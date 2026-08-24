// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// logseq-manual-log — command-palette action for manually asking Amp to log
// the current thread/task into the user's Logseq graph. This intentionally has
// no agent lifecycle hook: logging only happens when the command is invoked.

import type {
	BuiltinAgentMode,
	PluginAPI,
	PluginCommandContext,
	ThreadAssistantMessage,
	ThreadID,
	ThreadMessage,
	ThreadMessageID,
	ThreadState,
} from '@ampcode/plugin'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const LOGSEQ_REPO = process.env.AMP_LOGSEQ_GRAPH_DIR ?? '/Users/lelouvincx/Developer/second-brain-logseq'
const WORKER_MODE = 'high' as BuiltinAgentMode
const WORKER_STARTUP_TIMEOUT_MS = 15_000
const WORKER_TIMEOUT_MS = 10 * 60 * 1000
const WORKER_ERROR_RECOVERY_TIMEOUT_MS = 15_000
const MAX_NOTIFICATION_CHARS = 500
const LOGSEQ_WORKER_PROMPT_PREFIX = '[logseq-manual-log]'
const WORKER_RESULT_VERSION = 2
const WORKER_RESULT_KEYS = ['backlogVerified', 'error', 'journalVerified', 'parentThreadUpdated', 'summary', 'version']

type LogContext = Pick<PluginCommandContext, 'thread'>
type WorkerThread = {
	id: ThreadID
	state: {
		get(): Promise<ThreadState>
		subscribe(onNext: (state: ThreadState) => void): { unsubscribe(): void }
	}
	waitForResponse(options: { timeoutMs: number }): Promise<ThreadAssistantMessage>
	messages(options: { from: 'end'; limit: number; roles: Array<'user' | 'assistant'> }): Promise<ThreadMessage[]>
	messages(options: { full: true; from: 'start'; limit: number }): Promise<ThreadMessage[]>
	appendUserMessage(message: { type: 'user-message'; content: string }): Promise<void>
}

type WorkerStatus = 'creating' | 'starting' | 'running' | 'pending' | 'result-received' | 'failed'
type LogseqStatus = 'unverified' | 'partial' | 'complete' | 'failed'
type DownstreamStatus = 'not-attempted' | 'running' | 'complete' | 'failed'
type AppendStatus = 'none' | 'pending' | 'accepted' | 'unknown'
type LogseqValidation = { backlogVerified: boolean; journalVerified: boolean; error?: string }
type LogseqVerifier = (parentThreadID: string) => Promise<LogseqValidation>
type Timing = {
	startupTimeoutMs: number
	workerTimeoutMs: number
	checkpointDir?: string | null
	verifyLogseqWrite?: LogseqVerifier
	onWorkerCreated?: (workerID: ThreadID) => void | Promise<void>
}
type RecoveryCheckpoint = { version: 1; parentThreadID: ThreadID; workerThreadID: ThreadID }
type WorkerResult = {
	version: 2
	backlogVerified: boolean
	journalVerified: boolean
	parentThreadUpdated: boolean
	summary: string
	error: string | null
}
type WorkerWaitOutcome =
	| { kind: 'response'; response: ThreadAssistantMessage }
	| { kind: 'pending'; error?: string }
	| { kind: 'failed'; error: string }
type CompatibilityError = 'thread-messages-timeout' | 'worker-response-timeout' | null
type StartupGuard = { promise: Promise<'timeout' | 'error' | 'unknown'>; cancel(): void }

export type LogseqOperation = {
	parentThreadID: ThreadID
	hint: string
	processing: boolean
	generation: number
	creationPromise?: Promise<WorkerThread>
	creationUncertain: boolean
	checkpointReady: boolean
	worker?: WorkerThread
	workerID?: ThreadID
	workerStatus: WorkerStatus
	turnInFlight: boolean
	appendPromise?: Promise<void>
	appendStatus: AppendStatus
	lastConsumedAssistantMessageID?: ThreadMessageID
	logseqStatus: LogseqStatus
	parentThreadStatus: DownstreamStatus
	archiveStatus: DownstreamStatus
	summary?: string
	workerError?: string
	parentThreadError?: string
	archiveError?: string
	restartAllowed: boolean
}

export type LogseqOperationStore = Map<ThreadID, LogseqOperation>

const DEFAULT_TIMING: Timing = {
	startupTimeoutMs: WORKER_STARTUP_TIMEOUT_MS,
	workerTimeoutMs: WORKER_TIMEOUT_MS,
	checkpointDir: join(tmpdir(), 'amp-logseq-manual-log'),
}

export default function (amp: PluginAPI, timingOverrides: Partial<Timing> = {}) {
	const operations = new Map<ThreadID, LogseqOperation>()
	const timing = { ...DEFAULT_TIMING, ...timingOverrides }

	amp.logger.log(`[logseq-manual-log] plugin loaded → ${LOGSEQ_REPO}`)

	amp.registerCommand(
		'logseq-log-current-task',
		{
			title: 'Log Current Task',
			category: 'Logseq',
			description: 'Manually ask Amp to log this thread/task into Logseq.',
		},
		async (ctx) => {
			if (!ctx.thread) {
				await ctx.ui.notify('Open an Amp thread before running Logseq: Log current task.')
				return
			}

			const hint = await ctx.ui.input({
				title: 'Log current task to Logseq',
				message:
					'Optional target, note, or source link, e.g. "update DAT-594" or a Slack/PR/Notion URL. Leave blank to infer from this thread.',
				placeholder: 'Optional Logseq target / context / source links',
				submitButtonText: 'Log to Logseq',
			})

			if (hint === undefined) {
				await ctx.ui.notify('Logseq logging cancelled.')
				return
			}
			const result = await logCurrentTask(amp, ctx, hint.trim(), MAX_NOTIFICATION_CHARS, operations, {
				...timing,
				onWorkerCreated: (workerID) => ctx.ui.notify(`Logseq Amp thread created: ${workerID}`),
			})
			await ctx.ui.notify(result)
		},
	)
}

export async function logCurrentTask(
	amp: PluginAPI,
	ctx: LogContext,
	hint: string,
	maxResultChars: number,
	operations: LogseqOperationStore,
	timing: Timing = DEFAULT_TIMING,
): Promise<string> {
	if (!ctx.thread) {
		throw new Error('Open an Amp thread before running Logseq: Log current task.')
	}

	const parentThreadID = ctx.thread.id
	let operation = operations.get(parentThreadID)
	if (operation?.processing) return formatOperation(operation, maxResultChars, 'Another invocation is already reconciling this operation.')
	if (!operation) {
		operation = newOperation(parentThreadID, hint)
		operation.processing = true
		operations.set(parentThreadID, operation)
		try {
			const restored = await restoreOperation(amp, parentThreadID, hint, timing.checkpointDir)
			restored.processing = true
			operation = restored
			operations.set(parentThreadID, operation)
		} catch (error) {
			operation.creationUncertain = true
			operation.workerStatus = 'pending'
			operation.workerError = `Recovery checkpoint could not be read safely: ${errorMessage(error)}`
		}
	} else {
		operation.processing = true
	}
	try {
		await advanceOperation(amp, operation, timing)
		return formatOperation(operation, maxResultChars)
	} finally {
		operation.processing = false
		if (operation.restartAllowed || isFullyComplete(operation)) {
			operations.delete(parentThreadID)
			await removeCheckpoint(timing.checkpointDir, parentThreadID).catch((error) => {
				amp.logger.log(`[logseq-manual-log] checkpoint cleanup failed: ${errorMessage(error)}`)
			})
		}
	}
}

function newOperation(parentThreadID: ThreadID, hint: string): LogseqOperation {
	return {
		parentThreadID,
		hint,
		processing: false,
		generation: 0,
		creationUncertain: false,
		checkpointReady: false,
		workerStatus: 'creating',
		turnInFlight: false,
		appendStatus: 'none',
		logseqStatus: 'unverified',
		parentThreadStatus: 'not-attempted',
		archiveStatus: 'not-attempted',
		restartAllowed: false,
	}
}

async function restoreOperation(
	amp: PluginAPI,
	parentThreadID: ThreadID,
	hint: string,
	checkpointDir: string | null | undefined,
): Promise<LogseqOperation> {
	const checkpoint = await readCheckpoint(checkpointDir, parentThreadID)
	const operation = newOperation(parentThreadID, hint)
	if (!checkpoint) return operation

	operation.worker = amp.threads.get(checkpoint.workerThreadID) as unknown as WorkerThread
	operation.workerID = checkpoint.workerThreadID
	operation.checkpointReady = true
	operation.workerStatus = 'pending'
	try {
		const [initialMessage] = await operation.worker.messages({ full: true, from: 'start', limit: 1 })
		if (!initialMessage) return operation
		if (!isBoundWorkerPrompt(initialMessage, parentThreadID, checkpoint.workerThreadID)) {
			await removeCheckpoint(checkpointDir, parentThreadID)
			return newOperation(parentThreadID, hint)
		}
		operation.generation = 1
		operation.turnInFlight = true
		operation.appendStatus = 'accepted'
		const [latestMessage] = await operation.worker.messages({ from: 'end', limit: 1, roles: ['user', 'assistant'] })
		if (latestMessage?.role === 'user') {
			const [previousResponse] = await operation.worker.messages({ from: 'end', limit: 1, roles: ['assistant'] })
			if (previousResponse?.role === 'assistant') operation.lastConsumedAssistantMessageID = previousResponse.id
		}
	} catch (error) {
		operation.generation = 1
		operation.turnInFlight = true
		operation.appendStatus = 'unknown'
		operation.workerError = `Worker message lookup is pending: ${errorMessage(error)}`
	}
	return operation
}

function isBoundWorkerPrompt(message: ThreadMessage, parentThreadID: ThreadID, workerThreadID: ThreadID): boolean {
	if (message.role !== 'user') return false
	const text = message.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
	return text.startsWith(LOGSEQ_WORKER_PROMPT_PREFIX)
		&& text.includes(`- Parent Amp thread id: ${parentThreadID}\n`)
		&& text.includes(`- Worker Amp thread id: ${workerThreadID}\n`)
}

async function readCheckpoint(checkpointDir: string | null | undefined, parentThreadID: ThreadID): Promise<RecoveryCheckpoint | undefined> {
	if (!checkpointDir) return undefined
	let text: string
	try {
		text = await readFile(checkpointPath(checkpointDir, parentThreadID), 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
	const value = JSON.parse(text) as Partial<RecoveryCheckpoint>
	if (value.version !== 1 || value.parentThreadID !== parentThreadID || typeof value.workerThreadID !== 'string') {
		throw new Error(`Invalid checkpoint at ${checkpointPath(checkpointDir, parentThreadID)}`)
	}
	return value as RecoveryCheckpoint
}

async function saveCheckpoint(checkpointDir: string | null | undefined, checkpoint: RecoveryCheckpoint): Promise<void> {
	if (!checkpointDir) return
	await mkdir(checkpointDir, { recursive: true })
	const path = checkpointPath(checkpointDir, checkpoint.parentThreadID)
	const temporaryPath = `${path}.${process.pid}.tmp`
	await writeFile(temporaryPath, JSON.stringify(checkpoint), 'utf8')
	await rename(temporaryPath, path)
}

async function removeCheckpoint(checkpointDir: string | null | undefined, parentThreadID: ThreadID): Promise<void> {
	if (!checkpointDir) return
	try {
		await unlink(checkpointPath(checkpointDir, parentThreadID))
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
	}
}

function checkpointPath(checkpointDir: string, parentThreadID: ThreadID): string {
	return join(checkpointDir, `${parentThreadID}.json`)
}

async function advanceOperation(amp: PluginAPI, operation: LogseqOperation, timing: Timing): Promise<void> {
	if (!operation.worker) {
		await ensureWorker(amp, operation, timing)
		if (!operation.worker) return
	}
	if (!await ensureCheckpoint(amp, operation, timing)) return

	if (operation.turnInFlight) {
		await consumeCurrentTurn(operation, timing)
		if (isReadyToArchive(operation)) await archiveWorker(amp, operation)
		return
	}

	if (isReadyToArchive(operation)) {
		await archiveWorker(amp, operation)
		return
	}

	await startWorkerTurn(operation, timing)
	if (operation.turnInFlight) await consumeCurrentTurn(operation, timing)
	if (isReadyToArchive(operation)) await archiveWorker(amp, operation)
}

async function ensureWorker(amp: PluginAPI, operation: LogseqOperation, timing: Timing): Promise<void> {
	if (operation.creationUncertain) return
	if (!operation.creationPromise) {
		operation.workerStatus = 'creating'
		try {
			const workerAgent = amp.getBuiltinAgent(WORKER_MODE)
			const creationPromise = workerAgent.createThread({
				parentThreadID: operation.parentThreadID,
				show: false,
			}) as Promise<WorkerThread>
			operation.creationPromise = creationPromise
			void creationPromise.then(
				(worker) => notifyWorkerCreated(amp, timing, worker.id),
				() => {},
			)
		} catch (error) {
			operation.workerStatus = 'failed'
			operation.workerError = errorMessage(error)
			operation.restartAllowed = true
			return
		}
	}

	const outcome = await settleWithin(operation.creationPromise, timing.startupTimeoutMs)
	if (outcome.kind === 'timeout') {
		operation.workerStatus = 'pending'
		operation.workerError = 'Worker creation is still unresolved.'
		return
	}
	if (outcome.kind === 'rejected') {
		operation.creationUncertain = true
		operation.workerStatus = 'pending'
		operation.workerError = `Worker creation was rejected, but remote acceptance is unknown: ${errorMessage(outcome.error)}`
		return
	}

	operation.creationPromise = undefined
	operation.worker = outcome.value
	operation.workerID = outcome.value.id
	operation.workerStatus = 'starting'
	operation.workerError = undefined
}

async function ensureCheckpoint(amp: PluginAPI, operation: LogseqOperation, timing: Timing): Promise<boolean> {
	if (operation.checkpointReady) return true
	if (!operation.workerID) return false
	try {
		await saveCheckpoint(timing.checkpointDir, {
			version: 1,
			parentThreadID: operation.parentThreadID,
			workerThreadID: operation.workerID,
		})
		operation.checkpointReady = true
		operation.workerError = undefined
		return true
	} catch (error) {
		operation.workerStatus = 'pending'
		operation.workerError = `Checkpoint write failed; worker prompt was not sent: ${errorMessage(error)}`
		amp.logger.log(`[logseq-manual-log] ${operation.workerError}`)
		return false
	}
}

function notifyWorkerCreated(amp: PluginAPI, timing: Timing, workerID: ThreadID): void {
	if (!timing.onWorkerCreated) return
	try {
		const notification = timing.onWorkerCreated(workerID)
		void Promise.resolve(notification).catch((error) => {
			amp.logger.log(`[logseq-manual-log] worker creation notification failed: ${errorMessage(error)}`)
		})
	} catch (error) {
		amp.logger.log(`[logseq-manual-log] worker creation notification failed: ${errorMessage(error)}`)
	}
}

async function startWorkerTurn(operation: LogseqOperation, timing: Timing): Promise<void> {
	if (!operation.worker || operation.creationUncertain) return
	operation.generation += 1
	operation.turnInFlight = true
	operation.appendStatus = 'pending'
	operation.workerStatus = 'starting'
	operation.workerError = undefined
	const content = operation.generation === 1
		? buildPrompt(operation.parentThreadID, operation.worker.id, operation.hint)
		: buildReconciliationPrompt(operation)

	try {
		operation.appendPromise = operation.worker.appendUserMessage({ type: 'user-message', content })
	} catch (error) {
		operation.generation -= 1
		operation.turnInFlight = false
		operation.appendStatus = 'none'
		operation.workerStatus = 'pending'
		operation.workerError = `Worker message delivery failed before acceptance: ${errorMessage(error)}`
		return
	}

	await settleAppend(operation, timing.startupTimeoutMs)
}

async function settleAppend(operation: LogseqOperation, timeoutMs: number): Promise<void> {
	if (!operation.appendPromise) return
	const outcome = await settleWithin(operation.appendPromise, timeoutMs)
	if (outcome.kind === 'timeout') {
		operation.workerStatus = 'pending'
		operation.appendStatus = 'pending'
		operation.workerError = 'Worker message delivery is still unresolved.'
		return
	}
	if (outcome.kind === 'rejected') {
		operation.workerStatus = 'pending'
		operation.appendStatus = 'unknown'
		operation.workerError = `Worker message delivery was rejected, but acceptance is unknown: ${errorMessage(outcome.error)}`
		return
	}
	operation.appendPromise = undefined
	operation.appendStatus = 'accepted'
	operation.workerStatus = 'running'
}

async function consumeCurrentTurn(operation: LogseqOperation, timing: Timing): Promise<void> {
	if (!operation.worker) return
	if (operation.appendStatus === 'pending') await settleAppend(operation, timing.startupTimeoutMs)

	const startupGuard = watchWorkerStartup(operation.worker, timing.startupTimeoutMs)
	const outcome = await waitForWorkerOutcome(
		operation.worker,
		operation.lastConsumedAssistantMessageID,
		startupGuard,
		timing.workerTimeoutMs,
	)
	startupGuard.cancel()

	if (outcome.kind === 'pending') {
		operation.workerStatus = 'pending'
		operation.workerError = outcome.error
		return
	}
	if (outcome.kind === 'failed') {
		operation.turnInFlight = false
		operation.appendPromise = undefined
		operation.appendStatus = 'none'
		operation.workerStatus = 'failed'
		operation.workerError = outcome.error
		operation.restartAllowed = true
		return
	}

	await consumeWorkerResponse(operation, outcome.response, timing.verifyLogseqWrite ?? verifyLogseqGraph)
}

export async function waitForWorkerOutcome(
	workerThread: WorkerThread,
	lastConsumedAssistantMessageID: ThreadMessageID | undefined,
	startupGuard: StartupGuard,
	timeoutMs = WORKER_TIMEOUT_MS,
): Promise<WorkerWaitOutcome> {
	const deadline = Date.now() + timeoutMs
	while (true) {
		const stored = await getFreshWorkerResponse(workerThread, lastConsumedAssistantMessageID)
		if (stored.kind === 'response') return stored
		const remainingMs = deadline - Date.now()
		if (remainingMs <= 0) return reconcileWorkerAfterWait(workerThread, lastConsumedAssistantMessageID, 'Timed out waiting for agent response')
		try {
			const outcome = await Promise.race([
				workerThread.waitForResponse({ timeoutMs: remainingMs }).then((response) => ({ kind: 'response' as const, response })),
				startupGuard.promise.then((signal) => ({ kind: 'startup' as const, signal })),
			])
			if (outcome.kind === 'response' && outcome.response.id !== lastConsumedAssistantMessageID) return outcome
			return reconcileWorkerAfterWait(workerThread, lastConsumedAssistantMessageID, outcome.kind === 'startup' ? outcome.signal : undefined)
		} catch (error) {
			const reconciled = await reconcileWorkerAfterWait(workerThread, lastConsumedAssistantMessageID, error)
			if (reconciled.kind !== 'failed') return reconciled
			const recoveryMs = Math.min(WORKER_ERROR_RECOVERY_TIMEOUT_MS, deadline - Date.now())
			if (recoveryMs <= 0 || !await waitForWorkerRecovery(workerThread, recoveryMs)) return reconciled
		}
	}
}

function waitForWorkerRecovery(workerThread: WorkerThread, timeoutMs: number): Promise<boolean> {
	return new Promise((resolvePromise) => {
		let settled = false
		let subscription: { unsubscribe(): void } | undefined
		const finish = (recovered: boolean) => {
			if (settled) return
			settled = true
			clearTimeout(timeout)
			subscription?.unsubscribe()
			resolvePromise(recovered)
		}
		const timeout = setTimeout(() => finish(false), timeoutMs)
		try {
			subscription = workerThread.state.subscribe((state) => {
				if (state !== 'error') finish(true)
			})
			void workerThread.state.get().then((state) => {
				if (state !== 'error') finish(true)
			}, () => finish(false))
		} catch {
			finish(false)
		}
	})
}

async function reconcileWorkerAfterWait(
	workerThread: WorkerThread,
	lastConsumedAssistantMessageID: ThreadMessageID | undefined,
	reason?: unknown,
): Promise<WorkerWaitOutcome> {
	const stored = await getFreshWorkerResponse(workerThread, lastConsumedAssistantMessageID)
	if (stored.kind === 'response') return stored
	if (stored.kind === 'unknown') return { kind: 'pending', error: stored.error }
	try {
		const state = await workerThread.state.get()
		if (state === 'error') return { kind: 'failed', error: errorMessage(reason || 'Worker entered an error state.') }
		return { kind: 'pending', error: reason ? errorMessage(reason) : `Worker is ${state}.` }
	} catch (error) {
		return { kind: 'pending', error: `Worker state is unresolved: ${errorMessage(error)}` }
	}
}

async function getFreshWorkerResponse(
	workerThread: WorkerThread,
	lastConsumedAssistantMessageID: ThreadMessageID | undefined,
): Promise<{ kind: 'response'; response: ThreadAssistantMessage } | { kind: 'none' } | { kind: 'unknown'; error: string }> {
	try {
		const state = await workerThread.state.get()
		if (state !== 'idle') return { kind: 'none' }
		const [message] = await workerThread.messages({ from: 'end', limit: 1, roles: ['assistant'] })
		if (message?.role !== 'assistant' || message.id === lastConsumedAssistantMessageID) return { kind: 'none' }
		return { kind: 'response', response: message }
	} catch (error) {
		const compatibility = classifyWorkerCompatibilityError(error)
		return {
			kind: 'unknown',
			error: compatibility
				? `Worker response lookup is pending (${compatibility}).`
				: `Worker response lookup failed: ${errorMessage(error)}`,
		}
	}
}

function watchWorkerStartup(workerThread: WorkerThread, timeoutMs: number): StartupGuard {
	let active = true
	let subscription: { unsubscribe(): void } | undefined
	let timeout: ReturnType<typeof setTimeout> | undefined
	let resolveStartup: (signal: 'timeout' | 'error' | 'unknown') => void = () => {}

	const cancel = () => {
		if (!active) return
		active = false
		if (timeout) clearTimeout(timeout)
		subscription?.unsubscribe()
	}
	const checkState = (state: ThreadState) => {
		if (!active) return
		if (state === 'error') {
			cancel()
			resolveStartup('error')
		} else if (state === 'running' || state === 'awaiting-approval') {
			cancel()
		}
	}
	const promise = new Promise<'timeout' | 'error' | 'unknown'>((resolvePromise) => {
		resolveStartup = resolvePromise
		subscription = workerThread.state.subscribe(checkState)
		if (!active) {
			subscription.unsubscribe()
		} else {
			timeout = setTimeout(() => {
				cancel()
				resolvePromise('timeout')
			}, timeoutMs)
		}
		void workerThread.state.get().then(checkState, () => {
			cancel()
			resolvePromise('unknown')
		})
	})

	return { promise, cancel }
}

export function classifyWorkerCompatibilityError(error: unknown): CompatibilityError {
	const message = errorMessage(error)
	if (message.includes('Plugin thread.messages timed out')) return 'thread-messages-timeout'
	if (message.includes('Timed out waiting for agent response')) return 'worker-response-timeout'
	return null
}

async function consumeWorkerResponse(
	operation: LogseqOperation,
	response: ThreadAssistantMessage,
	verifyLogseqWrite: LogseqVerifier,
): Promise<void> {
	operation.lastConsumedAssistantMessageID = response.id
	operation.turnInFlight = false
	operation.appendPromise = undefined
	operation.appendStatus = 'none'
	operation.workerStatus = 'result-received'
	const parsed = parseWorkerResult(extractAssistantText(response))
	if (!parsed.ok) {
		operation.workerError = parsed.error
		operation.summary = 'Worker returned an invalid result. Run the command again to reconcile existing Logseq state.'
		return
	}

	operation.summary = parsed.result.summary
	const parentOnlyFailure = parsed.result.backlogVerified
		&& parsed.result.journalVerified
		&& !parsed.result.parentThreadUpdated
	operation.workerError = parentOnlyFailure ? undefined : parsed.result.error || undefined
	operation.parentThreadStatus = parsed.result.parentThreadUpdated
		? 'complete'
		: parsed.result.backlogVerified && parsed.result.journalVerified
			? 'failed'
			: 'not-attempted'
	operation.parentThreadError = operation.parentThreadStatus === 'failed' ? parsed.result.error || undefined : undefined
	if (!parsed.result.backlogVerified) {
		operation.logseqStatus = 'failed'
		return
	}

	const validation = await verifyLogseqWrite(operation.parentThreadID)
	const backlogVerified = parsed.result.backlogVerified && validation.backlogVerified
	const journalVerified = parsed.result.journalVerified && validation.journalVerified
	if (backlogVerified && journalVerified) operation.logseqStatus = 'complete'
	else if (backlogVerified) operation.logseqStatus = 'partial'
	else operation.logseqStatus = 'failed'
	if (validation.error) operation.workerError = validation.error
}

type LogseqBlock = {
	indent: number
	parent?: number
	marker?: string
	headline: string
	properties: Map<string, string[]>
}

const ACTIONABLE_MARKERS = new Set(['TODO', 'DOING', 'DONE', 'WAITING', 'NOW', 'BLOCKED', 'CANCELLED'])
const ACTIVE_MARKERS = new Set(['TODO', 'DOING', 'WAITING', 'NOW', 'BLOCKED'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validateLogseqWrite(
	backlogText: string,
	journalText: string,
	parentThreadID: string,
	today: string,
): LogseqValidation {
	const blocks = parseLogseqBlocks(backlogText)
	const tasks = blocks.filter((block) =>
		block.marker
		&& ACTIONABLE_MARKERS.has(block.marker)
		&& propertyValues(block, 'input').some((value) => value.includes(parentThreadID)),
	)
	if (tasks.length !== 1) {
		return {
			backlogVerified: false,
			journalVerified: false,
			error: `Independent Logseq validation found ${tasks.length} parent-linked Backlog tasks; expected exactly 1.`,
		}
	}

	const task = tasks[0]
	const taskIndex = blocks.indexOf(task)
	const errors: string[] = []
	const taskID = singleProperty(task, 'id')
	if (!taskID || !UUID_PATTERN.test(taskID)) errors.push('task id:: must be one UUID')
	else if (blocks.filter((block) => propertyValues(block, 'id').includes(taskID)).length !== 1) errors.push('task id:: must be unique')
	if (!/^\[\[[^\]]+\]\]$/.test(singleProperty(task, 'project') ?? '')) errors.push('project:: must be one page reference')
	if (!/^#P\d+$/.test(singleProperty(task, 'priority') ?? '')) errors.push('priority:: must be one #P value')
	if (singleProperty(task, 'updated-at') !== today) errors.push(`updated-at:: must be ${today}`)
	if (task.marker && ACTIVE_MARKERS.has(task.marker) && !singleProperty(task, 'next-action')?.trim()) {
		errors.push('active task must have next-action::')
	}
	if (task.marker === 'DONE') {
		if (!/^\[\[\d{4}-\d{2}-\d{2}\]\]$/.test(singleProperty(task, 'completed') ?? '')) errors.push('DONE task must have completed:: [[YYYY-MM-DD]]')
		if (propertyValues(task, 'next-action').length || propertyValues(task, 'blocker').length) errors.push('DONE task must not have next-action:: or blocker::')
	}

	const linearIDs = new Set(`${task.headline} ${propertyValues(task, 'input').join(' ')}`.match(/\b(?:DAT|PS|DOC)-\d+\b/g) ?? [])
	if (linearIDs.size && !linearIDs.has(singleProperty(task, 'linear') ?? '')) errors.push('linear:: must match a Linear issue ID in the task title or input')

	const activities = blocks.filter((block) =>
		block.parent === taskIndex
		&& propertyValues(block, 'observed-at').includes(today)
		&& propertyValues(block, 'outcome').some((value) => value.trim())
		&& propertyValues(block, 'id').some((value) => UUID_PATTERN.test(value)),
	)
	if (!activities.length) errors.push(`direct activity for ${today} must have id::, observed-at::, and outcome::`)
	if (errors.length) {
		return {
			backlogVerified: false,
			journalVerified: false,
			error: `Independent Logseq validation failed: ${errors.join('; ')}.`,
		}
	}

	const journalVerified = Boolean(taskID && journalText.includes(`((${taskID}))`))
	return {
		backlogVerified: true,
		journalVerified,
		error: journalVerified ? undefined : 'Independent Logseq validation found no journal block reference to the parent-linked task.',
	}
}

async function verifyLogseqGraph(parentThreadID: string): Promise<LogseqValidation> {
	const today = localDateParts()
	let backlogText: string
	try {
		backlogText = await readFile(`${LOGSEQ_REPO}/pages/Backlog.md`, 'utf8')
	} catch (error) {
		return { backlogVerified: false, journalVerified: false, error: `Independent Logseq validation could not read Backlog.md: ${errorMessage(error)}` }
	}
	let journalText = ''
	try {
		journalText = await readFile(`${LOGSEQ_REPO}/journals/${today.journalFile}`, 'utf8')
	} catch (error) {
		return { backlogVerified: validateLogseqWrite(backlogText, '', parentThreadID, today.isoDate).backlogVerified, journalVerified: false, error: `Independent Logseq validation could not read today's journal: ${errorMessage(error)}` }
	}
	return validateLogseqWrite(backlogText, journalText, parentThreadID, today.isoDate)
}

function parseLogseqBlocks(text: string): LogseqBlock[] {
	const blocks: LogseqBlock[] = []
	const stack: number[] = []
	for (const line of text.split(/\r?\n/)) {
		const bullet = line.match(/^([ \t]*)-\s+(.*)$/)
		if (bullet) {
			const indent = indentationWidth(bullet[1])
			while (stack.length && blocks[stack[stack.length - 1]].indent >= indent) stack.pop()
			const markerMatch = bullet[2].match(/^(TODO|DOING|DONE|WAITING|NOW|BLOCKED|CANCELLED)\b\s*(.*)$/)
			blocks.push({
				indent,
				parent: stack[stack.length - 1],
				marker: markerMatch?.[1],
				headline: markerMatch?.[2] ?? bullet[2],
				properties: new Map(),
			})
			stack.push(blocks.length - 1)
			continue
		}
		const property = line.match(/^([ \t]*)([a-z][a-z0-9_-]*)::\s*(.*)$/)
		if (!property || !stack.length) continue
		const current = blocks[stack[stack.length - 1]]
		if (indentationWidth(property[1]) <= current.indent) continue
		const values = current.properties.get(property[2]) ?? []
		values.push(property[3])
		current.properties.set(property[2], values)
	}
	return blocks
}

function indentationWidth(value: string): number {
	return [...value].reduce((width, character) => width + (character === '\t' ? 4 : 1), 0)
}

function propertyValues(block: LogseqBlock, key: string): string[] {
	return block.properties.get(key) ?? []
}

function singleProperty(block: LogseqBlock, key: string): string | undefined {
	const values = propertyValues(block, key)
	return values.length === 1 ? values[0] : undefined
}

export function parseWorkerResult(text: string): { ok: true; result: WorkerResult } | { ok: false; error: string } {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch {
		return { ok: false, error: 'Worker result must be exactly one unfenced JSON object.' }
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Worker result must be a JSON object.' }
	const record = value as Record<string, unknown>
	const keys = Object.keys(record).sort()
	if (keys.length !== WORKER_RESULT_KEYS.length || keys.some((key, index) => key !== WORKER_RESULT_KEYS[index])) {
		return { ok: false, error: 'Worker result has an unexpected key set.' }
	}
	if (record.version !== WORKER_RESULT_VERSION
		|| typeof record.backlogVerified !== 'boolean'
		|| typeof record.journalVerified !== 'boolean'
		|| typeof record.parentThreadUpdated !== 'boolean'
		|| typeof record.summary !== 'string'
		|| (record.error !== null && typeof record.error !== 'string')) {
		return { ok: false, error: 'Worker result has invalid field types or version.' }
	}

	const result = record as WorkerResult
	if (!result.summary.trim()) return { ok: false, error: 'Worker result summary must not be empty.' }
	if (result.error !== null && !result.error.trim()) return { ok: false, error: 'Worker result error must be null or non-empty.' }
	if (result.journalVerified && !result.backlogVerified) return { ok: false, error: 'Journal verification requires the parent-linked Backlog task.' }
	if (result.parentThreadUpdated && (!result.backlogVerified || !result.journalVerified)) {
		return { ok: false, error: 'Parent thread update requires complete Logseq verification.' }
	}
	if (result.backlogVerified && result.journalVerified && result.parentThreadUpdated && result.error !== null) {
		return { ok: false, error: 'Complete verification cannot include an error.' }
	}
	if ((!result.backlogVerified || !result.journalVerified || !result.parentThreadUpdated) && result.error === null) {
		return { ok: false, error: 'Incomplete verification requires an explicit error.' }
	}
	return { ok: true, result }
}

function isReadyToArchive(operation: LogseqOperation): boolean {
	return operation.logseqStatus === 'complete' && operation.parentThreadStatus === 'complete'
}

async function archiveWorker(amp: PluginAPI, operation: LogseqOperation): Promise<void> {
	if (!operation.workerID) return
	if (operation.archiveStatus !== 'complete') {
		operation.archiveStatus = 'running'
		try {
			await archiveThread(amp, operation.workerID)
			operation.archiveStatus = 'complete'
			operation.archiveError = undefined
		} catch (error) {
			operation.archiveStatus = 'failed'
			operation.archiveError = `Archive failed: ${errorMessage(error)}`
		}
	}
}

function isFullyComplete(operation: LogseqOperation): boolean {
	return operation.logseqStatus === 'complete'
		&& operation.parentThreadStatus === 'complete'
		&& operation.archiveStatus === 'complete'
}

function formatOperation(operation: LogseqOperation, maxResultChars: number, note?: string): string {
	const worker = operation.workerID
		? `${operation.workerStatus} — ${operation.workerID}`
		: `${operation.workerStatus} (ID not assigned yet)`
	const errors = [operation.workerError, operation.parentThreadError, operation.archiveError].filter(Boolean).join('\n')
	const detail = note || errors || operation.summary || 'Operation state recorded; run the command again to reconcile pending work.'
	return [
		`Worker: ${worker}`,
		`Logseq: ${operation.logseqStatus}`,
		`Parent thread: ${operation.parentThreadStatus}`,
		`Archive: ${operation.archiveStatus}`,
		truncate(detail, maxResultChars),
	].join('\n')
}

function logseqCompletionContract(parentThreadID: string, today: string): string {
	return `Logseq completion criterion: set backlogVerified true only after re-reading Backlog.md and finding exactly one actionable task whose direct input:: contains ${parentThreadID}. That task must have one unique UUID in direct id::, one page reference in direct project::, one #P value in direct priority::, ${today} in direct updated-at::, a matching direct linear:: value when its title or input contains a DAT-, PS-, or DOC- issue ID, a non-empty direct next-action:: when active, and a directly nested activity with its own UUID in id::, ${today} in observed-at::, and a non-empty outcome::. A DONE task must have completed:: [[YYYY-MM-DD]] and no next-action:: or blocker::. Set journalVerified true only after re-reading today's journal and confirming that it contains a block reference to that exact task UUID.`
}

function parentThreadUpdateContract(parentThreadID: string): string {
	return `Only after both Logseq booleans meet that completion criterion, update parent Amp thread ${parentThreadID}. Derive its title from the verified task in the exact format \`[Project] task title\`. Preserve any Linear issue ID immediately after the project prefix. Derive labels for the normalized Backlog project and working project, plus \`customer-...\` when the task identifies a customer. Resolve the parent workspace directory name with \`project-resolve <directory-name> --json\` and use its registry key for the working-project label; if resolution fails, use the normalized directory name. Normalize each label to lowercase words joined with hyphens and omit punctuation. Truncate labels longer than 32 characters to 32 characters, remove any trailing hyphen, then remove empty values and duplicates. Do not add priority or task-state labels. Run \`amp threads rename\` with the exact derived title, then run \`amp threads label\` with every derived label without removing existing labels. Reapply both idempotent commands during reconciliation. Set parentThreadUpdated true only when both commands exit successfully.`
}

function workerResultContract(): string {
	return `Return exactly one unfenced JSON object and no other text:
{"version":${WORKER_RESULT_VERSION},"backlogVerified":true,"journalVerified":true,"parentThreadUpdated":true,"summary":"Short outcome","error":null}

Logseq booleans require the file read-back described above. parentThreadUpdated requires both parent-thread commands to exit successfully with the exact derived title and every required label. Never set journalVerified true when backlogVerified is false. Never set parentThreadUpdated true unless both Logseq booleans are true. If any boolean is false, set error to the corresponding concise non-empty reason.`
}

function buildReconciliationPrompt(operation: LogseqOperation): string {
	const today = localDateParts()
	return `${LOGSEQ_WORKER_PROMPT_PREFIX}

Reconcile Logseq logging for parent Amp thread ${operation.parentThreadID}. This is generation ${operation.generation} of the existing operation; do not create a duplicate task.

Use read_thread on ${operation.parentThreadID} again when the prior result did not verify Backlog. Re-read ${LOGSEQ_REPO}/pages/Backlog.md and the exact journal path from the original worker prompt. Search for the parent-thread link before mutation. Update the existing task when found; only create it when no parent-linked task exists after searching. Repair only missing or invalid state, including the RFC-0008 task contract: direct id::, project::, priority::, input::, updated-at::, next-action:: for active follow-up, blocker:: only for a known blocker, completed:: only for DONE, and directly nested dated activity with its own id::, observed-at::, and outcome::. If the user hint, parent thread, or matching Backlog task contains a Linear issue ID such as DAT-745, keep it unchanged in the Backlog task title, linear:: property, and immediately after the project prefix in the parent thread title. Before final read-back, ask yourself: can a fresh agent safely act on every recorded fact about this task, answer status and history questions, and take the recorded next action without asking the user to restate known context? If a new request changes intent or requires unavailable authority, can it identify that precisely rather than guessing? Repair missing durable context before continuing. Ensure the journal pointer targets that same task, then re-read both files.

${logseqCompletionContract(operation.parentThreadID, today.isoDate)}

${parentThreadUpdateContract(operation.parentThreadID)}

${workerResultContract()}`
}

type Settled<T> = { kind: 'fulfilled'; value: T } | { kind: 'rejected'; error: unknown } | { kind: 'timeout' }

function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<Settled<T>> {
	return new Promise((resolvePromise) => {
		const timeout = setTimeout(() => resolvePromise({ kind: 'timeout' }), timeoutMs)
		promise.then(
			(value) => {
				clearTimeout(timeout)
				resolvePromise({ kind: 'fulfilled', value })
			},
			(error) => {
				clearTimeout(timeout)
				resolvePromise({ kind: 'rejected', error })
			},
		)
	})
}

function buildPrompt(parentThreadID: string, workerThreadID: string, hint: string): string {
	const today = localDateParts()
	return `${LOGSEQ_WORKER_PROMPT_PREFIX}

You are a Logseq logging worker spawned from parent Amp thread ${parentThreadID}. This command was manually triggered by the user; do not set up automatic logging.

Task: log the actual durable work from the parent Amp thread into Logseq now.

Context:
- Parent Amp thread id: ${parentThreadID}
- Worker Amp thread id: ${workerThreadID}
- Parent Amp workspace: ${process.cwd()}
- Logseq repo: ${LOGSEQ_REPO}
- Today's journal file: ${LOGSEQ_REPO}/journals/${today.journalFile}

Rules:
1. First perform a private intent-reconstruction step. You must use read_thread on ${parentThreadID}. Do not fall back to partial parent context. If read_thread is unavailable or fails, stop without editing Logseq and return the required JSON with all 3 booleans false and a concise error. Infer and keep distinct: (a) the original user intent, (b) any later user redirect, (c) the latest coherent requested outcome, and (d) the durable result to log. Do not write anything yet.
2. Log the durable task/outcome represented by that reconstructed intent. Do not let incidental recent-message context replace the original task intent. If the thread contains unrelated later chatter, ignore it unless the user explicitly redirected the task.
3. Before choosing or writing a Logseq block, read \`${LOGSEQ_REPO}/pages/Canonical Pages.md\`, then read the corresponding canonical project/rule pages named there, especially \`pages/Projects.md\`, \`pages/Backlog.md\`, and any relevant rule page. Use that canonical map as the source of truth for project taxonomy, active backlog matches, priority conventions, and placement.
4. All task logs must be represented in \`pages/Backlog.md\` first. Check for an existing backlog entry referencing the parent thread via \`input:: [Ampcode](${parentThreadID})\`, a numbered variant such as \`[1-Ampcode](${parentThreadID})\`, or \`${parentThreadID}\`; update it instead of creating a duplicate.
5. If the user hint or reconstructed parent-thread intent clearly maps to an active task in \`pages/Backlog.md\`, update that backlog task/block. Otherwise create one concise backlog task block in the canonical backlog placement for its project/priority/state.
6. After the backlog task is updated or created, add or update a short reference in today's journal pointing back to that backlog task:
   - under \`### Done\` when the work is complete
   - under \`### Tasks\` when follow-up remains
   - under \`### Notes\` when this is informational only
   Create the section only if needed and missing. Keep the journal entry as a pointer to the backlog task, not a duplicate task with copied properties/source links.
7. Use Logseq markdown conventions from this graph:
   - lowercase properties with \`::\`
   - Every newly created backlog task must follow the RFC-0008 task contract and have direct \`id:: <uuid>\`, \`project:: [[...]]\`, \`priority:: #P...\`, \`input:: ...\`, and \`updated-at:: ${today.isoDate}\` properties. Generate a unique stable UUID for \`id::\`.
   - \`project:: [[...]]\` must be coherent with the canonical project map in \`pages/Projects.md\`; default to \`[[Personal]]\` only for personal/tooling tasks that do not match a more specific canonical project such as \`[[Logseq]]\`, \`[[Internal]]\`, \`[[Docs]]\`, or \`[[Presales]]\`.
   - \`priority:: #P...\` when inferable from backlog/rules; default to \`#P3\` only for low-priority personal/tooling tasks
   - Preserve a Linear issue ID in a direct \`linear:: DAT-...\` property when one exists.
   - Add a direct \`next-action::\` with one concrete action when follow-up remains. Add \`blocker::\` only for a known blocker or waiting condition. Remove stale \`next-action::\` and \`blocker::\` from a DONE task.
   - Keep source/reference links in the backlog task block's \`input::\` property, not scattered as child notes or duplicated in the journal reference.
   - Always include the parent Amp thread in the backlog task's \`input::\`.
   - Also include useful source or deliverable links from the user instruction and parent thread in the backlog task's \`input::\`, such as Slack, Notion, Linear, GitHub PR/issue, ReadAI, customer docs, design docs, or related Amp threads.
   - When there is more than one input link, use numbered labels like \`input:: [1-Ampcode](${parentThreadID}) [2-PR](https://...) [3-Slack](https://...)\`; use \`input:: [Ampcode](${parentThreadID})\` only when no other useful reference link is found.
   - Dedupe equivalent links and skip incidental documentation/search-result links unless they were actual task inputs or important deliverables.
   - \`completed:: [[${today.isoDate}]]\` only for DONE backlog items
   - Record the durable result from this thread as a directly nested activity bullet. Give the activity its own stable \`id:: <uuid>\`, \`observed-at:: ${today.isoDate}\`, and non-empty \`outcome::\`. Add \`decision::\` and \`input::\` when supported by the thread.
   - When updating an existing parent-linked task, preserve valid fields and repair any missing task-contract fields before verification.
   - preserve surrounding indentation style, usually one tab for properties under a block
8. Keep the backlog entry short: one task block plus few useful child notes, and one brief journal reference. Do not paste the transcript or your private intent-reconstruction notes.
9. Do not commit, push, run weekly report automation, or modify unrelated blocks.
10. After mutation and before final read-back, ask yourself: can a fresh agent safely act on every recorded fact about this task, answer status and history questions, and take the recorded next action without asking the user to restate known context? If a new request changes intent or requires unavailable authority, can it identify that precisely rather than guessing? Repair the task or activity when the answer is no. Then re-read both files.
11. Do not send messages to the parent thread. Return your result only as this worker thread's final answer.

${logseqCompletionContract(parentThreadID, today.isoDate)}

${parentThreadUpdateContract(parentThreadID)}

User instruction: ${hint || '(none, infer the best target from this thread)'}

${workerResultContract()}
`
}

function extractAssistantText(message: ThreadAssistantMessage): string {
	return message.content
		.filter((block) => block.type === 'text')
		.map((block) => block.text.trim())
		.filter(Boolean)
		.join('\n')
		.trim()
}

async function archiveThread(amp: PluginAPI, threadID: ThreadID): Promise<void> {
	const result = await amp.$`amp threads archive ${threadID}`
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || `amp threads archive exited with ${result.exitCode}`)
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function truncate(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text
	return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`
}

function localDateParts(): { isoDate: string; journalFile: string } {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return {
		isoDate: `${year}-${month}-${day}`,
		journalFile: `${year}_${month}_${day}.md`,
	}
}
