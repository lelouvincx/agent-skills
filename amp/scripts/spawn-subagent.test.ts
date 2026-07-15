import { describe, expect, test } from 'bun:test'

import {
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
