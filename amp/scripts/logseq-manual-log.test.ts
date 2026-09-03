import { describe, expect, test } from 'bun:test'

import plugin, { buildParentTaskPrompt, queueLogCurrentTask } from '../plugins/logseq-manual-log'

const parentID = 'T-parent'
const workspace = '/workspace/agent-skills'
const logseqRepo = '/workspace/logseq'
const today = new Date(2026, 8, 3, 12)

function fakeThread(options: { appendError?: Error } = {}) {
	const appended: Array<{ type: string; content: string }> = []
	return {
		thread: {
			id: parentID,
			async appendUserMessage(message: { type: string; content: string }) {
				if (options.appendError) throw options.appendError
				appended.push(message)
			},
		},
		appended,
	}
}

function fakeAmp() {
	let command: ((ctx: unknown) => Promise<void>) | undefined
	let commandMetadata: Record<string, unknown> | undefined
	let getBuiltinAgentCalls = 0
	const logs: string[] = []
	const amp = {
		logger: { log(message: string) { logs.push(message) } },
		helpers: {
			filePathFromURI(uri: { toString(): string }) {
				return decodeURIComponent(new URL(uri.toString()).pathname)
			},
		},
		registerCommand(_id: string, metadata: Record<string, unknown>, handler: (ctx: unknown) => Promise<void>) {
			commandMetadata = metadata
			command = handler
			return { unsubscribe() {}, setAvailability() {} }
		},
		getBuiltinAgent() {
			getBuiltinAgentCalls += 1
			throw new Error('The command must not create a worker')
		},
	}
	return {
		amp,
		logs,
		get command() { return command },
		get commandMetadata() { return commandMetadata },
		get getBuiltinAgentCalls() { return getBuiltinAgentCalls },
	}
}

function commandContext(options: {
	hint?: string
	thread?: ReturnType<typeof fakeThread>['thread']
	workspaceRoot?: URL | null
} = {}) {
	const notifications: string[] = []
	let inputCalls = 0
	return {
		ctx: {
			thread: options.thread,
			system: {
				workspaceRoot: options.workspaceRoot === undefined
					? new URL('file:///workspace/agent-skills')
					: options.workspaceRoot,
			},
			ui: {
				async input() {
					inputCalls += 1
					return options.hint
				},
				async notify(message: string) {
					notifications.push(message)
				},
			},
		},
		notifications,
		get inputCalls() { return inputCalls },
	}
}

describe('parent Task prompt', () => {
	test('makes the parent synthesize live context into a standalone Task brief', () => {
		const prompt = buildParentTaskPrompt(parentID, 'update DAT-594 from Slack', workspace, logseqRepo, today)

		expect(prompt).toStartWith('[logseq-log-current-task]')
		expect(prompt).toContain('Call the built-in Task tool as your next action')
		expect(prompt).toContain('Task starts with fresh context')
		expect(prompt).toContain('Include each material fact once')
		expect(prompt).toContain('Treat the Parent handoff as the primary intent source')
		expect(prompt).toContain('use read_thread only to retrieve that fact')
		expect(prompt).toContain('original user intent and any later redirect')
		expect(prompt).toContain('work completed and its durable result')
		expect(prompt).toContain('decisions, known blockers, and authority still required')
		expect(prompt).toContain('actual task inputs and important deliverables')
		expect(prompt.indexOf('### Parent handoff'))
			.toBeLessThan(prompt.indexOf('### Runtime context'))
		expect(prompt.indexOf('### Runtime context'))
			.toBeLessThan(prompt.indexOf('### Optional user hint'))
		expect(prompt.indexOf('### Optional user hint'))
			.toBeLessThan(prompt.indexOf('### Intent boundary'))
		expect(prompt.indexOf('### Intent boundary'))
			.toBeLessThan(prompt.indexOf('### Logging contract'))
	})

	test('carries command context and the complete logging contract', () => {
		const prompt = buildParentTaskPrompt(parentID, 'update DAT-594 from Slack', workspace, logseqRepo, today)

		expect(prompt).toContain(`Parent Amp thread: ${parentID}`)
		expect(prompt).toContain(`Parent workspace: ${workspace}`)
		expect(prompt).toContain(`Logseq graph: ${logseqRepo}`)
		expect(prompt).toContain(`Today's date: 2026-09-03`)
		expect(prompt).toContain(`Today's journal: ${logseqRepo}/journals/2026_09_03.md`)
		expect(prompt).toContain('### Optional user hint\n\nupdate DAT-594 from Slack')
		expect(prompt).toContain('If exactly one exists, update it')
		expect(prompt).toContain('If none exists, create one')
		expect(prompt).toContain('If several exist, reconcile them into one')
		expect(prompt).toContain('Finish with exactly one actionable parent-linked task')
		expect(prompt).toContain('Write the durable task or outcome to Backlog.md first')
		expect(prompt).toContain('id:: <uuid>')
		expect(prompt).toContain('next-action::')
		expect(prompt).toContain('observed-at:: 2026-09-03')
		expect(prompt).toContain('journal pointer to the same task UUID')
		expect(prompt).toContain('Re-read Backlog.md and today\'s journal after mutation')
		expect(prompt).toContain('Only after both files pass read-back, update parent thread T-parent')
		expect(prompt).toContain('amp threads rename and amp threads label')
		expect(prompt).toContain('task UUID, title, state, Backlog path, journal path')
		expect(prompt).toContain('parent-linked task count, UUID uniqueness result')
		expect(prompt).toContain('journal verification: the task UUID referenced by the journal pointer')
		expect(prompt).not.toContain("read Backlog.md and today's journal yourself")
		expect(prompt).toContain('That Task owns the file re-read or repair')
		expect(prompt).toContain('Keep Task calls serial')
	})

	test('represents a blank hint explicitly', () => {
		expect(buildParentTaskPrompt(parentID, '', workspace, logseqRepo, today)).toContain('### Optional user hint\n\n(none)')
	})
})

describe('queueLogCurrentTask', () => {
	test('appends one normal user turn to the active parent thread', async () => {
		const target = fakeThread()

		await queueLogCurrentTask({ thread: target.thread } as never, 'keep TODO', workspace, logseqRepo, today)

		expect(target.appended).toHaveLength(1)
		expect(target.appended[0].type).toBe('user-message')
		expect(target.appended[0].content).toContain('### Optional user hint\n\nkeep TODO')
	})

	test('requires an active thread', async () => {
		expect(queueLogCurrentTask({ thread: undefined } as never, '', workspace, logseqRepo, today))
			.rejects.toThrow('Open an Amp thread')
	})
})

describe('command-only plugin surface', () => {
	test('registers the command without creating a hidden worker', () => {
		const harness = fakeAmp()

		plugin(harness.amp as never)

		expect(harness.command).toBeFunction()
		expect(harness.commandMetadata).toMatchObject({
			title: 'Log Current Task',
			category: 'Logseq',
		})
		expect(harness.getBuiltinAgentCalls).toBe(0)
	})

	test('queues a trimmed hint in the current thread and reports delivery', async () => {
		const harness = fakeAmp()
		const target = fakeThread()
		const command = commandContext({ hint: '  update DAT-594  ', thread: target.thread })
		plugin(harness.amp as never)

		await harness.command!(command.ctx as never)

		expect(target.appended).toHaveLength(1)
		expect(target.appended[0].content).toContain('### Optional user hint\n\nupdate DAT-594')
		expect(target.appended[0].content).toContain('Parent workspace: /workspace/agent-skills')
		expect(command.notifications).toEqual([
			'Logseq logging queued in this thread. The parent agent will delegate it through Task.',
		])
		expect(harness.getBuiltinAgentCalls).toBe(0)
	})

	test('does not open the prompt or append when no thread is active', async () => {
		const harness = fakeAmp()
		const command = commandContext()
		plugin(harness.amp as never)

		await harness.command!(command.ctx as never)

		expect(command.inputCalls).toBe(0)
		expect(command.notifications).toEqual([
			'Open an Amp thread before running Logseq: Log Current Task.',
		])
	})

	test('does not append when the user cancels', async () => {
		const harness = fakeAmp()
		const target = fakeThread()
		const command = commandContext({ hint: undefined, thread: target.thread })
		plugin(harness.amp as never)

		await harness.command!(command.ctx as never)

		expect(target.appended).toHaveLength(0)
		expect(command.notifications).toEqual(['Logseq logging cancelled.'])
	})

	test('represents a missing active workspace without using the plugin process directory', async () => {
		const harness = fakeAmp()
		const target = fakeThread()
		const command = commandContext({ hint: '', thread: target.thread, workspaceRoot: null })
		plugin(harness.amp as never)

		await harness.command!(command.ctx as never)

		expect(target.appended).toHaveLength(1)
		expect(target.appended[0].content).toContain('Parent workspace: (none)')
		expect(target.appended[0].content).not.toContain(process.cwd())
	})

	test('reports delivery failure without claiming the turn was queued', async () => {
		const harness = fakeAmp()
		const target = fakeThread({ appendError: new Error('thread unavailable') })
		const command = commandContext({ hint: '', thread: target.thread })
		plugin(harness.amp as never)

		await harness.command!(command.ctx as never)

		expect(target.appended).toHaveLength(0)
		expect(command.notifications).toEqual(['Could not queue Logseq logging: thread unavailable'])
		expect(harness.logs).toContain('[logseq-manual-log] parent turn delivery failed: thread unavailable')
	})
})
