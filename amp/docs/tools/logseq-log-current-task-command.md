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

The command requires an active thread and accepts no JSON input.

It opens `Log current task to Logseq`. You can enter any of these optional details:

- target
- note
- source link

Select `Log to Logseq` to start the flow. The command shows a success or error notification when the flow ends.

## Behavior

The command runs this sequence:

1. It checks that an Amp thread is active.
2. It prompts you for an optional hint.
3. It starts a hidden built-in `high` worker without copying recent parent messages.
4. The worker reconstructs the parent context with `read_thread`.
5. The worker updates Logseq.
6. The plugin derives the parent thread title and labels from the result.
7. The plugin renames and labels the parent thread.
8. The plugin archives the worker.

The worker must leave its initial idle state within 15 seconds. This includes cases where the account lacks credits for `high` mode. The flow fails early instead of waiting for the full worker timeout.

If `read_thread` fails, the worker stops without editing Logseq. The plugin also rejects Oracle calls from the worker.

### Parent thread title

The plugin derives the title in this format:

`[Project] task title`

### Parent thread labels

The plugin adds these labels:

- backlog project, normalized to lowercase alphanumeric words joined with hyphens, such as `presales`
- working project, using the project registry key for the parent Amp workspace, such as `logseq`, `agent-skills` or `demo4`
- customer, when the backlog task identifies one, normalized with a `customer-` prefix, such as `customer-fanserv` or `customer-basata`

The plugin does not add priority or TODO/DONE state labels. It preserves existing parent thread labels.

## Permissions and side effects

The command can:

- write to the configured Logseq graph
- create and archive a hidden Amp worker thread
- rename the parent Amp thread
- add labels to the parent Amp thread

## Examples

Choose `logseq: Log current task` from the command palette, optionally enter `update DAT-594`, and select `Log to Logseq`.

## Troubleshooting

- Open an Amp thread before invoking the command.
- If the worker fails, inspect the worker thread linked from the notification.
- Set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp to use a different graph.

## Maintenance notes

Update this document when any of these change:

- command ID
- palette prompt
- notifications
- worker mode or startup timeout
- context reconstruction
- Oracle guard
- parent thread title or labels
- Logseq flow
