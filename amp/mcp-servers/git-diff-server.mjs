#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

const MAX_OUTPUT_BYTES = 1024 * 1024
const MAX_PATHS = 100
const TIMEOUT_MS = 30_000
const TOOL_NAMES = new Set(['git_diff', 'git_diff_refs', 'git_changed_files', 'git_file_at_ref'])
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-11-25', '2025-06-18', '2025-03-26'])

let activeChild

export async function getGitDiff(repository = process.env.AMP_GIT_DIFF_REPOSITORY, input = {}) {
	assertOnlyKeys(input, ['paths'])
	const root = await getRepositoryRoot(repository)
	const paths = normalizePaths(root, input.paths)
	try {
		await resolveCommit(root, 'HEAD', 'HEAD')
	} catch {
		throw new Error('The repository has no HEAD commit; supply the diff through context instead.')
	}

	const tracked = await runGit(root, gitDiffArgs(['--unified=3', 'HEAD', '--', ...paths]))
	const untracked = await runGit(root, untrackedArgs(paths))
	return boundedResult([
		'Tracked diff against HEAD (staged and unstaged):',
		tracked.stdout.trimEnd() || '(none)',
		'',
		'Untracked paths (contents are not included; read these files separately):',
		formatUntracked(untracked.stdout),
	].join('\n'))
}

export async function getGitChangedFiles(repository = process.env.AMP_GIT_DIFF_REPOSITORY, input = {}) {
	assertOnlyKeys(input, [])
	const root = await getRepositoryRoot(repository)
	const staged = await runGit(root, gitDiffArgs(['--cached', '--name-status', '--no-renames', '--']))
	const unstaged = await runGit(root, gitDiffArgs(['--name-status', '--no-renames', '--']))
	const untracked = await runGit(root, untrackedArgs([]))
	return boundedResult([
		'Staged tracked changes:',
		staged.stdout.trimEnd() || '(none)',
		'',
		'Unstaged tracked changes:',
		unstaged.stdout.trimEnd() || '(none)',
		'',
		'Untracked paths:',
		formatUntracked(untracked.stdout),
	].join('\n'))
}

export async function getGitDiffRefs(repository = process.env.AMP_GIT_DIFF_REPOSITORY, input = {}) {
	assertOnlyKeys(input, ['baseRef', 'targetRef', 'paths'])
	const baseRef = normalizeRef(input.baseRef, 'baseRef')
	const targetRef = normalizeRef(input.targetRef ?? 'HEAD', 'targetRef')
	const root = await getRepositoryRoot(repository)
	const paths = normalizePaths(root, input.paths)
	const base = await resolveCommit(root, baseRef, 'baseRef')
	const target = await resolveCommit(root, targetRef, 'targetRef')
	const mergeBaseResult = await runGit(root, ['--no-pager', 'merge-base', base.oid, target.oid])
	const mergeBase = validateObjectID(mergeBaseResult.stdout.trim(), 'merge base')
	const tracked = await runGit(root, gitDiffArgs(['--unified=3', mergeBase, target.oid, '--', ...paths]))

	return boundedResult([
		`Committed diff from the merge base of ${JSON.stringify(baseRef)} to ${JSON.stringify(targetRef)}:`,
		`Merge base: ${mergeBase}`,
		`Target commit: ${target.oid}`,
		'',
		tracked.stdout.trimEnd() || '(none)',
	].join('\n'))
}

export async function getGitFileAtRef(repository = process.env.AMP_GIT_DIFF_REPOSITORY, input = {}) {
	assertOnlyKeys(input, ['ref', 'path'])
	const ref = normalizeRef(input.ref, 'ref')
	const root = await getRepositoryRoot(repository)
	const [path] = normalizePaths(root, [input.path])
	if (path === '.') throw new Error('path must name one file inside the repository.')
	const commit = await resolveCommit(root, ref, 'ref')
	const tree = await runGit(root, [
		'--no-pager',
		'--literal-pathspecs',
		'-c', 'core.fsmonitor=false',
		'ls-tree', '-z', '--full-tree', commit.oid, '--', path,
	])
	const entries = tree.stdout.split('\0').filter(Boolean)
	if (entries.length !== 1) throw new Error(`File not found at ${JSON.stringify(ref)}: ${JSON.stringify(path)}`)
	const separator = entries[0].indexOf('\t')
	const [mode, type, objectID] = entries[0].slice(0, separator).split(' ')
	const listedPath = entries[0].slice(separator + 1)
	if (separator < 0 || listedPath !== path || type !== 'blob') {
		throw new Error(`Path is not one file at ${JSON.stringify(ref)}: ${JSON.stringify(path)}`)
	}
	validateObjectID(objectID, 'file object')
	const file = await runGit(root, ['--no-pager', 'cat-file', 'blob', objectID])
	if (file.stdout.includes('\0')) throw new Error(`Binary files are not supported: ${JSON.stringify(path)}`)

	return boundedResult([
		`File ${JSON.stringify(path)} at ${JSON.stringify(ref)} (${commit.oid}, mode ${mode}):`,
		file.stdout,
	].join('\n'))
}

export async function serve(input = process.stdin, output = process.stdout) {
	const lines = createInterface({ input, crlfDelay: Infinity })
	for await (const line of lines) {
		if (!line.trim()) continue
		let request
		try {
			request = JSON.parse(line)
		} catch {
			writeMessage(output, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
			continue
		}

		if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
			if (request?.id !== undefined) writeError(output, request.id, -32600, 'Invalid request')
			continue
		}
		if (request.id === undefined) continue

		if (request.method === 'initialize') {
			const requestedVersion = request.params?.protocolVersion
			writeResult(output, request.id, {
				protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion) ? requestedVersion : '2025-11-25',
				capabilities: { tools: {} },
				serverInfo: { name: 'amp-read-only-git', version: '1.0.0' },
			})
			continue
		}
		if (request.method === 'ping') {
			writeResult(output, request.id, {})
			continue
		}
		if (request.method === 'tools/list') {
			writeResult(output, request.id, { tools: toolDefinitions() })
			continue
		}
		if (request.method === 'tools/call') {
			const name = request.params?.name
			if (!TOOL_NAMES.has(name)) {
				writeError(output, request.id, -32602, `Unknown tool: ${String(request.params?.name)}`)
				continue
			}
			const args = request.params?.arguments ?? {}
			if (!args || typeof args !== 'object' || Array.isArray(args)) {
				writeError(output, request.id, -32602, `${name} arguments must be an object`)
				continue
			}
			try {
				writeResult(output, request.id, {
					content: [{ type: 'text', text: await callTool(name, args) }],
					isError: false,
				})
			} catch (error) {
				writeResult(output, request.id, {
					content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
					isError: true,
				})
			}
			continue
		}

		writeError(output, request.id, -32601, `Method not found: ${request.method}`)
	}
}

function toolDefinitions() {
	const paths = {
		type: 'array',
		items: { type: 'string', minLength: 1, maxLength: 4096 },
		minItems: 1,
		maxItems: MAX_PATHS,
		description: 'Optional repository-relative paths to include. Literal pathspecs only.',
	}
	const ref = { type: 'string', minLength: 1, maxLength: 1024 }
	return [
		toolDefinition(
			'git_diff',
			'Return tracked staged and unstaged working-tree changes against HEAD plus untracked paths. Use paths to split a large review.',
			{ type: 'object', properties: { paths }, additionalProperties: false },
		),
		toolDefinition(
			'git_diff_refs',
			'Return committed changes from the merge base of 2 verified refs to the target ref.',
			{
				type: 'object',
				properties: { baseRef: ref, targetRef: ref, paths },
				required: ['baseRef'],
				additionalProperties: false,
			},
		),
		toolDefinition(
			'git_changed_files',
			'Return separate staged, unstaged, and untracked path summaries for the current working tree.',
			{ type: 'object', properties: {}, additionalProperties: false },
		),
		toolDefinition(
			'git_file_at_ref',
			'Return one repository-relative text file at a verified commit ref.',
			{
				type: 'object',
				properties: { ref, path: { type: 'string', minLength: 1, maxLength: 4096 } },
				required: ['ref', 'path'],
				additionalProperties: false,
			},
		),
	]
}

function toolDefinition(name, description, inputSchema) {
	return {
		name,
		description,
		inputSchema,
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
	}
}

function callTool(name, args) {
	switch (name) {
		case 'git_diff': return getGitDiff(undefined, args)
		case 'git_diff_refs': return getGitDiffRefs(undefined, args)
		case 'git_changed_files': return getGitChangedFiles(undefined, args)
		case 'git_file_at_ref': return getGitFileAtRef(undefined, args)
		default: throw new Error(`Unknown tool: ${name}`)
	}
}

async function getRepositoryRoot(repository) {
	if (!repository) throw new Error('AMP_GIT_DIFF_REPOSITORY is required.')
	const root = (await runGit(resolve(repository), [
		'--no-pager',
		'-c', 'core.fsmonitor=false',
		'rev-parse', '--show-toplevel',
	])).stdout.trim()
	if (!root) throw new Error('Git did not return a repository root.')
	return root
}

async function resolveCommit(root, ref, label) {
	const result = await runGit(root, [
		'--no-pager',
		'-c', 'core.fsmonitor=false',
		'rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`,
	], [0, 1])
	if (result.exitCode !== 0) throw new Error(`${label} does not resolve to a local commit: ${JSON.stringify(ref)}`)
	return { ref, oid: validateObjectID(result.stdout.trim(), label) }
}

function normalizeRef(value, label) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty Git ref.`)
	const ref = value.trim()
	if (ref.length > 1024 || /[\0\r\n]/.test(ref) || ref.startsWith('-') || ref.includes('@{')) {
		throw new Error(`${label} is not an allowed Git ref.`)
	}
	return ref
}

function validateObjectID(value, label) {
	if (!/^[0-9a-f]{40,64}$/.test(value)) throw new Error(`Git returned an invalid ${label} object ID.`)
	return value
}

function normalizePaths(root, value) {
	if (value === undefined) return []
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PATHS) {
		throw new Error(`paths must contain 1 to ${MAX_PATHS} repository-relative paths.`)
	}
	const paths = value.map((path) => {
		if (typeof path !== 'string' || !path || path.length > 4096 || /[\0\r\n]/.test(path) || isAbsolute(path)) {
			throw new Error('Each path must be a repository-relative string of at most 4096 characters.')
		}
		const normalized = relative(root, resolve(root, path))
		if (normalized === '..' || normalized.startsWith(`..${sep}`) || isAbsolute(normalized)) {
			throw new Error(`Path escapes the repository: ${JSON.stringify(path)}`)
		}
		return normalized || '.'
	})
	return [...new Set(paths)]
}

function assertOnlyKeys(input, allowedKeys) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Tool arguments must be an object.')
	const unexpected = Object.keys(input).filter((key) => !allowedKeys.includes(key))
	if (unexpected.length > 0) throw new Error(`Unexpected tool argument: ${unexpected[0]}`)
}

function gitDiffArgs(args) {
	return [
		'--no-pager',
		'--literal-pathspecs',
		'-c', 'color.ui=false',
		'-c', 'core.fsmonitor=false',
		'-c', 'core.quotepath=true',
		'diff',
		'--no-ext-diff',
		'--no-textconv',
		'--no-color',
		'--submodule=short',
		...args,
	]
}

function untrackedArgs(paths) {
	return [
		'--no-pager',
		'--literal-pathspecs',
		'-c', 'core.fsmonitor=false',
		'ls-files', '--others', '--exclude-standard', '-z', '--', ...paths,
	]
}

function formatUntracked(stdout) {
	return stdout
		.split('\0')
		.filter(Boolean)
		.map((path) => `- ${JSON.stringify(path)}`)
		.join('\n') || '(none)'
}

function boundedResult(result) {
	if (Buffer.byteLength(result) > MAX_OUTPUT_BYTES) {
		throw new Error('Git output exceeded the 1 MiB limit; use changed-file and path-scoped tools or supply a narrower diff through context.')
	}
	return result
}

function runGit(cwd, args, allowedExitCodes = [0]) {
	return new Promise((resolveRun, rejectRun) => {
		const stdout = []
		const stderr = []
		let outputBytes = 0
		let settled = false
		let timeout
		const child = spawn('git', args, {
			cwd,
			env: gitEnvironment(),
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		activeChild = child

		const finish = (error, result) => {
			if (settled) return
			settled = true
			clearTimeout(timeout)
			if (activeChild === child) activeChild = undefined
			if (error) rejectRun(error)
			else resolveRun(result)
		}
		const capture = (chunks) => (chunk) => {
			outputBytes += chunk.length
			if (outputBytes > MAX_OUTPUT_BYTES) {
				child.kill('SIGKILL')
				finish(new Error('Git output exceeded the 1 MiB limit; supply a narrower diff through context.'))
				return
			}
			chunks.push(chunk)
		}
		child.stdout.on('data', capture(stdout))
		child.stderr.on('data', capture(stderr))
		child.on('error', (error) => finish(error))
		child.on('close', (exitCode) => {
			const result = {
				exitCode,
				stdout: Buffer.concat(stdout).toString('utf8'),
				stderr: Buffer.concat(stderr).toString('utf8'),
			}
			if (!allowedExitCodes.includes(exitCode)) {
				finish(new Error(`git ${args.at(-1) ?? ''} failed: ${result.stderr.trim() || `exit ${exitCode}`}`))
				return
			}
			finish(undefined, result)
		})

		timeout = setTimeout(() => {
			child.kill('SIGKILL')
			finish(new Error('Git diff timed out after 30 seconds.'))
		}, TIMEOUT_MS)
		timeout.unref()
	})
}

function gitEnvironment() {
	const env = {}
	for (const key of ['HOME', 'PATH', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot']) {
		if (typeof process.env[key] === 'string') env[key] = process.env[key]
	}
	return {
		...env,
		GIT_ATTR_NOSYSTEM: '1',
		GIT_CONFIG_NOSYSTEM: '1',
		GIT_NO_LAZY_FETCH: '1',
		GIT_OPTIONAL_LOCKS: '0',
		GIT_PAGER: 'cat',
		GIT_TERMINAL_PROMPT: '0',
		LC_ALL: 'C',
		NO_COLOR: '1',
		PAGER: 'cat',
	}
}

function writeResult(output, id, result) {
	writeMessage(output, { jsonrpc: '2.0', id, result })
}

function writeError(output, id, code, message) {
	writeMessage(output, { jsonrpc: '2.0', id, error: { code, message } })
}

function writeMessage(output, message) {
	output.write(`${JSON.stringify(message)}\n`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
	process.once('SIGTERM', () => {
		activeChild?.kill('SIGKILL')
		process.exit(0)
	})
	serve().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
		process.exitCode = 1
	})
}
