import { describe, expect, test } from 'bun:test'

import {
	default as registerSubagentTools,
	discoverSpawnedSubagents,
	executeSubagentControl,
	readAllMessages,
} from '../plugins/spawn-subagent'

const childID = 'T-11111111-1111-1111-1111-111111111111'
const otherID = 'T-22222222-2222-2222-2222-222222222222'

function spawnMessages(status: 'done' | 'error' | 'cancelled' = 'done') {
	return [
		{
			role: 'assistant',
			id: 'assistant-1',
			content: [{
				type: 'tool_use',
				id: 'tool-1',
				name: 'spawn_subagent',
				input: { instructions: 'Check the parser', mode: 'high', cwd: '/tmp' },
			}],
		},
		{
			role: 'user',
			id: 'user-1',
			content: [{
				type: 'tool_result',
				toolUseID: 'tool-1',
				status,
				output: `Started high subagent in ${childID}. Do not poll or wait for it.`,
			}],
		},
	] as never[]
}

function parentWith(messages: never[]) {
	return {
		messages: async ({ offset = 0, limit = 20 }: { offset?: number; limit?: number }) =>
			messages.slice(offset, offset + limit),
	}
}

function threadDirectory(state: 'idle' | 'running' | 'awaiting-approval' | 'error') {
	let cancelCalls = 0
	return {
		threads: {
			get: (threadID: string) => {
				if (threadID !== childID) throw new Error('missing thread')
				return {
					state: { get: async () => state },
					title: { get: async () => 'Parser review' },
					cancel: async () => { cancelCalls += 1 },
				}
			},
		},
		cancelCalls: () => cancelCalls,
	}
}

function spawnHarness() {
	let spawnTool: { execute: (input: Record<string, unknown>, ctx: unknown) => Promise<string> } | undefined
	const createCalls: unknown[] = []
	const initialMessages: string[] = []
	registerSubagentTools({
		on: () => undefined,
		registerTool: (tool: { name: string }) => {
			if (tool.name === 'spawn_subagent') spawnTool = tool as typeof spawnTool
		},
		getBuiltinAgent: () => ({
			createThread: async (options: unknown) => {
				createCalls.push(options)
				return {
					id: childID,
					appendUserMessage: async ({ content }: { content: string }) => { initialMessages.push(content) },
				}
			},
		}),
	} as never)
	if (!spawnTool) throw new Error('spawn_subagent was not registered')
	return {
		execute: (input: Record<string, unknown>) => spawnTool!.execute(input, { thread: { id: otherID } }),
		createCalls,
		initialMessages,
	}
}

describe('subagent execution target', () => {
	test('defaults to local execution and preserves local cwd behavior', async () => {
		const harness = spawnHarness()
		await harness.execute({ instructions: 'Check locally' })

		expect(harness.createCalls).toEqual([{ parentThreadID: otherID, executor: 'local' }])
		expect(harness.initialMessages[0]).toContain(`Use ${JSON.stringify(process.cwd())} as your working directory`)
	})

	test('targets an Orb without sending the parent cwd', async () => {
		const harness = spawnHarness()
		await harness.execute({ instructions: 'Check remotely', executor: 'orb' })

		expect(harness.createCalls).toEqual([{ parentThreadID: otherID, executor: 'orb' }])
		expect(harness.initialMessages[0]).toContain("Use the selected Orb executor's current workspace")
		expect(harness.initialMessages[0]).not.toContain(process.cwd())
	})

	test('targets a runner by stable ID', async () => {
		const harness = spawnHarness()
		await harness.execute({
			instructions: 'Check on runner',
			executor: { type: 'runner', id: ' runner-123 ' },
		})

		expect(harness.createCalls).toEqual([{
			parentThreadID: otherID,
			executor: { type: 'runner', id: 'runner-123' },
		}])
		expect(harness.initialMessages[0]).toContain("Use the selected runner executor's current workspace")
	})

	test('rejects a runner without a stable ID', async () => {
		const harness = spawnHarness()
		await expect(harness.execute({
			instructions: 'Check on runner',
			executor: { type: 'runner', id: '  ' },
		})).rejects.toThrow('runner executor id is required')
		expect(harness.createCalls).toEqual([])
	})

	test('rejects cwd for remote execution', async () => {
		const harness = spawnHarness()
		await expect(harness.execute({
			instructions: 'Check remotely',
			executor: 'orb',
			cwd: '/tmp',
		})).rejects.toThrow('cwd is only supported with the local executor')
		expect(harness.createCalls).toEqual([])
	})
})

describe('subagent transcript discovery', () => {
	test('discovers successful spawns and associates the latest structured report', () => {
		const messages = [
			...spawnMessages(),
			{
				role: 'user',
				id: 'report-1',
				content: [{ type: 'text', text: `From Amp ThreadID ${childID}:\n\n## Status\n\nblocked\n\n## Summary\n\nNeed input.` }],
			},
			{
				role: 'user',
				id: 'report-2',
				content: [{ type: 'text', text: `From Amp ThreadID ${childID}:\n\n## Status\n\ndone\n\n## Summary\n\nParser is correct.\n\n## Validation\n\nTests passed.\n\n## Next\n\nNo follow-up needed.` }],
			},
		] as never[]

		expect(discoverSpawnedSubagents(messages as never)).toEqual([{
			threadID: childID,
			mode: 'high',
			cwd: '/tmp',
			task: 'Check the parser',
			report: {
				status: 'done',
				summary: 'Parser is correct.',
				validation: 'Tests passed.',
				next: 'No follow-up needed.',
			},
		}])
	})

	test('ignores unsuccessful spawn results', () => {
		expect(discoverSpawnedSubagents(spawnMessages('error') as never)).toEqual([])
	})

	test('reads a full transcript in Amp-sized pages', async () => {
		const messages = Array.from({ length: 41 }, (_, index) => ({
			role: 'info',
			id: `info-${index}`,
			content: [{ type: 'text', text: String(index) }],
		})) as never[]
		const offsets: number[] = []
		const parent = {
			messages: async ({ offset = 0, limit = 20 }: { offset?: number; limit?: number }) => {
				offsets.push(offset)
				return messages.slice(offset, offset + limit)
			},
		}

		expect(await readAllMessages(parent as never)).toHaveLength(41)
		expect(offsets).toEqual([0, 20, 40])
	})
})

describe('subagent control', () => {
	test('lists and inspects an owned child', async () => {
		const directory = threadDirectory('running')
		const parent = parentWith(spawnMessages())

		expect(await executeSubagentControl(directory.threads as never, parent as never, { action: 'list' }))
			.toContain(`${childID} — state: running`)
		expect(await executeSubagentControl(directory.threads as never, parent as never, { action: 'status', threadID: childID }))
			.toContain('Title: Parser review')
	})

	test('rejects a thread not spawned by the current parent', async () => {
		const directory = threadDirectory('running')
		await expect(executeSubagentControl(
			directory.threads as never,
			parentWith(spawnMessages()) as never,
			{ action: 'cancel', threadID: otherID },
		)).rejects.toThrow('was not spawned by this parent')
		expect(directory.cancelCalls()).toBe(0)
	})

	test('cancels an active child turn but leaves idle children alone', async () => {
		const active = threadDirectory('awaiting-approval')
		const parent = parentWith(spawnMessages())
		expect(await executeSubagentControl(active.threads as never, parent as never, { action: 'cancel', threadID: childID }))
			.toContain('Cancellation requested')
		expect(active.cancelCalls()).toBe(1)

		const idle = threadDirectory('idle')
		expect(await executeSubagentControl(idle.threads as never, parent as never, { action: 'cancel', threadID: childID }))
			.toContain('No cancellation was requested')
		expect(idle.cancelCalls()).toBe(0)
	})
})
