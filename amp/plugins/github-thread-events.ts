// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// github-thread-events — durable local ownership state for routing future
// GitHub pull-request events to one eligible Amp thread.

import type { PluginAPI } from '@ampcode/plugin'
import { Database } from 'bun:sqlite'
import { chmodSync, closeSync, mkdirSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

type BindingRow = {
	base_ref: string
	owner_thread_id: string
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
