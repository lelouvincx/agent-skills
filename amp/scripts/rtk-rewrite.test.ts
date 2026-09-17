import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import plugin, { rewriteGitDiffToSem } from '../plugins/rtk-rewrite'

const tempDirectories: string[] = []

afterEach(() => {
	for (const path of tempDirectories.splice(0)) rmSync(path, { recursive: true, force: true })
})

function createFakeBin(): string {
	const dir = mkdtempSync(join(tmpdir(), 'rtk-rewrite-bin-'))
	tempDirectories.push(dir)
	writeFileSync(
		join(dir, 'sem'),
		`#!/bin/sh
if [ "$1" = --version ]; then
	echo 'sem 0.24.0'
	exit 0
fi
exit 1
`,
	)
	writeFileSync(
		join(dir, 'rtk'),
		`#!/bin/sh
if [ "$1" = --version ]; then
	echo 'rtk 0.49.0'
	exit 0
fi
if [ "$1" = rewrite ]; then
	shift
	[ "$1" = -- ] && shift
	cmd="$*"
	case "$cmd" in
		"git diff")
			echo 'rtk git diff'
			exit 3
			;;
		"git diff --stat")
			echo 'rtk git diff --stat'
			exit 3
			;;
		"sem diff")
			exit 1
			;;
		*)
			exit 1
			;;
	esac
fi
exit 1
`,
	)
	chmodSync(join(dir, 'sem'), 0o700)
	chmodSync(join(dir, 'rtk'), 0o700)
	return dir
}

async function handleBash(cmd: string) {
	const bin = createFakeBin()
	const cache = mkdtempSync(join(tmpdir(), 'rtk-rewrite-cache-'))
	tempDirectories.push(cache)
	const previousPath = process.env.PATH
	const previousCache = process.env.XDG_CACHE_HOME
	process.env.PATH = `${bin}:/bin:/usr/bin`
	process.env.XDG_CACHE_HOME = cache
	try {
		let handler: ((event: { tool: string; input: Record<string, unknown> }, ctx: { logger: { log: (m: string) => void } }) => Promise<{ action: string; input?: Record<string, unknown> }>) | undefined
		plugin({
			logger: { log() {} },
			on(_event: string, registered: typeof handler) {
				handler = registered
			},
		} as never)
		if (!handler) throw new Error('plugin did not register a tool.call handler')
		return await handler({ tool: 'Bash', input: { cmd } }, { logger: { log() {} } })
	} finally {
		process.env.PATH = previousPath
		if (previousCache === undefined) delete process.env.XDG_CACHE_HOME
		else process.env.XDG_CACHE_HOME = previousCache
	}
}

describe('git diff to sem diff overlay', () => {
	test('rewrites compatible git diff commands', () => {
		expect(rewriteGitDiffToSem('git diff')).toBe('sem diff')
		expect(rewriteGitDiffToSem('git --no-pager diff')).toBe('sem diff')
		expect(rewriteGitDiffToSem('git -C /tmp diff')).toBe('sem diff -C /tmp')
		expect(rewriteGitDiffToSem('git --no-pager -C /tmp diff --cached')).toBe('sem diff -C /tmp --cached')
		expect(rewriteGitDiffToSem('git -C /tmp --no-pager diff --staged')).toBe('sem diff -C /tmp --staged')
		expect(rewriteGitDiffToSem('git diff --cached HEAD -- README.md')).toBe('sem diff --cached HEAD -- README.md')
		expect(rewriteGitDiffToSem('git diff HEAD~1...HEAD')).toBe('sem diff HEAD~1...HEAD')
		expect(rewriteGitDiffToSem('rtk git diff')).toBe('sem diff')
		expect(rewriteGitDiffToSem('command git diff')).toBe('sem diff')
		expect(rewriteGitDiffToSem('command rtk git diff -- README.md')).toBe('sem diff -- README.md')
		expect(rewriteGitDiffToSem('git diff -- "foo bar"')).toBe('sem diff -- "foo bar"')
		expect(rewriteGitDiffToSem('git diff 2>&1')).toBe('sem diff 2>&1')
		expect(rewriteGitDiffToSem('git diff > out.patch')).toBe('sem diff > out.patch')
	})

	test('rewrites git diff segments inside compounds', () => {
		expect(rewriteGitDiffToSem('git diff && git status')).toBe('sem diff && git status')
		expect(rewriteGitDiffToSem('git status && git diff')).toBe('git status && sem diff')
		expect(rewriteGitDiffToSem('git diff | head')).toBe('sem diff | head')
		expect(rewriteGitDiffToSem('git diff || true')).toBe('sem diff || true')
		expect(rewriteGitDiffToSem('git diff; git status')).toBe('sem diff; git status')
		expect(rewriteGitDiffToSem('git diff --stat && git diff')).toBe('git diff --stat && sem diff')
	})

	test('leaves incompatible git commands unchanged', () => {
		expect(rewriteGitDiffToSem('git diff --stat')).toBe('git diff --stat')
		expect(rewriteGitDiffToSem('git diff --color')).toBe('git diff --color')
		expect(rewriteGitDiffToSem('git diff -U3')).toBe('git diff -U3')
		expect(rewriteGitDiffToSem('git diff --name-only')).toBe('git diff --name-only')
		expect(rewriteGitDiffToSem('git status')).toBe('git status')
		expect(rewriteGitDiffToSem('git --no-pager')).toBe('git --no-pager')
		expect(rewriteGitDiffToSem('git log')).toBe('git log')
		expect(rewriteGitDiffToSem('/usr/bin/git diff')).toBe('/usr/bin/git diff')
		expect(rewriteGitDiffToSem('git -C /tmp -C /other diff')).toBe('git -C /tmp -C /other diff')
		expect(rewriteGitDiffToSem('sem diff')).toBe('sem diff')
		expect(rewriteGitDiffToSem('')).toBe('')
	})
})

describe('rtk-rewrite tool.call overlay', () => {
	test('rewrites git diff to sem diff before rtk rewrite', async () => {
		expect(await handleBash('git diff')).toEqual({
			action: 'modify',
			input: { cmd: 'sem diff' },
		})
	})

	test('leaves unsupported git diff flags for rtk rewrite', async () => {
		expect(await handleBash('git diff --stat')).toEqual({
			action: 'modify',
			input: { cmd: 'rtk git diff --stat' },
		})
	})

	test('allows commands with no overlay or rtk rewrite', async () => {
		expect(await handleBash('git status')).toEqual({ action: 'allow' })
	})
})
