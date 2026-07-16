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

# Logseq: Log Current Task Command

## Summary

`logseq-log-current-task` provides the command-palette action `logseq: Log current task`. It prompts for an optional hint, then runs the same Logseq logging flow exposed separately by the related agent tool.

[ISSUE-0001: Logseq logging reliability](../issues/issue-0001-logseq-logging-reliability.md) preserves the original intent and evidence shared by the command and agent-tool surfaces.

## Invocation

- Surface: command palette
- Registered with: `amp.registerCommand`
- Command ID: `logseq-log-current-task`
- Palette label: `logseq: Log current task`
- Plugin file: `plugins/logseq-manual-log.ts`

## Contract

The command requires an active thread and accepts no JSON input. It opens `Log current task to Logseq`, where the optional message can provide a target, note, or source link. Submitting `Log to Logseq` produces a UI notification with separate worker, Logseq, parent-rename, and worker-archive statuses.

## Behavior

The command checks for an active thread, prompts for an optional hint, and calls the same in-memory operation coordinator as the agent tool. The first invocation starts one hidden built-in `high` worker for the parent thread. Concurrent or later invocations reconcile that operation instead of starting another worker. Ambiguous startup, message delivery, state, or response outcomes are reported as pending while the existing worker retains ownership. The worker must reconstruct parent context with `read_thread`, update Backlog before the journal, re-read both files, and return the strict JSON result documented by the related agent tool. A partial or malformed result is reconciled through the same worker. After worker-attested completion, parent rename and worker archive run as separate stages, so either downstream failure preserves Logseq success.

## Permissions and side effects

The command can write to the configured Logseq graph, create and archive a hidden Amp worker thread, and rename the parent Amp thread.

## Examples

Choose `logseq: Log current task` from the command palette, optionally enter `update DAT-594`, and select `Log to Logseq`.

## Troubleshooting

- Open an Amp thread before invoking the command.
- If the notification says pending, partial, unverified, rename failed, or archive failed, run the command again to reconcile only unfinished work.
- Set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp to use a different graph.

## Maintenance notes

Update this document when the command ID, palette prompt, notifications, worker mode, startup timeout, context reconstruction, Oracle guard, or shared operation flow changes. Keep detailed routing and worker-result rules in the related agent-tool document and historical rationale in ISSUE-0001.
