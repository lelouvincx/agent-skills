// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// local-claude-cliproxy — command-palette helper for the projected local
// CLIProxyAPI runtime used by Amp custom-url Claude model routing.

import type { PluginAPI } from '@ampcode/plugin'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const RUNTIME_DIR = join(homedir(), '.local', 'share', 'amp-cliproxy')

export const description = 'Opens the projected local CLIProxyAPI runtime directory for Amp Claude custom-url routing.'

export default function (amp: PluginAPI) {
	amp.logger.log(`[local-claude-cliproxy] plugin loaded → ${RUNTIME_DIR}`)

	amp.registerCommand(
		'local-claude-proxy-open-runtime',
		{
			title: 'Open Runtime Directory',
			category: 'Local Claude Proxy',
			description: 'Open ~/.local/share/amp-cliproxy for the local CLIProxyAPI runtime.',
		},
		async (ctx) => {
			try {
				await openPath(RUNTIME_DIR)
				await ctx.ui.notify(`Opened Local Claude Proxy runtime: ${RUNTIME_DIR}`)
			} catch (error) {
				amp.logger.log(`[local-claude-cliproxy] open failed: ${errorMessage(error)}`)
				await ctx.ui.notify(`Could not open Local Claude Proxy runtime: ${errorMessage(error)}`)
			}
		},
	)
}

function openPath(path: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn('open', [path], { stdio: 'ignore' })
		child.once('error', reject)
		child.once('exit', (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`open exited with status ${code}`))
			}
		})
	})
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
