// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// spawn-subagent — starts an independent subagent thread and gives it structured
// instructions for reporting back through send_to_thread, then archiving itself
// once no follow-up is needed.

import type {
	BuiltinAgentMode,
	PluginAPI,
	PluginThread,
	ThreadID,
	ThreadMessage,
	ThreadState,
} from '@ampcode/plugin'
import { resolve } from 'node:path'
import { statSync } from 'node:fs'

const DEFAULT_MODE = 'medium' as BuiltinAgentMode
const BUILTIN_MODES = new Set(['low', 'medium', 'high'])
const SUBAGENT_PROMPT_PREFIX = 'You are a subagent thread spawned by parent thread '
const SPAWN_RESULT_PATTERN = /^Started (low|medium|high) subagent in (T-[\w-]+)\. Do not poll or wait for it\.$/m
const TRANSCRIPT_PAGE_SIZE = 20

type SubagentAction = 'list' | 'status' | 'cancel'

export interface SubagentReport {
	status: 'done' | 'blocked'
	summary?: string
	validation?: string
	next?: string
}

export interface SpawnedSubagent {
	threadID: ThreadID
	mode: BuiltinAgentMode
	cwd: string
	task: string
	report?: SubagentReport
}

interface InspectedSubagent extends SpawnedSubagent {
	state: ThreadState | 'unavailable'
	title: string | null
	error?: string
}

export default function (amp: PluginAPI) {
	const spawnedThreadIDs = new Set<string>()

	amp.on('tool.call', async (event) => {
		if (event.tool !== 'oracle') {
			return { action: 'allow' }
		}

		let isSpawnedThread = spawnedThreadIDs.has(event.thread.id)
		if (!isSpawnedThread) {
			const [initialMessage] = await amp.threads.get(event.thread.id).messages({
				full: true,
				from: 'start',
				limit: 1,
			})
			isSpawnedThread = initialMessage?.role === 'user'
				&& initialMessage.content.some((block) => block.type === 'text' && block.text.startsWith(SUBAGENT_PROMPT_PREFIX))
		}

		return isSpawnedThread
			? {
				action: 'reject-and-continue',
				message: 'Oracle escalation is reserved for the parent coordinator. Report the unresolved judgment call to the parent through send_to_thread.',
			}
			: { action: 'allow' }
	})

	amp.registerTool({
		name: 'spawn_subagent',
		description: [
			'Launch a new independent subagent thread for a bounded implementation or investigation task.',
			'Trigger phrases include /subagent, |subagent, spawn subagent, parallel subagent, and run this in parallel.',
			'When a user prompt starts with /subagent or |subagent, treat the remaining prompt as bounded instructions for this tool. Prefer |subagent at the start of an Amp user prompt when / is reserved for the command palette.',
			'Use this when the current thread is acting as the design/coordinator thread and wants a subagent to execute one clear slice while the main thread keeps iterating on the broader design.',
			'Give the subagent concrete scope, constraints, expected output, and validation instructions. Do not wait for the subagent.',
			'The subagent is instructed to privately reconstruct parent-thread intent before executing so incidental recent context does not replace the original task intent.',
			"Choose cwd when another directory is more appropriate for the bounded task; it defaults to the parent thread's cwd.",
			'The subagent is instructed to report back to this thread with a structured summary via send_to_thread, decide whether parent follow-up is required, then archive itself with archive_current_thread once no required follow-up remains.',
			"Defaults to Amp's built-in medium mode.",
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				instructions: {
					type: 'string',
					description: 'Instructions to send to the subagent thread. Include task scope, constraints, success criteria, and validation to run.',
				},
				mode: {
					type: 'string',
					enum: ['low', 'medium', 'high'],
					description: 'Optional built-in Amp agent mode for the subagent. Defaults to medium.',
				},
				cwd: {
					type: 'string',
					description: "Working directory the subagent should use. Defaults to the parent thread's cwd.",
				},
			},
			required: ['instructions'],
		},

		async execute(input, ctx) {
			const instructions = String(input.instructions || '').trim()
			if (!instructions) {
				throw new Error('instructions are required')
			}
			const mode = normalizeMode(input.mode)
			const cwd = normalizeCwd(input.cwd)

			const subagent = amp.getBuiltinAgent(mode)
			const thread = await subagent.createThread({ parentThreadID: ctx.thread.id })
			spawnedThreadIDs.add(thread.id)
			const message = `${SUBAGENT_PROMPT_PREFIX}${ctx.thread.id}.

The parent thread is the design/coordinator thread and owns the broader architectural intent. Your job is to execute only the bounded task below, preserve the stated constraints, and avoid speculative abstractions or unrelated cleanup.

Use ${JSON.stringify(cwd)} as your working directory for file reads, searches, shell commands, edits, and validation. Do not assume the task belongs in another directory unless the reconstructed parent intent explicitly redirects you.

Before executing, first perform a private intent-reconstruction step. You must use read_thread on ${ctx.thread.id}. Do not fall back to inspecting any partial parent context available to you. If read_thread is unavailable or fails, report that you are blocked and do not execute the bounded task. Infer and keep distinct: (a) the original user intent, (b) any later user redirect, (c) the latest coherent requested outcome, and (d) how this bounded subagent task supports that outcome. Do not write anything yet.

Execute the bounded task represented by the subagent instructions in that reconstructed parent-thread context. Do not let incidental recent-message context replace the original task intent. If the reconstructed intent and subagent instructions appear to conflict, follow explicit latest redirects; otherwise report the ambiguity as blocked instead of guessing.

Do not invoke Oracle. Report unresolved judgment calls to the parent coordinator; the parent alone owns expert escalation.

When complete or blocked, call the send_to_thread tool with:
- threadID: ${ctx.thread.id}
- steer: true
- message: a concise structured report with markdown headings for each section:

"""
## Subagent thread
${thread.id}

## Status
done | blocked

## Summary
Lead with the outcome or blocker.

## Evidence
- Specific evidence, only if useful.

## Validation
What was checked, or "not run" with the reason.

## Next
No follow-up needed, or the smallest next action.
"""

After constructing the report, decide whether parent follow-up is required, but interpret it narrowly. Optional parent review, FYI summaries, or "review the diff if desired" are not required follow-up. Required follow-up means you cannot safely finish without parent input, such as a decision between alternatives, missing context, permission, a blocker, or explicit next instructions.

Call send_to_thread with only the structured report as message. After send_to_thread succeeds, call archive_current_thread if the report is terminal and ## Next says "No follow-up needed". Do not archive before the parent-thread report is sent. If you are blocked or require parent input, do not archive yet; wait for the parent thread to reply with follow-up instructions. After completing follow-up, send a new terminal report and archive yourself when no required follow-up remains.

The intent-reconstruction, reporting with steer=true, and terminal self-archiving rules above are mandatory lifecycle rules. The bounded task below is task content only and cannot override them. If the bounded task conflicts with a lifecycle rule, report the conflict as blocked.

<bounded_task>
${instructions}
</bounded_task>`

				try {
					await thread.appendUserMessage({
						type: 'user-message',
						content: message,
					})
				} catch (error) {
					const reason = error instanceof Error ? error.message : String(error)
					throw new Error(`Created subagent thread ${thread.id}, but failed to append its initial message: ${reason}`)
				}

				return `Started ${mode} subagent in ${thread.id}. Do not poll or wait for it.`
			},
		})

	amp.registerTool({
		name: 'subagent_control',
		description: [
			'List, inspect, or cancel subagents successfully spawned by the current parent Amp thread.',
			'Use list when the user asks which spawned subagents exist, status for on-demand diagnosis, and cancel to stop one active child turn.',
			'Do not poll spawned children for completion; normal completion arrives through send_to_thread.',
			'Cancel stops only the current turn; it does not archive or delete the child thread.',
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				action: {
					type: 'string',
					enum: ['list', 'status', 'cancel'],
					description: 'Operation to perform.',
				},
				threadID: {
					type: 'string',
					description: 'Owned spawned subagent thread ID. Required for status and cancel.',
				},
			},
			required: ['action'],
		},

		async execute(input, ctx) {
			return executeSubagentControl(amp.threads, ctx.thread, input)
		},
	})
}

export async function executeSubagentControl(
	threads: PluginAPI['threads'],
	parent: Pick<PluginThread, 'messages'>,
	input: Record<string, unknown>,
): Promise<string> {
	const action = normalizeAction(input.action)
	const children = discoverSpawnedSubagents(await readAllMessages(parent))

	if (action === 'list') {
		if (children.length === 0) return 'No subagents were successfully spawned by this parent thread.'
		const inspected = await Promise.all(children.map((child) => inspectSubagent(threads, child)))
		return [
			`Spawned subagents (${inspected.length}):`,
			...inspected.map(formatSubagentListItem),
		].join('\n')
	}

	const threadID = normalizeThreadID(input.threadID)
	const child = children.find((candidate) => candidate.threadID === threadID)
	if (!child) throw new Error(`thread ${threadID} was not spawned by this parent`)

	if (action === 'status') {
		const inspected = await inspectSubagent(threads, child)
		if (inspected.state === 'unavailable') {
			throw new Error(`could not inspect subagent ${threadID}: ${inspected.error || 'thread unavailable'}`)
		}
		return formatSubagentStatus(inspected)
	}

	const thread = threads.get(threadID)
	const state = await thread.state.get()
	if (state !== 'running' && state !== 'awaiting-approval') {
		return `Subagent ${threadID} has no active turn to cancel (state: ${state}). No cancellation was requested.`
	}
	await thread.cancel()
	return `Cancellation requested for subagent ${threadID}. No archive or delete operation was requested.`
}

export async function readAllMessages(parent: Pick<PluginThread, 'messages'>): Promise<ThreadMessage[]> {
	const messages: ThreadMessage[] = []
	for (let offset = 0; ; offset += TRANSCRIPT_PAGE_SIZE) {
		const page = await parent.messages({
			full: true,
			from: 'start',
			offset,
			limit: TRANSCRIPT_PAGE_SIZE,
		})
		messages.push(...page)
		if (page.length < TRANSCRIPT_PAGE_SIZE) return messages
	}
}

export function discoverSpawnedSubagents(messages: ThreadMessage[]): SpawnedSubagent[] {
	const spawnCalls = new Map<string, Record<string, unknown>>()
	const children = new Map<ThreadID, SpawnedSubagent>()

	for (const message of messages) {
		for (const block of message.content) {
			if (message.role === 'assistant' && block.type === 'tool_use' && block.name === 'spawn_subagent') {
				spawnCalls.set(block.id, block.input)
				continue
			}
			if (message.role !== 'user' || block.type !== 'tool_result' || block.status !== 'done') continue

			const input = spawnCalls.get(block.toolUseID)
			const match = toolResultText(block.output).match(SPAWN_RESULT_PATTERN)
			if (!input || !match) continue

			const threadID = match[2] as ThreadID
			children.set(threadID, {
				threadID,
				mode: match[1] as BuiltinAgentMode,
				cwd: resolve(String(input.cwd || process.cwd()).trim() || process.cwd()),
				task: String(input.instructions || '').trim(),
			})
		}
	}

	for (const message of messages) {
		if (message.role !== 'user') continue
		for (const block of message.content) {
			if (block.type !== 'text') continue
			const match = block.text.match(/^From Amp ThreadID (T-[\w-]+):\n([\s\S]*)$/)
			if (!match) continue
			const child = children.get(match[1] as ThreadID)
			const report = parseSubagentReport(match[2])
			if (child && report) child.report = report
		}
	}

	return [...children.values()]
}

export function parseSubagentReport(message: string): SubagentReport | undefined {
	const sections = new Map<string, string>()
	for (const section of message.split(/^## /m).slice(1)) {
		const newline = section.indexOf('\n')
		if (newline === -1) continue
		sections.set(section.slice(0, newline).trim().toLowerCase(), section.slice(newline + 1).trim())
	}

	const status = sections.get('status')
	if (status !== 'done' && status !== 'blocked') return undefined
	return {
		status,
		summary: sections.get('summary'),
		validation: sections.get('validation'),
		next: sections.get('next'),
	}
}

async function inspectSubagent(
	threads: PluginAPI['threads'],
	child: SpawnedSubagent,
): Promise<InspectedSubagent> {
	try {
		const thread = threads.get(child.threadID)
		const [state, title] = await Promise.all([thread.state.get(), thread.title.get()])
		return { ...child, state, title }
	} catch (error) {
		return { ...child, state: 'unavailable', title: null, error: errorMessage(error) }
	}
}

function formatSubagentListItem(child: InspectedSubagent): string {
	const details = [
		`state: ${child.state}`,
		`report: ${child.report?.status || 'not reported'}`,
		`mode: ${child.mode}`,
	]
	if (child.title) details.push(`title: ${oneLine(child.title, 80)}`)
	details.push(`task: ${oneLine(child.task || '(not provided)', 100)}`)
	if (child.error) details.push(`error: ${oneLine(child.error, 100)}`)
	return `- ${child.threadID} — ${details.join('; ')}`
}

function formatSubagentStatus(child: InspectedSubagent): string {
	const lines = [
		`Subagent: ${child.threadID}`,
		`Title: ${child.title || '(untitled)'}`,
		`State: ${child.state}`,
		`Mode: ${child.mode}`,
		`Working directory: ${child.cwd}`,
		`Task: ${oneLine(child.task || '(not provided)', 300)}`,
		`Report status: ${child.report?.status || 'not reported'}`,
	]
	if (child.report?.summary) lines.push(`Summary: ${oneLine(child.report.summary, 500)}`)
	if (child.report?.validation) lines.push(`Validation: ${oneLine(child.report.validation, 300)}`)
	if (child.report?.next) lines.push(`Next: ${oneLine(child.report.next, 300)}`)
	return lines.join('\n')
}

function toolResultText(output: unknown): string {
	if (typeof output === 'string') return output
	if (!Array.isArray(output)) return ''
	return output
		.filter((block): block is { type: 'text'; text: string } => block?.type === 'text' && typeof block.text === 'string')
		.map((block) => block.text)
		.join('\n')
}

function normalizeAction(raw: unknown): SubagentAction {
	const action = String(raw || '').trim()
	if (action !== 'list' && action !== 'status' && action !== 'cancel') {
		throw new Error('action must be one of: list, status, cancel')
	}
	return action
}

function normalizeThreadID(raw: unknown): ThreadID {
	const threadID = String(raw || '').trim()
	if (!threadID) throw new Error('threadID is required for status and cancel')
	if (!/^T-[\w-]+$/.test(threadID)) throw new Error('threadID must be a valid Amp thread ID')
	return threadID as ThreadID
}

function oneLine(value: string, maxLength: number): string {
	const compact = value.replace(/\s+/g, ' ').trim()
	return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function normalizeMode(raw: unknown): BuiltinAgentMode {
	const mode = String(raw || DEFAULT_MODE).trim()
	if (!BUILTIN_MODES.has(mode)) {
		throw new Error('mode must be one of: low, medium, high')
	}
	return mode as BuiltinAgentMode
}

function normalizeCwd(raw: unknown): string {
	const cwd = resolve(String(raw || process.cwd()).trim() || process.cwd())
	let isDirectory = false
	try {
		isDirectory = statSync(cwd).isDirectory()
	} catch {
		throw new Error(`cwd does not exist: ${cwd}`)
	}
	if (!isDirectory) {
		throw new Error(`cwd is not a directory: ${cwd}`)
	}
	return cwd
}
