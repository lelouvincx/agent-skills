// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// rtk-rewrite — Amp plugin port of https://github.com/rtk-ai/rtk/blob/master/hooks/claude/rtk-rewrite.sh
//
// Rewrites Bash commands to use `rtk` for token savings. All rewrite logic
// lives in `rtk rewrite`, which is the single source of truth (the Rust
// registry in src/discover/registry.rs). To add or change rules, edit the
// Rust registry — not this file.
//
// `rtk rewrite` exit-code protocol:
//   0 + stdout  Rewrite found with an explicit allow verdict
//   1           No RTK equivalent → pass through unchanged
//   2           Deny rule matched → pass through (permission rules handle it)
//   3 + stdout  Ask/default verdict → rewrite, but let the permission system prompt
//
// Requires: rtk >= 0.23.0 on $PATH. Verified with rtk 0.42.4.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PluginAPI } from '@ampcode/plugin'

const MIN_RTK_MAJOR = 0
const MIN_RTK_MINOR = 23
const MIN_RTK_VERSION = `${MIN_RTK_MAJOR}.${MIN_RTK_MINOR}.0`
const VERIFIED_RTK_VERSION = '0.42.4'

function checkRtkVersionOnce(logger: { log: (m: string) => void; warn?: (m: string) => void }): boolean {
	const cacheDir = process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache')
	const cacheFile = join(cacheDir, `rtk-hook-version-ok-${MIN_RTK_VERSION}`)
	if (existsSync(cacheFile)) return true

	const r = spawnSync('rtk', ['--version'], { encoding: 'utf8' })
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

export default function (amp: PluginAPI) {
	const ok = checkRtkVersionOnce(amp.logger)
	if (!ok) {
		amp.logger.log('[rtk] plugin disabled — rtk binary unavailable or too old')
		return
	}

	amp.on('tool.call', async (event, ctx) => {
		if (event.tool !== 'Bash') return { action: 'allow' }

		const cmd = (event.input as { cmd?: unknown }).cmd
		if (typeof cmd !== 'string' || cmd.length === 0) return { action: 'allow' }

		const r = spawnSync('rtk', ['rewrite', '--', cmd], { encoding: 'utf8' })
		const exit = r.status ?? 0
		const rewritten = (r.stdout ?? '').replace(/\n$/, '')

		switch (exit) {
			case 0: {
				// Explicit allow verdict. If identical, the command was already using RTK.
				if (rewritten === cmd || rewritten.length === 0) return { action: 'allow' }
				ctx.logger.log(`[rtk] rewrote: ${cmd}  →  ${rewritten}`)
				return { action: 'modify', input: { ...event.input, cmd: rewritten } }
			}
			case 3: {
				// Ask/default verdict: rewrite the command, but let Amp's permission
				// system prompt the user (existing `Bash → ask` rules still apply
				// to the rewritten command).
				if (rewritten.length === 0 || rewritten === cmd) return { action: 'allow' }
				ctx.logger.log(`[rtk] rewrote (ask): ${cmd}  →  ${rewritten}`)
				return { action: 'modify', input: { ...event.input, cmd: rewritten } }
			}
			case 1:
			case 2:
			default:
				return { action: 'allow' }
		}
	})
}
