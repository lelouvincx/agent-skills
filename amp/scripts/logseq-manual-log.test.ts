import { describe, expect, test } from 'bun:test'

import plugin, {
	classifyWorkerCompatibilityError,
	isExplicitLogseqLoggingRequest,
	isPathInsideLogseqGraph,
	logCurrentTask,
	parseWorkerResult,
	waitForWorkerOutcome,
	type LogseqOperationStore,
} from '../plugins/logseq-manual-log'

const parentID = 'T-parent'
const workerID = 'T-worker'
const graphRoot = '/tmp/logseq-graph'
const runtimeGraphRoot = '/Users/lelouvincx/Developer/second-brain-logseq'
const timing = { startupTimeoutMs: 20, workerTimeoutMs: 20 }
const completeResult = {
	version: 1,
	backlogVerified: true,
	journalVerified: true,
	threadTitle: '[Presales] Follow up with FanServ',
	summary: 'Logged and verified both files.',
	error: null,
}
const partialResult = {
	...completeResult,
	journalVerified: false,
	summary: 'Backlog verified; journal still missing.',
	error: 'Journal pointer was not found.',
}
const failedResult = {
	...completeResult,
	backlogVerified: false,
	journalVerified: false,
	threadTitle: null,
	summary: 'No Logseq writes verified.',
	error: 'Canonical pages could not be read.',
}

function assistantResponse(id: string, result: unknown = completeResult) {
	return {
		role: 'assistant',
		id,
		content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
	}
}

function deferred<T>() {
	let resolvePromise!: (value: T) => void
	let rejectPromise!: (error: unknown) => void
	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve
		rejectPromise = reject
	})
	return { promise, resolve: resolvePromise, reject: rejectPromise }
}

function fakeWorker(options: {
	id?: string
	state?: string | (() => string | Promise<string>)
	waitForResponse?: () => unknown | Promise<unknown>
	messages?: () => unknown[] | Promise<unknown[]>
	appendUserMessage?: (message: { content: string }) => void | Promise<void>
} = {}) {
	const appended: string[] = []
	const state = options.state ?? 'running'
	const worker = {
		id: options.id ?? workerID,
		state: {
			get: async () => typeof state === 'function' ? state() : state,
			subscribe: () => ({ unsubscribe() {} }),
		},
		waitForResponse: async () => options.waitForResponse ? options.waitForResponse() : assistantResponse('response-1'),
		messages: async () => options.messages ? options.messages() : [],
		appendUserMessage: async (message: { content: string }) => {
			appended.push(message.content)
			await options.appendUserMessage?.(message)
		},
	}
	return { worker, appended }
}

function fakeShell(handler?: (command: string, values: unknown[]) => { exitCode: number; stdout?: string; stderr?: string } | Promise<{ exitCode: number; stdout?: string; stderr?: string }>) {
	const calls: string[] = []
	const shell = async (strings: TemplateStringsArray, ...values: unknown[]) => {
		const command = strings.join('{}')
		calls.push(command)
		const result = await handler?.(command, values) ?? { exitCode: 0 }
		return { stdout: '', stderr: '', ...result }
	}
	return { shell, calls }
}

function fakeAmp(options: {
	createThread?: () => unknown | Promise<unknown>
	shell?: ReturnType<typeof fakeShell>['shell']
	filesModifiedByToolCall?: (event: { input: Record<string, unknown> }) => unknown[] | null
} = {}) {
	let createCalls = 0
	const hooks = new Map<string, (event: never, ctx?: never) => unknown>()
	let registeredTool: { execute(input: Record<string, unknown>, ctx: unknown): Promise<unknown> } | undefined
	let commandHandler: ((ctx: unknown) => Promise<void>) | undefined
	const defaultShell = fakeShell()
	const amp = {
		logger: { log() {} },
		on(event: string, handler: (event: never, ctx?: never) => unknown) {
			hooks.set(event, handler)
			return { unsubscribe() {} }
		},
		registerTool(tool: typeof registeredTool) {
			registeredTool = tool
			return { unsubscribe() {} }
		},
		registerCommand(_id: string, _metadata: unknown, handler: (ctx: unknown) => Promise<void>) {
			commandHandler = handler
			return { unsubscribe() {}, setAvailability() {} }
		},
		getBuiltinAgent() {
			return {
				createThread: () => {
					createCalls += 1
					return Promise.resolve(options.createThread?.())
				},
			}
		},
		$: options.shell ?? defaultShell.shell,
		helpers: {
			filesModifiedByToolCall: options.filesModifiedByToolCall ?? ((event: { input: { files?: unknown[] } }) => event.input.files ?? null),
			filePathFromURI: (file: unknown) => String(file),
		},
		threads: {
			get: () => ({ messages: async () => [] }),
		},
	}
	return {
		amp,
		hooks,
		get tool() { return registeredTool },
		get command() { return commandHandler },
		get createCalls() { return createCalls },
		defaultShell,
	}
}

function context(id = parentID) {
	return { thread: { id } }
}

function neverStartupGuard() {
	return { promise: new Promise<never>(() => {}), cancel() {} }
}

describe('worker result protocol', () => {
	test('accepts complete, partial, and verified failed results', () => {
		expect(parseWorkerResult(JSON.stringify(completeResult)).ok).toBe(true)
		expect(parseWorkerResult(JSON.stringify(partialResult)).ok).toBe(true)
		expect(parseWorkerResult(JSON.stringify(failedResult)).ok).toBe(true)
	})

	test.each([
		['prose', `result: ${JSON.stringify(completeResult)}`],
		['extra key', JSON.stringify({ ...completeResult, taskId: 'not-p0' })],
		['journal without backlog', JSON.stringify({ ...failedResult, journalVerified: true })],
		['complete with error', JSON.stringify({ ...completeResult, error: 'contradiction' })],
		['failed without error', JSON.stringify({ ...failedResult, error: null })],
		['backlog without title', JSON.stringify({ ...partialResult, threadTitle: null })],
		['unverified backlog with title', JSON.stringify({ ...failedResult, threadTitle: 'invalid' })],
		['multiline title', JSON.stringify({ ...completeResult, threadTitle: '[Presales] Bad\ntitle' })],
	])('rejects %s', (_label, value) => {
		expect(parseWorkerResult(value).ok).toBe(false)
	})
})

describe('routing helpers', () => {
	test.each([
		'Log this into Logseq.',
		"Add the current task to today's Logseq journal.",
		'Use the Logseq plugin tool to log this.',
		'Save this outcome to Logseq.',
	])('recognizes explicit logging request: %s', (message) => {
		expect(isExplicitLogseqLoggingRequest(message)).toBe(true)
	})

	test.each([
		'Fix the Logseq plugin.',
		'Read this Logseq page.',
		'Explain how Logseq logging works.',
		'How do I log this to Logseq?',
		'Add support for Logseq logging.',
		'Add Logseq routing support.',
		'Do not log this to Logseq.',
		'Edit Canonical Pages.md in Logseq.',
	])('ignores non-logging request: %s', (message) => {
		expect(isExplicitLogseqLoggingRequest(message)).toBe(false)
	})

	test('uses normalized directory containment', () => {
		expect(isPathInsideLogseqGraph(`${graphRoot}/pages/Backlog.md`, graphRoot)).toBe(true)
		expect(isPathInsideLogseqGraph(graphRoot, graphRoot)).toBe(true)
		expect(isPathInsideLogseqGraph(`${graphRoot}-copy/pages/Backlog.md`, graphRoot)).toBe(false)
		expect(isPathInsideLogseqGraph('/tmp/elsewhere.md', graphRoot)).toBe(false)
	})
})

describe('worker wait outcomes', () => {
	test('consumes a fresh stored response', async () => {
		const response = assistantResponse('stored')
		const { worker } = fakeWorker({ messages: () => [response] })
		expect(await waitForWorkerOutcome(worker as never, undefined, neverStartupGuard(), 1)).toEqual({ kind: 'response', response })
	})

	test('returns pending while a timed-out worker is running', async () => {
		const { worker } = fakeWorker({ waitForResponse: async () => { throw new Error('Timed out waiting for agent response') } })
		const outcome = await waitForWorkerOutcome(worker as never, undefined, neverStartupGuard(), 1)
		expect(outcome.kind).toBe('pending')
	})

	test('still waits when the initial stored-response lookup fails', async () => {
		const response = assistantResponse('awaited')
		const { worker } = fakeWorker({
			messages: async () => { throw new Error('Plugin thread.messages timed out') },
			waitForResponse: () => response,
		})
		expect(await waitForWorkerOutcome(worker as never, undefined, neverStartupGuard(), 1)).toEqual({ kind: 'response', response })
	})

	test('returns failed for a typed worker error with no fresh response', async () => {
		const { worker } = fakeWorker({ state: 'error', waitForResponse: async () => { throw new Error('worker failed') } })
		const outcome = await waitForWorkerOutcome(worker as never, undefined, neverStartupGuard(), 1)
		expect(outcome.kind).toBe('failed')
	})

	test('never reuses the previous assistant message', async () => {
		const previous = assistantResponse('previous')
		const { worker } = fakeWorker({ messages: () => [previous], waitForResponse: () => previous })
		const outcome = await waitForWorkerOutcome(worker as never, 'previous', neverStartupGuard(), 1)
		expect(outcome.kind).toBe('pending')
	})

	test('isolates timeout compatibility strings', () => {
		expect(classifyWorkerCompatibilityError(new Error('Plugin thread.messages timed out'))).toBe('thread-messages-timeout')
		expect(classifyWorkerCompatibilityError(new Error('Timed out waiting for agent response'))).toBe('worker-response-timeout')
		expect(classifyWorkerCompatibilityError(new Error('other'))).toBeNull()
	})
})

describe('operation coordinator', () => {
	test('completes, renames, archives, and cleans up one operation', async () => {
		const { worker, appended } = fakeWorker()
		const harness = fakeAmp({ createThread: () => worker })
		const operations: LogseqOperationStore = new Map()
		const output = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)

		expect(output).toContain('Logseq: complete')
		expect(output).toContain('Rename: complete')
		expect(output).toContain('Archive: complete')
		expect(harness.createCalls).toBe(1)
		expect(appended).toHaveLength(1)
		expect(operations.size).toBe(0)
	})

	test('returns pending and reuses one running worker', async () => {
		const { worker, appended } = fakeWorker({ waitForResponse: async () => { throw new Error('Timed out waiting for agent response') } })
		const harness = fakeAmp({ createThread: () => worker })
		const operations: LogseqOperationStore = new Map()

		const first = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		const second = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(first).toContain('Worker: pending')
		expect(second).toContain('Worker: pending')
		expect(harness.createCalls).toBe(1)
		expect(appended).toHaveLength(1)
	})

	test('serializes concurrent calls during worker creation', async () => {
		const creation = deferred<unknown>()
		const { worker } = fakeWorker()
		const harness = fakeAmp({ createThread: () => creation.promise })
		const operations: LogseqOperationStore = new Map()
		const first = logCurrentTask(harness.amp as never, context() as never, '', 500, operations, { ...timing, startupTimeoutMs: 100 })
		await Promise.resolve()
		const second = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(second).toContain('already reconciling')
		expect(harness.createCalls).toBe(1)
		creation.resolve(worker)
		await first
	})

	test('serializes concurrent calls during rename', async () => {
		const rename = deferred<{ exitCode: number }>()
		const { worker } = fakeWorker()
		const shell = fakeShell((command) => command.includes('rename') ? rename.promise : { exitCode: 0 })
		const harness = fakeAmp({ createThread: () => worker, shell: shell.shell })
		const operations: LogseqOperationStore = new Map()
		const first = logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		while (!shell.calls.some((call) => call.includes('rename'))) await Promise.resolve()
		const second = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(second).toContain('already reconciling')
		expect(shell.calls.filter((call) => call.includes('rename'))).toHaveLength(1)
		rename.resolve({ exitCode: 0 })
		await first
	})

	test('serializes concurrent calls during archive', async () => {
		const archive = deferred<{ exitCode: number }>()
		const { worker } = fakeWorker()
		const shell = fakeShell((command) => command.includes('archive') ? archive.promise : { exitCode: 0 })
		const harness = fakeAmp({ createThread: () => worker, shell: shell.shell })
		const operations: LogseqOperationStore = new Map()
		const first = logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		while (!shell.calls.some((call) => call.includes('archive'))) await Promise.resolve()
		const second = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(second).toContain('already reconciling')
		expect(shell.calls.filter((call) => call.includes('archive'))).toHaveLength(1)
		archive.resolve({ exitCode: 0 })
		await first
	})

	test('preserves Logseq success, archives after rename failure, then retries rename only', async () => {
		let renameCalls = 0
		const { worker, appended } = fakeWorker()
		const shell = fakeShell((command) => {
			if (command.includes('rename')) {
				renameCalls += 1
				return renameCalls === 1 ? { exitCode: 1, stderr: 'rename failed' } : { exitCode: 0 }
			}
			return { exitCode: 0 }
		})
		const harness = fakeAmp({ createThread: () => worker, shell: shell.shell })
		const operations: LogseqOperationStore = new Map()

		const first = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(first).toContain('Logseq: complete')
		expect(first).toContain('Rename: failed')
		expect(first).toContain('Archive: complete')
		const second = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(second).toContain('Rename: complete')
		expect(second).not.toContain('rename failed')
		expect(appended).toHaveLength(1)
		expect(shell.calls.filter((call) => call.includes('archive'))).toHaveLength(1)
	})

	test('preserves Logseq success across archive failure', async () => {
		const { worker } = fakeWorker()
		const shell = fakeShell((command) => command.includes('archive') ? { exitCode: 1, stderr: 'archive failed' } : { exitCode: 0 })
		const harness = fakeAmp({ createThread: () => worker, shell: shell.shell })
		const operations: LogseqOperationStore = new Map()
		const output = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(output).toContain('Logseq: complete')
		expect(output).toContain('Archive: failed')
		expect(operations.size).toBe(1)
	})

	test.each([
		['partial', partialResult],
		['malformed', 'not json'],
		['verified failure', failedResult],
	])('reconciles %s through the same worker', async (_label, firstResult) => {
		const responses = [assistantResponse('first', firstResult), assistantResponse('second', completeResult)]
		const { worker, appended } = fakeWorker({ waitForResponse: () => responses.shift()! })
		const harness = fakeAmp({ createThread: () => worker })
		const operations: LogseqOperationStore = new Map()

		await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		const output = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(output).toContain('Logseq: complete')
		expect(harness.createCalls).toBe(1)
		expect(appended).toHaveLength(2)
		expect(appended[1]).toContain('do not create a duplicate task')
	})

	test('preserves prior partial verification when a repair result is malformed', async () => {
		const responses = [assistantResponse('first', partialResult), assistantResponse('second', 'not json')]
		const { worker } = fakeWorker({ waitForResponse: () => responses.shift()! })
		const harness = fakeAmp({ createThread: () => worker })
		const operations: LogseqOperationStore = new Map()

		await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		const output = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(output).toContain('Logseq: partial')
		expect(output).toContain('must be exactly one unfenced JSON object')
	})

	test('releases a typed-error worker so a later invocation can start a fresh worker', async () => {
		const failedWorker = fakeWorker({
			id: 'T-failed-worker',
			state: 'error',
			waitForResponse: async () => { throw new Error('worker failed') },
		})
		const replacementWorker = fakeWorker({ id: 'T-replacement-worker' })
		const workers = [failedWorker.worker, replacementWorker.worker]
		const harness = fakeAmp({ createThread: () => workers.shift() })
		const operations: LogseqOperationStore = new Map()

		const first = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(first).toContain('Worker: failed')
		expect(first).toContain('Logseq: unverified')
		expect(operations.size).toBe(0)

		const second = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(second).toContain('Logseq: complete')
		expect(harness.createCalls).toBe(2)
		expect(failedWorker.appended).toHaveLength(1)
		expect(replacementWorker.appended).toHaveLength(1)
	})

	test('does not append another repair while one is processing', async () => {
		const repair = deferred<unknown>()
		const responses = [assistantResponse('first', partialResult)]
		const { worker, appended } = fakeWorker({
			waitForResponse: () => responses.length ? responses.shift()! : repair.promise,
		})
		const harness = fakeAmp({ createThread: () => worker })
		const operations: LogseqOperationStore = new Map()
		await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)

		const second = logCurrentTask(harness.amp as never, context() as never, '', 500, operations, { ...timing, workerTimeoutMs: 100 })
		while (appended.length < 2) await Promise.resolve()
		const third = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(third).toContain('already reconciling')
		expect(appended).toHaveLength(2)
		repair.resolve(assistantResponse('second', completeResult))
		await second
	})

	test('accepts a fresh stored response when append settlement is unresolved', async () => {
		const response = assistantResponse('stored-after-append')
		const { worker, appended } = fakeWorker({
			appendUserMessage: () => new Promise(() => {}),
			messages: () => [response],
		})
		const harness = fakeAmp({ createThread: () => worker })
		const operations: LogseqOperationStore = new Map()
		const output = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, { ...timing, startupTimeoutMs: 1 })
		expect(output).toContain('Logseq: complete')
		expect(appended).toHaveLength(1)
	})

	test('does not duplicate an unresolved initial append', async () => {
		const { worker, appended } = fakeWorker({
			appendUserMessage: () => new Promise(() => {}),
			waitForResponse: async () => { throw new Error('Timed out waiting for agent response') },
		})
		const harness = fakeAmp({ createThread: () => worker })
		const operations: LogseqOperationStore = new Map()
		const shortTiming = { startupTimeoutMs: 1, workerTimeoutMs: 1 }
		await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, shortTiming)
		const output = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, shortTiming)
		expect(output).toContain('Worker: pending')
		expect(appended).toHaveLength(1)
	})

	test('does not duplicate an unresolved repair append', async () => {
		let appendCalls = 0
		const responses = [assistantResponse('first', partialResult)]
		const { worker, appended } = fakeWorker({
			appendUserMessage: () => {
				appendCalls += 1
				return appendCalls === 1 ? undefined : new Promise(() => {})
			},
			waitForResponse: () => responses.length
				? responses.shift()!
				: Promise.reject(new Error('Timed out waiting for agent response')),
		})
		const harness = fakeAmp({ createThread: () => worker })
		const operations: LogseqOperationStore = new Map()
		const shortTiming = { startupTimeoutMs: 1, workerTimeoutMs: 1 }
		await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, shortTiming)
		await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, shortTiming)
		const output = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, shortTiming)
		expect(output).toContain('Worker: pending')
		expect(appended).toHaveLength(2)
	})

	test('keeps unresolved creation owned without a worker ID', async () => {
		const harness = fakeAmp({ createThread: () => new Promise(() => {}) })
		const operations: LogseqOperationStore = new Map()
		const output = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, { ...timing, startupTimeoutMs: 1 })
		expect(output).toContain('Worker: pending (ID not assigned yet)')
		expect(operations.size).toBe(1)
	})

	test('adopts a delayed creation result without creating another worker', async () => {
		const creation = deferred<unknown>()
		const { worker } = fakeWorker()
		const harness = fakeAmp({ createThread: () => creation.promise })
		const operations: LogseqOperationStore = new Map()
		const shortTiming = { startupTimeoutMs: 1, workerTimeoutMs: 20 }

		const first = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, shortTiming)
		expect(first).toContain('Worker: pending (ID not assigned yet)')
		creation.resolve(worker)
		const second = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(second).toContain('Logseq: complete')
		expect(harness.createCalls).toBe(1)
	})

	test('keeps rejected creation owned because remote acceptance is unknown', async () => {
		const harness = fakeAmp({ createThread: () => Promise.reject(new Error('transport rejected')) })
		const operations: LogseqOperationStore = new Map()
		const first = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		const second = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(first).toContain('Worker: pending (ID not assigned yet)')
		expect(second).toContain('Worker: pending (ID not assigned yet)')
		expect(harness.createCalls).toBe(1)
	})

	test('releases a definite synchronous creation failure', async () => {
		const harness = fakeAmp({ createThread: () => { throw new Error('invalid create request') } })
		const operations: LogseqOperationStore = new Map()
		const output = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(output).toContain('Worker: failed (ID not assigned yet)')
		expect(output).toContain('invalid create request')
		expect(operations.size).toBe(0)
	})

	test('keeps a rejected append owned when message acceptance is unknown', async () => {
		const { worker, appended } = fakeWorker({
			appendUserMessage: async () => { throw new Error('transport rejected') },
			waitForResponse: async () => { throw new Error('Timed out waiting for agent response') },
		})
		const harness = fakeAmp({ createThread: () => worker })
		const operations: LogseqOperationStore = new Map()

		const first = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		const second = await logCurrentTask(harness.amp as never, context() as never, '', 500, operations, timing)
		expect(first).toContain('Worker: pending')
		expect(second).toContain('Worker: pending')
		expect(harness.createCalls).toBe(1)
		expect(appended).toHaveLength(1)
	})

	test('keeps different parent operations independent', async () => {
		const firstWorker = fakeWorker({ id: 'T-worker-1', waitForResponse: async () => { throw new Error('Timed out waiting for agent response') } }).worker
		const secondWorker = fakeWorker({ id: 'T-worker-2', waitForResponse: async () => { throw new Error('Timed out waiting for agent response') } }).worker
		const workers = [firstWorker, secondWorker]
		const harness = fakeAmp({ createThread: () => workers.shift() })
		const operations: LogseqOperationStore = new Map()
		await Promise.all([
			logCurrentTask(harness.amp as never, context('T-parent-1') as never, '', 500, operations, timing),
			logCurrentTask(harness.amp as never, context('T-parent-2') as never, '', 500, operations, timing),
		])
		expect(harness.createCalls).toBe(2)
		expect(operations.size).toBe(2)
	})
})

describe('plugin turn routing and shared operation', () => {
	test('blocks graph writes for the matching explicit turn and fails open otherwise', async () => {
		const { worker } = fakeWorker({ waitForResponse: async () => { throw new Error('Timed out waiting for agent response') } })
		const harness = fakeAmp({ createThread: () => worker })
		plugin(harness.amp as never)
		const start = harness.hooks.get('agent.start')!
		const end = harness.hooks.get('agent.end')!
		const toolCall = harness.hooks.get('tool.call')!

		expect(await start({ thread: { id: parentID }, id: 'turn-1', message: 'Log this into Logseq.' } as never)).toBeTruthy()
		expect(await toolCall({ thread: { id: parentID }, tool: 'apply_patch', input: { files: [`${runtimeGraphRoot}/pages/Backlog.md`, '/tmp/code.ts'] } } as never)).toEqual(expect.objectContaining({ action: 'reject-and-continue' }))
		expect(await toolCall({ thread: { id: parentID }, tool: 'apply_patch', input: { files: ['/tmp/code.ts'] } } as never)).toEqual({ action: 'allow' })
		expect(await toolCall({ thread: { id: parentID }, tool: 'shell_command', input: {} } as never)).toEqual({ action: 'allow' })

		await end({ thread: { id: parentID }, id: 'other-turn' } as never)
		expect(await toolCall({ thread: { id: parentID }, tool: 'apply_patch', input: { files: [`${runtimeGraphRoot}/pages/Backlog.md`] } } as never)).toEqual(expect.objectContaining({ action: 'reject-and-continue' }))
		await end({ thread: { id: parentID }, id: 'turn-1' } as never)
		expect(await toolCall({ thread: { id: parentID }, tool: 'apply_patch', input: { files: [`${runtimeGraphRoot}/pages/Backlog.md`] } } as never)).toEqual({ action: 'allow' })
	})

	test('replaces stale routing markers on every new turn', async () => {
		const harness = fakeAmp()
		plugin(harness.amp as never)
		const start = harness.hooks.get('agent.start')!
		const end = harness.hooks.get('agent.end')!
		const toolCall = harness.hooks.get('tool.call')!
		const graphWrite = { thread: { id: parentID }, tool: 'apply_patch', input: { files: [`${runtimeGraphRoot}/pages/Backlog.md`] } }

		await start({ thread: { id: parentID }, id: 'turn-1', message: 'Log this into Logseq.' } as never)
		await start({ thread: { id: parentID }, id: 'turn-2', message: 'Log this task into Logseq.' } as never)
		await end({ thread: { id: parentID }, id: 'turn-1' } as never)
		expect(await toolCall(graphWrite as never)).toEqual(expect.objectContaining({ action: 'reject-and-continue' }))

		await start({ thread: { id: parentID }, id: 'turn-3', message: 'Inspect the project code.' } as never)
		expect(await toolCall(graphWrite as never)).toEqual({ action: 'allow' })
	})

	test('fails open when file-mutation helpers cannot classify a call', async () => {
		const harness = fakeAmp({ filesModifiedByToolCall: () => { throw new Error('unsupported input') } })
		plugin(harness.amp as never)
		await harness.hooks.get('agent.start')!({ thread: { id: parentID }, id: 'turn-1', message: 'Log this into Logseq.' } as never)
		const result = await harness.hooks.get('tool.call')!({ thread: { id: parentID }, tool: 'unknown_writer', input: {} } as never)
		expect(result).toEqual({ action: 'allow' })
	})

	test('exempts worker-prefixed turns and known workers', async () => {
		const { worker } = fakeWorker({ waitForResponse: async () => { throw new Error('Timed out waiting for agent response') } })
		const harness = fakeAmp({ createThread: () => worker })
		plugin(harness.amp as never)
		const start = harness.hooks.get('agent.start')!
		const toolCall = harness.hooks.get('tool.call')!

		expect(await start({ thread: { id: workerID }, id: 'worker-turn', message: '[logseq-manual-log]\nLog to Logseq.' } as never)).toBeUndefined()
		await harness.tool!.execute({}, context() as never)
		expect(await toolCall({ thread: { id: workerID }, tool: 'apply_patch', input: { files: [`${runtimeGraphRoot}/pages/Backlog.md`] } } as never)).toEqual({ action: 'allow' })
	})

	test('command and agent tool reuse the same parent operation', async () => {
		const { worker, appended } = fakeWorker({ waitForResponse: async () => { throw new Error('Timed out waiting for agent response') } })
		const harness = fakeAmp({ createThread: () => worker })
		plugin(harness.amp as never)
		await harness.tool!.execute({}, context() as never)
		await harness.command!({
			thread: { id: parentID },
			ui: { input: async () => '', notify: async () => {} },
		} as never)
		expect(harness.createCalls).toBe(1)
		expect(appended).toHaveLength(1)
	})
})
