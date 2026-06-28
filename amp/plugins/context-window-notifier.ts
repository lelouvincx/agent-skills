// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// context-window-notifier — read-only event handler that warns when a thread's
// estimated context-window usage is at or above the configured threshold.
//
// Amp's plugin API does not currently expose the exact UI token gauge, so this
// intentionally uses a simple text-size heuristic. Treat the notification as an
// early warning, not an authoritative counter.

import type { PluginAPI, PluginThread, PluginToolResultContentBlock, ThreadMessage, ThreadMessageID } from '@ampcode/plugin'

const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000
const DEFAULT_NOTIFY_THRESHOLD = 0.5
const CHARS_PER_TOKEN = 4
const MESSAGE_PAGE_SIZE = 20

export default function (amp: PluginAPI) {
	const contextWindowTokens = positiveNumber(process.env.AMP_CONTEXT_WINDOW_TOKENS) ?? DEFAULT_CONTEXT_WINDOW_TOKENS
	const notifyThreshold = thresholdNumber(process.env.AMP_CONTEXT_NOTIFY_THRESHOLD) ?? DEFAULT_NOTIFY_THRESHOLD

	amp.logger.log(
		`[context-window-notifier] plugin loaded (threshold=${Math.round(notifyThreshold * 100)}%, window=${contextWindowTokens} tokens)`,
	)

	amp.on('agent.end', async (event, ctx) => {
		const tokens = await estimateCurrentThreadTokens(ctx.thread, event.messages, (error) => {
			ctx.logger.log(`[context-window-notifier] failed to read thread messages: ${errorMessage(error)}`)
		})

		const ratio = tokens / contextWindowTokens
		if (ratio < notifyThreshold) {
			return
		}

		try {
			await ctx.ui.notify(
				`Context window estimate is above ${Math.round(notifyThreshold * 100)}% for ${event.thread.id}.\n` +
					`Estimated usage: ${Math.round(ratio * 100)}% (~${Math.round(tokens).toLocaleString()} / ${contextWindowTokens.toLocaleString()} tokens).\n` +
					'Consider summarizing, compacting, or starting a fresh thread soon.',
			)
		} catch (error) {
			ctx.logger.log(`[context-window-notifier] failed to notify: ${errorMessage(error)}`)
		}
	})
}

async function estimateCurrentThreadTokens(
	thread: PluginThread,
	turnMessages: ThreadMessage[],
	onReadError: (error: unknown) => void,
): Promise<number> {
	const estimate = { tokens: 0, seenMessageIDs: new Set<string>() }
	addMessagesToEstimate(estimate, turnMessages)

	for (let offset = 0; ; ) {
		let messages: ThreadMessage[]
		try {
			messages = await thread.messages({ from: 'end', offset, limit: MESSAGE_PAGE_SIZE })
		} catch (error) {
			onReadError(error)
			break
		}

		if (messages.length === 0) break
		addMessagesToEstimate(estimate, messages)
		offset += messages.length
		if (messages.length < MESSAGE_PAGE_SIZE) break
	}

	return estimate.tokens
}

function addMessagesToEstimate(estimate: { tokens: number; seenMessageIDs: Set<string> }, messages: ThreadMessage[]): void {
	for (const message of messages) {
		const key = messageIDKey(message.id)
		if (estimate.seenMessageIDs.has(key)) continue

		estimate.seenMessageIDs.add(key)
		estimate.tokens += estimateTokens(messageText(message))
	}
}

function messageIDKey(id: ThreadMessageID): string {
	return typeof id === 'number' ? `n:${id}` : `s:${id}`
}

function messageText(message: ThreadMessage): string {
	return message.content
		.map((block) => {
			if (block.type === 'text') return block.text
			if (block.type === 'thinking') return block.thinking
			if (block.type === 'tool_use') return `${block.name}\n${safeJson(block.input)}`
			if (block.type === 'tool_result') return `${block.status}\n${toolOutputText(block.output)}`
			return ''
		})
		.filter(Boolean)
		.join('\n')
}

function toolOutputText(output: unknown): string {
	if (typeof output === 'string') return output
	if (isContentBlockArray(output)) {
		return output
			.map((block) => {
				if (block.type === 'text') return block.text
				if (block.type === 'image') return `[image:${block.mimeType}:${block.data.length} base64 chars]`
				return ''
			})
			.filter(Boolean)
			.join('\n')
	}
	return output === undefined ? '' : safeJson(output)
}

function isContentBlockArray(value: unknown): value is PluginToolResultContentBlock[] {
	return Array.isArray(value) && value.every((block) => block && typeof block === 'object' && 'type' in block)
}

function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

function positiveNumber(value: string | undefined): number | null {
	if (!value) return null
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function thresholdNumber(value: string | undefined): number | null {
	const parsed = positiveNumber(value)
	return parsed !== null && parsed <= 1 ? parsed : null
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
