---
doc_schema: "amp-artifact/v2"
title: "Logseq: log current task command"
slug: "logseq-log-current-task-command"
status: "active"
summary: "Adds a command that logs the current Amp task to Logseq and renames the parent thread."
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
  last_verified: "2026-07-15"
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
  - "logseq-log-current-task"
  - "spawn-subagent"
tags:
  - "command"
  - "logseq"
  - "manual"
  - "worker"
---

# Logseq: log current task command

## Summary

`logseq-log-current-task` adds the command-palette action `logseq: Log current task`. It asks for an optional hint, then runs the same flow as the related agent tool.

[ISSUE-0001: Logseq logging reliability](../issues/issue-0001-logseq-logging-reliability.md) explains why this shared contract exists. It preserves the original intent and evidence.

## Invocation

- Surface: command palette
- Registered with: `amp.registerCommand`
- Command ID: `logseq-log-current-task`
- Palette label: `logseq: Log current task`
- Plugin file: `plugins/logseq-manual-log.ts`

## Contract

You must run the command from an active thread. It accepts no JSON input.

The command opens `Log current task to Logseq`. You can enter a target, note or source link. Select `Log to Logseq` to start the operation. The notification reports worker, Logseq, parent rename and worker archive results separately.

## Behavior

The command calls the same in-memory operation coordinator as the agent tool. The first call starts one hidden built-in `high` worker for the parent thread. Concurrent and later calls use the existing operation instead of starting another worker.

The command reports uncertain worker creation, message delivery, state and responses as pending. The existing worker keeps ownership of the operation.

The worker uses `read_thread` to reconstruct the parent context. It updates Backlog before the journal, then re-reads both files. It returns the strict JSON result defined in the agent-tool document.

The command uses the same worker to repair partial or malformed results. After verified Logseq completion, rename and archive run separately. A failure in either action does not change Logseq success.

## Permissions and side effects

The command can:

- write to the configured Logseq graph
- create and archive a hidden Amp worker thread
- rename the parent Amp thread

## Examples

1. Choose `logseq: Log current task` from the command palette.
2. Enter an optional hint, such as `update DAT-594`.
3. Select `Log to Logseq`.

## Troubleshooting

Use these checks when the command does not complete:

- open an Amp thread before running the command
- if the notification says pending, partial, unverified, rename failed or archive failed, run the command again
- to use another graph, set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp

## Maintenance notes

Update this document when any of these change:

- the command ID, prompt or notifications
- worker mode or startup timeout
- context reconstruction or the Oracle guard
- the shared operation flow

Keep detailed routing and worker-result rules in the agent-tool document. Keep historical intent and evidence in ISSUE-0001.
