// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// send-to-thread — sends a text user message to another Amp thread.

import type { PluginAPI, ThreadID } from '@ampcode/plugin'

export default function (amp: PluginAPI) {
	amp.registerTool({
		name: 'send_to_thread',
		description: [
			'Send a text user message to an existing Amp thread by thread ID.',
			'Use this to let worker threads report completion, blockers, or follow-up results back to the parent design/coordinator thread.',
			'When reporting worker completion to a busy parent thread, set steer=true so the message is preferred when the thread next dequeues work.',
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
					description: 'Text message to send to the target thread.',
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
