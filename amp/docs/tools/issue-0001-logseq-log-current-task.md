---
doc_schema: "amp-artifact/v2"
title: "Logseq: log current task"
slug: "logseq-log-current-task"
status: "active"
summary: "Lets the agent log a task to Logseq, rename the parent thread and clean up the worker."
artifact:
  id: "logseq_log_current_task"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/logseq-manual-log.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerTool"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-07-15"
contract:
  input_kind: "json_schema"
  output_kind: "text"
  trigger: "tool_call"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
  optional_inputs:
    - "hint"
runtime:
  uses:
    - "amp.registerTool"
    - "amp.on agent.start"
    - "amp.on agent.end"
    - "amp.on tool.call"
    - "amp.helpers.filesModifiedByToolCall"
    - "amp.helpers.filePathFromURI"
    - "amp.getBuiltinAgent"
    - "Agent.createThread"
    - "PluginThread.appendUserMessage"
    - "PluginThread.waitForResponse"
    - "PluginThread.messages"
    - "PluginThread.state"
    - "amp.$ amp threads rename"
    - "amp.$ amp threads archive"
  dependencies:
    - "Amp CLI on PATH for renaming parent thread and archiving worker thread"
    - "Logseq graph directory"
  env:
    - "AMP_LOGSEQ_GRAPH_DIR"
  reads:
    - "parent Amp thread through spawned worker via read_thread"
    - "Logseq graph through spawned worker"
  writes:
    - "Logseq graph through spawned worker"
    - "hidden worker Amp thread"
    - "parent Amp thread title"
    - "worker thread archive state"
  network:
    - "Amp built-in high agent runtime"
  logs:
    - "plugin load log"
safety:
  permission_level: "manual-tool-with-worker-write"
  user_gate: "explicit in-thread tool call or agent decision plus optional hint"
  constraints:
    - "Lifecycle events may add routing guidance or reject recognized direct graph writes, but never start Logseq logging automatically."
    - "Requires an active Amp thread."
    - "Worker must use read_thread successfully before editing Logseq."
    - "Worker must re-read and verify both Logseq mutations before reporting completion."
    - "Oracle calls from the worker are rejected."
    - "Worker is instructed not to commit, push, run weekly automation, or modify unrelated Logseq blocks."
  risks:
    - "Worker can edit the configured Logseq graph."
    - "Write verification is worker-attested; the coordinator validates the result but does not independently parse Logseq semantics."
    - "Operation state is in memory and cannot prevent duplicate workers after plugin reload or process restart."
    - "Amp cannot identify every possible shell-based file mutation, so direct-write routing protection is best effort."
related:
  - "logseq-log-current-task-command"
  - "spawn-subagent"
tags:
  - "agent_tool"
  - "logseq"
  - "manual"
  - "worker"
---

# Logseq: log current task

## Summary

`logseq_log_current_task` logs the durable outcome of the current Amp thread to Logseq. Within one plugin process, it coordinates one active or pending hidden worker for each parent thread. It reports unresolved work as pending and reports Logseq, rename and archive results separately.

[ISSUE-0001: Logseq logging reliability](../issues/issue-0001-logseq-logging-reliability.md) explains why this contract exists and preserves the original intent, incident evidence and decisions.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `logseq_log_current_task`
- Plugin file: `plugins/logseq-manual-log.ts`

## Contract

You must run the tool from an active thread. It accepts one optional JSON input:

| Field | Type | Notes |
| --- | --- | --- |
| `hint` | `string` | A target, note or source link, such as `update DAT-594` or a Slack, PR or Notion URL. |

The tool returns plain text with separate `Worker`, `Logseq`, `Rename` and `Archive` statuses:

- `pending` means the operation may still write, or Amp cannot confirm whether it accepted the work
- `partial` means the worker verified the parent-linked Backlog task but not the matching journal pointer
- `complete` means the worker re-read both files and verified that the journal points to the same parent-linked task
- `failed` means the operation can no longer write or the worker returned a validated failure

Completion is worker-attested and read-back-verified. The coordinator validates the worker's result but does not independently inspect the meaning of the graph files.

Runtime defaults:

| Setting                     | Value                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Logseq repo                 | `AMP_LOGSEQ_GRAPH_DIR` or `/Users/lelouvincx/Developer/second-brain-logseq` |
| Worker mode                 | `high`                                                                      |
| Worker startup timeout      | 15 seconds                                                                  |
| Worker timeout              | 5 minutes                                                                   |
| Result excerpt limit        | 500 characters                                                              |
| Parent thread title pattern | `[Project] task title`                                                      |

## Behavior

### One operation owns each parent thread

The tool records one in-memory operation for each parent thread before it creates a worker. It handles each create, append, response, rename and archive state change in order. A concurrent call returns the current status instead of starting duplicate work.

The first call starts a hidden built-in `high` worker without recent parent messages. Later calls use the same worker and retry only unfinished stages.

This guarantee lasts for one plugin process. Amp does not provide an operation store or a way to list child threads. A plugin reload can therefore lose ownership of pending work.

### Uncertain work stays pending

Amp may not confirm whether it created a worker, delivered a message or stored a response. When this happens, the tool keeps ownership and reports `pending`. It does not create another worker, add another message or cancel work that may still write.

After 5 minutes, the tool checks the worker state and looks for a new message. A worker stays pending if it is `running`, `awaiting-approval` or still uncertain.

Only an assistant message with a new message ID can satisfy the current worker turn.

The Amp plugin API does not provide typed timeout errors. The plugin therefore keeps 2 string checks in one compatibility helper.

### The worker writes Backlog first

The worker must call `read_thread` for the parent thread before editing Logseq. If this fails, it returns a structured error without changing the graph. The plugin also rejects Oracle calls from the worker.

The worker reconstructs the original user intent and the latest coherent outcome. It then updates or creates the parent-linked task in `pages/Backlog.md`. Today's journal contains a short pointer to that task under `Done`, `Tasks` or `Notes`, based on the task state.

### The worker follows the canonical map

The worker reads `pages/Canonical Pages.md` before choosing or writing a block. It then reads the project and rule pages named there. These include `pages/Projects.md`, `pages/Backlog.md` and any relevant rule pages.

The Backlog task must follow the canonical project, priority, title and placement rules. If the canonical map conflicts with the reconstructed request, the worker preserves the user's intent and applies the canonical project mapping.

### The worker records useful source links

The worker stores source links in the Backlog task's `input::` property. It always includes the parent Amp thread. It also includes useful links from the hint or parent thread, such as Slack, Notion, Linear, GitHub, ReadAI, customer documents, design documents or related Amp threads.

For more than one link, the worker uses numbered labels. For example: `input:: [1-Ampcode](T-...) [2-PR](https://...) [3-Slack](https://...)`. It removes duplicate links and skips incidental references. The journal points to the Backlog task instead of copying its properties and links.

### The worker returns strict JSON

After editing, the worker re-reads both files. It then returns one unfenced JSON object with this exact key set:

```json
{"version":1,"backlogVerified":true,"journalVerified":true,"threadTitle":"[Project] task title","summary":"Short outcome","error":null}
```

`backlogVerified` means the worker found a Backlog task linked to the parent thread. `journalVerified` means the journal points to that same task.

The tool rejects results that contain:

- extra keys, prose or code fences
- invalid field types
- multiline or malformed titles
- `journalVerified` without `backlogVerified`
- a verified Backlog task without a title
- an error when both files are verified
- no error when neither file is verified

Malformed output remains `unverified`. It never counts as complete or as a terminal failure.

### Rename and archive run separately

Verified Logseq completion starts 2 separate actions: rename the parent thread and archive the worker. The tool still tries to archive the worker if rename fails. Either failure leaves `Logseq: complete` unchanged.

The tool keeps the same worker after a partial, malformed or verified failed result. A later call makes the worker inspect existing parent-linked state and repair only missing work. A malformed repair response does not erase earlier verified Logseq state.

The tool removes an operation after Logseq, rename and archive all complete. A typed worker error with no new response also ends ownership. A later call can then start a replacement worker.

Transport errors stay pending if Amp cannot confirm worker creation or message acceptance.

### Explicit requests use this tool

When an `agent.start` message explicitly asks for Logseq logging, the plugin adds hidden guidance that requires this tool. During that turn, it rejects recognized parent-agent file changes inside the graph. The agent must split mixed changes into separate tool calls.

The plugin converts and normalises file paths before checking whether they are inside the graph. The rule does not apply to Logseq workers. Unknown types of file change fail open. The hook never starts logging automatically and does not intercept unrelated paths.

## Permissions and side effects

The tool can:

- write to the configured Logseq graph through the worker
- create and archive a hidden Amp worker thread
- rename the parent Amp thread through the Amp CLI

Lifecycle hooks only guide explicit Logseq requests. They never start logging automatically.

## Examples

Log the current thread with no extra hint:

```json
{}
```

Log the current thread with an optional hint:

```json
{
  "hint": "update DAT-594; include https://github.com/owner/repo/pull/123"
}
```

## Troubleshooting

Use these checks when the tool does not complete:

- for `Open an Amp thread before running...`, switch to a thread and run the tool again
- for `Worker: pending`, wait and run the tool again to check the same operation
- for `Logseq: partial` or `unverified`, run the tool again so the same worker can verify and repair the state
- for `Rename: failed`, run the tool again to retry rename without another Logseq write
- for `Archive: failed`, run the tool again to retry cleanup without another Logseq write
- for `Worker: failed`, run the tool again to start a replacement worker
- for the wrong graph, set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp

## Maintenance notes

Update this document when any of these change:

- the agent tool schema or routing hooks
- operation state, worker results or reconciliation
- Backlog-first behaviour or journal verification
- parent rename or worker archive
- the default graph path, worker mode or startup timeout
- mandatory `read_thread` behaviour or the Oracle guard
- timeout compatibility

Update ISSUE-0001 when work resolves a finding or changes scope. Keep historical evidence in the issue record, not this runtime contract.
