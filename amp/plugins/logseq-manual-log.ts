// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// logseq-manual-log — command-palette action for manually asking Amp to log
// the current thread/task into the user's Logseq graph. This intentionally has
// no agent lifecycle hook: logging only happens when the command is invoked.

import type {
	AgentReasoningEffort,
	BuiltinAgentMode,
	PluginAPI,
	PluginCommandContext,
	ThreadAssistantMessage,
	ThreadID,
	ThreadMessage,
} from '@ampcode/plugin'

const LOGSEQ_REPO = process.env.AMP_LOGSEQ_GRAPH_DIR ?? '/Users/lelouvincx/Developer/second-brain-logseq'
const WORKER_MODE: BuiltinAgentMode = 'deep'
const WORKER_REASONING_EFFORT: AgentReasoningEffort = 'xhigh'
const WORKER_TIMEOUT_MS = 10 * 60 * 1000
const PARENT_RECENT_MESSAGE_SEED_LIMIT = 20
const MAX_PARENT_EXCERPT_CHARS = 20_000
const MAX_NOTIFICATION_CHARS = 500

export default function (amp: PluginAPI) {
	amp.logger.log(`[logseq-manual-log] plugin loaded → ${LOGSEQ_REPO}`)

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
					'Optional target, note, or source link, e.g. "update DAT-594", "journal only", or a Slack/PR/Notion URL. Leave blank to infer from this thread.',
				placeholder: 'Optional Logseq target / context / source links',
				submitButtonText: 'Log to Logseq',
			})

			if (hint === undefined) {
				await ctx.ui.notify('Logseq logging cancelled.')
				return
			}

			const parentThreadID = ctx.thread.id
			const parentExcerpt = await parentThreadExcerpt(ctx.thread)
			const workerAgent = amp.getBuiltinAgent(WORKER_MODE, { reasoningEffort: WORKER_REASONING_EFFORT })
			const workerThread = await workerAgent.createThread({
				parentThreadID,
				show: false,
			})

			await ctx.ui.notify(`Started Logseq worker ${workerThread.id}.`)

			try {
				await workerThread.appendUserMessage({
					type: 'user-message',
					content: buildPrompt(parentThreadID, workerThread.id, hint.trim(), parentExcerpt),
				})

				const response = await workerThread.waitForResponse({ timeoutMs: WORKER_TIMEOUT_MS })
				const summary = extractAssistantText(response) || 'Logseq worker finished.'
				const newTitle = extractThreadTitle(summary)
				if (!newTitle) {
					await ctx.ui.notify(
						`Logseq worker ${workerThread.id} finished, but did not return a valid thread title; leaving it unarchived for inspection.\n${truncate(summary, MAX_NOTIFICATION_CHARS)}`,
					)
					return
				}

				try {
					await renameThread(ctx, parentThreadID, newTitle)
				} catch (error) {
					await ctx.ui.notify(
						`Logseq worker ${workerThread.id} finished, but parent thread rename failed; leaving it unarchived for inspection.\n${errorMessage(error)}`,
					)
					return
				}

				await ctx.ui.notify(
					`Logseq worker ${workerThread.id} finished and renamed this thread to ${newTitle}. Archiving worker now.\n${truncate(summary, MAX_NOTIFICATION_CHARS)}`,
				)
			} catch (error) {
				await ctx.ui.notify(
					`Logseq worker ${workerThread.id} failed or timed out; leaving it unarchived for inspection.\n${errorMessage(error)}`,
				)
				return
			}

			try {
				await archiveThread(ctx, workerThread.id)
			} catch (error) {
				await ctx.ui.notify(
					`Logseq worker ${workerThread.id} finished, but archive failed; leaving it unarchived for inspection.\n${errorMessage(error)}`,
				)
			}
		},
	)
}

function buildPrompt(parentThreadID: string, workerThreadID: string, hint: string, parentExcerpt: string): string {
	const today = localDateParts()
	return `[logseq-manual-log]

You are a Logseq logging worker spawned from parent Amp thread ${parentThreadID}. This command was manually triggered by the user; do not set up automatic logging.

Task: log the actual durable work from the parent Amp thread into Logseq now.

Context:
- Parent Amp thread id: ${parentThreadID}
- Worker Amp thread id: ${workerThreadID}
- Logseq repo: ${LOGSEQ_REPO}
- Today's journal file: ${LOGSEQ_REPO}/journals/${today.journalFile}
- User instruction: ${hint || '(none — infer the best target from this thread)'}

Recent parent-thread seed for quick link/outcome extraction only; do not use this seed as the source of truth for original intent:
<<<recent-parent-thread-seed
${parentExcerpt || '(not available — use read_thread on the parent thread if available)'}
recent-parent-thread-seed

Rules:
1. First perform a private intent-reconstruction step. Use read_thread on ${parentThreadID} when available, or otherwise inspect the parent thread as fully as available. Infer and keep distinct: (a) the original user intent, (b) any later user redirect, (c) the latest coherent requested outcome, and (d) the durable result to log. Do not write anything yet.
2. Log the durable task/outcome represented by that reconstructed intent. Do not let incidental recent-message context replace the original task intent. If the thread contains unrelated later chatter, ignore it unless the user explicitly redirected the task.
3. Before choosing or writing a Logseq block, read \`${LOGSEQ_REPO}/pages/Canonical Pages.md\`, then read the corresponding canonical project/rule pages named there, especially \`pages/Projects.md\`, \`pages/Backlog.md\`, and any relevant rule page. Use that canonical map as the source of truth for project taxonomy, active backlog matches, priority conventions, and placement.
4. If reconstructed intent, recent seed, and canonical map conflict, prefer reconstructed user intent plus canonical project mapping; use the recent seed only for final outcome details and reference links.
5. First check for an existing Logseq entry referencing the parent thread via \`input:: [Ampcode](${parentThreadID})\`, a numbered variant such as \`[1-Ampcode](${parentThreadID})\`, or \`${parentThreadID}\`; update it instead of creating a duplicate.
6. If the user hint or reconstructed parent-thread intent clearly maps to an active task in \`pages/Backlog.md\` or today's journal, update that task/block.
7. Otherwise append one concise block to today's journal:
   - under \`### Done\` when the work is complete
   - under \`### Tasks\` when follow-up remains
   - under \`### Notes\` when this is informational only
   Create the section only if needed and missing.
8. Use Logseq markdown conventions from this graph:
   - lowercase properties with \`::\`
   - \`project:: [[...]]\` must be coherent with the canonical project map in \`pages/Projects.md\`; default to \`[[Personal]]\` only for personal/tooling tasks that do not match a more specific canonical project such as \`[[Logseq]]\`, \`[[Internal]]\`, \`[[Docs]]\`, or \`[[Presales]]\`.
   - \`priority:: #P...\` when inferable from backlog/rules; default to \`#P3\` only for low-priority personal/tooling tasks
   - Keep source/reference links in the block's \`input::\` property, not scattered as child notes.
   - Always include the parent Amp thread in \`input::\`.
   - Also include useful source or deliverable links from the user instruction and parent thread, such as Slack, Notion, Linear, GitHub PR/issue, ReadAI, customer docs, design docs, or related Amp threads.
   - When there is more than one input link, use numbered labels like \`input:: [1-Ampcode](${parentThreadID}) [2-PR](https://...) [3-Slack](https://...)\`; use \`input:: [Ampcode](${parentThreadID})\` only when no other useful reference link is found.
   - Dedupe equivalent links and skip incidental documentation/search-result links unless they were actual task inputs or important deliverables.
   - \`completed:: [[${today.isoDate}]]\` only for DONE items
   - preserve surrounding indentation style, usually one tab for properties under a block
9. Keep the entry short: one task/note block plus few useful child notes. Do not paste the transcript or your private intent-reconstruction notes.
10. Determine the parent Amp thread title from the Logseq task/block you wrote or updated, using exactly this pattern: \`[Project] task title\`. Use the Logseq \`project:: [[...]]\` value without brackets for \`Project\`; use the task/block title text without TODO/DONE markers or properties for \`task title\`.
11. Do not commit, push, run weekly report automation, or modify unrelated blocks.
12. Do not send messages to the parent thread. Return your result only as this worker thread's final answer.

After editing, reply with exactly two plain-text lines, without bullets or code formatting:
Logged to <file/block> — <summary>.
Thread title: [Project] task title
`
}

async function parentThreadExcerpt(thread: PluginCommandContext['thread']): Promise<string> {
	if (!thread) return ''
	try {
		const messages = await thread.messages({ from: 'end', limit: PARENT_RECENT_MESSAGE_SEED_LIMIT })
		return truncate(formatThreadMessages(messages), MAX_PARENT_EXCERPT_CHARS)
	} catch {
		return ''
	}
}

function formatThreadMessages(messages: ThreadMessage[]): string {
	return messages
		.map((message, index) => {
			const parts = message.content
				.map((block) => {
					if (block.type === 'text') return block.text.trim()
					if (block.type === 'tool_use') return `[tool_use: ${block.name}]`
					if (block.type === 'tool_result') return `[tool_result: ${block.status}]`
					return ''
				})
				.filter(Boolean)
				.join('\n')
				.trim()

			return parts ? `## ${index + 1}. ${message.role}\n${truncate(parts, 4_000)}` : ''
		})
		.filter(Boolean)
		.join('\n\n')
}

function extractAssistantText(message: ThreadAssistantMessage): string {
	return message.content
		.filter((block) => block.type === 'text')
		.map((block) => block.text.trim())
		.filter(Boolean)
		.join('\n')
		.trim()
}

async function archiveThread(ctx: PluginCommandContext, threadID: ThreadID): Promise<void> {
	const result = await ctx.$`amp threads archive ${threadID}`
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || `amp threads archive exited with ${result.exitCode}`)
	}
}

async function renameThread(ctx: PluginCommandContext, threadID: ThreadID, newTitle: string): Promise<void> {
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
