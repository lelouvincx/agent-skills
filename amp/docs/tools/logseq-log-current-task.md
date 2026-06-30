---
doc_schema: "amp-plugin-capability/v1"
title: "Logseq: Log Current Task"
slug: "logseq-log-current-task"
status: "active"
summary: "Adds a command-palette action that manually logs the current Amp thread task into a Logseq graph and renames the Amp thread from the Logseq task title."
capability:
  id: "logseq-log-current-task"
  type: "command"
  surface: "command_palette"
  invocation: "command_palette"
  registration_api: "amp.registerCommand"
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
  last_verified: "2026-06-28"
contract:
  input_kind: "ui_prompt"
  output_kind: "ui_notification"
  event: null
  command_id: "logseq-log-current-task"
  agent_mode_key: null
runtime:
  uses:
    - "amp.registerCommand"
    - "ctx.ui.input"
    - "ctx.ui.notify"
    - "ctx.thread.messages"
    - "amp.getBuiltinAgent"
    - "Agent.createThread"
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
  permission_level: "manual-command-with-worker-write"
  user_gate: "manual command invocation plus optional UI hint"
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
  - "command"
  - "logseq"
  - "manual"
  - "worker"
---

# Logseq: Log Current Task

## Summary

`logseq-log-current-task` adds the command-palette action `logseq: Log current task`. It manually spawns a hidden built-in Amp worker to log the durable outcome of the current thread into the configured Logseq graph, then renames the parent Amp thread from the Logseq task title.

## Invocation

- Surface: command palette
- Registered with: `amp.registerCommand`
- Command ID: `logseq-log-current-task`
- Palette label: `logseq: Log current task`
- Plugin file: `plugins/logseq-manual-log.ts`

## Contract

The command accepts no JSON input. It requires an active thread. When invoked, it opens a UI input prompt:

| Prompt field  | Notes                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Title         | `Log current task to Logseq`                                                                               |
| Message       | Optional target, note, or source link, such as `update DAT-594` or a Slack/PR/Notion URL.                  |
| Submit button | `Log to Logseq`                                                                                            |

Runtime defaults:

| Setting                     | Value                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Logseq repo                 | `AMP_LOGSEQ_GRAPH_DIR` or `/Users/lelouvincx/Developer/second-brain-logseq` |
| Worker mode                 | `deep`                                                                      |
| Worker reasoning effort     | `medium` (Amp GPT-5.5 recommended default for normal deep work)             |
| Worker timeout              | 10 minutes                                                                  |
| Parent recent-message seed  | 20 messages                                                                 |
| Parent excerpt limit        | 20000 characters                                                            |
| Notification excerpt limit  | 500 characters                                                              |
| Parent thread title pattern | `[Project] task title`                                                      |

## Behavior

The command checks for an active thread, prompts for an optional hint, reads up to 20 recent messages only as a seed for link/outcome extraction, spawns a hidden built-in `deep/medium` worker thread, and sends it a Logseq-specific prompt. The worker has an explicit private intent-reconstruction step: read the parent Amp thread, infer the original user intent, the latest coherent requested outcome, and the durable result to log, then proceed from that reconstructed intent. The worker is asked to log task entries in `pages/Backlog.md` first: update an existing matching backlog block when possible, otherwise create one concise backlog task block. Today's journal should then contain only a short reference back to that backlog task, under `Done`, `Tasks`, or `Notes` according to the task state.

Before choosing or writing a block, the worker must treat the Logseq graph's canonical map as the source of truth: read `pages/Canonical Pages.md`, then read the corresponding canonical project/rule pages named there, especially `pages/Projects.md`, `pages/Backlog.md`, and relevant rule pages. The backlog task's `project:: [[...]]`, priority, title, and placement must be coherent with that canonical project taxonomy and any matching active backlog task. If the recent-message seed, reconstructed intent, and canonical pages disagree, the worker should prefer the reconstructed original thread intent and canonical project mapping over incidental recent-message context.

When writing the backlog task block, the worker keeps reference links in the `input::` property. It always includes the parent Amp thread and also includes useful source or deliverable links found in the user hint or parent thread, such as Slack, Notion, Linear, GitHub PR/issue, ReadAI, customer docs, design docs, or related Amp threads. With multiple links, it uses numbered labels such as `input:: [1-Ampcode](T-...) [2-PR](https://...) [3-Slack](https://...)`, dedupes equivalent links, and skips incidental links that are not meaningful task references. The journal reference should stay brief and point to the backlog task instead of duplicating the task properties or source links.

The worker's final answer must include a plain-text `Thread title: [Project] task title` line derived from the Logseq task/block it wrote or updated. The project is the Logseq `project:: [[...]]` value without brackets; the task title is the Logseq block's task/note text without TODO/DONE markers or properties. If the worker finishes within the timeout and returns a valid title, the command renames the parent thread with `amp threads rename <parentThreadID> "[Project] task title"`, shows a completion notification, and archives the worker thread with `amp threads archive <threadID>`. If the worker fails, times out, returns no title, rename fails, or archive fails, it notifies the user and leaves the worker unarchived for inspection.

## Permissions and side effects

This command can write to the configured Logseq graph through the spawned worker. It also renames the parent Amp thread through the Amp CLI, and creates and usually archives a hidden Amp worker thread. It does not automatically log thread lifecycle events; the user must invoke the command manually.

## Examples

Run from the command palette:

```text
logseq: Log current task
```

Optional hint examples:

```text
update DAT-594
docs/tools maintenance
include https://github.com/owner/repo/pull/123
```

## Troubleshooting

- `Open an Amp thread before running...`: switch to a thread and invoke the command again.
- Command cancelled: the UI prompt returned `undefined`; invoke again and submit a hint or blank input.
- Worker failed or timed out: open the worker thread from the notification and inspect its state.
- Rename failed or title missing: inspect the worker's final response and rename the parent thread manually with the `[Project] task title` pattern if needed.
- Archive failed: archive the worker manually after inspecting it.
- Wrong Logseq graph: set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp.

## Maintenance notes

Update this doc when the worker prompt, Backlog-first task logging behavior, journal-reference behavior, Logseq conventions, `input::` reference-link behavior, parent thread rename behavior, default graph path, worker mode, timeout, or archive behavior changes. Keep this documented as a manual command; it intentionally has no `agent.start` or `agent.end` hook.
