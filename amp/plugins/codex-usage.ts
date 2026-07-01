// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// codex-usage — reports local Codex CLI quota without exposing token values.

import type { PluginAPI } from '@ampcode/plugin'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const TOKEN_REFRESH_URL = 'https://auth.openai.com/oauth/token'
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

type AuthJson = {
	auth_mode?: string
	tokens?: {
		id_token?: string
		access_token?: string
		refresh_token?: string
		account_id?: string
	}
	last_refresh?: string
	[key: string]: unknown
}

type UsagePayload = {
	plan_type?: string
	rate_limit?: {
		allowed?: boolean
		limit_reached?: boolean
		primary_window?: RateLimitWindow
		secondary_window?: RateLimitWindow
	}
	rate_limit_reset_credits?: {
		available_count?: number
	}
}

type RateLimitWindow = {
	used_percent?: number
	limit_window_seconds?: number
	reset_after_seconds?: number
	reset_at?: number
}

type RefreshResponse = {
	id_token?: string
	access_token?: string
	refresh_token?: string
}

export default function (amp: PluginAPI) {
	amp.registerCommand(
		'codex_usage_command',
		{
			title: 'Codex usage',
			category: 'codex',
			description: 'Show current Codex 5-hour and weekly usage limits.',
		},
		async (ctx) => {
			const authPath = codexAuthPath()
			const auth = await readAuth(authPath)
			const payload = await fetchUsageWithRefresh(authPath, auth)
			await ctx.ui.notify(formatUsage(payload))
		},
	)
}

function codexAuthPath(): string {
	const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
	return join(codexHome, 'auth.json')
}

async function readAuth(authPath: string): Promise<AuthJson> {
	try {
		return JSON.parse(await readFile(authPath, 'utf8')) as AuthJson
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			throw new Error(`No Codex auth file found at ${authPath}. Run codex login locally first.`)
		}
		throw new Error(`Could not read Codex auth file: ${errorMessage(error)}`)
	}
}

async function fetchUsageWithRefresh(authPath: string, auth: AuthJson): Promise<UsagePayload> {
	try {
		return await fetchUsage(auth)
	} catch (error) {
		if (!isExpiredTokenError(error)) throw error

		const refreshed = await refreshAuth(authPath, auth)
		return await fetchUsage(refreshed)
	}
}

async function fetchUsage(auth: AuthJson): Promise<UsagePayload> {
	const accessToken = auth.tokens?.access_token
	if (!accessToken) throw new Error('No Codex access token found. Run codex login locally first.')

	const headers: Record<string, string> = {
		Authorization: `Bearer ${accessToken}`,
	}
	if (auth.tokens?.account_id) {
		headers['ChatGPT-Account-ID'] = auth.tokens.account_id
	}

	const response = await fetch(CODEX_USAGE_URL, { headers })
	if (!response.ok) {
		throw await httpError('Codex usage request failed', response)
	}

	return await response.json() as UsagePayload
}

async function refreshAuth(authPath: string, auth: AuthJson): Promise<AuthJson> {
	const refreshToken = auth.tokens?.refresh_token
	if (!refreshToken) throw new Error('Codex access token expired and no refresh token is available. Run codex login locally first.')

	const response = await fetch(TOKEN_REFRESH_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: CODEX_CLIENT_ID,
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
		}),
	})

	if (!response.ok) {
		throw await httpError('Codex token refresh failed', response)
	}

	const refreshed = await response.json() as RefreshResponse
	const nextAuth: AuthJson = {
		...auth,
		tokens: {
			...(auth.tokens || {}),
			...(refreshed.id_token ? { id_token: refreshed.id_token } : {}),
			...(refreshed.access_token ? { access_token: refreshed.access_token } : {}),
			...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
		},
		last_refresh: new Date().toISOString(),
	}

	await writeFile(authPath, `${JSON.stringify(nextAuth, null, 2)}\n`, { mode: 0o600 })
	await chmod(authPath, 0o600).catch(() => undefined)
	return nextAuth
}

function formatUsage(payload: UsagePayload): string {
	const rateLimit = payload.rate_limit || {}
	const windows = [rateLimit.primary_window, rateLimit.secondary_window]
		.filter(Boolean)
		.map((window) => describeWindow(window as RateLimitWindow))

	const fiveHour = windows.find((window) => window.name === '5-hour')
	const weekly = windows.find((window) => window.name === 'weekly')

	return `Codex: 5h ${fiveHour ? formatWindow(fiveHour) : 'not reported'}; weekly ${weekly ? formatWindow(weekly) : 'not reported'}`
}

function describeWindow(window: RateLimitWindow): { name: string; remainingPercent?: number; resetAt?: string } {
	const seconds = window.limit_window_seconds || 0
	const usedPercent = typeof window.used_percent === 'number' ? window.used_percent : undefined
	const remainingPercent = typeof usedPercent === 'number' ? Math.max(0, 100 - usedPercent) : undefined

	let name = `${seconds}s`
	if (Math.abs(seconds - 5 * 60 * 60) < 120) name = '5-hour'
	if (Math.abs(seconds - 7 * 24 * 60 * 60) < 120) name = 'weekly'

	return {
		name,
		remainingPercent,
		resetAt: window.reset_at ? formatResetAt(window.reset_at) : undefined,
	}
}

function formatWindow(window: { remainingPercent?: number; resetAt?: string }): string {
	const remaining = typeof window.remainingPercent === 'number' ? `${window.remainingPercent}%` : 'unknown'
	return window.resetAt ? `${remaining} (reset ${window.resetAt})` : remaining
}

function formatResetAt(unixSeconds: number): string {
	const formatter = new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	})
	return formatter.format(new Date(unixSeconds * 1000))
}

async function httpError(prefix: string, response: Response): Promise<Error> {
	let code = ''
	try {
		const body = await response.json() as { error?: { code?: string; message?: string }; code?: string; message?: string }
		code = body.error?.code || body.code || ''
		const message = body.error?.message || body.message || response.statusText
		return Object.assign(new Error(`${prefix}: HTTP ${response.status}${code ? ` (${code})` : ''}: ${message}`), { httpStatus: response.status, code })
	} catch {
		return Object.assign(new Error(`${prefix}: HTTP ${response.status}: ${response.statusText}`), { httpStatus: response.status, code })
	}
}

function isExpiredTokenError(error: unknown): boolean {
	return error instanceof Error && /HTTP 401/.test(error.message) && /token_expired/.test(error.message)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
