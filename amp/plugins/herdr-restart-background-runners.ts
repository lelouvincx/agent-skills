// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now
//
// herdr-restart-background-runners — command-palette action that creates an
// Amp worker thread with a safe, confirmation-gated Herdr runner restart prompt.

import type { BuiltinAgentMode, PluginAPI } from '@ampcode/plugin'

export const description = 'Adds a command that creates a worker thread for restarting Herdr background Amp runners.'

const COMMAND_ID = 'herdr-restart-background-runners'
const WORKER_MODE = 'medium' as BuiltinAgentMode

export default function (amp: PluginAPI) {
	amp.logger.log('[herdr-restart-background-runners] plugin loaded')

	amp.registerCommand(
		COMMAND_ID,
		{
			title: 'Restart Background Runners',
			category: 'Herdr',
			description: 'Create an Amp worker thread to restart Herdr background Amp runners except agent-skills.',
		},
		async (ctx) => {
			const confirmed = await ctx.ui.confirm({
				title: 'Create Herdr runner restart thread?',
				message: [
					'This will create a worker Amp thread with the restart workflow.',
					'',
					'The command itself will not restart runners. The worker prompt requires a second confirmation before it changes Herdr tabs or Amp runner processes.',
				].join('\n'),
				confirmButtonText: 'Create worker thread',
			})

			if (!confirmed) {
				await ctx.ui.notify('Herdr runner restart cancelled.')
				return
			}

			try {
				const workerAgent = amp.getBuiltinAgent(WORKER_MODE)
				const options = {
					...(ctx.thread?.id ? { parentThreadID: ctx.thread.id } : {}),
					show: true,
					executor: { type: 'runner' as const, id: 'macbook.agent-skills' },
				}
				const worker = await workerAgent.createThread(options)
				await worker.appendUserMessage({ type: 'user-message', content: buildWorkerPrompt() })
				await ctx.ui.notify(`Herdr runner restart thread created: ${worker.id}`)
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				amp.logger.log(`[herdr-restart-background-runners] worker creation failed: ${message}`)
				await ctx.ui.notify(`Could not create Herdr runner restart thread: ${message}`)
			}
		},
	)
}

function buildWorkerPrompt(): string {
	return [
		'Use the herdr CLI to restart all Amp local runners in the `background` workspace except `agent-skills`.',
		'',
		'This workflow always starts from the `agent-skills` runner. Treat `agent-skills` as the always-on control runner: never stop it, restart it, close its tab, replace its tab, or create a duplicate for it.',
		'',
		'Ask me to confirm before doing any restart, Ctrl-C, tab close, tab create, or other Herdr tab or process mutation. Do the listing and planning first, then wait for confirmation.',
		'',
		'Use this workflow:',
		'',
		'1. Inspect current Herdr state:',
		'   - `herdr workspace list`',
		'   - `herdr agent list`',
		'   - after you know the background workspace ID, `herdr tab list --workspace <background_workspace_id>`',
		'',
		'2. Find the workspace whose label is exactly `background`.',
		'',
		'3. From `herdr agent list`, select only agents where:',
		'   - `agent` is `amp`',
		'   - `workspace_id` is the background workspace ID',
		'   - the basename of `cwd` is not `agent-skills`',
		'',
		'4. Preserve the exact mapping from each selected `herdr agent list` record:',
		'   - `cwd`',
		'   - `tab_id`',
		'   - `pane_id`',
		'   - basename of `cwd` as `<directory>`',
		'   - runner ID `macbook.<directory>`',
		'',
		'Do not infer pane or tab ownership from tab labels. Labels can drift from directory names. Use the selected record\'s exact `pane_id` and `tab_id` when restarting an existing runner.',
		'',
		'5. For each selected runner, use this command exactly:',
		'',
		'```sh',
		'AMP_NO_TUI=1 caffeinate -dimsu amp --no-tui --runner-id=macbook.<directory>',
		'```',
		'',
		'6. Restart existing runner tabs without creating duplicates:',
		'   - re-check `herdr api snapshot` or `herdr agent list` before mutating each runner',
		'   - if the selected `pane_id` or `tab_id` is stale, resolve the same `cwd` again before acting',
		'   - prefer reusing the exact existing pane/tab for that runner',
		'   - send Ctrl-C as `C-c`, not `ctrl-c`:',
		'     `herdr pane send-keys <pane_id> C-c`',
		'   - confirm the pane is back at a shell prompt with:',
		'     `herdr pane read <pane_id>`',
		'   - start the runner by sending literal text, then Enter:',
		'     `herdr pane send-text <pane_id> "AMP_NO_TUI=1 caffeinate -dimsu amp --no-tui --runner-id=macbook.<directory>"`',
		'     `herdr pane send-keys <pane_id> enter`',
		'',
		'7. If a runner tab does not already exist:',
		'   - create it in the background workspace without focusing it:',
		'     `herdr tab create --workspace <background_workspace_id> --cwd <cwd> --label <directory_or_existing_label> --no-focus`',
		'   - get the new pane ID from the create result or from `herdr api snapshot`',
		'   - start the runner using `herdr pane send-text` plus `enter` as above',
		'   - do not use `herdr pane run sh -lc ...` for this command unless verification proves the runner stays registered',
		'',
		'8. Verify:',
		'   - wait a few seconds',
		'   - run `herdr agent list`',
		'   - confirm every restarted background runner appears as `agent: "amp"` with `agent_status: "idle"` or another valid Amp state',
		'   - run `herdr tab list --workspace <background_workspace_id>` and confirm no duplicate tabs were created',
		'   - restore focus to `agent-skills` if focus moved:',
		'     `herdr tab focus <agent_skills_tab_id>`',
		'',
		'9. Report:',
		'   - list the restarted runner IDs',
		'   - list any runners skipped and why',
		'   - state whether verification passed',
		'   - if verification failed, include the smallest diagnostic output needed',
		'',
		'Do not archive any thread unless I explicitly confirm that after verification.',
	].join('\n')
}
