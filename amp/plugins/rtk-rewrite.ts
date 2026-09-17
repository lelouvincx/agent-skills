// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// rtk-rewrite — Amp plugin port of https://github.com/rtk-ai/rtk/blob/master/hooks/claude/rtk-rewrite.sh
//
// Rewrites compatible `git diff` segments to `sem diff` before `rtk rewrite`
// maps them to `rtk git diff`. Remaining rewrite logic lives in `rtk rewrite`.
//
// `rtk rewrite` exit-code protocol:
//   0 + stdout  Rewrite found with an explicit allow verdict
//   1           No RTK equivalent → pass through unchanged
//   2           Deny rule matched → pass through (permission rules handle it)
//   3 + stdout  Ask/default verdict → rewrite, but let the permission system prompt
//
// Requires: optional sem on $PATH (verified with 0.24.0); optional rtk >= 0.23.0
// on $PATH (verified with 0.49.0). The plugin loads when at least one is usable.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PluginAPI } from '@ampcode/plugin'

const MIN_RTK_MAJOR = 0
const MIN_RTK_MINOR = 23
const MIN_RTK_VERSION = `${MIN_RTK_MAJOR}.${MIN_RTK_MINOR}.0`
const VERIFIED_RTK_VERSION = '0.49.0'
const VERIFIED_SEM_VERSION = '0.24.0'
const SEM_DIFF_FLAGS = new Set(['--cached', '--staged', '--'])

export const description = 'Rewrites compatible git diff Bash commands to sem diff, then remaining eligible commands through rtk rewrite.'

function checkSemOnce(logger: { log: (m: string) => void }): boolean {
	const r = spawnSync('sem', ['--version'], { encoding: 'utf8', env: process.env })
	if (r.status !== 0) {
		logger.log('[rtk] sem is not installed or not in PATH; git diff overlay disabled')
		return false
	}
	const raw = (r.stdout || '').trim().replace(/^sem\s+/, '').split(/\s+/)[0] ?? ''
	if (raw && raw !== VERIFIED_SEM_VERSION) {
		logger.log(`[rtk] using sem ${raw}; plugin verified with ${VERIFIED_SEM_VERSION}`)
	}
	return true
}

function checkRtkVersionOnce(logger: { log: (m: string) => void }): boolean {
	const cacheDir = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache')
	const cacheFile = join(cacheDir, `rtk-hook-version-ok-${MIN_RTK_VERSION}`)
	if (existsSync(cacheFile)) return true

	const r = spawnSync('rtk', ['--version'], { encoding: 'utf8', env: process.env })
	if (r.status !== 0) {
		logger.log('[rtk] WARNING: rtk is not installed or not in PATH. Install: https://github.com/rtk-ai/rtk#installation')
		return false
	}
	const raw = (r.stdout || '').trim().replace(/^rtk\s+/, '').split(/\s+/)[0] ?? ''
	const [maj, min] = raw.split('.').map((n) => parseInt(n, 10))
	if (Number.isFinite(maj) && Number.isFinite(min)) {
		if (maj === MIN_RTK_MAJOR && min < MIN_RTK_MINOR) {
			logger.log(`[rtk] WARNING: rtk ${raw} is too old (need >= ${MIN_RTK_VERSION}). Upgrade: brew upgrade rtk or cargo install --git https://github.com/rtk-ai/rtk --force`)
			return false
		}
	}
	if (raw && raw !== VERIFIED_RTK_VERSION) {
		logger.log(`[rtk] using rtk ${raw}; plugin verified with ${VERIFIED_RTK_VERSION}`)
	}
	try {
		mkdirSync(cacheDir, { recursive: true })
		spawnSync('touch', [cacheFile])
	} catch {
		// best effort
	}
	return true
}

function tokenize(segment: string): string[] | null {
	const tokens: string[] = []
	let current = ''
	let quote: '"' | "'" | null = null
	let escaped = false

	for (const char of segment) {
		if (escaped) {
			current += char
			escaped = false
			continue
		}
		if (quote === '"' && char === '\\') {
			escaped = true
			current += char
			continue
		}
		if (quote) {
			current += char
			if (char === quote) quote = null
			continue
		}
		if (char === '"' || char === "'") {
			quote = char
			current += char
			continue
		}
		if (/\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current)
				current = ''
			}
			continue
		}
		current += char
	}

	if (quote !== null || escaped) return null
	if (current.length > 0) tokens.push(current)
	return tokens
}

function shellJoin(tokens: string[]): string {
	return tokens.join(' ')
}

function rewriteGitDiffTokens(tokens: string[]): string[] | null {
	const args = [...tokens]
	if (args[0] === 'command') args.shift()
	if (args[0] === 'rtk' && args[1] === 'git') args.shift()
	if (args[0] !== 'git') return null

	args.shift()
	const cwd: string[] = []
	let foundDiff = false
	while (args.length > 0) {
		const token = args[0]
		if (token === 'diff') {
			args.shift()
			foundDiff = true
			break
		}
		if (token === '--no-pager') {
			args.shift()
			continue
		}
		if (token === '-C') {
			if (args.length < 2 || cwd.length > 0) return null
			cwd.push(args[1])
			args.splice(0, 2)
			continue
		}
		return null
	}
	if (!foundDiff) return null

	const rest: string[] = []
	let seenSeparator = false
	for (const token of args) {
		if (seenSeparator) {
			rest.push(token)
			continue
		}
		if (token === '--') {
			seenSeparator = true
			rest.push(token)
			continue
		}
		if (token.startsWith('-') && !SEM_DIFF_FLAGS.has(token)) return null
		rest.push(token)
	}

	return ['sem', 'diff', ...(cwd.length === 1 ? ['-C', cwd[0]] : []), ...rest]
}

function rewriteSegment(segment: string): string {
	const match = segment.match(/^(\s*)([\s\S]*?)(\s*)$/)
	if (!match) return segment
	const [, leading, core, trailing] = match
	if (core.length === 0) return segment
	const tokens = tokenize(core)
	if (!tokens || tokens.length === 0) return segment
	const rewritten = rewriteGitDiffTokens(tokens)
	if (!rewritten) return segment
	return `${leading}${shellJoin(rewritten)}${trailing}`
}

function splitTopLevel(command: string): string[] {
	const pieces: string[] = []
	let current = ''
	let quote: '"' | "'" | null = null
	let escaped = false

	const flush = () => {
		pieces.push(current)
		current = ''
	}

	for (let i = 0; i < command.length; i++) {
		const char = command[i]
		const next = command[i + 1]
		if (escaped) {
			current += char
			escaped = false
			continue
		}
		if (quote === '"' && char === '\\') {
			escaped = true
			current += char
			continue
		}
		if (quote) {
			current += char
			if (char === quote) quote = null
			continue
		}
		if (char === '"' || char === "'") {
			quote = char
			current += char
			continue
		}
		if (char === '&' && next === '&') {
			flush()
			pieces.push('&&')
			i++
			continue
		}
		if (char === '|' && next === '|') {
			flush()
			pieces.push('||')
			i++
			continue
		}
		if (char === '|' || char === ';') {
			flush()
			pieces.push(char)
			continue
		}
		current += char
	}

	flush()
	return pieces
}

export function rewriteGitDiffToSem(command: string): string {
	const pieces = splitTopLevel(command)
	return pieces
		.map((piece, index) => (index % 2 === 0 ? rewriteSegment(piece) : piece))
		.join('')
}

export default function (amp: PluginAPI) {
	const semOk = checkSemOnce(amp.logger)
	const rtkOk = checkRtkVersionOnce(amp.logger)
	if (!semOk && !rtkOk) {
		amp.logger.log('[rtk] plugin disabled — sem and rtk binaries unavailable or too old')
		return
	}

	amp.on('tool.call', async (event, ctx) => {
		if (event.tool !== 'Bash') return { action: 'allow' }

		const cmd = (event.input as { cmd?: unknown }).cmd
		if (typeof cmd !== 'string' || cmd.length === 0) return { action: 'allow' }

		let rewritten = cmd
		if (semOk) {
			const overlay = rewriteGitDiffToSem(cmd)
			if (overlay !== cmd) {
				ctx.logger.log(`[rtk] rewrote: ${cmd}  →  ${overlay}`)
				rewritten = overlay
			}
		}

		if (rtkOk) {
			const r = spawnSync('rtk', ['rewrite', '--', rewritten], { encoding: 'utf8', env: process.env })
			const exit = r.status ?? 0
			const next = (r.stdout ?? '').replace(/\n$/, '')

			switch (exit) {
				case 0:
				case 3: {
					if (next.length > 0 && next !== rewritten) {
						ctx.logger.log(`[rtk] rewrote${exit === 3 ? ' (ask)' : ''}: ${rewritten}  →  ${next}`)
						rewritten = next
					}
					break
				}
				default:
					break
			}
		}

		if (rewritten === cmd) return { action: 'allow' }
		return { action: 'modify', input: { ...event.input, cmd: rewritten } }
	})
}
