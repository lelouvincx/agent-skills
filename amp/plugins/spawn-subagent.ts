// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// spawn-subagent — starts an independent subagent thread and gives it structured
// instructions for reporting back through send_to_thread, then archiving itself
// once no follow-up is needed.

import type { BuiltinAgentMode, PluginAPI } from '@ampcode/plugin'

const DEFAULT_MODE = 'medium' as BuiltinAgentMode
const BUILTIN_MODES = new Set(['low', 'medium', 'high'])

export default function (amp: PluginAPI) {
	amp.registerTool({
		name: 'spawn_subagent',
		description: [
			'Launch a new independent subagent thread for a bounded implementation or investigation task.',
			'Trigger phrases include /subagent, |subagent, spawn subagent, parallel subagent, and run this in parallel.',
			'When a user prompt starts with /subagent or |subagent, treat the remaining prompt as bounded instructions for this tool. Prefer |subagent at the start of an Amp user prompt when / is reserved for the command palette.',
			'Use this when the current thread is acting as the design/coordinator thread and wants a subagent to execute one clear slice while the main thread keeps iterating on the broader design.',
			'Give the subagent concrete scope, constraints, expected output, and validation instructions. Do not wait for the subagent.',
			'The subagent is instructed to privately reconstruct parent-thread intent before executing so incidental recent context does not replace the original task intent.',
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
			},
			required: ['instructions'],
		},

		async execute(input, ctx) {
			const instructions = String(input.instructions || '').trim()
			if (!instructions) {
				throw new Error('instructions are required')
			}
			const mode = normalizeMode(input.mode)

			const subagent = amp.getBuiltinAgent(mode)
			const thread = await subagent.createThread({ parentThreadID: ctx.thread.id })
			const message = `You are a subagent thread spawned by parent thread ${ctx.thread.id}.

The parent thread is the design/coordinator thread and owns the broader architectural intent. Your job is to execute only the bounded task below, preserve the stated constraints, and avoid speculative abstractions or unrelated cleanup.

Before executing, first perform a private intent-reconstruction step. You must use read_thread on ${ctx.thread.id}. Do not fall back to inspecting any partial parent context available to you. If read_thread is unavailable or fails, report that you are blocked and do not execute the bounded task. Infer and keep distinct: (a) the original user intent, (b) any later user redirect, (c) the latest coherent requested outcome, and (d) how this bounded subagent task supports that outcome. Do not write anything yet.

Execute the bounded task represented by the subagent instructions in that reconstructed parent-thread context. Do not let incidental recent-message context replace the original task intent. If the reconstructed intent and subagent instructions appear to conflict, follow explicit latest redirects; otherwise report the ambiguity as blocked instead of guessing.

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
}

function normalizeMode(raw: unknown): BuiltinAgentMode {
	const mode = String(raw || DEFAULT_MODE).trim()
	if (!BUILTIN_MODES.has(mode)) {
		throw new Error('mode must be one of: low, medium, high')
	}
	return mode as BuiltinAgentMode
}
