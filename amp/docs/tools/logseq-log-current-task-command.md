---
doc_schema: "amp-artifact/v2"
title: "Logseq: Log Current Task Command"
slug: "logseq-log-current-task-command"
status: "active"
summary: "Adds a command-palette action that logs the current Amp thread task into Logseq and renames the thread."
artifact:
  id: "logseq-log-current-task"
  type: "command"
  surface: "command_palette"
  invocation: "command_palette"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/logseq-manual-log.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerCommand"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-07-13"
contract:
  input_kind: "ui_prompt"
  output_kind: "ui_notification"
  trigger: "command_palette"
  allowed_tools: []
  event: null
  command_id: "logseq-log-current-task"
  agent_mode_key: null
runtime:
  uses:
    - "amp.registerCommand"
    - "ctx.ui.input"
    - "ctx.ui.notify"
  dependencies:
    - "Amp CLI on PATH"
    - "Logseq graph directory"
  env:
    - "AMP_LOGSEQ_GRAPH_DIR"
  reads:
    - "parent Amp thread through spawned worker via read_thread"
    - "Logseq graph through spawned worker"
  writes:
    - "Logseq graph through spawned worker"
    - "parent Amp thread title"
    - "parent Amp thread labels"
    - "worker thread archive state"
  network:
    - "Amp built-in high agent runtime"
  logs:
    - "plugin load log"
safety:
  permission_level: "manual-command-with-worker-write"
  user_gate: "manual command palette invocation"
  constraints:
    - "Requires an active Amp thread."
    - "Does not run automatically from lifecycle events."
    - "Worker must reconstruct parent context with read_thread and is blocked from invoking Oracle."
  risks:
    - "Worker can edit the configured Logseq graph."
    - "Malformed worker responses can leave the parent thread title unchanged."
related:
  - "spawn-subagent"
tags:
  - "command"
  - "logseq"
  - "manual"
  - "worker"
---

# Logseq: Log Current Task Command

## Summary

`logseq-log-current-task` provides the command-palette action `logseq: Log current task`. It prompts for an optional hint, then runs the Logseq logging flow.

## Invocation

- Surface: command palette
- Registered with: `amp.registerCommand`
- Command ID: `logseq-log-current-task`
- Palette label: `logseq: Log current task`
- Plugin file: `plugins/logseq-manual-log.ts`

## Contract

The command requires an active thread and accepts no JSON input. It opens `Log current task to Logseq`, where the optional message can provide a target, note, or source link. Submitting `Log to Logseq` produces a UI success or error notification.

## Behavior

The command checks for an active thread, prompts for an optional hint, and calls the plugin's shared logging flow. That flow starts a hidden built-in `high` worker without seeding recent parent messages. If the worker cannot leave its initial idle state within 15 seconds, including when `high` mode cannot start because the account lacks credits, the flow fails instead of waiting for the full worker timeout. The worker must reconstruct parent context with `read_thread`; if that fails, it stops without editing Logseq. Oracle calls from the worker are rejected. After a successful Logseq update, the flow derives a `[Project] task title` and labels from the backlog task's project, priority, and TODO/DONE state. The plugin renames and labels the parent thread before archiving the worker. Labels are normalized to lowercase alphanumeric hyphenated values, for example `presales`, `p2`, and `done`.

## Permissions and side effects

The command can write to the configured Logseq graph, create and archive a hidden Amp worker thread, and rename and add labels to the parent Amp thread. Existing parent-thread labels are preserved.

## Examples

Choose `logseq: Log current task` from the command palette, optionally enter `update DAT-594`, and select `Log to Logseq`.

## Troubleshooting

- Open an Amp thread before invoking the command.
- If the worker fails, inspect the worker thread linked from the notification.
- Set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp to use a different graph.

## Maintenance notes

Update this document when the command ID, palette prompt, notifications, worker mode, startup timeout, context reconstruction, Oracle guard, parent-thread title or labels, or Logseq flow changes.
