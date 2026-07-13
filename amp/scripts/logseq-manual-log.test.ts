import { describe, expect, test } from 'bun:test'

import { waitForWorkerResponse } from '../plugins/logseq-manual-log'

const response = {
	role: 'assistant',
	id: 'assistant-message',
	content: [{ type: 'text', text: 'Thread title: [Presales] Follow up with FanServ' }],
}
const startupGuard = {
	promise: new Promise<never>(() => {}),
	cancel() {},
}

describe('waitForWorkerResponse', () => {
	test('consumes a stored response before a transient wait retry', async () => {
		let waitCalls = 0
		const worker = {
			state: { get: async () => 'idle', subscribe: () => ({ unsubscribe() {} }) },
			waitForResponse: async () => {
				waitCalls += 1
				throw new Error('Plugin thread.messages timed out')
			},
			messages: async () => [response],
		}

		expect(await waitForWorkerResponse(worker as never, startupGuard)).toEqual(response)
		expect(waitCalls).toBe(1)
	})

	test('consumes a stored response when the nominal wait reports a timeout', async () => {
		let waitCalls = 0
		const worker = {
			state: { get: async () => 'idle', subscribe: () => ({ unsubscribe() {} }) },
			waitForResponse: async () => {
				waitCalls += 1
				throw new Error('Timed out waiting for agent response')
			},
			messages: async () => [response],
		}

		expect(await waitForWorkerResponse(worker as never, startupGuard)).toEqual(response)
		expect(waitCalls).toBe(1)
	})

	test('allows an in-flight response to settle just after the nominal timeout', async () => {
		const timeouts: number[] = []
		const worker = {
			state: { get: async () => 'running', subscribe: () => ({ unsubscribe() {} }) },
			waitForResponse: async ({ timeoutMs }: { timeoutMs: number }) => {
				timeouts.push(timeoutMs)
				if (timeouts.length === 1) throw new Error('Timed out waiting for agent response')
				return response
			},
			messages: async () => [],
		}

		expect(await waitForWorkerResponse(worker as never, startupGuard)).toEqual(response)
		expect(timeouts.at(-1)).toBe(15_000)
	})
})
