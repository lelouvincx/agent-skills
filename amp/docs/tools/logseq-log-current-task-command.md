---
doc_schema: "amp-artifact/v2"
title: "Logseq: log current task command"
slug: "logseq-log-current-task-command"
status: "active"
summary: "Queues a parent-thread turn that briefs a Task subagent from the active conversation and logs the current work to Logseq."
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
  last_verified: "2026-09-03"
contract:
  input_kind: "ui_prompt"
  output_kind: "queued_parent_thread_turn"
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
    - "PluginThread.appendUserMessage"
    - "PluginSystem.workspaceRoot"
    - "PluginAPI.helpers.filePathFromURI"
    - "built-in Task through the parent agent"
  dependencies:
    - "Amp CLI on PATH"
    - "Logseq graph directory"
    - "current thread agent with the built-in Task tool"
  env:
    - "AMP_LOGSEQ_GRAPH_DIR"
  reads:
    - "active conversation context through the parent agent"
    - "active workspace root through PluginSystem"
    - "Logseq graph through a Task subagent"
  writes:
    - "delegation request to the active Amp thread"
    - "Logseq graph through a Task subagent"
    - "parent Amp thread title through a Task subagent"
    - "parent Amp thread labels through a Task subagent"
  network:
    - "current thread agent runtime"
    - "built-in Task runtime"
  logs:
    - "plugin load log"
safety:
  permission_level: "manual-command-with-delegated-write"
  user_gate: "manual command palette invocation"
  constraints:
    - "Requires an active Amp thread."
    - "Does not run automatically from lifecycle events."
    - "Parent agent must brief Task from its active conversation context."
    - "Task brief must be standalone because a Task subagent starts fresh."
    - "Task subagent must treat the parent-authored brief as its primary intent source."
    - "Task subagent owns all Logseq file reads, writes, verification and repair."
    - "Task subagent must re-read and verify both Logseq files before reporting completion."
    - "Task subagent must rename and label the parent thread only after it verifies both Logseq files."
    - "Parent agent must inspect the Task result before reporting completion."
    - "Each parent Amp thread label must not exceed 32 characters."
  risks:
    - "Task subagent can edit the configured Logseq graph."
    - "Command notification confirms delivery to the parent thread, not Logseq completion."
    - "Logging quality depends on the parent agent carrying all material intent into the standalone Task brief."
related:
  - "delegating-subagents"
tags:
  - "command"
  - "logseq"
  - "manual"
  - "task"
---

# Logseq: log current task command

## Summary

`logseq-log-current-task` adds the command-palette action `Logseq: Log Current Task`.

The command asks for an optional hint. It then queues a normal turn in the active thread. The parent agent uses its current conversation context to brief a built-in Task subagent, which writes and verifies the Logseq record.

[ISSUE-0001: Logseq logging reliability](../issues/issue-0001-logseq-logging-reliability.md) preserves the original incident and the reasons for this parent-owned delegation path.

## Invocation

- Surface: command palette
- Registered with: `amp.registerCommand`
- Command ID: `logseq-log-current-task`
- Palette label: `Logseq: Log Current Task`
- Plugin file: `plugins/logseq-manual-log.ts`

You must run the command from an active thread whose agent can call the built-in `Task` tool.

## Contract

The command opens `Log current task to Logseq`. You can enter:

- a target
- a note
- a source link

Select `Log to Logseq` to queue the logging turn. The notification confirms that Amp added the request to the active thread. It does not claim that Logseq was updated.

The parent agent must:

1. Use its active conversation context to identify original intent, later redirects, current outcome, remaining work, decisions and important links.
2. Call built-in Task as its next action with a standalone handoff and bounded execution contract.
3. Inspect the Task result against the logging contract.
4. Report the verified outcome or exact blocker in the parent thread.

A Task subagent starts fresh and receives the context in the parent's brief, not the full conversation. It treats that brief as the primary intent source. If one named material intent fact required for safe logging is absent, Task uses `read_thread` only to retrieve that fact when the tool is available. If the tool is unavailable, Task reports the missing fact as the blocker. It continues from the parent handoff for all other intent.

## Behavior

### Parent agent briefs Task from live context

The command appends one user message to the current thread. It does not create a hidden worker thread.

The message tells the parent agent to call built-in Task as its next action and use the conversation context already available in its current inference turn. This includes the original request, accepted decisions, user redirects, work completed, remaining work and relevant source or deliverable links.

The parent puts 5 sections in the Task prompt, in this order:

1. `Parent handoff`
2. `Runtime context`
3. `Optional user hint`
4. `Intent boundary`
5. `Logging contract`

The `Parent handoff` includes each material fact once:

- the durable task or outcome to log
- original intent and later redirects that affect the result
- completed work, current state and one concrete next action when work remains
- decisions, blockers and required authority
- relevant source and deliverable links

`Runtime context` supplies the parent thread ID, active workspace root, Logseq graph, Backlog path, date and journal path. The plugin gets the workspace from `PluginSystem.workspaceRoot` and converts it with `PluginAPI.helpers.filePathFromURI`; it does not use the plugin process directory. When Amp has no workspace open, the value is `(none)`. `Optional user hint` supplies the command hint or `(none)`. `Intent boundary` tells Task how to resolve a missing intent fact. `Logging contract` carries the numbered execution and completion requirements below.

This boundary keeps interpretation with the agent that took part in the conversation. Task owns the bounded file and metadata work.

Task treats the parent-authored brief as authoritative for the requested outcome. When one named material intent fact required for safe logging is absent, Task may use `read_thread` to retrieve that fact if the tool is available. If the tool is unavailable, Task reports the missing fact as the blocker. It continues from the parent handoff for all other intent.

### Task writes Backlog first

Task reads `pages/Canonical Pages.md` and relevant rule pages before writing. It uses those pages as the source of truth for project taxonomy, priority, placement and active Backlog matches.

Task first searches `pages/Backlog.md` for every actionable task whose direct `input::` contains the parent thread ID. It follows these branches:

- If exactly one task exists, update it.
- If no task exists, create one.
- If several tasks exist, reconcile them into one only when every durable fact can be preserved. Otherwise, stop and report the duplicate task locations as the blocker.

The mutation must finish with exactly one actionable parent-linked task.

Every new task must have direct:

- `id:: <uuid>`
- `project:: [[...]]`
- `priority:: #P...`
- `input:: ...`
- `updated-at:: YYYY-MM-DD`

Task must preserve a Linear issue ID in a direct `linear::` property when one exists. Only `DAT-`, `PS-` and `DOC-` prefixes count as Linear team IDs.

An active task must have one concrete `next-action::`. Task adds `blocker::` only for a known blocker or waiting condition.

A `DONE` task must have `completed:: [[YYYY-MM-DD]]`. It must not keep `next-action::` or `blocker::`.

Task records the durable result as a directly nested activity bullet with its own stable `id::`, `observed-at::` and non-empty `outcome::`. It adds `decision::` and `input::` when the parent brief supports them.

Useful source and deliverable links belong in the Backlog task's `input::`. Task always includes the parent Amp thread. It deduplicates equivalent links and omits incidental research links.

After the Backlog update, Task adds or updates one short journal pointer to the same task:

- under `### Done` when work is complete
- under `### Tasks` when follow-up remains
- under `### Notes` when the record is informational

The journal entry points to the Backlog task UUID. It does not copy the task properties or source links.

Task keeps the Backlog entry short. It does not paste the parent summary, private reasoning or transcript.

### Task verifies files and updates the parent

After writing, Task re-reads `pages/Backlog.md` and today's journal. It reports Logseq complete only when it finds:

- exactly one actionable task linked to the parent thread
- all required direct task properties
- a unique task UUID
- a matching Linear property when required
- valid state-specific properties
- a directly nested activity for today with its own UUID and outcome
- a journal block reference to the same task UUID

Task then checks whether a fresh agent could understand the task, answer status and history questions, and take the next action without asking the user to repeat known context. It repairs missing durable context before reporting completion.

Only after both files pass read-back does Task update the parent thread. It derives:

- title in the exact format `[Project] task title`
- normalized Backlog project label
- working-project label from `project-resolve <workspace-directory-name> --json`, or the normalized directory name when resolution fails; omit this label when the parent workspace is `(none)`
- `customer-...` label when the task identifies a customer

Task preserves a Linear issue ID immediately after the project prefix. It normalizes labels to lowercase words joined with hyphens, removes punctuation and duplicates, and limits each label to 32 characters. It preserves existing labels and adds no priority or task-state label.

Task runs `amp threads rename` and `amp threads label` for the parent thread. It reports parent metadata complete only when both commands succeed.

Task does not commit, push, run weekly report automation or modify unrelated Logseq blocks.

### Parent agent checks the result

Task returns a compact done report with:

- task UUID, title, state, Backlog path, journal path and concise outcome
- Backlog verification evidence: parent-linked task count, UUID uniqueness result, required direct-field result, state-specific-field result, and today's activity UUID and date
- journal verification evidence: the task UUID referenced by the journal pointer
- parent metadata evidence: separate rename and label command results
- exact blocker and smallest parent or user input needed when blocked

The parent agent checks the compact evidence report before replying. If required evidence is missing or a safe local gap remains, the parent calls one focused Task after the first finishes, passing the original parent handoff, runtime context, prior report and unmet checks. The repair Task re-reads or repairs the files and returns a revised report. Task calls run serially.

The parent response states what was logged, whether both files were verified, whether thread metadata was updated, and any blocker.

### Repeated invocations update one task

Each command invocation queues one parent-thread turn. Turns in one thread run in order.

Every Task brief requires a Backlog search for actionable tasks whose direct `input::` contains the parent thread ID before mutation. A later invocation therefore updates or safely reconciles parent-linked state instead of creating another task.

The command has no hidden-worker checkpoint or separate operation store. If the parent turn or Task fails, run the command again. The next Task must inspect and repair existing parent-linked state before it creates anything.

## Permissions and side effects

The command can queue a user message in the active thread. The resulting parent turn can use Task to:

- write to the configured Logseq graph
- rename the parent Amp thread
- add labels to the parent Amp thread

The command does not create or archive an addressable worker thread. It does not run from an agent message or lifecycle event.

## Examples

1. Choose `Logseq: Log Current Task` from the command palette.
2. Enter an optional hint, such as `update DAT-594`.
3. Select `Log to Logseq`.
4. Review the parent agent's completion report in the same thread.

## Troubleshooting

- No active thread: send a message to create one, then run the command again.
- Task is unavailable: switch the thread to an agent mode that exposes the built-in Task tool, then run the command again.
- Parent turn fails: run the command again. The next Task will search for existing parent-linked state before writing.
- Backlog or journal verification fails: use the reported blocker to fix graph access or canonical rules, then run the command again.
- Parent title or labels fail: check that Amp CLI is on `PATH`, then run the command again.
- Parent workspace is `(none)`: open the repository or workspace in Amp before invoking the command if you want a working-project label.
- Wrong graph: set `AMP_LOGSEQ_GRAPH_DIR` before starting Amp.

## Maintenance notes

Update this document when any of these change:

- command ID, prompt or notification
- parent-to-Task context boundary
- Task result or repair behavior
- Backlog-first behavior or journal verification
- parent thread title or labels
- default graph path or date handling

Keep historical intent and evidence in ISSUE-0001.
