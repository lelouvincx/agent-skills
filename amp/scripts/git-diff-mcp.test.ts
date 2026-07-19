import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { getGitChangedFiles, getGitDiff, getGitDiffRefs, getGitFileAtRef } from '../mcp-servers/git-diff-server.mjs'

const tempDirectories: string[] = []

afterEach(() => {
	for (const path of tempDirectories.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('read-only Git diff MCP server', () => {
	test('returns staged and unstaged changes plus untracked paths without changing the repository', async () => {
		const repository = createRepository()
		const tracked = join(repository, 'tracked.txt')
		writeFileSync(tracked, 'one\ntwo\n')
		git(repository, 'add', 'tracked.txt')
		writeFileSync(tracked, 'one\ntwo\nthree\n')
		writeFileSync(join(repository, 'new file.txt'), 'new\n')
		const statusBefore = git(repository, 'status', '--porcelain=v1', '-z')

		const diff = await getGitDiff(repository)

		expect(diff).toContain('+two')
		expect(diff).toContain('+three')
		expect(diff).toContain('"new file.txt"')
		expect(git(repository, 'status', '--porcelain=v1', '-z')).toBe(statusBefore)
	})

	test('does not execute a configured external diff command', async () => {
		const repository = createRepository()
		const marker = join(repository, 'external-diff-ran')
		const externalDiff = join(repository, 'external-diff.sh')
		writeFileSync(externalDiff, `#!/bin/sh\ntouch ${JSON.stringify(marker)}\n`)
		chmodSync(externalDiff, 0o700)
		git(repository, 'config', 'diff.external', externalDiff)
		writeFileSync(join(repository, 'tracked.txt'), 'changed\n')

		await getGitDiff(repository)

		expect(existsSync(marker)).toBe(false)
	})

	test('provides bounded ref, summary, path, and historical-file review context', async () => {
		const repository = createRepository()
		git(repository, 'checkout', '--quiet', '-b', 'feature')
		writeFileSync(join(repository, 'tracked.txt'), 'feature\n')
		writeFileSync(join(repository, 'other.txt'), 'other\n')
		git(repository, 'add', 'tracked.txt', 'other.txt')
		git(repository, 'commit', '--quiet', '-m', 'feature')

		const refDiff = await getGitDiffRefs(repository, { baseRef: 'main', targetRef: 'feature' })
		expect(refDiff).toContain('+feature')
		expect(refDiff).toContain('other.txt')
		const oldFile = await getGitFileAtRef(repository, { ref: 'main', path: 'tracked.txt' })
		expect(oldFile).toContain('\none\n')

		writeFileSync(join(repository, 'tracked.txt'), 'feature\nstaged\n')
		git(repository, 'add', 'tracked.txt')
		writeFileSync(join(repository, 'tracked.txt'), 'feature\nstaged\nunstaged\n')
		writeFileSync(join(repository, 'other.txt'), 'other changed\n')
		writeFileSync(join(repository, 'untracked.txt'), 'new\n')
		const summary = await getGitChangedFiles(repository)
		expect(summary).toContain('Staged tracked changes:\nM\ttracked.txt')
		expect(summary).toContain('Unstaged tracked changes:')
		expect(summary).toContain('M\tother.txt')
		expect(summary).toContain('"untracked.txt"')
		const scoped = await getGitDiff(repository, { paths: ['tracked.txt'] })
		expect(scoped).toContain('+unstaged')
		expect(scoped).not.toContain('other.txt')
		expect(scoped).not.toContain('untracked.txt')

		await expect(getGitDiff(repository, { paths: ['../outside'] })).rejects.toThrow('escapes the repository')
		await expect(getGitDiffRefs(repository, { baseRef: 'HEAD@{1}' })).rejects.toThrow('not an allowed Git ref')
		await expect(getGitFileAtRef(repository, { ref: 'main', path: '../outside' })).rejects.toThrow('escapes the repository')
	})

	test('serves the stable MCP initialize, list, and call flow over stdio', () => {
		const repository = createRepository()
		writeFileSync(join(repository, 'tracked.txt'), 'changed\n')
		const server = resolve(import.meta.dir, '..', 'mcp-servers', 'git-diff-server.mjs')
		const messages = [
			{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
			{ jsonrpc: '2.0', method: 'notifications/initialized' },
			{ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
			{ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'git_diff', arguments: {} } },
			{ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'git_changed_files', arguments: {} } },
			{ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'git_diff_refs', arguments: { baseRef: 'main', targetRef: 'HEAD' } } },
			{ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'git_file_at_ref', arguments: { ref: 'main', path: 'tracked.txt' } } },
		]
		const result = spawnSync('node', [server], {
			encoding: 'utf8',
			env: { ...process.env, AMP_GIT_DIFF_REPOSITORY: repository },
			input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
		})

		expect(result.status).toBe(0)
		const responses = result.stdout.trim().split('\n').map((line) => JSON.parse(line))
		expect(responses.find((response) => response.id === 1)?.result.protocolVersion).toBe('2025-11-25')
		expect(responses.find((response) => response.id === 2)?.result.tools.map((tool) => tool.name)).toEqual([
			'git_diff',
			'git_diff_refs',
			'git_changed_files',
			'git_file_at_ref',
		])
		expect(responses.find((response) => response.id === 3)?.result.isError).toBe(false)
		expect(responses.find((response) => response.id === 4)?.result.content[0].text).toContain('Untracked paths:')
		expect(responses.find((response) => response.id === 5)?.result.isError).toBe(false)
		expect(responses.find((response) => response.id === 6)?.result.content[0].text).toContain('\none\n')
	})
})

function createRepository(): string {
	const repository = mkdtempSync(join(tmpdir(), 'git-diff-mcp-test-'))
	tempDirectories.push(repository)
	git(repository, 'init', '--quiet')
	git(repository, 'config', 'user.email', 'test@example.com')
	git(repository, 'config', 'user.name', 'Test')
	git(repository, 'config', 'commit.gpgsign', 'false')
	git(repository, 'config', 'core.hooksPath', '/dev/null')
	writeFileSync(join(repository, 'tracked.txt'), 'one\n')
	git(repository, 'add', 'tracked.txt')
	git(repository, 'commit', '--quiet', '-m', 'initial')
	git(repository, 'branch', '-M', 'main')
	return repository
}

function git(repository: string, ...args: string[]): string {
	const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' })
	if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`)
	return result.stdout
}
