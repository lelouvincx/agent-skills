// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// spawn-subagent — starts an independent subagent thread and gives it structured
// instructions for reporting back through send_to_thread, then archiving itself
// once no follow-up is needed.

import type { AgentReasoningEffort, BuiltinAgentMode, PluginAPI } from '@ampcode/plugin'

const DEFAULT_MODE: BuiltinAgentMode = 'deep'
const DEFAULT_REASONING_EFFORT: AgentReasoningEffort = 'medium'
const BUILTIN_MODES = new Set(['smart', 'deep', 'rush'])
const REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

export default function (amp: PluginAPI) {
	amp.registerTool({
		name: 'spawn_subagent',
		description: [
			'Launch a new independent subagent thread for a bounded implementation or investigation task.',
			'Trigger phrases include spawn subagent, subagent thread, launch a subagent, parallel agent, background subagent, delegate this slice, and run this in parallel.',
			'Use this when the current thread is acting as the design/coordinator thread and wants a subagent to execute one clear slice while the main thread keeps iterating on the broader design.',
			'Give the subagent concrete scope, constraints, expected output, and validation instructions. Do not wait for the subagent.',
			'The subagent is instructed to privately reconstruct parent-thread intent before executing so incidental recent context does not replace the original task intent.',
			'The subagent is instructed to report back to this thread with a structured summary via send_to_thread, decide whether parent follow-up is required, then archive itself with archive_current_thread once no required follow-up remains.',
			"Defaults to the built-in deep agent with medium reasoning effort, Amp's recommended GPT-5.5 default for normal deep work.",
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
					enum: ['smart', 'deep', 'rush'],
					description: 'Optional built-in Amp agent mode for the subagent. Defaults to deep.',
				},
				reasoningEffort: {
					type: 'string',
					enum: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
					description: "Optional reasoning effort for the subagent. Defaults to medium, Amp's recommended GPT-5.5 default for normal deep work.",
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
			const reasoningEffort = normalizeReasoningEffort(input.reasoningEffort)

			const subagent = amp.getBuiltinAgent(mode, { reasoningEffort })
			const thread = await subagent.createThread({ parentThreadID: ctx.thread.id })
			const message = `You are a subagent thread spawned by parent thread ${ctx.thread.id}.

The parent thread is the design/coordinator thread and owns the broader architectural intent. Your job is to execute only the bounded task below, preserve the stated constraints, and avoid speculative abstractions or unrelated cleanup.

Before executing, first perform a private intent-reconstruction step. Use read_thread on ${ctx.thread.id} when available, or otherwise inspect the parent thread as fully as available. Infer and keep distinct: (a) the original user intent, (b) any later user redirect, (c) the latest coherent requested outcome, and (d) how this bounded subagent task supports that outcome. Do not write anything yet.

Execute the bounded task represented by the subagent instructions in that reconstructed parent-thread context. Do not let incidental recent-message context replace the original task intent. If the reconstructed intent and subagent instructions appear to conflict, follow explicit latest redirects; otherwise report the ambiguity as blocked instead of guessing.

When complete or blocked, call the send_to_thread tool with:
- threadID: ${ctx.thread.id}
- steer: true
- message: a concise structured report using this format:

Subagent thread: ${thread.id}
Status: done | blocked
Task summary:
Files changed:
Validation:
Open questions / blockers:
Follow-up needed:

You decide whether parent follow-up is required, but interpret it narrowly. Optional parent review, FYI summaries, or "review the diff if desired" are not required follow-up. Required follow-up means you cannot safely finish without parent input, such as a decision between alternatives, missing context, permission, a blocker, or explicit next instructions.

If the report is terminal and Follow-up needed is empty or none, then after the send_to_thread report succeeds, call archive_current_thread to archive this subagent thread. Do not archive before the parent-thread report is sent. If you are blocked or require parent input, do not archive yet; wait for the parent thread to reply with follow-up instructions. After completing follow-up, send a new terminal report and archive yourself when no required follow-up remains.

${instructions}`

			await thread.appendUserMessage({
				type: 'user-message',
				content: message,
			})

			return `Started ${mode}/${reasoningEffort} subagent in ${thread.id}. Do not poll or wait for it.`
		},
	})
}

function normalizeMode(raw: unknown): BuiltinAgentMode {
	const mode = String(raw || DEFAULT_MODE).trim()
	if (!BUILTIN_MODES.has(mode)) {
		throw new Error('mode must be one of: smart, deep, rush')
	}
	return mode as BuiltinAgentMode
}

function normalizeReasoningEffort(raw: unknown): AgentReasoningEffort {
	const reasoningEffort = String(raw || DEFAULT_REASONING_EFFORT).trim()
	if (!REASONING_EFFORTS.has(reasoningEffort)) {
		throw new Error('reasoningEffort must be one of: none, minimal, low, medium, high, xhigh, max')
	}
	return reasoningEffort as AgentReasoningEffort
}
