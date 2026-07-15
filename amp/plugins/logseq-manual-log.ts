// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// logseq-manual-log — command-palette action and agent-callable tool for
// manually asking Amp to log the current thread/task into the user's Logseq
// graph. Lifecycle hooks only route explicit requests; writes still require
// command or tool invocation.

import { isAbsolute, relative, resolve, sep } from 'node:path'

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

const LOGSEQ_REPO = process.env.AMP_LOGSEQ_GRAPH_DIR ?? '/Users/lelouvincx/Developer/second-brain-logseq'
const WORKER_MODE = 'high' as BuiltinAgentMode
const WORKER_STARTUP_TIMEOUT_MS = 15_000
const WORKER_TIMEOUT_MS = 5 * 60 * 1000
const MAX_RESULT_CHARS = 500
const MAX_NOTIFICATION_CHARS = 500
const LOGSEQ_WORKER_PROMPT_PREFIX = '[logseq-manual-log]'
const WORKER_RESULT_KEYS = ['backlogVerified', 'error', 'journalVerified', 'summary', 'threadTitle', 'version']

type LogContext = Pick<PluginCommandContext, 'thread'>
type WorkerThread = {
	id: ThreadID
	state: {
		get(): Promise<ThreadState>
		subscribe(onNext: (state: ThreadState) => void): { unsubscribe(): void }
	}
	waitForResponse(options: { timeoutMs: number }): Promise<ThreadAssistantMessage>
	messages(options: { from: 'end'; limit: number; roles: ['assistant'] }): Promise<ThreadMessage[]>
	appendUserMessage(message: { type: 'user-message'; content: string }): Promise<void>
}

type WorkerStatus = 'creating' | 'starting' | 'running' | 'pending' | 'result-received' | 'failed'
type LogseqStatus = 'unverified' | 'partial' | 'complete' | 'failed'
type DownstreamStatus = 'not-attempted' | 'running' | 'complete' | 'failed'
type AppendStatus = 'none' | 'pending' | 'accepted' | 'unknown'
type Timing = { startupTimeoutMs: number; workerTimeoutMs: number }
type WorkerResult = {
	version: 1
	backlogVerified: boolean
	journalVerified: boolean
	threadTitle: string | null
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
	worker?: WorkerThread
	workerID?: ThreadID
	workerStatus: WorkerStatus
	turnInFlight: boolean
	appendPromise?: Promise<void>
	appendStatus: AppendStatus
	lastConsumedAssistantMessageID?: ThreadMessageID
	logseqStatus: LogseqStatus
	renameStatus: DownstreamStatus
	archiveStatus: DownstreamStatus
	threadTitle?: string
	summary?: string
	workerError?: string
	renameError?: string
	archiveError?: string
	restartAllowed: boolean
}

export type LogseqOperationStore = Map<ThreadID, LogseqOperation>

const DEFAULT_TIMING: Timing = {
	startupTimeoutMs: WORKER_STARTUP_TIMEOUT_MS,
	workerTimeoutMs: WORKER_TIMEOUT_MS,
}

export default function (amp: PluginAPI) {
	const operations = new Map<ThreadID, LogseqOperation>()
	const routedTurns = new Map<ThreadID, ThreadMessageID>()

	amp.logger.log(`[logseq-manual-log] plugin loaded → ${LOGSEQ_REPO}`)

	amp.on('agent.start', (event) => {
		routedTurns.delete(event.thread.id)
		if (event.message.startsWith(LOGSEQ_WORKER_PROMPT_PREFIX) || !isExplicitLogseqLoggingRequest(event.message)) return

		routedTurns.set(event.thread.id, event.id)
		return {
			message: {
				content: 'This turn explicitly requests current-task Logseq logging. You must call logseq_log_current_task. Do not edit the Logseq graph directly from the parent thread.',
				display: false,
			},
		}
	})

	amp.on('agent.end', (event) => {
		if (routedTurns.get(event.thread.id) === event.id) routedTurns.delete(event.thread.id)
	})

	amp.on('tool.call', async (event) => {
		const knownWorker = isKnownWorker(operations, event.thread.id)
		if (event.tool === 'oracle') {
			const worker = knownWorker || await hasWorkerPromptPrefix(amp, event.thread.id)
			return worker
				? {
					action: 'reject-and-continue',
					message: 'Oracle is unavailable to Logseq logging workers. Use read_thread and the Logseq canonical pages to complete the logging task.',
				}
				: { action: 'allow' }
		}

		if (knownWorker || event.tool === 'logseq_log_current_task' || !routedTurns.has(event.thread.id)) return { action: 'allow' }
		try {
			const files = amp.helpers.filesModifiedByToolCall(event)
			if (!files || !files.some((file) => isPathInsideLogseqGraph(amp.helpers.filePathFromURI(file)))) return { action: 'allow' }
		} catch {
			return { action: 'allow' }
		}

		return {
			action: 'reject-and-continue',
			message: 'This turn must use logseq_log_current_task. Split unrelated file changes into a separate tool call and do not edit the Logseq graph directly.',
		}
	})

	amp.registerCommand(
		'logseq-log-current-task',
		{
			title: 'Log current task',
			category: 'logseq',
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

			const result = await logCurrentTask(amp, ctx, hint.trim(), MAX_NOTIFICATION_CHARS, operations)
			await ctx.ui.notify(result)
		},
	)

	amp.registerTool({
		name: 'logseq_log_current_task',
		description: [
			'Log the durable outcome of the current Amp thread into the configured Logseq graph.',
			'Call this whenever the user explicitly asks to log the current task to Logseq; do not edit the Logseq graph directly from the parent thread.',
			'The tool reuses pending work, reports Logseq, rename, and archive separately, and archives the worker after verified completion.',
		].join(' '),
		inputSchema: {
			type: 'object',
			properties: {
				hint: {
					type: 'string',
					description: 'Optional target, note, or source link, such as update DAT-594 or a Slack/PR/Notion URL.',
				},
			},
		},

		async execute(input, ctx) {
			if (!ctx.thread) {
				throw new Error('Open an Amp thread before running logseq_log_current_task.')
			}

			return logCurrentTask(amp, ctx, String(input.hint || '').trim(), MAX_RESULT_CHARS, operations)
		},
	})
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
		operations.set(parentThreadID, operation)
	}
	operation.processing = true
	try {
		await advanceOperation(amp, operation, timing)
		return formatOperation(operation, maxResultChars)
	} finally {
		operation.processing = false
		if (operation.restartAllowed || isFullyComplete(operation)) operations.delete(parentThreadID)
	}
}

function newOperation(parentThreadID: ThreadID, hint: string): LogseqOperation {
	return {
		parentThreadID,
		hint,
		processing: false,
		generation: 0,
		creationUncertain: false,
		workerStatus: 'creating',
		turnInFlight: false,
		appendStatus: 'none',
		logseqStatus: 'unverified',
		renameStatus: 'not-attempted',
		archiveStatus: 'not-attempted',
		restartAllowed: false,
	}
}

async function advanceOperation(amp: PluginAPI, operation: LogseqOperation, timing: Timing): Promise<void> {
	if (!operation.worker) {
		await ensureWorker(amp, operation, timing)
		if (!operation.worker) return
	}

	if (operation.turnInFlight) {
		await consumeCurrentTurn(operation, timing)
		if (operation.logseqStatus === 'complete') await completeDownstreamStages(amp, operation)
		return
	}

	if (operation.logseqStatus === 'complete') {
		await completeDownstreamStages(amp, operation)
		return
	}

	await startWorkerTurn(operation, timing)
	if (operation.turnInFlight) await consumeCurrentTurn(operation, timing)
	if (operation.logseqStatus === 'complete') await completeDownstreamStages(amp, operation)
}

async function ensureWorker(amp: PluginAPI, operation: LogseqOperation, timing: Timing): Promise<void> {
	if (!operation.creationPromise) {
		operation.workerStatus = 'creating'
		try {
			const workerAgent = amp.getBuiltinAgent(WORKER_MODE)
			operation.creationPromise = workerAgent.createThread({
				parentThreadID: operation.parentThreadID,
				show: false,
			}) as Promise<WorkerThread>
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
		operation.workerStatus = 'failed'
		operation.workerError = errorMessage(error)
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

	consumeWorkerResponse(operation, outcome.response)
}

export async function waitForWorkerOutcome(
	workerThread: WorkerThread,
	lastConsumedAssistantMessageID: ThreadMessageID | undefined,
	startupGuard: StartupGuard,
	timeoutMs = WORKER_TIMEOUT_MS,
): Promise<WorkerWaitOutcome> {
	const stored = await getFreshWorkerResponse(workerThread, lastConsumedAssistantMessageID)
	if (stored.kind === 'response') return stored
	try {
		const outcome = await Promise.race([
			workerThread.waitForResponse({ timeoutMs }).then((response) => ({ kind: 'response' as const, response })),
			startupGuard.promise.then((signal) => ({ kind: 'startup' as const, signal })),
		])
		if (outcome.kind === 'response' && outcome.response.id !== lastConsumedAssistantMessageID) return outcome
		return reconcileWorkerAfterWait(workerThread, lastConsumedAssistantMessageID, outcome.kind === 'startup' ? outcome.signal : undefined)
	} catch (error) {
		return reconcileWorkerAfterWait(workerThread, lastConsumedAssistantMessageID, error)
	}
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

function consumeWorkerResponse(operation: LogseqOperation, response: ThreadAssistantMessage): void {
	operation.lastConsumedAssistantMessageID = response.id
	operation.turnInFlight = false
	operation.appendPromise = undefined
	operation.appendStatus = 'none'
	operation.workerStatus = 'result-received'
	const parsed = parseWorkerResult(extractAssistantText(response))
	if (!parsed.ok) {
		operation.workerError = parsed.error
		operation.summary = 'Worker returned an invalid result. Invoke the capability again to reconcile existing Logseq state.'
		return
	}

	operation.summary = parsed.result.summary
	operation.threadTitle = parsed.result.threadTitle || undefined
	operation.workerError = parsed.result.error || undefined
	if (parsed.result.backlogVerified && parsed.result.journalVerified) operation.logseqStatus = 'complete'
	else if (parsed.result.backlogVerified) operation.logseqStatus = 'partial'
	else operation.logseqStatus = 'failed'
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
	if (record.version !== 1
		|| typeof record.backlogVerified !== 'boolean'
		|| typeof record.journalVerified !== 'boolean'
		|| (record.threadTitle !== null && typeof record.threadTitle !== 'string')
		|| typeof record.summary !== 'string'
		|| (record.error !== null && typeof record.error !== 'string')) {
		return { ok: false, error: 'Worker result has invalid field types or version.' }
	}

	const result = record as WorkerResult
	if (!result.summary.trim()) return { ok: false, error: 'Worker result summary must not be empty.' }
	if (result.error !== null && !result.error.trim()) return { ok: false, error: 'Worker result error must be null or non-empty.' }
	if (result.journalVerified && !result.backlogVerified) return { ok: false, error: 'Journal verification requires the parent-linked Backlog task.' }
	if (!result.backlogVerified && result.threadTitle !== null) return { ok: false, error: 'Unverified Backlog requires a null thread title.' }
	if (result.backlogVerified && (result.threadTitle === null || !isValidThreadTitle(result.threadTitle))) return { ok: false, error: 'Verified Backlog requires a valid thread title.' }
	if (result.backlogVerified && result.journalVerified && result.error !== null) {
		return { ok: false, error: 'Complete verification cannot include an error.' }
	}
	if ((!result.backlogVerified || !result.journalVerified) && result.error === null) {
		return { ok: false, error: 'Incomplete verification requires an explicit error.' }
	}
	return { ok: true, result }
}

async function completeDownstreamStages(amp: PluginAPI, operation: LogseqOperation): Promise<void> {
	if (!operation.threadTitle || !operation.workerID) return
	if (operation.renameStatus !== 'complete') {
		operation.renameStatus = 'running'
		try {
			await renameThread(amp, operation.parentThreadID, operation.threadTitle)
			operation.renameStatus = 'complete'
			operation.renameError = undefined
		} catch (error) {
			operation.renameStatus = 'failed'
			operation.renameError = `Rename failed: ${errorMessage(error)}`
		}
	}

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
		&& operation.renameStatus === 'complete'
		&& operation.archiveStatus === 'complete'
}

function formatOperation(operation: LogseqOperation, maxResultChars: number, note?: string): string {
	const worker = operation.workerID
		? `${operation.workerStatus} — ${operation.workerID}`
		: `${operation.workerStatus} (ID not assigned yet)`
	const errors = [operation.workerError, operation.renameError, operation.archiveError].filter(Boolean).join('\n')
	const detail = note || errors || operation.summary || 'Operation state recorded; invoke the same capability again to reconcile pending work.'
	return [
		`Worker: ${worker}`,
		`Logseq: ${operation.logseqStatus}`,
		`Rename: ${operation.renameStatus}`,
		`Archive: ${operation.archiveStatus}`,
		truncate(detail, maxResultChars),
	].join('\n')
}

function buildReconciliationPrompt(operation: LogseqOperation): string {
	return `${LOGSEQ_WORKER_PROMPT_PREFIX}

Reconcile Logseq logging for parent Amp thread ${operation.parentThreadID}. This is generation ${operation.generation} of the existing operation; do not create a duplicate task.

Use read_thread on ${operation.parentThreadID} again when the prior result did not verify Backlog. Re-read ${LOGSEQ_REPO}/pages/Backlog.md and the exact journal path from the original worker prompt. Search for the parent-thread link before mutation. Update the existing task when found; only create it when no parent-linked task exists after searching. Repair only missing or invalid state, ensure the journal pointer targets that same task, then re-read both files.

Return exactly one unfenced JSON object and no other text:
{"version":1,"backlogVerified":true,"journalVerified":true,"threadTitle":"[Project] task title","summary":"Short outcome","error":null}

Use true only after post-write read-back. If only Backlog verifies, set journalVerified to false and error to a concise non-empty reason. If neither verifies, set both booleans false, threadTitle null, and error to a concise non-empty reason.`
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

export function isExplicitLogseqLoggingRequest(message: string): boolean {
	const normalized = message.toLowerCase()
	if (!normalized.includes('logseq')) return false
	if (/\b(?:do not|don't|never)\b[^.\n]{0,80}\b(?:log|save|write|add|record|capture)\b[^.\n]{0,80}\blogseq\b/.test(normalized)) return false
	if (/\b(?:how|why|when|where|whether)\b[^?\n]{0,120}\b(?:log|save|write|add|record|capture)\b[^?\n]{0,120}\blogseq\b/.test(normalized)) return false
	if (/\b(?:fix|implement|refactor|review|test|debug|explain|read|inspect)\b[^.\n]{0,80}\b(?:logseq|plugin|code|docs?|page)\b/.test(normalized)) return false
	if (/\b(?:add|build|change|create|design|implement)\b[^.\n]{0,120}\b(?:support|feature|integration|plugin|tooling|workflow|routing|code|tests?|docs?)\b[^.\n]{0,120}\blogseq\b/.test(normalized)
		|| /\b(?:add|build|change|create|design|implement)\b[^.\n]{0,120}\blogseq\b[^.\n]{0,120}\b(?:support|feature|integration|plugin|tooling|workflow|routing|code|tests?|docs?)\b/.test(normalized)) return false
	return /\b(?:log|save|write|add|record|capture|put)\b[^.\n]{0,120}\blogseq\b/.test(normalized)
		|| /\blogseq\b[^.\n]{0,120}\b(?:log|save|journal|todo|task|current thread)\b/.test(normalized)
		|| /\b(?:use|call)\b[^.\n]{0,120}\b(?:logseq\b[^.\n]{0,40}\b(?:plugin|tool)|(?:plugin|tool)\b[^.\n]{0,40}\blogseq)\b/.test(normalized)
}

export function isPathInsideLogseqGraph(filePath: string, graphRoot = LOGSEQ_REPO): boolean {
	const path = resolve(filePath)
	const root = resolve(graphRoot)
	const fromRoot = relative(root, path)
	return fromRoot === '' || (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
}

function isKnownWorker(operations: LogseqOperationStore, threadID: ThreadID): boolean {
	return [...operations.values()].some((operation) => operation.workerID === threadID)
}

async function hasWorkerPromptPrefix(amp: PluginAPI, threadID: ThreadID): Promise<boolean> {
	try {
		const [initialMessage] = await amp.threads.get(threadID).messages({ full: true, from: 'start', limit: 1 })
		return initialMessage?.role === 'user'
			&& initialMessage.content.some((block) => block.type === 'text' && block.text.startsWith(LOGSEQ_WORKER_PROMPT_PREFIX))
	} catch {
		return false
	}
}

function buildPrompt(parentThreadID: string, workerThreadID: string, hint: string): string {
	const today = localDateParts()
	return `${LOGSEQ_WORKER_PROMPT_PREFIX}

You are a Logseq logging worker spawned from parent Amp thread ${parentThreadID}. This command was manually triggered by the user; do not set up automatic logging.

Task: log the actual durable work from the parent Amp thread into Logseq now.

Context:
- Parent Amp thread id: ${parentThreadID}
- Worker Amp thread id: ${workerThreadID}
- Logseq repo: ${LOGSEQ_REPO}
- Today's journal file: ${LOGSEQ_REPO}/journals/${today.journalFile}

Rules:
1. First perform a private intent-reconstruction step. You must use read_thread on ${parentThreadID}. Do not fall back to partial parent context. If read_thread is unavailable or fails, stop without editing Logseq and return the required JSON with both verification booleans false, threadTitle null, and a concise error. Infer and keep distinct: (a) the original user intent, (b) any later user redirect, (c) the latest coherent requested outcome, and (d) the durable result to log. Do not write anything yet.
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
   - \`project:: [[...]]\` must be coherent with the canonical project map in \`pages/Projects.md\`; default to \`[[Personal]]\` only for personal/tooling tasks that do not match a more specific canonical project such as \`[[Logseq]]\`, \`[[Internal]]\`, \`[[Docs]]\`, or \`[[Presales]]\`.
   - \`priority:: #P...\` when inferable from backlog/rules; default to \`#P3\` only for low-priority personal/tooling tasks
   - Keep source/reference links in the backlog task block's \`input::\` property, not scattered as child notes or duplicated in the journal reference.
   - Always include the parent Amp thread in the backlog task's \`input::\`.
   - Also include useful source or deliverable links from the user instruction and parent thread in the backlog task's \`input::\`, such as Slack, Notion, Linear, GitHub PR/issue, ReadAI, customer docs, design docs, or related Amp threads.
   - When there is more than one input link, use numbered labels like \`input:: [1-Ampcode](${parentThreadID}) [2-PR](https://...) [3-Slack](https://...)\`; use \`input:: [Ampcode](${parentThreadID})\` only when no other useful reference link is found.
   - Dedupe equivalent links and skip incidental documentation/search-result links unless they were actual task inputs or important deliverables.
   - \`completed:: [[${today.isoDate}]]\` only for DONE backlog items
   - preserve surrounding indentation style, usually one tab for properties under a block
8. Keep the backlog entry short: one task block plus few useful child notes, and one brief journal reference. Do not paste the transcript or your private intent-reconstruction notes.
9. Determine the parent Amp thread title from the Logseq backlog task/block you wrote or updated, using exactly this pattern: \`[Project] task title\`. Use the Logseq \`project:: [[...]]\` value without brackets for \`Project\`; use the backlog task/block title text without TODO/DONE markers or properties for \`task title\`.
10. Do not invoke Oracle. The plugin blocks Oracle calls from this worker.
11. Do not commit, push, run weekly report automation, or modify unrelated blocks.
12. Do not send messages to the parent thread. Return your result only as this worker thread's final answer.
13. After mutation, re-read both files. Set backlogVerified true only when a Backlog task linked to parent thread ${parentThreadID} is present. Set journalVerified true only when the journal pointer targets that same task.

User instruction: ${hint || '(none, infer the best target from this thread)'}

Return exactly one unfenced JSON object and no other text:
{"version":1,"backlogVerified":true,"journalVerified":true,"threadTitle":"[Project] task title","summary":"Short outcome","error":null}

Use true only after post-write read-back. If only Backlog verifies, set journalVerified false and error to a concise non-empty reason. If neither verifies, set both booleans false, threadTitle null, and error to a concise non-empty reason. Never set journalVerified true when backlogVerified is false.
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

async function renameThread(amp: PluginAPI, threadID: ThreadID, newTitle: string): Promise<void> {
	const result = await amp.$`amp threads rename ${threadID} ${newTitle}`
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || `amp threads rename exited with ${result.exitCode}`)
	}
}

function isValidThreadTitle(text: string): boolean {
	return text === text.trim() && /^\[[^\]\r\n]+\] [^\r\n]+$/.test(text)
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
