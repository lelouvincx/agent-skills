// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// macos-turn-end-notifier — sends a native macOS notification whenever an
// agent turn ends.

import type { PluginAPI } from '@ampcode/plugin'

const FALLBACK_NOTIFICATION_TITLE = 'Amp turn finished'
const MAX_TITLE_CHARS = 80
const MAX_BODY_CHARS = 180
const TERMINAL_APP_NAME = 'Alacritty'

let loggedUnsupportedPlatform = false

export default function (amp: PluginAPI) {
	amp.logger.log('[macos-turn-end-notifier] plugin loaded')

	amp.on('agent.end', async (event, ctx) => {
		if (process.platform !== 'darwin') {
			if (!loggedUnsupportedPlatform) {
				loggedUnsupportedPlatform = true
				ctx.logger.log(`[macos-turn-end-notifier] skipping notifications on unsupported platform: ${process.platform}`)
			}
			return
		}

		const title = truncate(oneLine((await safeThreadTitle(ctx)) || FALLBACK_NOTIFICATION_TITLE), MAX_TITLE_CHARS)
		const subtitle = `${statusLabel(event.status)} · ${shortThreadID(event.thread.id)}`
		const body = truncate(oneLine(event.message) || event.thread.id, MAX_BODY_CHARS)

		try {
			if (await notifyWithTerminalNotifier(ctx, { title, subtitle, body })) return
			await notifyWithOsaScript(ctx, { title, subtitle, body })
		} catch (error) {
			ctx.logger.log(`[macos-turn-end-notifier] failed to notify: ${errorMessage(error)}`)
		}
	})
}

async function notifyWithTerminalNotifier(
	ctx: { $: PluginAPI['$']; logger: { log: (...args: unknown[]) => void } },
	notification: { title: string; subtitle: string; body: string },
): Promise<boolean> {
	const paneID = process.env.HERDR_PANE_ID
	if (!paneID) return false

	const terminalNotifier = await commandPath(ctx, 'terminal-notifier')
	if (!terminalNotifier) return false

	const herdr = await commandPath(ctx, 'herdr')
	if (!herdr) return false

	const clickCommand = [`/usr/bin/open -a ${shellQuote(TERMINAL_APP_NAME)}`, `${shellQuote(herdr)} agent focus ${shellQuote(paneID)} >/dev/null 2>&1`].join('; ')
	const command = [
		shellQuote(terminalNotifier),
		'-title',
		shellQuote(notification.title),
		'-subtitle',
		shellQuote(notification.subtitle),
		'-message',
		shellQuote(notification.body),
		'-execute',
		shellQuote(clickCommand),
	].join(' ')

	const result = await ctx.$`/bin/sh -lc ${command}`
	if (result.exitCode !== 0) {
		ctx.logger.log(`[macos-turn-end-notifier] terminal-notifier failed: ${result.stderr || `exit ${result.exitCode}`}`)
		return false
	}

	return true
}

async function notifyWithOsaScript(
	ctx: { $: PluginAPI['$']; logger: { log: (...args: unknown[]) => void } },
	notification: { title: string; subtitle: string; body: string },
): Promise<void> {
	const script = [
		'display notification',
		appleScriptString(notification.body),
		'with title',
		appleScriptString(notification.title),
		'subtitle',
		appleScriptString(notification.subtitle),
	].join(' ')

	const result = await ctx.$`/usr/bin/osascript -e ${script}`
	if (result.exitCode !== 0) {
		ctx.logger.log(`[macos-turn-end-notifier] osascript failed: ${result.stderr || `exit ${result.exitCode}`}`)
	}
}

async function commandPath(ctx: { $: PluginAPI['$'] }, command: string): Promise<string | null> {
	try {
		const result = await ctx.$`/bin/sh -lc ${`command -v ${shellQuote(command)}`}`
		const path = result.stdout.trim()
		return result.exitCode === 0 && path ? path : null
	} catch {
		return null
	}
}

async function safeThreadTitle(ctx: { thread: { title: { get(): Promise<string | null> } } }): Promise<string | null> {
	try {
		return await ctx.thread.title.get()
	} catch {
		return null
	}
}

function statusLabel(status: 'done' | 'error' | 'cancelled'): string {
	if (status === 'done') return 'Done'
	if (status === 'error') return 'Error'
	return 'Cancelled'
}

function shortThreadID(threadID: string): string {
	return threadID.length > 10 ? `${threadID.slice(0, 10)}…` : threadID
}

function truncate(value: string, maxLength: number): string {
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function oneLine(value: string): string {
	return value.replace(/\s+/g, ' ').trim()
}

function appleScriptString(value: string): string {
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
