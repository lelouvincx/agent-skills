import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import plugin, {
	countIdlePullOperations,
	loadGithubThreadEventContract,
	openGithubThreadEventStore,
	registerOwnershipTools,
	resolveEventPolicy,
	runAdaptivePolling,
} from '../plugins/github-thread-events'

type RegisteredTool = {
	name: string
	description: string
	inputSchema: {
		type: 'object'
		properties?: Record<string, { type?: string }>
		required?: string[]
		additionalProperties?: boolean
	}
	execute(input: Record<string, unknown>, ctx: unknown): Promise<string>
}

const originalEnabled = process.env.AMP_GITHUB_THREAD_EVENTS_ENABLED
const originalConfigDirectory = process.env.AMP_CONFIG_DIR
const temporaryDirectories: string[] = []
const stores: ReturnType<typeof openGithubThreadEventStore>[] = []

afterEach(() => {
	for (const store of stores.splice(0).reverse()) {
		try { store.close() } catch {}
	}
	for (const directory of temporaryDirectories.splice(0).reverse()) {
		rmSync(directory, { recursive: true, force: true })
	}
	restoreEnvironment('AMP_GITHUB_THREAD_EVENTS_ENABLED', originalEnabled)
	restoreEnvironment('AMP_CONFIG_DIR', originalConfigDirectory)
})

function restoreEnvironment(name: string, value: string | undefined) {
	if (value === undefined) delete process.env[name]
	else process.env[name] = value
}

function temporaryDirectory() {
	const directory = mkdtempSync(join(tmpdir(), 'github-thread-events-test-'))
	temporaryDirectories.push(directory)
	return directory
}

const checkedInContract = join(import.meta.dir, '..', 'github-thread-events')

function installProjectedContract(configDirectory: string) {
	const contractDirectory = join(configDirectory, 'github-thread-events')
	cpSync(checkedInContract, contractDirectory, { recursive: true })
	return contractDirectory
}

function readJson(path: string) {
	return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path: string, value: unknown) {
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function fakeAmp() {
	const tools: RegisteredTool[] = []
	const logs: string[] = []
	return {
		amp: {
			logger: { log(message: string) { logs.push(message) } },
			registerTool(tool: RegisteredTool) {
				tools.push(tool)
				return { unsubscribe() {} }
			},
		},
		tools,
		logs,
	}
}

function ownershipHarness(databasePath = join(temporaryDirectory(), 'state', 'github-thread-events.sqlite')) {
	const store = openGithubThreadEventStore(databasePath)
	stores.push(store)
	const fake = fakeAmp()
	registerOwnershipTools(fake.amp as never, store)
	const tools = new Map(fake.tools.map((tool) => [tool.name, tool]))
	return {
		databasePath,
		store,
		tools,
		async call(name: string, input: Record<string, unknown>, threadID: string) {
			const tool = tools.get(name)
			if (!tool) throw new Error(`Tool ${name} was not registered`)
			return tool.execute(input, { thread: { id: threadID } })
		},
	}
}

function queryAll(databasePath: string, sql: string, ...parameters: (string | number)[]) {
	const database = new Database(databasePath, { readonly: true })
	try {
		return database.query(sql).all(...parameters) as Record<string, unknown>[]
	} finally {
		database.close()
	}
}

function bindingInput(overrides: Record<string, unknown> = {}) {
	return { repository: 'Owner/Repository', pullRequest: 126, baseRef: 'Main', ...overrides }
}

describe('plugin process gate', () => {
	test('disabled plugin registers nothing and creates no state', () => {
		const configDirectory = temporaryDirectory()
		process.env.AMP_CONFIG_DIR = configDirectory
		process.env.AMP_GITHUB_THREAD_EVENTS_ENABLED = 'true'
		const fake = fakeAmp()

		plugin(fake.amp as never)

		expect(fake.tools).toEqual([])
		expect(fake.logs).toEqual([])
		expect(existsSync(join(configDirectory, 'state'))).toBe(false)
	})

	test('enabled plugin creates protected state and registers exactly 3 tools', () => {
		const configDirectory = temporaryDirectory()
		installProjectedContract(configDirectory)
		const databasePath = join(configDirectory, 'state', 'github-thread-events.sqlite')
		process.env.AMP_CONFIG_DIR = configDirectory
		process.env.AMP_GITHUB_THREAD_EVENTS_ENABLED = '1'
		const fake = fakeAmp()

		plugin(fake.amp as never)

		expect(fake.tools.map((tool) => tool.name)).toEqual([
			'bind_pr_to_thread',
			'register_thread_event_recipient',
			'transfer_pr_thread_owner',
		])
		expect(queryAll(databasePath, `select name from sqlite_schema where type = 'table' and name not like 'sqlite_%' order by name`))
			.toEqual([{ name: 'bindings' }, { name: 'recipients' }])
		expect(queryAll(databasePath, 'pragma foreign_key_list(bindings)')).toEqual([expect.objectContaining({
			from: 'owner_thread_id',
			table: 'recipients',
			to: 'thread_id',
		})])
		expect(statSync(join(configDirectory, 'state')).mode & 0o777).toBe(0o700)
		expect(statSync(databasePath).mode & 0o777).toBe(0o600)
		expect(fake.logs).toEqual([`[github-thread-events] enabled → ${databasePath}`])
	})

	test('enabled plugin fails before state or tools when a projected contract is missing or invalid', () => {
		for (const mutate of [
			(_directory: string) => {},
			(directory: string) => {
				const root = installProjectedContract(directory)
				writeFileSync(join(root, 'config.json'), '{ malformed')
			},
			(directory: string) => {
				const root = installProjectedContract(directory)
				const projectPath = join(root, 'policies', 'projects', 'lelouvincx', 'agent-skills.json')
				const project = readJson(projectPath)
				project.unexpected = true
				writeJson(projectPath, project)
			},
		]) {
			const configDirectory = temporaryDirectory()
			mutate(configDirectory)
			process.env.AMP_CONFIG_DIR = configDirectory
			process.env.AMP_GITHUB_THREAD_EVENTS_ENABLED = '1'
			const fake = fakeAmp()

			expect(() => plugin(fake.amp as never)).toThrow('GitHub thread event contract')
			expect(fake.tools).toEqual([])
			expect(fake.logs).toEqual([])
			expect(existsSync(join(configDirectory, 'state'))).toBe(false)
		}
	})
})

describe('runtime configuration and policy', () => {
	test('checked-in projection loads reviewed values and resolves exact project, global fallback and missing policy', () => {
		const root = installProjectedContract(temporaryDirectory())
		const contract = loadGithubThreadEventContract(root)

		expect(contract.config.repositories.map((item) => item.repository)).toEqual([
			'lelouvincx/agent-skills',
			'lelouvincx/second-brain-logseq',
			'lelouvincx/dotfiles',
		])
		expect(resolveEventPolicy(contract, 'LELOUVINCX/AGENT-SKILLS', 'github.pull-request.merged')).toEqual({
			status: 'found',
			scope: 'project',
			policy: expect.objectContaining({
				id: 'github.pull-request.merged',
				fixedAction: expect.stringContaining('Run ./sync-skills.sh. Reload the projected plugins and the system prompt.'),
			}),
		})
		expect(resolveEventPolicy(contract, 'lelouvincx/agent-skills', 'github.workflow-run.failure')).toEqual({
			status: 'found',
			scope: 'global',
			policy: expect.objectContaining({ id: 'github.workflow-run.failure' }),
		})
		expect(resolveEventPolicy(contract, 'lelouvincx/agent-skills', 'github.issue.opened')).toEqual({
			status: 'missing-policy',
			reason: 'missing-event-policy',
			repository: 'lelouvincx/agent-skills',
			policyID: 'github.issue.opened',
		})
	})

	test('runtime rejects malformed closed objects, duplicates, forbidden fields and policy invariants', () => {
		const mutations: ((root: string) => void)[] = [
			(root) => {
				const path = join(root, 'config.json')
				const config = readJson(path)
				config.formatVersion = 'github-thread-events-config/v2'
				writeJson(path, config)
			},
			(root) => {
				const path = join(root, 'config.json')
				const config = readJson(path)
				config.repositories.push(config.repositories[0])
				writeJson(path, config)
			},
			(root) => {
				const path = join(root, 'policies', 'global.json')
				const policies = readJson(path)
				policies.policies[0].actorTrust.token = 'not-logged'
				writeJson(path, policies)
			},
			(root) => {
				const path = join(root, 'policies', 'global.json')
				const policies = readJson(path)
				policies.policies.push(policies.policies[0])
				writeJson(path, policies)
			},
			(root) => {
				const path = join(root, 'policies', 'global.json')
				const policies = readJson(path)
				policies.policies[0].sourcePointers = policies.policies[0].sourcePointers.filter((item: string) => item !== 'head-sha')
				writeJson(path, policies)
			},
		]

		for (const mutate of mutations) {
			const root = installProjectedContract(temporaryDirectory())
			mutate(root)
			let message = ''
			try { loadGithubThreadEventContract(root) } catch (error) { message = String(error) }
			expect(message).toContain('GitHub thread event contract')
			expect(message).not.toContain('not-logged')
		}
	})

	test('runtime rejects project paths that do not match a configured normalized repository', () => {
		const root = installProjectedContract(temporaryDirectory())
		const source = join(root, 'policies', 'projects', 'lelouvincx', 'agent-skills.json')
		const mismatch = join(root, 'policies', 'projects', 'Other', 'Repo.json')
		mkdirSync(join(root, 'policies', 'projects', 'Other'), { recursive: true })
		cpSync(source, mismatch)

		expect(() => loadGithubThreadEventContract(root)).toThrow('project policy path')
	})

	test('invalid applicable project and global policy files fail closed', () => {
		const invalidProjectRoot = installProjectedContract(temporaryDirectory())
		const projectPath = join(invalidProjectRoot, 'policies', 'projects', 'lelouvincx', 'agent-skills.json')
		const project = readJson(projectPath)
		project.policies[0].sourceCandidate = 'github.other'
		writeJson(projectPath, project)
		expect(() => loadGithubThreadEventContract(invalidProjectRoot)).toThrow('id must equal sourceCandidate')

		const invalidGlobalRoot = installProjectedContract(temporaryDirectory())
		const globalPath = join(invalidGlobalRoot, 'policies', 'global.json')
		const global = readJson(globalPath)
		global.policies[0].sourceCandidate = 'github.other'
		writeJson(globalPath, global)
		expect(() => loadGithubThreadEventContract(invalidGlobalRoot)).toThrow('id must equal sourceCandidate')
	})
})

describe('adaptive polling foundation', () => {
	test('polls immediately, backs off after empty results and resets after work', async () => {
		const pulls = [0, 0, 2, 0, 0]
		const delays: number[] = []
		const { polling } = loadGithubThreadEventContract(installProjectedContract(temporaryDirectory())).config

		await runAdaptivePolling({
			pull: async () => Array.from({ length: pulls.shift() ?? 0 }),
			sleep: async (milliseconds) => { delays.push(milliseconds) },
			activeIntervalSeconds: polling.activeIntervalSeconds,
			maximumIdleIntervalSeconds: polling.maximumIdleIntervalSeconds,
			maximumPolls: 5,
		})

		expect(delays).toEqual([30_000, 60_000, 15_000, 30_000])
		expect(pulls).toEqual([])
	})

	test('all-day empty pull operations stay below the checked-in Free-plan limit', () => {
		const root = installProjectedContract(temporaryDirectory())
		const { config } = loadGithubThreadEventContract(root)
		const operations = countIdlePullOperations(
			86_400,
			config.polling.activeIntervalSeconds,
			config.polling.maximumIdleIntervalSeconds,
		)

		expect(operations).toBe(1_441)
		expect(operations).toBeLessThan(config.queueAssumptions.dailyOperationLimit)
	})
})

describe('binding and recipient state', () => {
	test('initial bind registers its invoking owner and persists one binding', async () => {
		const harness = ownershipHarness()

		expect(await harness.call('bind_pr_to_thread', bindingInput(), 'T-owner')).toBe(
			'{"status":"created","repository":"owner/repository","pullRequest":126,"baseRef":"Main","ownerThreadID":"T-owner"}',
		)
		expect(queryAll(harness.databasePath, 'select thread_id, registered_at from recipients')).toEqual([
			expect.objectContaining({ thread_id: 'T-owner', registered_at: expect.any(String) }),
		])
		expect(queryAll(harness.databasePath, 'select repository, pull_request, base_ref, owner_thread_id, updated_at from bindings')).toEqual([
			expect.objectContaining({
				repository: 'owner/repository',
				pull_request: 126,
				base_ref: 'Main',
				owner_thread_id: 'T-owner',
				updated_at: expect.any(String),
			}),
		])
	})

	test('recipient registration grants no ownership and preserves its first timestamp', async () => {
		const harness = ownershipHarness()

		expect(JSON.parse(await harness.call('register_thread_event_recipient', {}, 'T-destination'))).toEqual({
			status: 'registered',
			threadID: 'T-destination',
		})
		expect(queryAll(harness.databasePath, 'select count(*) as count from bindings')).toEqual([{ count: 0 }])
		const [{ registered_at: registeredAt }] = queryAll(
			harness.databasePath,
			'select registered_at from recipients where thread_id = ?',
			'T-destination',
		)
		await Bun.sleep(2)

		expect(JSON.parse(await harness.call('register_thread_event_recipient', {}, 'T-destination'))).toEqual({
			status: 'already_registered',
			threadID: 'T-destination',
		})
		expect(queryAll(harness.databasePath, 'select registered_at from recipients where thread_id = ?', 'T-destination'))
			.toEqual([{ registered_at: registeredAt }])
	})

	test('same-owner binds preserve or update only the base ref as needed', async () => {
		const harness = ownershipHarness()
		await harness.call('bind_pr_to_thread', bindingInput(), 'T-owner')
		const [{ updated_at: firstUpdatedAt }] = queryAll(harness.databasePath, 'select updated_at from bindings')
		await Bun.sleep(2)

		expect(JSON.parse(await harness.call('bind_pr_to_thread', bindingInput(), 'T-owner'))).toEqual({
			status: 'unchanged',
			repository: 'owner/repository',
			pullRequest: 126,
			baseRef: 'Main',
			ownerThreadID: 'T-owner',
		})
		expect(queryAll(harness.databasePath, 'select updated_at from bindings')).toEqual([{ updated_at: firstUpdatedAt }])
		await Bun.sleep(2)

		expect(JSON.parse(await harness.call('bind_pr_to_thread', bindingInput({ baseRef: 'release/V1' }), 'T-owner'))).toEqual({
			status: 'base_ref_updated',
			repository: 'owner/repository',
			pullRequest: 126,
			baseRef: 'release/V1',
			ownerThreadID: 'T-owner',
		})
		const [{ base_ref: baseRef, updated_at: updatedAt }] = queryAll(
			harness.databasePath,
			'select base_ref, updated_at from bindings',
		)
		expect(baseRef).toBe('release/V1')
		expect(updatedAt).not.toBe(firstUpdatedAt)
	})

	test('cross-thread bind fails and rolls back attempted recipient registration', async () => {
		const harness = ownershipHarness()
		await harness.call('bind_pr_to_thread', bindingInput(), 'T-owner')

		await expect(harness.call('bind_pr_to_thread', bindingInput(), 'T-intruder')).rejects.toThrow(
			'Pull request owner/repository#126 is already owned by another thread.',
		)
		expect(queryAll(harness.databasePath, 'select thread_id from recipients order by thread_id')).toEqual([
			{ thread_id: 'T-owner' },
		])
		expect(queryAll(harness.databasePath, 'select owner_thread_id from bindings')).toEqual([
			{ owner_thread_id: 'T-owner' },
		])
	})

	test('normalized repository and pull-request key remains unique across reopen', async () => {
		const directory = temporaryDirectory()
		const databasePath = join(directory, 'state', 'github-thread-events.sqlite')
		const first = ownershipHarness(databasePath)
		await first.call('bind_pr_to_thread', bindingInput({ repository: '  Owner/Repository  ' }), 'T-owner')
		first.store.close()

		const reopened = ownershipHarness(databasePath)
		expect(JSON.parse(await reopened.call('bind_pr_to_thread', bindingInput({ repository: 'owner/repository' }), 'T-owner'))).toEqual({
			status: 'unchanged',
			repository: 'owner/repository',
			pullRequest: 126,
			baseRef: 'Main',
			ownerThreadID: 'T-owner',
		})
		expect(queryAll(databasePath, 'select repository, pull_request, count(*) as count from bindings group by repository, pull_request')).toEqual([
			{ repository: 'owner/repository', pull_request: 126, count: 1 },
		])
	})
})

describe('owner-only transfer', () => {
	test('enforces binding, owner, then destination checks and transfers only from the owner', async () => {
		const harness = ownershipHarness()

		await expect(harness.call('transfer_pr_thread_owner', {
			repository: 'Owner/Repository', pullRequest: 126, destinationThreadID: 'T-destination',
		}, 'T-unrelated')).rejects.toThrow('No binding exists for owner/repository#126.')
		await harness.call('bind_pr_to_thread', bindingInput(), 'T-owner')
		await expect(harness.call('transfer_pr_thread_owner', {
			repository: 'Owner/Repository', pullRequest: 126, destinationThreadID: 'T-destination',
		}, 'T-owner')).rejects.toThrow('Destination thread T-destination is not a registered event recipient.')
		expect(queryAll(harness.databasePath, 'select thread_id from recipients')).toEqual([{ thread_id: 'T-owner' }])
		const [{ updated_at: beforeTransfer }] = queryAll(harness.databasePath, 'select updated_at from bindings')
		await harness.call('register_thread_event_recipient', {}, 'T-destination')

		for (const nonOwner of ['T-destination', 'T-parent-equivalent', 'T-unrelated']) {
			await expect(harness.call('transfer_pr_thread_owner', {
				repository: 'Owner/Repository', pullRequest: 126, destinationThreadID: 'T-destination',
			}, nonOwner)).rejects.toThrow('Only the current owner can transfer owner/repository#126.')
		}
		await Bun.sleep(2)

		expect(JSON.parse(await harness.call('transfer_pr_thread_owner', {
			repository: 'Owner/Repository', pullRequest: 126, destinationThreadID: ' T-destination ',
		}, 'T-owner'))).toEqual({
			status: 'transferred',
			repository: 'owner/repository',
			pullRequest: 126,
			previousOwnerThreadID: 'T-owner',
			ownerThreadID: 'T-destination',
		})
		const [transferredBinding] = queryAll(
			harness.databasePath,
			'select repository, pull_request, base_ref, owner_thread_id, updated_at from bindings',
		)
		expect(transferredBinding).toEqual(expect.objectContaining({
			repository: 'owner/repository',
			pull_request: 126,
			base_ref: 'Main',
			owner_thread_id: 'T-destination',
		}))
		expect(transferredBinding.updated_at).not.toBe(beforeTransfer)
		expect(queryAll(harness.databasePath, 'select thread_id from recipients order by thread_id')).toEqual([
			{ thread_id: 'T-destination' },
			{ thread_id: 'T-owner' },
		])
		await expect(harness.call('transfer_pr_thread_owner', {
			repository: 'Owner/Repository', pullRequest: 126, destinationThreadID: 'T-owner',
		}, 'T-owner')).rejects.toThrow('Only the current owner can transfer owner/repository#126.')
	})

	test('current owner self-transfer is unchanged without changing its timestamp', async () => {
		const harness = ownershipHarness()
		await harness.call('bind_pr_to_thread', bindingInput(), 'T-owner')
		const [{ updated_at: updatedAt }] = queryAll(harness.databasePath, 'select updated_at from bindings')
		await Bun.sleep(2)

		expect(JSON.parse(await harness.call('transfer_pr_thread_owner', {
			repository: 'Owner/Repository', pullRequest: 126, destinationThreadID: 'T-owner',
		}, 'T-owner'))).toEqual({
			status: 'unchanged',
			repository: 'owner/repository',
			pullRequest: 126,
			previousOwnerThreadID: 'T-owner',
			ownerThreadID: 'T-owner',
		})
		expect(queryAll(harness.databasePath, 'select updated_at from bindings')).toEqual([{ updated_at: updatedAt }])
	})
})

describe('input contracts', () => {
	test('schemas reject unknown fields and never accept a current owner input', () => {
		const harness = ownershipHarness()
		const expectedProperties: Record<string, string[]> = {
			bind_pr_to_thread: ['baseRef', 'pullRequest', 'repository'],
			register_thread_event_recipient: [],
			transfer_pr_thread_owner: ['destinationThreadID', 'pullRequest', 'repository'],
		}

		for (const [name, properties] of Object.entries(expectedProperties)) {
			const schema = harness.tools.get(name)?.inputSchema
			expect(schema?.additionalProperties).toBe(false)
			expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(properties)
			expect(Object.keys(schema?.properties ?? {})).not.toContain('ownerThreadID')
		}
		expect(harness.tools.get('bind_pr_to_thread')?.inputSchema.required).toEqual(['repository', 'pullRequest', 'baseRef'])
		expect(harness.tools.get('transfer_pr_thread_owner')?.inputSchema.required).toEqual([
			'repository', 'pullRequest', 'destinationThreadID',
		])
		expect(harness.tools.get('bind_pr_to_thread')?.inputSchema.properties?.pullRequest?.type).toBe('number')
		expect(harness.tools.get('transfer_pr_thread_owner')?.inputSchema.properties?.pullRequest?.type).toBe('number')
	})

	test('runtime validation rejects invalid normalized fields', async () => {
		const harness = ownershipHarness()

		for (const repository of ['', 'owner', '/repository', 'owner/', 'owner/repository/extra', 'own er/repository', 'owner/repo sitory', 7]) {
			await expect(harness.call('bind_pr_to_thread', bindingInput({ repository }), 'T-owner')).rejects.toThrow('repository')
		}
		for (const pullRequest of ['126', 0, -1, 1.5]) {
			await expect(harness.call('bind_pr_to_thread', bindingInput({ pullRequest }), 'T-owner')).rejects.toThrow('pullRequest')
		}
		for (const baseRef of ['', '   ', 7]) {
			await expect(harness.call('bind_pr_to_thread', bindingInput({ baseRef }), 'T-owner')).rejects.toThrow('baseRef')
		}
		for (const destinationThreadID of ['', '   ', 7]) {
			await expect(harness.call('transfer_pr_thread_owner', {
				repository: 'owner/repository', pullRequest: 126, destinationThreadID,
			}, 'T-owner')).rejects.toThrow('destinationThreadID')
		}
		expect(queryAll(harness.databasePath, 'select count(*) as count from recipients')).toEqual([{ count: 0 }])
		expect(queryAll(harness.databasePath, 'select count(*) as count from bindings')).toEqual([{ count: 0 }])
	})
})
