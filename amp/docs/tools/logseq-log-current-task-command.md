---
doc_schema: "amp-artifact/v2"
title: "Logseq: log current task command"
slug: "logseq-log-current-task-command"
status: "active"
summary: "Adds a command that reliably logs the current Amp task to Logseq, then updates the parent thread."
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
  last_verified: "2026-07-18"
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
    - "amp.on tool.call"
    - "ctx.ui.input"
    - "ctx.ui.notify"
    - "amp.getBuiltinAgent"
    - "Agent.createThread"
    - "PluginThread.appendUserMessage"
    - "PluginThread.waitForResponse"
    - "PluginThread.messages"
    - "PluginThread.state"
    - "amp.threads.get(...).messages"
    - "amp.$ amp threads rename"
    - "amp.$ amp threads label"
    - "amp.$ amp threads archive"
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
    - "Worker must reconstruct parent context with read_thread before editing Logseq."
    - "Worker must re-read and verify both Logseq files before reporting completion."
    - "Worker must return the exact versioned JSON result."
    - "Oracle calls from the worker are rejected."
  risks:
    - "Worker can edit the configured Logseq graph."
    - "Write verification is worker-attested; the coordinator validates the result but does not independently parse Logseq semantics."
    - "Operation state is in memory and cannot prevent duplicate workers after plugin reload or process restart."
related:
  - "spawn-subagent"
tags:
  - "command"
  - "logseq"
  - "manual"
  - "worker"
---

# Logseq: log current task command

## Summary

`logseq-log-current-task` adds the command-palette action `Logseq: Log Current Task`. It asks for an optional hint, then logs the task through one coordinated worker operation.

[ISSUE-0001: Logseq logging reliability](../issues/issue-0001-logseq-logging-reliability.md) preserves the original incident, revised command-only intent and reliability decisions.

## Invocation

- Surface: command palette
- Registered with: `amp.registerCommand`
- Command ID: `logseq-log-current-task`
- Palette label: `Logseq: Log Current Task`
- Plugin file: `plugins/logseq-manual-log.ts`

## Contract

You must run the command from an active thread. It accepts no JSON input.

The command opens `Log current task to Logseq`. You can enter:

- a target
- a note
- a source link

Select `Log to Logseq` to start the operation. The notification reports these statuses separately:

- `Worker`
- `Logseq`
- `Rename`
- `Labels`
- `Archive`

`Pending` means the operation may still write or Amp cannot confirm whether it accepted the work. `Partial` means the worker verified the parent-linked Backlog task but not the matching journal pointer. `Complete` means the worker re-read both files and verified that the journal points to the same parent-linked task.

## Behavior

### One operation owns each parent thread

The command records one in-memory operation for each parent thread before it creates a worker. It handles each create, append, response, rename, label and archive state change in order. A concurrent invocation returns the current status instead of starting duplicate work.

The first invocation starts one hidden built-in `high` worker without copying recent parent messages. Later invocations use the same worker and retry only unfinished stages.

This guarantee lasts for one plugin process. Amp does not provide an operation store or a way to list child threads. A plugin reload can therefore lose ownership of pending work.

### Uncertain work stays pending

Amp may not confirm whether it created a worker, delivered a message or stored a response. When this happens, the command keeps ownership and reports `pending`. It does not create another worker, append another message or cancel work that may still write.

After 5 minutes, the command checks worker state and looks for a fresh assistant message. Only a message with a new ID can satisfy the current worker turn.

The Amp plugin API does not provide typed timeout errors. The plugin keeps the 2 required string checks in one compatibility helper.

### The worker writes Backlog first

The worker must call `read_thread` for the parent thread before editing Logseq. If this fails, it returns a structured error without changing the graph. The plugin rejects Oracle calls from the worker.

The worker reconstructs original user intent and latest coherent outcome. It then updates or creates the parent-linked task in `pages/Backlog.md`. Today's journal contains a short pointer to that task under `Done`, `Tasks` or `Notes`, based on task state.

The worker reads `pages/Canonical Pages.md` and relevant rule pages before writing. It stores parent Amp thread and useful source links in the Backlog task's `input::` property.

New Backlog tasks must follow the Logseq task contract from RFC-0008 in the Logseq graph.

Each new task must have direct `id::`, `project::`, `priority::`, `input::` and `updated-at::` properties.

The worker must preserve a Linear issue ID in `linear::` when one exists.

An active task with remaining work must have a direct `next-action::` property.

The worker adds `blocker::` only when there is a known blocker or waiting condition.

A `DONE` task must have `completed:: [[YYYY-MM-DD]]` and must not have a stale `next-action::` or `blocker::`.

The worker records a dated work result as a directly nested activity bullet with its own stable `id::`, `observed-at::` and `outcome::` properties.

It may add `decision::` and `input::` to the activity when the parent thread provides them.

The worker must repair missing contract fields when it updates an existing parent-linked task.

### The worker returns strict JSON

After editing, the worker re-reads both files. It returns one unfenced JSON object with this exact key set:

```json
{"version":1,"backlogVerified":true,"journalVerified":true,"threadTitle":"[Project] task title","threadLabels":["project","working-project","customer-name"],"summary":"Short outcome","error":null}
```

`backlogVerified` means the worker found a Backlog task linked to the parent thread. `journalVerified` means the journal points to that same task.

The result also includes:

- `threadTitle` in the format `[Project] task title`
- `threadLabels` for the Backlog project, working project and customer when present

If the hint, parent thread or matching Backlog task contains a Linear issue ID, the worker keeps that ID unchanged after the project prefix in `threadTitle`. For example, it uses `[Internal] DAT-745 Support Quality Overview PR #111` rather than dropping `DAT-745`.

The coordinator normalises and removes duplicate labels. A verified Backlog task needs at least one usable label. An unverified Backlog result must return an empty label list.

The coordinator rejects extra keys, prose, code fences, invalid field types and contradictory verification results. Malformed output remains `unverified`. It never counts as complete or as a terminal failure.

Completion is worker-attested and read-back-verified. The coordinator validates the result but does not independently inspect the meaning of graph files.

### The same worker repairs incomplete state

The command keeps the same worker after a partial, malformed or validated failed result. A later invocation makes the worker inspect existing parent-linked state and repair only missing work. A malformed repair response does not erase earlier verified Logseq state.

### Later actions run separately

Verified Logseq completion starts 3 separate actions:

- rename parent thread
- add labels without removing existing labels
- archive worker

The plugin still attempts archive if rename or labelling fails. Any later-action failure leaves `Logseq: complete` unchanged. A later invocation retries only failed stages.

The operation leaves memory after Logseq, rename, labels and archive all complete. A typed worker error with no fresh response also ends ownership so a later invocation can start a replacement worker.

## Permissions and side effects

The command can:

- write to the configured Logseq graph
- create and archive a hidden Amp worker thread
- rename the parent Amp thread
- add labels to the parent Amp thread

The command does not run from an agent message or lifecycle event. You must select it from the command palette.

## Examples

1. Choose `Logseq: Log Current Task` from the command palette.
2. Enter an optional hint, such as `update DAT-594`.
3. Select `Log to Logseq`.

## Troubleshooting

Use these checks when the command does not complete:

- open an Amp thread before running the command
- for `Worker: pending`, wait and run the command again to check the same operation
- for `Logseq: partial`, `Logseq: unverified` or `Logseq: failed`, run the command again so the same worker can repair the state
- for `Rename: failed`, `Labels: failed` or `Archive: failed`, run the command again to retry only that action
- for `Worker: failed`, run the command again to start a replacement worker
- if `Worker: pending` remains unresolved after repeated retries, reload the plugins or restart Amp to clear in-memory ownership; use this only as an escape hatch because the original worker may still write
- to use another graph, set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp

## Maintenance notes

Update this document when any of these change:

- the command ID, prompt or notifications
- worker mode or startup timeout
- context reconstruction or the Oracle guard
- operation state, worker result or reconciliation
- Backlog-first behaviour or journal verification
- parent thread title or labels
- rename, label or archive behaviour
- default graph path or timeout compatibility

Keep historical intent and evidence in ISSUE-0001.
