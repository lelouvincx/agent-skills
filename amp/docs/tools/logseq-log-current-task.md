---
doc_schema: "amp-plugin-capability/v1"
title: "Logseq: Log Current Task"
slug: "logseq-log-current-task"
status: "active"
summary: "Adds a command-palette command and an agent-callable tool that log the current Amp thread task into a Logseq graph and rename the Amp thread from the Logseq task title."
capability:
  id: "logseq_log_current_task"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  registration_api: "amp.registerTool"
  api_stability: "stable"
plugin:
  file: "plugins/logseq-manual-log.ts"
  scope: "system"
  install_source: "local"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-07-02"
contract:
  input_kind: "json_schema"
  output_kind: "text"
  event: null
  command_id: "logseq-log-current-task"
  agent_mode_key: null
  optional_inputs:
    - "hint"
runtime:
  uses:
    - "amp.registerTool"
    - "amp.registerCommand"
    - "ctx.ui.input"
    - "ctx.ui.notify"
    - "ctx.thread.messages"
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
    - "current Amp thread recent messages as a seed; parent thread through spawned worker for intent reconstruction"
    - "Logseq graph through spawned worker"
  writes:
    - "Logseq graph through spawned worker"
    - "hidden worker Amp thread"
    - "parent Amp thread title"
    - "worker thread archive state"
  network:
    - "Amp built-in deep agent runtime"
  logs:
    - "plugin load log"
safety:
  permission_level: "manual-tool-with-worker-write"
  user_gate: "explicit in-thread tool call, command-palette invocation, or agent decision plus optional hint"
  constraints:
    - "Does not run automatically from lifecycle events."
    - "Requires an active Amp thread."
    - "Worker is instructed not to commit, push, run weekly automation, or modify unrelated Logseq blocks."
  risks:
    - "Worker can edit the configured Logseq graph."
    - "Malformed worker responses can leave the parent thread title unchanged."
    - "Archive failure leaves the worker thread unarchived for inspection."
related:
  - "spawn-worker"
tags:
  - "agent_tool"
  - "logseq"
  - "manual"
  - "worker"
---

# Logseq: Log Current Task

## Summary

`logseq-log-current-task` provides the command-palette action `logseq: Log current task`. `logseq_log_current_task` provides the same behavior as an agent-callable tool. Both surfaces log the durable outcome of the current Amp thread into the configured Logseq graph. The agent tool is meant to be called directly from the active Amp thread when the user asks to log the current task, without using the command palette. Both surfaces start a hidden built-in Amp worker to perform the Logseq edit, wait for its result, then rename the parent Amp thread from the Logseq task title.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `logseq_log_current_task`
- Command surface: command palette
- Command registered with: `amp.registerCommand`
- Command ID: `logseq-log-current-task`
- Palette label: `logseq: Log current task`
- Plugin file: `plugins/logseq-manual-log.ts`

## Contract

The agent tool requires an active thread and accepts one optional JSON input:

| Field  | Type     | Notes                                                                                     |
| ------ | -------- | ----------------------------------------------------------------------------------------- |
| `hint` | `string` | Optional target, note, or source link, such as `update DAT-594` or a Slack/PR/Notion URL. |

Agent tool output is plain text. On success it includes the worker summary, the new parent thread title, and the worker archive result. On failure it returns the worker thread ID and the reason the worker was left unarchived for inspection.

The command-palette command accepts no JSON input. It requires an active thread. When invoked, it opens a UI input prompt:

| Prompt field  | Notes                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------- |
| Title         | `Log current task to Logseq`                                                              |
| Message       | Optional target, note, or source link, such as `update DAT-594` or a Slack/PR/Notion URL. |
| Submit button | `Log to Logseq`                                                                           |

Runtime defaults:

| Setting                     | Value                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Logseq repo                 | `AMP_LOGSEQ_GRAPH_DIR` or `/Users/lelouvincx/Developer/second-brain-logseq` |
| Worker mode                 | `deep`                                                                      |
| Worker reasoning effort     | `medium` (Amp GPT-5.5 recommended default for normal deep work)             |
| Worker timeout              | 10 minutes                                                                  |
| Worker wait retry delay     | 1 second for transient `Plugin thread.messages timed out` errors            |
| Parent recent-message seed  | 20 messages                                                                 |
| Parent excerpt limit        | 20000 characters                                                            |
| Result excerpt limit        | 500 characters                                                              |
| Parent thread title pattern | `[Project] task title`                                                      |

## Behavior

The agent tool checks for an active thread and uses the optional `hint` input. The command-palette command checks for an active thread, prompts for an optional hint, then calls the same internal logging flow used by the tool. That shared flow reads up to 20 recent messages only as a seed for link/outcome extraction, spawns a hidden built-in `deep/medium` worker thread, and sends it a Logseq-specific prompt. While waiting for the worker, transient `Plugin thread.messages timed out` errors are retried until the worker timeout expires. The prompt places the optional hint near the end, after the worker rules and immediately before the required final-response format. The worker has an explicit private intent-reconstruction step: read the parent Amp thread, infer the original user intent, the latest coherent requested outcome, and the durable result to log, then proceed from that reconstructed intent. The worker is asked to log task entries in `pages/Backlog.md` first: update a matching backlog block when possible, otherwise create one concise backlog task block. Today's journal should then contain only a short reference back to that backlog task, under `Done`, `Tasks`, or `Notes` according to the task state.

Before choosing or writing a block, the worker must treat the Logseq graph's canonical map as the source of truth: read `pages/Canonical Pages.md`, then read the corresponding canonical project/rule pages named there, especially `pages/Projects.md`, `pages/Backlog.md`, and relevant rule pages. The backlog task's `project:: [[...]]`, priority, title, and placement must be coherent with that canonical project taxonomy and any matching active backlog task. If the recent-message seed, reconstructed intent, and canonical pages disagree, the worker should prefer the reconstructed original thread intent and canonical project mapping over incidental recent-message context.

When writing the backlog task block, the worker stores reference links in the `input::` property. It includes the parent Amp thread plus useful source or deliverable links found in the user hint or parent thread, such as Slack, Notion, Linear, GitHub PR/issue, ReadAI, customer docs, design docs, or related Amp threads. With multiple links, it uses numbered labels such as `input:: [1-Ampcode](T-...) [2-PR](https://...) [3-Slack](https://...)`, dedupes equivalent links, and skips incidental links that are not meaningful task references. The journal reference should stay brief and point to the backlog task instead of duplicating the task properties or source links.

The worker's final answer must include a plain-text `Thread title: [Project] task title` line derived from the Logseq task/block it wrote or updated. The project is the Logseq `project:: [[...]]` value without brackets; the task title is the Logseq block's task/note text without TODO/DONE markers or properties. If the worker finishes within the timeout and returns a valid title, the shared logging flow renames the parent thread with `amp threads rename <parentThreadID> "[Project] task title"`, returns or shows the worker summary, and archives the worker thread with `amp threads archive <threadID>`. If the worker fails, times out, returns no title, rename fails, or archive fails, it returns or shows the error and leaves the worker unarchived for inspection.

## Permissions and side effects

Both surfaces can write to the configured Logseq graph through the spawned worker, rename the parent Amp thread through the Amp CLI, and create and usually archive a hidden Amp worker thread. This capability does not automatically log thread lifecycle events; the user must invoke the command-palette action, ask the active Amp thread to log the task, or the agent must otherwise decide to call the tool.

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

Run from the command palette:

```text
logseq: Log current task
```

## Troubleshooting

- `Open an Amp thread before running...`: switch to a thread and ask Amp to call the tool again.
- Worker failed or timed out: open the worker thread from the notification and inspect its state.
- Rename failed or title missing: inspect the worker's final response and rename the parent thread manually with the `[Project] task title` pattern if needed.
- Archive failed: archive the worker manually after inspecting it.
- Wrong Logseq graph: set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp.
- Command cancelled: the UI prompt returned `undefined`; invoke again and submit a hint or blank input.

## Maintenance notes

Update this doc when the command contract, agent tool schema, worker prompt, Backlog-first task logging behavior, journal-reference behavior, Logseq conventions, `input::` reference-link behavior, parent thread rename behavior, default graph path, worker mode, worker wait retry behavior, timeout, or archive behavior changes. This capability is a manual command-palette command plus agent-callable tool; it intentionally has no `agent.start` hook or `agent.end` hook.
