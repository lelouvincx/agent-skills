// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// send-to-thread — sends a text user message to another Amp thread.

import type { PluginAPI, ThreadID } from '@ampcode/plugin'

export default function (amp: PluginAPI) {
	amp.registerTool({
		name: 'send_to_thread',
		description: [
			'Send a text user message to an existing Amp thread by thread ID.',
			'Use this to let subagent threads report completion, blockers, or follow-up results back to the parent design/coordinator thread.',
			'When message is a human-readable report, use Markdown headings for each section and put the status or answer first. Use short active sentences, avoid repeated context and process narration, and end with the smallest next action or "No follow-up needed".',
			'Subagent completion reports should use Markdown headings: ## Subagent thread, ## Status, ## Summary, ## Evidence when useful, ## Validation, and ## Next.',
			'When reporting subagent completion to a busy parent thread, set steer=true so the message is preferred when the thread next dequeues work.',
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				threadID: {
					type: 'string',
					description: 'Target Amp thread ID, for example T-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.',
				},
				message: {
					type: 'string',
					description: 'Text message to send to the target thread. For human-readable reports, follow the documented message contract: status or answer first; Markdown headings for each section; short active sentences; no repeated context or process narration; concrete bullets only when useful; end with the smallest next action or "No follow-up needed". Subagent reports should use headings: ## Subagent thread, ## Status, ## Summary, optional ## Evidence, ## Validation, and ## Next. Raw logs, code snippets, structured data, and quoted source text may keep their original format.',
				},
				steer: {
					type: 'boolean',
					description: 'If true and the target thread is busy, queue this as a steering message preferred for the next turn. Defaults to false.',
				},
			},
			required: ['threadID', 'message'],
		},

		async execute(input, ctx) {
			const threadID = String(input.threadID || '').trim()
			const message = String(input.message || '').trim()
			const steer = input.steer === true
			if (!threadID) {
				throw new Error('threadID is required')
			}
			if (!message) {
				throw new Error('message is required')
			}

			const thread = amp.threads.get(threadID as ThreadID)
			const forwardedMessage = `From Amp ThreadID ${ctx.thread.id}:

${message}`

			await thread.appendUserMessage({
				type: 'user-message',
				content: forwardedMessage,
			}, { steer })

			return steer ? `Sent steering message to ${threadID}.` : `Sent message to ${threadID}.`
		},
	})
}
