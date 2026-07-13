---
doc_schema: "amp-artifact/v2"
title: "Logseq: Log Current Task"
slug: "logseq-log-current-task"
status: "active"
summary: "Adds an agent-callable tool that logs the current Amp thread task into a Logseq graph and renames the Amp thread from the Logseq task title."
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
  last_verified: "2026-07-13"
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
    - "amp.on tool.call"
    - "amp.getBuiltinAgent"
    - "Agent.createThread"
    - "PluginThread.appendUserMessage"
    - "PluginThread.waitForResponse"
    - "ctx.$ amp threads rename"
    - "ctx.$ amp threads archive"
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
    - "Does not run automatically from lifecycle events."
    - "Requires an active Amp thread."
    - "Worker must use read_thread successfully before editing Logseq."
    - "Oracle calls from the worker are rejected."
    - "Worker is instructed not to commit, push, run weekly automation, or modify unrelated Logseq blocks."
  risks:
    - "Worker can edit the configured Logseq graph."
    - "Malformed worker responses can leave the parent thread title unchanged."
    - "Archive failure leaves the worker thread unarchived for inspection."
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

`logseq_log_current_task` logs the durable outcome of the current Amp thread into the configured Logseq graph. It starts a hidden built-in Amp worker to perform the Logseq edit, waits for its result, then renames the parent Amp thread from the Logseq task title.

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

Agent tool output is plain text. On success it includes the worker summary, the new parent thread title, and the worker archive result. On failure it returns the worker thread ID and the reason the worker was left unarchived for inspection.

Runtime defaults:

| Setting                     | Value                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Logseq repo                 | `AMP_LOGSEQ_GRAPH_DIR` or `/Users/lelouvincx/Developer/second-brain-logseq` |
| Worker mode                 | `high`                                                                      |
| Worker startup timeout      | 15 seconds                                                                  |
| Worker timeout              | 10 minutes                                                                  |
| Worker wait retry delay     | 1 second for transient `Plugin thread.messages timed out` errors            |
| Result excerpt limit        | 500 characters                                                              |
| Parent thread title pattern | `[Project] task title`                                                      |

## Behavior

The agent tool checks for an active thread and uses the optional `hint` input. Its logging flow spawns a hidden built-in `high` worker thread without seeding recent parent messages and sends it a Logseq-specific prompt. It watches worker state concurrently with the response: an explicit error fails immediately, while a worker that cannot leave its initial idle state within 15 seconds fails instead of holding the parent tool open for the full worker timeout. This includes failed `high`-mode startup when the account lacks the required credits; the flow does not fall back to another mode. The worker must first use `read_thread` on the parent thread; if the tool is unavailable or fails, the worker must stop without editing Logseq and report the blocker. Oracle calls from Logseq workers are rejected by a `tool.call` guard. While waiting for a started worker, transient `Plugin thread.messages timed out` errors are retried until the 10-minute worker timeout expires. The prompt places the optional hint near the end, after the worker rules and immediately before the required final-response format. After reconstructing the original user intent, latest coherent requested outcome, and durable result, the worker logs task entries in `pages/Backlog.md` first: update a matching backlog block when possible, otherwise create one concise backlog task block. Today's journal should then contain only a short reference back to that backlog task, under `Done`, `Tasks`, or `Notes` according to the task state.

Before choosing or writing a block, the worker must treat the Logseq graph's canonical map as the source of truth: read `pages/Canonical Pages.md`, then read the corresponding canonical project/rule pages named there, especially `pages/Projects.md`, `pages/Backlog.md`, and relevant rule pages. The backlog task's `project:: [[...]]`, priority, title, and placement must be coherent with that canonical project taxonomy and any matching active backlog task. If reconstructed intent and canonical pages disagree, the worker should preserve the reconstructed user intent while applying the canonical project mapping.

When writing the backlog task block, the worker stores reference links in the `input::` property. It includes the parent Amp thread plus useful source or deliverable links found in the user hint or parent thread, such as Slack, Notion, Linear, GitHub PR/issue, ReadAI, customer docs, design docs, or related Amp threads. With multiple links, it uses numbered labels such as `input:: [1-Ampcode](T-...) [2-PR](https://...) [3-Slack](https://...)`, dedupes equivalent links, and skips incidental links that are not meaningful task references. The journal reference should stay brief and point to the backlog task instead of duplicating the task properties or source links.

The worker's final answer must include a plain-text `Thread title: [Project] task title` line derived from the Logseq task/block it wrote or updated. The project is the Logseq `project:: [[...]]` value without brackets; the task title is the Logseq block's task/note text without TODO/DONE markers or properties. If the worker finishes within the timeout and returns a valid title, the shared logging flow renames the parent thread with `amp threads rename <parentThreadID> "[Project] task title"`, returns or shows the worker summary, and archives the worker thread with `amp threads archive <threadID>`. If the worker fails, times out, returns no title, rename fails, or archive fails, it returns or shows the error and leaves the worker unarchived for inspection.

## Permissions and side effects

The tool can write to the configured Logseq graph through the spawned worker, rename the parent Amp thread through the Amp CLI, and create and usually archive a hidden Amp worker thread. It does not automatically log thread lifecycle events; the user must ask the active Amp thread to log the task or the agent must otherwise decide to call the tool.

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
- Worker failed or timed out: open the worker thread from the notification and inspect its state.
- Rename failed or title missing: inspect the worker's final response and rename the parent thread manually with the `[Project] task title` pattern if needed.
- Archive failed: archive the worker manually after inspecting it.
- Wrong Logseq graph: set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp.

## Maintenance notes

Update this doc when the agent tool schema, worker prompt, Backlog-first task logging behavior, journal-reference behavior, Logseq conventions, `input::` reference-link behavior, parent thread rename behavior, default graph path, worker mode, startup timeout, mandatory `read_thread` behavior, Oracle guard, worker wait retry behavior, timeout, or archive behavior changes. This capability is an agent-callable tool; it intentionally has no `agent.start` hook or `agent.end` hook.
