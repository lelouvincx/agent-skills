---
doc_schema: "amp-artifact/v2"
title: "Logseq: Log Current Task"
slug: "logseq-log-current-task"
status: "active"
summary: "Adds an agent-callable tool that reliably coordinates Logseq task logging, parent-thread rename, and worker cleanup."
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

# Logseq: Log Current Task

## Summary

`logseq_log_current_task` logs the durable outcome of the current Amp thread into the configured Logseq graph. It coordinates one hidden built-in Amp worker per parent thread, reports unresolved work as pending, and preserves separate Logseq-write, parent-rename, and worker-archive outcomes.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `logseq_log_current_task`
- Plugin file: `plugins/logseq-manual-log.ts`

## Contract

The agent tool requires an active thread and accepts one optional JSON input:

| Field  | Type     | Notes                                                                                     |
| ------ | -------- | ----------------------------------------------------------------------------------------- |
| `hint` | `string` | Optional target, note, or source link, such as `update DAT-594` or a Slack/PR/Notion URL. |

Agent tool output is plain text and reports separate `Worker`, `Logseq`, `Rename`, and `Archive` statuses. `Pending` means the operation may still write or its accepted state is unresolved. `Partial` means the worker verified the parent-linked Backlog task but could not verify the matching journal pointer. `Complete` means the worker re-read both files and verified that the journal pointer targets the same parent-linked task. `Failed` requires either a verified worker failure result or a definite failure before any worker message could be accepted.

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

The agent tool checks for an active thread and uses the optional `hint` input. The coordinator stores one in-memory operation per parent thread before beginning asynchronous worker creation. Every create, append, response-consumption, rename, and archive transition is serialized; a concurrent invocation returns the current snapshot instead of starting duplicate work. The first invocation starts a hidden built-in `high` worker without seeding recent parent messages. A later invocation reconciles the same worker and retries only unfinished stages. This guarantee covers one plugin process only because Amp exposes neither a dedicated operation store nor child-thread enumeration.

Worker creation, message delivery, state lookup, and response waiting may fail ambiguously. If a worker or message might have been accepted, the coordinator retains ownership and reports `pending`; it does not create another worker, append another turn, or cancel a potentially writing turn. At the five-minute deadline the coordinator performs one typed-state and fresh-message reconciliation. `running`, `awaiting-approval`, uncertain transport state, or an unresolved stored response remains pending. The worker-response and thread-message timeout strings are isolated compatibility fallbacks because the plugin API exposes no typed timeout errors.

The worker must first use `read_thread` on the parent thread; if that fails, it must stop without editing Logseq and return a structured error. Oracle calls from Logseq workers are rejected. After reconstructing the original user intent, latest coherent requested outcome, and durable result, the worker updates or creates the parent-linked task in `pages/Backlog.md` first. Today's journal then contains only a short pointer to that task under `Done`, `Tasks`, or `Notes` according to task state.

Before choosing or writing a block, the worker must treat the Logseq graph's canonical map as the source of truth: read `pages/Canonical Pages.md`, then read the corresponding canonical project/rule pages named there, especially `pages/Projects.md`, `pages/Backlog.md`, and relevant rule pages. The backlog task's `project:: [[...]]`, priority, title, and placement must be coherent with that canonical project taxonomy and any matching active backlog task. If reconstructed intent and canonical pages disagree, the worker should preserve the reconstructed user intent while applying the canonical project mapping.

When writing the backlog task block, the worker stores reference links in the `input::` property. It includes the parent Amp thread plus useful source or deliverable links found in the user hint or parent thread, such as Slack, Notion, Linear, GitHub PR/issue, ReadAI, customer docs, design docs, or related Amp threads. With multiple links, it uses numbered labels such as `input:: [1-Ampcode](T-...) [2-PR](https://...) [3-Slack](https://...)`, dedupes equivalent links, and skips incidental links that are not meaningful task references. The journal reference stays brief and points to the backlog task instead of duplicating task properties or source links.

After mutation, the worker re-reads both files and returns exactly one unfenced JSON object with this key set:

```json
{"version":1,"backlogVerified":true,"journalVerified":true,"threadTitle":"[Project] task title","summary":"Short outcome","error":null}
```

`backlogVerified` means the worker found a Backlog task linked to the parent thread. `journalVerified` means it confirmed that the journal pointer targets that same task. The coordinator rejects extra keys, prose, fences, invalid types, multiline or malformed titles, `journalVerified` without `backlogVerified`, any verified Backlog without a title, both writes verified with an error, or neither write verified without an error. Malformed output is `unverified`, never complete or terminal failure.

Complete Logseq state triggers parent rename and worker archive as independent stages. Archive is attempted even if rename fails, and either downstream failure preserves `Logseq: complete`. A partial, malformed, or verified failed worker result retains the same worker for a later constrained reconciliation turn. That turn must inspect existing parent-linked state before mutation, repair only the missing state, and return the same JSON schema. A fully complete, renamed, and archived operation is removed from memory.

When an `agent.start` message explicitly asks to log the current task to Logseq, the plugin appends hidden routing guidance requiring this tool. During that turn, recognized parent-agent file mutations under the configured graph are rejected and must be split from unrelated file changes. Logseq workers are exempt. Path checks use Amp's file-mutation helpers and normalized containment. Unrecognized mutation forms fail open; the hook does not start logging automatically or intercept unrelated paths.

## Permissions and side effects

The tool can write to the configured Logseq graph through the spawned worker, rename the parent Amp thread through the Amp CLI, and create and archive a hidden Amp worker thread. Lifecycle hooks only strengthen routing for explicit current-task logging requests; they do not initiate logging automatically.

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

- `Open an Amp thread before running...`: switch to a thread and ask Amp to call the tool again.
- `Worker: pending`: invoke the same capability again later; it will reconcile the existing operation rather than starting another worker.
- `Logseq: partial` or `unverified`: invoke the same capability again to make the existing worker verify and repair missing state.
- `Rename: failed`: invoke the same capability again to retry rename without another Logseq write.
- `Archive: failed`: invoke the same capability again to retry cleanup without another Logseq write.
- Wrong Logseq graph: set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp.

## Maintenance notes

Update this doc when the agent tool schema, routing hooks, operation state, worker result protocol, Backlog-first behavior, journal verification, reconciliation, parent rename, worker archive, default graph path, worker mode, startup timeout, mandatory `read_thread` behavior, Oracle guard, or timeout compatibility changes.
