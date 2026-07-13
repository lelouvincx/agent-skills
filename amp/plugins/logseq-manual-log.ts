// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// logseq-manual-log — command-palette action and agent-callable tool for
// manually asking Amp to log the current thread/task into the user's Logseq
// graph. This intentionally has no agent lifecycle hook: logging only happens
// when the command is invoked or the tool is called from an Amp thread.

import type {
	BuiltinAgentMode,
	PluginAPI,
	PluginCommandContext,
	ThreadAssistantMessage,
	ThreadID,
	ThreadMessage,
	ThreadState,
} from '@ampcode/plugin'

const LOGSEQ_REPO = process.env.AMP_LOGSEQ_GRAPH_DIR ?? '/Users/lelouvincx/Developer/second-brain-logseq'
const WORKER_MODE = 'high' as BuiltinAgentMode
const WORKER_STARTUP_TIMEOUT_MS = 15_000
const WORKER_TIMEOUT_MS = 5 * 60 * 1000
const WORKER_WAIT_RETRY_DELAY_MS = 1_000
const WORKER_COMPLETION_GRACE_MS = 15_000
const MAX_RESULT_CHARS = 500
const MAX_NOTIFICATION_CHARS = 500
const LOGSEQ_WORKER_PROMPT_PREFIX = '[logseq-manual-log]'

type LogContext = Pick<PluginCommandContext, 'thread' | '$'>
type WorkerThread = {
	state: {
		get(): Promise<ThreadState>
		subscribe(onNext: (state: ThreadState) => void): { unsubscribe(): void }
	}
	waitForResponse(options: { timeoutMs: number }): Promise<ThreadAssistantMessage>
	messages(options: { from: 'end'; limit: number; roles: ['assistant'] }): Promise<ThreadMessage[]>
}

export default function (amp: PluginAPI) {
	const workerThreadIDs = new Set<string>()

	amp.logger.log(`[logseq-manual-log] plugin loaded → ${LOGSEQ_REPO}`)

	amp.on('tool.call', async (event) => {
		if (event.tool !== 'oracle') {
			return { action: 'allow' }
		}

		let isLogseqWorker = workerThreadIDs.has(event.thread.id)
		if (!isLogseqWorker) {
			const [initialMessage] = await amp.threads.get(event.thread.id).messages({
				full: true,
				from: 'start',
				limit: 1,
			})
			isLogseqWorker = initialMessage?.role === 'user'
				&& initialMessage.content.some((block) => block.type === 'text' && block.text.startsWith(LOGSEQ_WORKER_PROMPT_PREFIX))
		}

		return isLogseqWorker
			? {
				action: 'reject-and-continue',
				message: 'Oracle is unavailable to Logseq logging workers. Use read_thread and the Logseq canonical pages to complete the logging task.',
			}
			: { action: 'allow' }
	})

	amp.registerCommand(
		'logseq-log-current-task',
		{
			title: 'Log current task',
			category: 'logseq',
			description: 'Manually ask Amp to log this thread/task into Logseq.',
		},
		async (ctx) => {
			if (!ctx.thread) {
				await ctx.ui.notify('Open an Amp thread before running Logseq: Log current task.')
				return
			}

			const hint = await ctx.ui.input({
				title: 'Log current task to Logseq',
				message:
					'Optional target, note, or source link, e.g. "update DAT-594" or a Slack/PR/Notion URL. Leave blank to infer from this thread.',
				placeholder: 'Optional Logseq target / context / source links',
				submitButtonText: 'Log to Logseq',
			})

			if (hint === undefined) {
				await ctx.ui.notify('Logseq logging cancelled.')
				return
			}

			const result = await logCurrentTask(amp, ctx, hint.trim(), MAX_NOTIFICATION_CHARS, workerThreadIDs)
			await ctx.ui.notify(result)
		},
	)

	amp.registerTool({
		name: 'logseq_log_current_task',
		description: [
			'Log the durable outcome of the current Amp thread into the configured Logseq graph.',
			'Use this when the user asks to log the current task from inside the active Amp thread, without using the command palette.',
			'The tool starts a hidden Logseq worker, waits for it, renames the parent thread from the Logseq task title, and archives the worker when successful.',
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				hint: {
					type: 'string',
					description: 'Optional target, note, or source link, such as update DAT-594 or a Slack/PR/Notion URL.',
				},
			},
		},

		async execute(input, ctx) {
			if (!ctx.thread) {
				throw new Error('Open an Amp thread before running logseq_log_current_task.')
			}

			return logCurrentTask(amp, ctx, String(input.hint || '').trim(), MAX_RESULT_CHARS, workerThreadIDs)
		},
	})
}

async function logCurrentTask(
	amp: PluginAPI,
	ctx: LogContext,
	hint: string,
	maxResultChars: number,
	workerThreadIDs: Set<string>,
): Promise<string> {
	if (!ctx.thread) {
		throw new Error('Open an Amp thread before running Logseq: Log current task.')
	}

	const parentThreadID = ctx.thread.id
	const workerAgent = amp.getBuiltinAgent(WORKER_MODE)
	const workerThread = await workerAgent.createThread({
		parentThreadID,
		show: false,
	})
	workerThreadIDs.add(workerThread.id)
	const startupGuard = watchWorkerStartup(workerThread)

	try {
		await Promise.race([
			workerThread.appendUserMessage({
				type: 'user-message',
				content: buildPrompt(parentThreadID, workerThread.id, hint),
			}),
			startupGuard.promise,
		])

		const response = await waitForWorkerResponse(workerThread, startupGuard)
		const summary = extractAssistantText(response) || 'Logseq worker finished.'
		const newTitle = extractThreadTitle(summary)
		if (!newTitle) {
			return `Logseq worker ${workerThread.id} finished, but did not return a valid thread title; leaving it unarchived for inspection.\n${truncate(summary, maxResultChars)}`
		}

		try {
			await renameThread(ctx, parentThreadID, newTitle)
		} catch (error) {
			return `Logseq worker ${workerThread.id} finished, but parent thread rename failed; leaving it unarchived for inspection.\n${errorMessage(error)}`
		}

		try {
			await archiveThread(ctx, workerThread.id)
		} catch (error) {
			return `Logseq worker ${workerThread.id} finished and renamed this thread to ${newTitle}, but archive failed; leaving it unarchived for inspection.\n${errorMessage(error)}`
		}

		return `Logseq worker ${workerThread.id} finished, renamed this thread to ${newTitle}, and was archived.\n${truncate(summary, maxResultChars)}`
	} catch (error) {
		return `Logseq worker ${workerThread.id} failed or timed out; leaving it unarchived for inspection.\n${errorMessage(error)}`
	} finally {
		startupGuard.cancel()
	}
}

export async function waitForWorkerResponse(
	workerThread: WorkerThread,
	startupGuard: ReturnType<typeof watchWorkerStartup>,
): Promise<ThreadAssistantMessage> {
	const deadline = Date.now() + WORKER_TIMEOUT_MS
	let lastError: unknown

	while (Date.now() < deadline) {
		const remainingMs = deadline - Date.now()
		try {
			return await Promise.race([
				workerThread.waitForResponse({ timeoutMs: remainingMs }),
				startupGuard.promise,
			])
		} catch (error) {
			lastError = error
			if (isWorkerResponseTimeout(error)) {
				break
			}
			if (!isThreadMessagesTimeout(error)) {
				throw error
			}
			const completedResponse = await getCompletedWorkerResponse(workerThread)
			if (completedResponse) return completedResponse
			await sleep(Math.min(WORKER_WAIT_RETRY_DELAY_MS, Math.max(0, deadline - Date.now())))
		}
	}

	const completedResponse = await getCompletedWorkerResponse(workerThread)
	if (completedResponse) return completedResponse

	try {
		return await Promise.race([
			workerThread.waitForResponse({ timeoutMs: WORKER_COMPLETION_GRACE_MS }),
			startupGuard.promise,
		])
	} catch (error) {
		if (!isThreadMessagesTimeout(error) && !isWorkerResponseTimeout(error)) {
			throw error
		}
		const settledResponse = await getCompletedWorkerResponse(workerThread)
		if (settledResponse) return settledResponse
		throw lastError instanceof Error ? lastError : error
	}
}

async function getCompletedWorkerResponse(workerThread: WorkerThread): Promise<ThreadAssistantMessage | null> {
	if (await workerThread.state.get() !== 'idle') return null
	try {
		const [message] = await workerThread.messages({ from: 'end', limit: 1, roles: ['assistant'] })
		return message?.role === 'assistant' ? message : null
	} catch (error) {
		if (isThreadMessagesTimeout(error)) return null
		throw error
	}
}

function watchWorkerStartup(workerThread: WorkerThread): { promise: Promise<never>; cancel(): void } {
	let active = true
	let subscription: { unsubscribe(): void } | undefined
	let timeout: ReturnType<typeof setTimeout> | undefined
	let rejectStartup: (error: Error) => void = () => {}

	const cancel = () => {
		if (!active) return
		active = false
		if (timeout) clearTimeout(timeout)
		subscription?.unsubscribe()
	}
	const checkState = (state: ThreadState) => {
		if (!active) return
		if (state === 'error') {
			cancel()
			rejectStartup(new Error('Logseq high-mode worker entered an error state before starting'))
		} else if (state === 'running' || state === 'awaiting-approval') {
			cancel()
		}
	}
	const promise = new Promise<never>((_, reject) => {
		rejectStartup = reject
		subscription = workerThread.state.subscribe(checkState)
		if (!active) {
			subscription.unsubscribe()
		} else {
			timeout = setTimeout(() => {
				cancel()
				reject(new Error(`Logseq high-mode worker did not start within ${WORKER_STARTUP_TIMEOUT_MS / 1000} seconds`))
			}, WORKER_STARTUP_TIMEOUT_MS)
		}
		void workerThread.state.get().then(checkState, (error) => {
			cancel()
			reject(error)
		})
	})

	return { promise, cancel }
}

function isThreadMessagesTimeout(error: unknown): boolean {
	return errorMessage(error).includes('Plugin thread.messages timed out')
}

function isWorkerResponseTimeout(error: unknown): boolean {
	return errorMessage(error).includes('Timed out waiting for agent response')
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildPrompt(parentThreadID: string, workerThreadID: string, hint: string): string {
	const today = localDateParts()
	return `${LOGSEQ_WORKER_PROMPT_PREFIX}

You are a Logseq logging worker spawned from parent Amp thread ${parentThreadID}. This command was manually triggered by the user; do not set up automatic logging.

Task: log the actual durable work from the parent Amp thread into Logseq now.

Context:
- Parent Amp thread id: ${parentThreadID}
- Worker Amp thread id: ${workerThreadID}
- Logseq repo: ${LOGSEQ_REPO}
- Today's journal file: ${LOGSEQ_REPO}/journals/${today.journalFile}

Rules:
1. First perform a private intent-reconstruction step. You must use read_thread on ${parentThreadID}. Do not fall back to partial parent context. If read_thread is unavailable or fails, stop without editing Logseq and report the blocker. Infer and keep distinct: (a) the original user intent, (b) any later user redirect, (c) the latest coherent requested outcome, and (d) the durable result to log. Do not write anything yet.
2. Log the durable task/outcome represented by that reconstructed intent. Do not let incidental recent-message context replace the original task intent. If the thread contains unrelated later chatter, ignore it unless the user explicitly redirected the task.
3. Before choosing or writing a Logseq block, read \`${LOGSEQ_REPO}/pages/Canonical Pages.md\`, then read the corresponding canonical project/rule pages named there, especially \`pages/Projects.md\`, \`pages/Backlog.md\`, and any relevant rule page. Use that canonical map as the source of truth for project taxonomy, active backlog matches, priority conventions, and placement.
4. All task logs must be represented in \`pages/Backlog.md\` first. Check for an existing backlog entry referencing the parent thread via \`input:: [Ampcode](${parentThreadID})\`, a numbered variant such as \`[1-Ampcode](${parentThreadID})\`, or \`${parentThreadID}\`; update it instead of creating a duplicate.
5. If the user hint or reconstructed parent-thread intent clearly maps to an active task in \`pages/Backlog.md\`, update that backlog task/block. Otherwise create one concise backlog task block in the canonical backlog placement for its project/priority/state.
6. After the backlog task is updated or created, add or update a short reference in today's journal pointing back to that backlog task:
   - under \`### Done\` when the work is complete
   - under \`### Tasks\` when follow-up remains
   - under \`### Notes\` when this is informational only
   Create the section only if needed and missing. Keep the journal entry as a pointer to the backlog task, not a duplicate task with copied properties/source links.
7. Use Logseq markdown conventions from this graph:
   - lowercase properties with \`::\`
   - \`project:: [[...]]\` must be coherent with the canonical project map in \`pages/Projects.md\`; default to \`[[Personal]]\` only for personal/tooling tasks that do not match a more specific canonical project such as \`[[Logseq]]\`, \`[[Internal]]\`, \`[[Docs]]\`, or \`[[Presales]]\`.
   - \`priority:: #P...\` when inferable from backlog/rules; default to \`#P3\` only for low-priority personal/tooling tasks
   - Keep source/reference links in the backlog task block's \`input::\` property, not scattered as child notes or duplicated in the journal reference.
   - Always include the parent Amp thread in the backlog task's \`input::\`.
   - Also include useful source or deliverable links from the user instruction and parent thread in the backlog task's \`input::\`, such as Slack, Notion, Linear, GitHub PR/issue, ReadAI, customer docs, design docs, or related Amp threads.
   - When there is more than one input link, use numbered labels like \`input:: [1-Ampcode](${parentThreadID}) [2-PR](https://...) [3-Slack](https://...)\`; use \`input:: [Ampcode](${parentThreadID})\` only when no other useful reference link is found.
   - Dedupe equivalent links and skip incidental documentation/search-result links unless they were actual task inputs or important deliverables.
   - \`completed:: [[${today.isoDate}]]\` only for DONE backlog items
   - preserve surrounding indentation style, usually one tab for properties under a block
8. Keep the backlog entry short: one task block plus few useful child notes, and one brief journal reference. Do not paste the transcript or your private intent-reconstruction notes.
9. Determine the parent Amp thread title from the Logseq backlog task/block you wrote or updated, using exactly this pattern: \`[Project] task title\`. Use the Logseq \`project:: [[...]]\` value without brackets for \`Project\`; use the backlog task/block title text without TODO/DONE markers or properties for \`task title\`.
10. Do not invoke Oracle. The plugin blocks Oracle calls from this worker.
11. Do not commit, push, run weekly report automation, or modify unrelated blocks.
12. Do not send messages to the parent thread. Return your result only as this worker thread's final answer.

User instruction: ${hint || '(none, infer the best target from this thread)'}

After editing, reply with exactly two plain-text lines, without bullets or code formatting:
Logged to <backlog file/block> and <journal file/block> — <summary>.
Thread title: [Project] task title
`
}

function extractAssistantText(message: ThreadAssistantMessage): string {
	return message.content
		.filter((block) => block.type === 'text')
		.map((block) => block.text.trim())
		.filter(Boolean)
		.join('\n')
		.trim()
}

async function archiveThread(ctx: LogContext, threadID: ThreadID): Promise<void> {
	const result = await ctx.$`amp threads archive ${threadID}`
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || `amp threads archive exited with ${result.exitCode}`)
	}
}

async function renameThread(ctx: LogContext, threadID: ThreadID, newTitle: string): Promise<void> {
	const result = await ctx.$`amp threads rename ${threadID} ${newTitle}`
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || `amp threads rename exited with ${result.exitCode}`)
	}
}

function extractThreadTitle(text: string): string | null {
	const match = text.match(/^\s*`?Thread title:\s*(\[[^\]\n]+\]\s+.+?)`?\s*\.?\s*$/im)
	if (!match) return null
	return oneLine(match[1]).trim() || null
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, ' ')
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function truncate(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text
	return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`
}

function localDateParts(): { isoDate: string; journalFile: string } {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return {
		isoDate: `${year}-${month}-${day}`,
		journalFile: `${year}_${month}_${day}.md`,
	}
}
