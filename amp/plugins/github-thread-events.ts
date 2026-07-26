// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// github-thread-events — durable local ownership state for routing future
// GitHub pull-request events to one eligible Amp thread.

import type { PluginAPI } from '@ampcode/plugin'
import { Database } from 'bun:sqlite'
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const CONFIG_FORMAT = 'github-thread-events-config/v1' as const
const POLICY_FORMAT = 'github-thread-event-policy-set/v1' as const
const REPOSITORY_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9._-]+$/
const POLICY_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/
const ACTOR_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/
const REQUIRED_GLOBAL_POLICIES = new Set([
	'github.workflow-run.failure',
	'github.pull-request.merged',
	'github.pull-request.review-feedback',
	'github.pull-request.merge-conflict',
])
const FORBIDDEN_FIELDS = new Set([
	'accountid', 'credential', 'credentials', 'database', 'databasepath', 'queueid', 'secret', 'token', 'webhooksecret',
])
const SOURCE_POINTERS = [
	'delivery-id', 'repository', 'pull-request', 'head-sha', 'canonical-url', 'actor',
] as const
const PREFLIGHTS = [
	'failed-run-still-matches-current-head',
	'pull-request-still-merged-and-current',
	'current-unresolved-review-feedback',
	'pull-request-currently-conflicting',
] as const
const REQUIRED_POINTERS: Record<EventPolicy['currentStatePreflight'], readonly EventPolicy['sourcePointers'][number][]> = {
	'failed-run-still-matches-current-head': ['head-sha'],
	'pull-request-still-merged-and-current': [],
	'current-unresolved-review-feedback': ['actor'],
	'pull-request-currently-conflicting': ['head-sha'],
}

export type EventPolicy = {
	readonly id: string
	readonly sourceCandidate: string
	targetKind: 'pull-request'
	currentStatePreflight: typeof PREFLIGHTS[number]
	readonly fixedAction: string
	readonly sourcePointers: readonly (typeof SOURCE_POINTERS[number])[]
	readonly actorTrust: {
		instructionAuthority: 'fixed-action-only'
		readonly trustedActors: readonly string[]
	}
	readonly expiry: { mode: 'queue-retention' }
}

export type GithubThreadEventConfig = {
	formatVersion: typeof CONFIG_FORMAT
	cloudflarePlan: 'free'
	repositories: { repository: string, baseBranches: string[] }[]
	queueAssumptions: {
		dailyOperationLimit: 10000
		primaryRetentionSeconds: 86400
		deadLetterRetentionSeconds: 86400
		maximumRetries: 100
	}
	polling: {
		activeIntervalSeconds: 15
		maximumIdleIntervalSeconds: 60
		batchSize: 5
		visibilityTimeoutSeconds: 30
	}
	bindingGraceSeconds: 180
	staleNotification: { afterSeconds: 300, slackChannelID: 'C0BKVJXBH98' }
}

type PolicySet = { formatVersion: typeof POLICY_FORMAT, policies: EventPolicy[] }

export type GithubThreadEventContract = {
	config: GithubThreadEventConfig
	global: PolicySet
	projects: ReadonlyMap<string, PolicySet>
}

type BindingRow = {
	base_ref: string
	owner_thread_id: string
}

export function loadGithubThreadEventContract(root: string): GithubThreadEventContract {
	const config = decodeConfig(readRuntimeJson(join(root, 'config.json')), join(root, 'config.json'))
	const globalPath = join(root, 'policies', 'global.json')
	const global = decodePolicySet(readRuntimeJson(globalPath), globalPath)
	const configuredRepositories = new Set(config.repositories.map(({ repository }) => repository))
	const projects = new Map<string, PolicySet>()

	for (const [repository, path] of projectPolicyPaths(join(root, 'policies', 'projects'))) {
		if (!configuredRepositories.has(repository)) {
			contractError(path, `project policy path does not match a configured repository`)
		}
		projects.set(repository, decodePolicySet(readRuntimeJson(path), path))
	}

	return { config, global, projects }
}

export function resolveEventPolicy(contract: GithubThreadEventContract, repositoryValue: string, policyID: string) {
	const repository = normalizePolicyRepository(repositoryValue)
	if (!contract.config.repositories.some((configured) => configured.repository === repository)) {
		contractError('policy lookup', 'repository is not configured for monitoring')
	}
	if (typeof policyID !== 'string' || !POLICY_ID_PATTERN.test(policyID)) contractError('policy lookup', 'policy ID is invalid')
	const projectPolicy = contract.projects.get(repository)?.policies.find(({ id }) => id === policyID)
	if (projectPolicy) return { status: 'found' as const, scope: 'project' as const, policy: projectPolicy }
	const globalPolicy = contract.global.policies.find(({ id }) => id === policyID)
	if (globalPolicy) return { status: 'found' as const, scope: 'global' as const, policy: globalPolicy }
	return {
		status: 'missing-policy' as const,
		reason: 'missing-event-policy' as const,
		repository,
		policyID,
	}
}

export async function runAdaptivePolling(options: {
	pull: () => Promise<readonly unknown[]>
	sleep: (milliseconds: number) => Promise<void>
	activeIntervalSeconds: number
	maximumIdleIntervalSeconds: number
	maximumPolls?: number
}) {
	validatePollingIntervals(options.activeIntervalSeconds, options.maximumIdleIntervalSeconds)
	if (options.maximumPolls !== undefined && (!Number.isSafeInteger(options.maximumPolls) || options.maximumPolls <= 0)) {
		throw new Error('maximumPolls must be a positive safe integer when provided.')
	}

	let emptyResults = 0
	let polls = 0
	while (options.maximumPolls === undefined || polls < options.maximumPolls) {
		const messages = await options.pull()
		polls += 1
		if (options.maximumPolls !== undefined && polls >= options.maximumPolls) break
		emptyResults = messages.length === 0 ? emptyResults + 1 : 0
		const delaySeconds = emptyResults === 0
			? options.activeIntervalSeconds
			: Math.min(options.maximumIdleIntervalSeconds, options.activeIntervalSeconds * 2 ** emptyResults)
		await options.sleep(delaySeconds * 1000)
	}
}

export function countIdlePullOperations(
	durationSeconds: number,
	activeIntervalSeconds: number,
	maximumIdleIntervalSeconds: number,
) {
	validatePollingIntervals(activeIntervalSeconds, maximumIdleIntervalSeconds)
	if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) {
		throw new Error('durationSeconds must be a positive safe integer.')
	}
	let operations = 0
	let elapsedSeconds = 0
	let emptyResults = 0
	while (elapsedSeconds < durationSeconds) {
		operations += 1
		emptyResults += 1
		elapsedSeconds += Math.min(maximumIdleIntervalSeconds, activeIntervalSeconds * 2 ** emptyResults)
	}
	return operations
}

export function openGithubThreadEventStore(databasePath: string) {
	const stateDirectory = dirname(databasePath)
	mkdirSync(stateDirectory, { recursive: true, mode: 0o700 })
	chmodSync(stateDirectory, 0o700)
	closeSync(openSync(databasePath, 'a', 0o600))
	chmodSync(databasePath, 0o600)

	const database = new Database(databasePath, { create: true })
	try {
		database.exec(`
			pragma foreign_keys = on;

			create table if not exists recipients (
				thread_id text primary key not null
			, registered_at text not null
			);

			create table if not exists bindings (
				repository text not null
			, pull_request integer not null check (pull_request > 0)
			, base_ref text not null
			, owner_thread_id text not null
			, updated_at text not null
			, primary key (repository, pull_request)
			, foreign key (owner_thread_id) references recipients(thread_id)
			);
		`)
		chmodSync(databasePath, 0o600)
	} catch (error) {
		database.close()
		throw error
	}

	const findRecipient = database.query('select registered_at from recipients where thread_id = ?')
	const insertRecipient = database.query('insert into recipients (thread_id, registered_at) values (?, ?)')
	const insertRecipientIfAbsent = database.query('insert or ignore into recipients (thread_id, registered_at) values (?, ?)')
	const findBinding = database.query(`
		select base_ref, owner_thread_id
		from bindings
		where repository = ? and pull_request = ?
	`)
	const insertBinding = database.query(`
		insert into bindings (repository, pull_request, base_ref, owner_thread_id, updated_at)
		values (?, ?, ?, ?, ?)
	`)
	const updateBaseRef = database.query(`
		update bindings
		set base_ref = ?, updated_at = ?
		where repository = ? and pull_request = ?
	`)
	const updateOwner = database.query(`
		update bindings
		set owner_thread_id = ?, updated_at = ?
		where repository = ? and pull_request = ?
	`)

	const bindTransaction = database.transaction((
		repository: string,
		pullRequest: number,
		baseRef: string,
		ownerThreadID: string,
	) => {
		const timestamp = new Date().toISOString()
		insertRecipientIfAbsent.run(ownerThreadID, timestamp)
		const binding = findBinding.get(repository, pullRequest) as BindingRow | null

		if (!binding) {
			insertBinding.run(repository, pullRequest, baseRef, ownerThreadID, timestamp)
			return { status: 'created', repository, pullRequest, baseRef, ownerThreadID }
		}
		if (binding.owner_thread_id !== ownerThreadID) {
			throw new Error(`Pull request ${repository}#${pullRequest} is already owned by another thread.`)
		}
		if (binding.base_ref === baseRef) {
			return { status: 'unchanged', repository, pullRequest, baseRef, ownerThreadID }
		}

		updateBaseRef.run(baseRef, timestamp, repository, pullRequest)
		return { status: 'base_ref_updated', repository, pullRequest, baseRef, ownerThreadID }
	})

	const registerTransaction = database.transaction((threadID: string) => {
		if (findRecipient.get(threadID)) {
			return { status: 'already_registered', threadID }
		}
		insertRecipient.run(threadID, new Date().toISOString())
		return { status: 'registered', threadID }
	})

	const transferTransaction = database.transaction((
		repository: string,
		pullRequest: number,
		destinationThreadID: string,
		invokingThreadID: string,
	) => {
		const binding = findBinding.get(repository, pullRequest) as BindingRow | null
		if (!binding) {
			throw new Error(`No binding exists for ${repository}#${pullRequest}.`)
		}
		if (binding.owner_thread_id !== invokingThreadID) {
			throw new Error(`Only the current owner can transfer ${repository}#${pullRequest}.`)
		}
		if (!findRecipient.get(destinationThreadID)) {
			throw new Error(`Destination thread ${destinationThreadID} is not a registered event recipient.`)
		}
		if (binding.owner_thread_id === destinationThreadID) {
			return {
				status: 'unchanged',
				repository,
				pullRequest,
				previousOwnerThreadID: binding.owner_thread_id,
				ownerThreadID: destinationThreadID,
			}
		}

		updateOwner.run(destinationThreadID, new Date().toISOString(), repository, pullRequest)
		return {
			status: 'transferred',
			repository,
			pullRequest,
			previousOwnerThreadID: binding.owner_thread_id,
			ownerThreadID: destinationThreadID,
		}
	})

	return {
		bind(repository: string, pullRequest: number, baseRef: string, ownerThreadID: string) {
			return bindTransaction.immediate(repository, pullRequest, baseRef, ownerThreadID)
		},
		register(threadID: string) {
			return registerTransaction.immediate(threadID)
		},
		transfer(repository: string, pullRequest: number, destinationThreadID: string, invokingThreadID: string) {
			return transferTransaction.immediate(repository, pullRequest, destinationThreadID, invokingThreadID)
		},
		close() {
			database.close()
		},
	}
}

export function registerOwnershipTools(
	amp: Pick<PluginAPI, 'registerTool'>,
	store: ReturnType<typeof openGithubThreadEventStore>,
) {
	amp.registerTool({
		name: 'bind_pr_to_thread',
		description: 'Bind one pull request to the invoking thread and register that thread as its owner. Never accepts or replaces an owner thread ID.',
		inputSchema: {
			type: 'object',
			properties: {
				repository: { type: 'string', description: 'Repository in owner/repository form.' },
				pullRequest: { type: 'number', description: 'Positive integer pull-request number.' },
				baseRef: { type: 'string', description: 'Non-empty base branch name.' },
			},
			required: ['repository', 'pullRequest', 'baseRef'],
			additionalProperties: false,
		},
		async execute(input, ctx) {
			const repository = normalizeRepository(input.repository)
			const pullRequest = normalizePullRequest(input.pullRequest)
			const baseRef = normalizeNonEmptyString(input.baseRef, 'baseRef')
			return JSON.stringify(store.bind(repository, pullRequest, baseRef, ctx.thread.id))
		},
	})

	amp.registerTool({
		name: 'register_thread_event_recipient',
		description: 'Register only the invoking thread as an eligible transfer destination. Creates no binding and grants no ownership.',
		inputSchema: {
			type: 'object',
			properties: {},
			additionalProperties: false,
		},
		async execute(_input, ctx) {
			return JSON.stringify(store.register(ctx.thread.id))
		},
	})

	amp.registerTool({
		name: 'transfer_pr_thread_owner',
		description: 'Transfer a binding only from its invoking current owner to a destination that registered itself. Other threads cannot take ownership.',
		inputSchema: {
			type: 'object',
			properties: {
				repository: { type: 'string', description: 'Repository in owner/repository form.' },
				pullRequest: { type: 'number', description: 'Positive integer pull-request number.' },
				destinationThreadID: { type: 'string', description: 'Registered destination Amp thread ID.' },
			},
			required: ['repository', 'pullRequest', 'destinationThreadID'],
			additionalProperties: false,
		},
		async execute(input, ctx) {
			const repository = normalizeRepository(input.repository)
			const pullRequest = normalizePullRequest(input.pullRequest)
			const destinationThreadID = normalizeNonEmptyString(input.destinationThreadID, 'destinationThreadID')
			return JSON.stringify(store.transfer(repository, pullRequest, destinationThreadID, ctx.thread.id))
		},
	})
}

export default function (amp: PluginAPI) {
	if (process.env.AMP_GITHUB_THREAD_EVENTS_ENABLED !== '1') return

	const configDirectory = process.env.AMP_CONFIG_DIR || join(homedir(), '.config', 'amp')
	loadGithubThreadEventContract(join(configDirectory, 'github-thread-events'))
	const databasePath = join(configDirectory, 'state', 'github-thread-events.sqlite')
	const store = openGithubThreadEventStore(databasePath)
	registerOwnershipTools(amp, store)
	amp.logger.log(`[github-thread-events] enabled → ${databasePath}`)
}

function normalizeRepository(value: unknown): string {
	if (typeof value !== 'string') throw new Error('repository must be a string in owner/repository form.')
	const repository = value.trim()
	const parts = repository.split('/')
	if (parts.length !== 2 || parts.some((part) => !part || /\s/.test(part))) {
		throw new Error('repository must contain exactly 2 non-empty parts in owner/repository form with no inner whitespace.')
	}
	return repository.toLowerCase()
}

function normalizePullRequest(value: unknown): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		throw new Error('pullRequest must be a positive integer number.')
	}
	return value
}

function normalizeNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`)
	return value.trim()
}

function readRuntimeJson(path: string): unknown {
	let stats: ReturnType<typeof lstatSync>
	try {
		stats = lstatSync(path)
	} catch {
		contractError(path, 'required JSON file is unreadable or missing')
	}
	if (!stats.isFile() || stats.isSymbolicLink()) contractError(path, 'required JSON path must be a regular file')

	let text: string
	try {
		text = readFileSync(path, 'utf8')
	} catch {
		contractError(path, 'required JSON file is unreadable or missing')
	}
	try {
		return JSON.parse(text)
	} catch {
		contractError(path, 'JSON is malformed')
	}
}

function decodeConfig(value: unknown, path: string): GithubThreadEventConfig {
	rejectForbiddenFields(value, path)
	const config = closedRecord(value, path, [
		'formatVersion', 'cloudflarePlan', 'repositories', 'queueAssumptions', 'polling', 'bindingGraceSeconds', 'staleNotification',
	])
	exactValue(config.formatVersion, CONFIG_FORMAT, path, 'formatVersion')
	exactValue(config.cloudflarePlan, 'free', path, 'cloudflarePlan')

	const repositoryValues = arrayValue(config.repositories, path, 'repositories', true)
	const repositories = repositoryValues.map((value, index) => {
		const location = `${path}: repositories[${index}]`
		const repositoryConfig = closedRecord(value, location, ['repository', 'baseBranches'])
		const repository = matchingString(repositoryConfig.repository, REPOSITORY_PATTERN, location, 'repository')
		const baseBranches = arrayValue(repositoryConfig.baseBranches, location, 'baseBranches', true)
			.map((branch, branchIndex) => nonEmptyString(branch, location, `baseBranches[${branchIndex}]`))
		ensureUnique(baseBranches, location, 'baseBranches')
		return { repository, baseBranches }
	})
	ensureUnique(repositories.map(({ repository }) => repository), path, 'repositories')

	const queue = closedRecord(config.queueAssumptions, `${path}: queueAssumptions`, [
		'dailyOperationLimit', 'primaryRetentionSeconds', 'deadLetterRetentionSeconds', 'maximumRetries',
	])
	exactValue(queue.dailyOperationLimit, 10000, path, 'queueAssumptions.dailyOperationLimit')
	exactValue(queue.primaryRetentionSeconds, 86400, path, 'queueAssumptions.primaryRetentionSeconds')
	exactValue(queue.deadLetterRetentionSeconds, 86400, path, 'queueAssumptions.deadLetterRetentionSeconds')
	exactValue(queue.maximumRetries, 100, path, 'queueAssumptions.maximumRetries')

	const polling = closedRecord(config.polling, `${path}: polling`, [
		'activeIntervalSeconds', 'maximumIdleIntervalSeconds', 'batchSize', 'visibilityTimeoutSeconds',
	])
	exactValue(polling.activeIntervalSeconds, 15, path, 'polling.activeIntervalSeconds')
	exactValue(polling.maximumIdleIntervalSeconds, 60, path, 'polling.maximumIdleIntervalSeconds')
	exactValue(polling.batchSize, 5, path, 'polling.batchSize')
	exactValue(polling.visibilityTimeoutSeconds, 30, path, 'polling.visibilityTimeoutSeconds')
	exactValue(config.bindingGraceSeconds, 180, path, 'bindingGraceSeconds')

	const stale = closedRecord(config.staleNotification, `${path}: staleNotification`, ['afterSeconds', 'slackChannelID'])
	exactValue(stale.afterSeconds, 300, path, 'staleNotification.afterSeconds')
	exactValue(stale.slackChannelID, 'C0BKVJXBH98', path, 'staleNotification.slackChannelID')

	return {
		formatVersion: CONFIG_FORMAT,
		cloudflarePlan: 'free',
		repositories,
		queueAssumptions: {
			dailyOperationLimit: 10000,
			primaryRetentionSeconds: 86400,
			deadLetterRetentionSeconds: 86400,
			maximumRetries: 100,
		},
		polling: {
			activeIntervalSeconds: 15,
			maximumIdleIntervalSeconds: 60,
			batchSize: 5,
			visibilityTimeoutSeconds: 30,
		},
		bindingGraceSeconds: 180,
		staleNotification: { afterSeconds: 300, slackChannelID: 'C0BKVJXBH98' },
	}
}

function decodePolicySet(value: unknown, path: string): PolicySet {
	rejectForbiddenFields(value, path)
	const policySet = closedRecord(value, path, ['formatVersion', 'policies'])
	exactValue(policySet.formatVersion, POLICY_FORMAT, path, 'formatVersion')
	const policies = arrayValue(policySet.policies, path, 'policies').map((policy, index) => decodePolicy(policy, path, index))
	ensureUnique(policies.map(({ id }) => id), path, 'policy IDs')
	if (path.endsWith('/policies/global.json')) {
		for (const policyID of REQUIRED_GLOBAL_POLICIES) {
			if (!policies.some(({ id }) => id === policyID)) contractError(path, `missing required global policy ${policyID}`)
		}
	}
	return { formatVersion: POLICY_FORMAT, policies }
}

function decodePolicy(value: unknown, path: string, index: number): EventPolicy {
	const location = `${path}: policies[${index}]`
	const policy = closedRecord(value, location, [
		'id', 'sourceCandidate', 'targetKind', 'currentStatePreflight', 'fixedAction', 'sourcePointers', 'actorTrust', 'expiry',
	])
	const id = matchingString(policy.id, POLICY_ID_PATTERN, location, 'id')
	const sourceCandidate = matchingString(policy.sourceCandidate, POLICY_ID_PATTERN, location, 'sourceCandidate')
	if (id !== sourceCandidate) contractError(location, 'id must equal sourceCandidate')
	exactValue(policy.targetKind, 'pull-request', location, 'targetKind')
	const currentStatePreflight = enumString(policy.currentStatePreflight, PREFLIGHTS, location, 'currentStatePreflight')
	const fixedAction = nonEmptyString(policy.fixedAction, location, 'fixedAction')
	const sourcePointers = arrayValue(policy.sourcePointers, location, 'sourcePointers', true)
		.map((pointer, pointerIndex) => enumString(pointer, SOURCE_POINTERS, location, `sourcePointers[${pointerIndex}]`))
	ensureUnique(sourcePointers, location, 'sourcePointers')
	for (const pointer of ['delivery-id', 'repository', 'pull-request', 'canonical-url', ...REQUIRED_POINTERS[currentStatePreflight]]) {
		if (!sourcePointers.includes(pointer as typeof sourcePointers[number])) {
			contractError(location, `sourcePointers is missing required pointer ${pointer}`)
		}
	}

	const actorTrust = closedRecord(policy.actorTrust, `${location}.actorTrust`, ['instructionAuthority', 'trustedActors'])
	exactValue(actorTrust.instructionAuthority, 'fixed-action-only', location, 'actorTrust.instructionAuthority')
	const trustedActors = arrayValue(actorTrust.trustedActors, location, 'actorTrust.trustedActors', true)
		.map((actor, actorIndex) => matchingString(actor, ACTOR_PATTERN, location, `actorTrust.trustedActors[${actorIndex}]`))
	ensureUnique(trustedActors, location, 'actorTrust.trustedActors')
	const expiry = closedRecord(policy.expiry, `${location}.expiry`, ['mode'])
	exactValue(expiry.mode, 'queue-retention', location, 'expiry.mode')

	return Object.freeze({
		id,
		sourceCandidate,
		targetKind: 'pull-request',
		currentStatePreflight,
		fixedAction,
		sourcePointers: Object.freeze(sourcePointers),
		actorTrust: Object.freeze({ instructionAuthority: 'fixed-action-only' as const, trustedActors: Object.freeze(trustedActors) }),
		expiry: Object.freeze({ mode: 'queue-retention' as const }),
	})
}

function projectPolicyPaths(root: string): [string, string][] {
	if (!existsSync(root)) return []
	let stats: ReturnType<typeof lstatSync>
	try {
		stats = lstatSync(root)
	} catch {
		contractError(root, 'project policy directory is unreadable')
	}
	if (!stats.isDirectory() || stats.isSymbolicLink()) contractError(root, 'project policy path must be a regular directory')
	const paths: [string, string][] = []
	for (const ownerEntry of readRuntimeDirectory(root)) {
		const ownerPath = join(root, ownerEntry.name)
		if (!ownerEntry.isDirectory()) contractError(ownerPath, 'project policy path must be <owner>/<repository>.json')
		for (const repositoryEntry of readRuntimeDirectory(ownerPath)) {
			const path = join(ownerPath, repositoryEntry.name)
			if (!repositoryEntry.isFile() || !repositoryEntry.name.endsWith('.json')) {
				contractError(path, 'project policy path must be <owner>/<repository>.json')
			}
			const repository = `${ownerEntry.name}/${repositoryEntry.name.slice(0, -5)}`
			if (!REPOSITORY_PATTERN.test(repository)) {
				contractError(path, 'project policy path must be lowercase owner/repository.json')
			}
			paths.push([repository, path])
		}
	}
	return paths
}

function readRuntimeDirectory(path: string) {
	try {
		return readdirSync(path, { withFileTypes: true })
	} catch {
		contractError(path, 'project policy directory is unreadable')
	}
}

function closedRecord(value: unknown, path: string, allowedFields: readonly string[]): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) contractError(path, 'expected a closed object')
	const record = value as Record<string, unknown>
	for (const field of allowedFields) {
		if (!Object.hasOwn(record, field)) contractError(path, `missing required field ${field}`)
	}
	for (const field of Object.keys(record)) {
		if (!allowedFields.includes(field)) contractError(path, `unknown field ${field}`)
	}
	return record
}

function rejectForbiddenFields(value: unknown, path: string): void {
	if (Array.isArray(value)) {
		for (const child of value) rejectForbiddenFields(child, path)
		return
	}
	if (typeof value !== 'object' || value === null) return
	for (const [field, child] of Object.entries(value)) {
		if (FORBIDDEN_FIELDS.has(field.toLowerCase())) contractError(path, `forbidden secret, deployment or runtime-state field ${field}`)
		rejectForbiddenFields(child, path)
	}
}

function arrayValue(value: unknown, path: string, field: string, requireItems = false): unknown[] {
	if (!Array.isArray(value) || (requireItems && value.length === 0)) {
		contractError(path, `${field} must be ${requireItems ? 'a non-empty' : 'an'} array`)
	}
	return value
}

function nonEmptyString(value: unknown, path: string, field: string, trim = true): string {
	if (typeof value !== 'string' || value.length === 0 || (trim && !value.trim())) {
		contractError(path, `${field} must be a non-empty string`)
	}
	return value
}

function matchingString(value: unknown, pattern: RegExp, path: string, field: string): string {
	if (typeof value !== 'string' || !pattern.test(value)) contractError(path, `${field} has an invalid format`)
	return value
}

function enumString<const T extends readonly string[]>(value: unknown, allowed: T, path: string, field: string): T[number] {
	if (typeof value !== 'string' || !allowed.includes(value)) contractError(path, `${field} has an unsupported value`)
	return value
}

function exactValue(value: unknown, expected: string | number, path: string, field: string): void {
	if (value !== expected) contractError(path, `${field} has an unsupported value`)
}

function ensureUnique(values: readonly string[], path: string, field: string): void {
	if (new Set(values).size !== values.length) contractError(path, `${field} contains duplicates`)
}

function normalizePolicyRepository(value: unknown): string {
	if (typeof value !== 'string') contractError('policy lookup', 'repository must be a string')
	const repository = value.trim().toLowerCase()
	if (!REPOSITORY_PATTERN.test(repository)) contractError('policy lookup', 'repository must use owner/repository form')
	return repository
}

function validatePollingIntervals(activeIntervalSeconds: number, maximumIdleIntervalSeconds: number): void {
	if (!Number.isSafeInteger(activeIntervalSeconds) || activeIntervalSeconds <= 0) {
		throw new Error('activeIntervalSeconds must be a positive safe integer.')
	}
	if (!Number.isSafeInteger(maximumIdleIntervalSeconds)
		|| maximumIdleIntervalSeconds < activeIntervalSeconds
		|| maximumIdleIntervalSeconds > Math.floor(Number.MAX_SAFE_INTEGER / 1000)) {
		throw new Error('maximumIdleIntervalSeconds must be a safe integer from activeIntervalSeconds through the maximum safe millisecond delay.')
	}
}

function contractError(path: string, message: string): never {
	throw new Error(`Invalid GitHub thread event contract at ${path}: ${message}.`)
}
