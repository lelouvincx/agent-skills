---
doc_schema: "amp-artifact/v2"
title: "Herdr: restart background Amp runners command"
slug: "herdr-restart-background-runners-command"
status: "active"
summary: "Creates a worker Amp thread with a confirmation-gated workflow for restarting background Herdr Amp runner tabs except agent-skills."
artifact:
  id: "herdr-restart-background-runners"
  type: "command"
  surface: "command_palette"
  invocation: "command_palette"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/herdr-restart-background-runners.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerCommand"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-08-22"
contract:
  input_kind: "ui_prompt"
  output_kind: "ui_notification"
  trigger: "command_palette"
  allowed_tools: []
  event: null
  command_id: "herdr-restart-background-runners"
  agent_mode_key: null
runtime:
  uses:
    - "amp.registerCommand"
    - "ctx.ui.confirm"
    - "ctx.ui.notify"
    - "amp.getBuiltinAgent"
    - "Agent.createThread"
    - "PluginThread.appendUserMessage"
  dependencies:
    - "Amp Plugin API command and built-in agent support"
    - "herdr CLI available to the created worker thread"
    - "Amp CLI available to the created worker thread"
  env: []
  reads:
    - "active Amp thread ID when the command runs inside a thread"
  writes:
    - "new Amp worker thread"
    - "worker thread user message containing the restart workflow"
  network:
    - "Amp built-in medium agent runtime"
  logs:
    - "plugin load log"
    - "worker creation failure log"
safety:
  permission_level: "manual-command-with-worker-local-process-control"
  user_gate: "manual command palette invocation, worker creation confirmation, and worker-side mutation confirmation"
  constraints:
    - "The command only creates and prompts a worker thread after explicit confirmation."
    - "The worker prompt tells the agent to ask for confirmation before any restart or tab mutation."
    - "The workflow starts from the agent-skills runner."
    - "The worker prompt treats agent-skills as the always-on control runner and excludes it from all stop, restart, close, and replace operations."
    - "The worker prompt requires duplicate checks, Ctrl-C as C-c, runner verification, and focus restoration."
    - "The command itself does not run herdr, restart tabs, or archive threads."
  risks:
    - "The worker can interrupt local Amp runner processes after the user confirms in the worker thread."
    - "Creating the worker with show=true may move focus to the worker thread."
    - "A stale prompt can drift from Herdr or Amp CLI behaviour."
related: []
tags:
  - "command"
  - "herdr"
  - "amp-runner"
  - "worker"
---

# Herdr: restart background Amp runners command

## Summary

`herdr-restart-background-runners` adds the command-palette action `Herdr: Restart Background Runners`. It creates a worker Amp thread with a ready-to-run workflow for restarting Amp local runners in Herdr's `background` workspace.

The command does not restart anything itself. It starts a worker thread and gives that worker strict instructions. The worker must ask for confirmation before it changes tabs or processes.

The workflow always starts from the `agent-skills` runner. The worker treats `agent-skills` as the always-on control runner and must never stop, restart, close, replace, or duplicate it.

## Invocation

- Surface: command palette
- Registered with: `amp.registerCommand`
- Command ID: `herdr-restart-background-runners`
- Palette label: `Herdr: Restart Background Runners`
- Plugin file: `plugins/herdr-restart-background-runners.ts`

Run the command from any Amp thread. If a thread is active, the worker is created as a child of that thread. If no thread is active, the worker is created without a parent.

The command shows a confirmation dialog before it creates the worker thread.

## Contract

The command accepts no JSON input. It creates one worker thread through Amp's built-in `medium` agent and appends one user message.

The worker prompt tells the agent to:

1. Treat `agent-skills` as the always-on control runner that must never be stopped, restarted, closed, replaced, or duplicated.
2. Use `herdr workspace list`, `herdr agent list`, and `herdr tab list --workspace <background_workspace_id>`.
3. Find the workspace labelled exactly `background`.
4. Select only Amp agents in that workspace whose `cwd` basename is not `agent-skills`.
5. Preserve each selected `herdr agent list` record's exact `cwd`, `tab_id`, and `pane_id`.
6. Never infer pane or tab ownership from labels. Re-check stale `pane_id` or `tab_id` values against the same `cwd` before mutating a runner.
7. Use runner IDs in the form `macbook.<directory>`.
8. Use this restart command for each selected runner:

```sh
AMP_NO_TUI=1 caffeinate -dimsu amp --no-tui --runner-id=macbook.<directory>
```

The worker prompt also tells the agent to avoid duplicates, use existing tabs when present, create missing tabs with `--no-focus`, verify registered runners, restore focus to `agent-skills`, and report the result.

## Behavior

When invoked, the command asks Chinh to confirm worker creation. If Chinh cancels, the command shows a cancellation notification and does nothing.

If Chinh confirms, the command creates a visible worker thread with `show: true`. It pins execution to runner `macbook.agent-skills`. It uses the active thread ID as `parentThreadID` when available. It then appends the workflow prompt to the worker.

The worker thread stays independent after creation. The command does not wait for the worker to finish. This keeps the command quick and lets Chinh review or edit the worker plan before allowing any restart.

## Permissions and side effects

The command creates a new Amp thread on runner `macbook.agent-skills` and appends a user message to it. It can change Amp focus because it creates the worker with `show: true`.

The command does not run shell commands, stop processes, start processes, create Herdr tabs, or archive threads. Those side effects happen only if the worker later executes the prompt and Chinh confirms inside that worker thread.

## Examples

Run this command from the command palette:

```text
Herdr: Restart Background Runners
```

The command opens a worker thread and sends the restart workflow. Review the worker's plan. Confirm only when you want it to restart the background runners.

## Troubleshooting

If the command is missing, reload Amp plugins or restart Amp. Then check that `plugins/herdr-restart-background-runners.ts` was synced into `~/.config/amp/plugins`.

If the worker thread is created but does not receive the prompt, run the command again. The command does not mutate Herdr state, so retrying is safe apart from creating another worker thread.

If the worker cannot find Herdr, check that `herdr` is on `PATH` in the runner environment.

## Maintenance notes

Keep this document in sync with `plugins/herdr-restart-background-runners.ts`. Update this document first when changing the command ID, palette label, model, confirmation gate, worker visibility, or restart workflow.

The prompt intentionally uses `herdr pane send-text` plus `herdr pane send-keys <pane_id> enter` for existing tabs. Do not replace this with `herdr pane run sh -lc ...` unless Herdr behaviour changes and verification proves it leaves Amp registered.
