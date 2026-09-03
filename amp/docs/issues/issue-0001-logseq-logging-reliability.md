---
doc_schema: "amp-issue/v1"
code: "ISSUE-0001"
title: "Logseq logging reliability"
slug: "logseq-logging-reliability"
file: "issue-0001-logseq-logging-reliability.md"
status: "Partially resolved"
priority: "P0"
summary: "Explains the incident, command-only scope and reliability decisions behind Logseq task logging."
created: "2026-07-15"
updated: "2026-09-03"
amp_thread_id:
  T-019f63f5-d4b8-76e8-870e-b6ec96584a2d: "incident thread containing the original Logseq logging request and recovery"
  T-019f6417-0880-755e-bc60-ce2faebe753d: "worker thread that completed Logseq writes after the coordinator reported a timeout"
  T-019f6428-596b-70ce-ae87-1a13d907cbb5: "investigated the incident and defined the prioritized reliability scope"
  T-019f645f-41cb-7434-a0d9-d9d4d88fa5c3: "reviewed and tightened the P0 implementation plan"
  T-019f644b-4e40-7721-be21-ad60c2cfd428: "organized the issue record and revised its scope after the command-only change"
  T-01a064f2-224c-7097-8e0f-5ce6b560b10e: "made a parent-authored Task brief the primary intent source"
artifacts:
  - "logseq-log-current-task-command"
implementation:
  - path: "../tools/logseq-log-current-task-command.md"
  - path: "../../plugins/logseq-manual-log.ts"
  - path: "../../scripts/logseq-manual-log.test.ts"
pull_requests:
  - "https://github.com/lelouvincx/agent-skills/pull/98"
  - "https://github.com/lelouvincx/agent-skills/pull/108"
  - "https://github.com/lelouvincx/agent-skills/pull/111"
  - "https://github.com/lelouvincx/agent-skills/pull/167"
related: []
tags:
  - "logseq"
  - "reliability"
  - "data-integrity"
  - "worker-lifecycle"
---

# ISSUE-0001: Logseq logging reliability

## Summary

The original incident exposed 2 different problems. An in-thread request could bypass the agent tool, and the worker workflow could report a false failure while still writing.

[PR #108](https://github.com/lelouvincx/agent-skills/pull/108) removed the agent-callable tool on 18 July 2026 because the command works on Amp Web. In-thread requests were no longer part of the supported contract. At that point, the command still had to solve worker lifecycle and data integrity problems.

PR #98 added a process-scoped coordinator and worker-attested read-back checks. [PR #111](https://github.com/lelouvincx/agent-skills/pull/111) added parent project and customer labels.

The command now queues a turn in the active parent thread. The parent uses its live conversation context to write a standalone brief for built-in Task. This replaces the hidden worker's dependence on lossy `read_thread` reconstruction and its separate lifecycle. Task may use a targeted thread lookup for a specific missing fact when that tool is available. Task-link labels, customer-aware titles, graph configuration and timezone behaviour remain open.

The current contract is [Logseq: log current task command](../tools/logseq-log-current-task-command.md). This issue remains the source of truth for historical evidence, revised intent, decisions and follow-up.

## Trigger

[Amp thread T-019f63f5](https://ampcode.com/threads/T-019f63f5-d4b8-76e8-870e-b6ec96584a2d) triggered this investigation. It began with the request:

> log this into logseq today journal, keep TODO

The parent agent edited the journal directly. The user then required the Logseq plugin. The plugin started [worker thread T-019f6417](https://ampcode.com/threads/T-019f6417-0880-755e-bc60-ce2faebe753d) and reported a timeout. The worker later completed both Logseq writes.

The user needed further turns to recover the task ID, add Amp labels and correct the parent thread title.

The source investigation is [Amp thread T-019f6428](https://ampcode.com/threads/T-019f6428-596b-70ce-ae87-1a13d907cbb5). The reviewed P0 design was implemented in [PR #98](https://github.com/lelouvincx/agent-skills/pull/98).

PR #108 later removed the agent tool and retained the command-palette workflow. [Amp thread T-019f644b](https://ampcode.com/threads/T-019f644b-4e40-7721-be21-ad60c2cfd428) revised this issue to reflect that decision.

[Amp thread T-01a064f2](https://ampcode.com/threads/T-01a064f2-224c-7097-8e0f-5ce6b560b10e) later reported that `read_thread` did not preserve enough context or intention. It requested a Task brief written directly by the parent agent instead.

## Original intent

### Original problem

The user asked the active agent to log its task. The agent bypassed the available tool and edited Logseq directly. When the user required the plugin, the plugin reported failure while its worker kept writing.

The original design tried to support an in-thread request and a command-palette action through one workflow. It needed reliable routing and reliable worker state.

### Revised intent after PR #108

The command palette is now the only supported entry point. Selecting `Logseq: Log Current Task` should start one reliable, inspectable workflow. A chat request does not start logging or route the agent to a tool.

The workflow must:

- run only after manual command-palette invocation
- let one operation own active or unresolved work for each parent thread
- report active or uncertain work as pending, never as a terminal failure
- verify the parent-linked Backlog task and matching journal pointer by reading both files after the write
- report Logseq, parent rename, labels and worker archive results separately
- write to Backlog first, then add a short journal pointer
- preserve existing labels while adding project, working-project and customer labels
- allow later work to add task identity without weakening P0 guarantees

### Revised intent after parent-owned Task delegation

The command palette remains the only supported entry point. Selecting the command now queues a normal turn in the active thread instead of creating a hidden worker.

The workflow must:

- keep intent interpretation with the parent agent that has the active conversation context
- make the parent carry original intent, redirects, outcome, decisions, next action and important links into a standalone Task brief
- use one built-in Task subagent for bounded Logseq and parent-metadata work
- make Task inspect existing parent-linked state before writing
- make Task verify both Logseq files before updating the parent thread
- make the parent inspect Task's done report and report the result in the same thread
- avoid `read_thread` as an intent-reconstruction boundary

## Evidence

At the time of the incident, responsibility was split across 5 parts:

- the parent agent
- the plugin coordinator
- a general-purpose high-mode worker
- free-form worker output
- separate Amp CLI commands

The workflow was:

```text
User request
  → parent agent chooses whether to invoke the plugin
  → plugin starts a hidden high-mode worker
  → worker calls read_thread
  → worker reads canonical Logseq pages
  → worker edits Backlog.md and today's journal with generic file tools
  → worker returns a free-form two-line response
  → plugin parses the title
  → plugin renames the parent thread
  → plugin archives the worker
  → labels, task ID recovery, and convention corrections happen separately
```

The observed thread showed:

1. The parent agent bypassed the available plugin and directly patched the journal.
2. The user had to request an undo and explicitly require the plugin.
3. The plugin reported `failed or timed out` while its uncancelled worker continued.
4. The worker successfully created a Backlog task and journal pointer after the parent had received the failure result.
5. The parent manually read the worker thread and inspected both files to establish the real outcome.
6. The task ID was not returned by the plugin and had to be recovered separately.
7. The first `l-<serialized-id>` label exceeded Amp's 32-character limit.
8. The agent truncated the UUID representation without a documented collision-safe convention.
9. Project and customer labels required separate CLI work even though those values existed in the Logseq task.
10. The thread was renamed twice because the plugin's `[Project] task title` rule did not include the user's customer convention.

Later changes narrowed or extended the workflow:

- PR #108 removed the agent tool and kept the command-palette action
- PR #111 added Backlog project, working-project and customer labels

## Findings

### P0: correctness and data integrity

#### Explicit Logseq requests could bypass the capability

The registered tool description asked the model to use the tool when the user requested Logseq logging, but it did not enforce routing. A direct generic file edit could silently replace the intended workflow.

This was an original incident finding, but it is no longer a routing requirement. PR #108 removed the agent tool. Users now invoke logging from the command palette, and the plugin does not intercept agent turns or direct graph changes.

#### A timeout could disagree with the actual write state

The coordinator reported a terminal-looking failure while the worker was still active. The worker later wrote successfully. The plugin tried to find late responses, but a worker could still finish after the final grace period.

PR #98 reports an uncancelled or uncertain worker as `pending`. `Failed` now requires a terminal worker state or a validated failure result.

#### There was no explicit operation lifecycle

The workflow did not record each stage between worker creation and cleanup. The user could not clearly distinguish active work, a verified Logseq write, a rename failure, a label failure and an archive failure.

A minimal lifecycle needed to represent:

```text
created
→ running
→ pending | worker-result-received
→ logseq-complete | logseq-partial | failed
→ rename-complete | rename-failed
→ labels-complete | labels-failed
→ archive-complete | archive-failed
```

PR #98 records this lifecycle in memory. A plugin reload can still lose pending work because Amp provides no operation store or way to list child threads.

A later recovery change keeps the in-memory lifecycle but saves the parent and worker IDs in a disposable temporary checkpoint. After a reload, another command invocation reconnects to that worker, replays its latest result, validates Logseq again and safely reattempts all 3 downstream setters. The guarantee starts only after the checkpoint is committed, so uncertain creation before that point remains outside it.

#### Concurrent calls and retries could create duplicate writers

The worker prompt told the agent to avoid duplicate tasks by parent thread ID. The coordinator could still start another worker for the same parent. A prompt cannot prevent this race.

PR #98 records one operation for each parent thread before waiting for network work. It handles each state change in order. Concurrent calls return the current status. Retries use the same worker while work remains active or uncertain.

#### The Backlog and journal update is not transactional

The worker uses general file tools to change 2 Markdown files. One change can succeed while the other fails. Another graph change can also make a patch invalid.

The architecture still has no file transaction. PR #98 instead makes the worker read both files after writing. It reports a verified Backlog-only result as partial. A retry must repair existing parent-linked state before creating anything.

#### Logseq write status was conflated with downstream status

The coordinator treated title parsing, parent rename and worker archive as one success path. It could report the whole workflow as failed after a successful Logseq write.

The result needed to preserve separate statuses for:

- Logseq write
- parent thread rename
- parent thread labels
- worker archive

PR #98 makes these separate stages. A successful Logseq write stays successful when rename, labelling or archive fails. A later command invocation retries only unfinished work.

#### Control flow depended on free-form text and English error strings

The plugin used a regular expression to extract `Thread title:` from assistant prose. It also identified timeouts by matching English text such as `Timed out waiting for agent response`.

PR #98 replaced prose with an exact, versioned JSON result. It uses typed worker state when Amp provides it. One helper contains the 2 English timeout checks that remain necessary.

### P1: complete the end-to-end workflow

#### The plugin did not return the Logseq task ID

The parent needs the generated task ID to link the Amp thread back to Logseq. The worker's required response does not include it. The parent must inspect the graph or worker transcript to recover it.

The structured result should return the task ID, task state, Backlog location, and journal location.

The parent-owned Task workflow now requires this metadata in Task's done report.

#### Amp labels are outside the logging operation

The worker already determines `project::`, `customer::` and `id::`. The plugin does not use them to label the parent thread. The user needs separate turns and CLI commands.

PR #111 added Backlog project, working-project and customer labels. PR #98 carries them in the strict worker result and applies them as an independent downstream stage. A label failure does not erase Logseq completion or block worker archive.

The task-ID link label remains open because its encoding is not defined.

#### Task-ID label serialization is undefined

Removing hyphens from a UUID produces 32 characters. Adding `l-` exceeds Amp's 32-character label limit. Truncating the value loses information and creates a collision risk.

The Logseq canonical rules should define one collision-safe compact encoding, such as base64url encoding of the UUID bytes without padding.

#### Thread title and customer conventions are missing from canonical Logseq rules

The plugin-derived title used `[Project] task title`, while the observed required title was `[Presales] DEX - <title>`.

Add a canonical Logseq page such as `pages/Amp Thread Rules.md`. Link it from `pages/Canonical Pages.md` and define:

- project title patterns
- customer aliases used in titles
- normalized project and customer labels
- task-ID label encoding

Task should read this page through the canonical-page workflow rather than embedding user conventions in TypeScript.

#### Recovery metadata remains too manual

PR #98 reconciled pending and partial P0 operation state. PR #111 supplied project and customer labels. The parent-owned Task workflow now returns task identity and file locations. Customer-aware title conventions remain open.

### P2: reasoning cost and worker design

#### `high` is compensating for an under-structured workflow

The hidden worker had to reconstruct intent, resolve redirects and interpret canonical pages. It also had to choose a task, edit 2 files and verify the result. The implementation kept it on `high` while it owned all these decisions and changes.

The current workflow removes the fixed `high` worker. The active parent agent interprets its live conversation, then delegates bounded file and metadata work through native Task.

#### Full-thread reconstruction is unconditional

The worker must call `read_thread` even when the hint contains a complete task summary and source links. Long or multi-topic threads increase response time, token use and timeout risk.

The parent-owned Task workflow resolves this finding. The parent writes a standalone brief from its active conversation context, and Task uses that brief as its primary intent source. When `read_thread` is available, Task may use it to resolve a specific missing fact rather than reconstructing the whole task.

#### Canonical lookup uses broad general-purpose reads and searches

The worker read several complete pages and ran several searches before writing. A direct canonical index could find the project rules, customer alias, naming rule, priority and Backlog section with less work.

### P3: operational robustness and maintainability

#### The fallback graph path is machine-specific

The plugin defaults to `/Users/lelouvincx/Developer/second-brain-logseq`. Other machines and orbs fail later inside the worker.

Prefer explicit environment configuration, then project-registry resolution, then a clear configuration failure.

#### “Today” depends on the plugin process timezone

The journal filename is derived from `new Date()` in the runtime process. A remote process or orb can disagree with the user's local date.

The graph or plugin configuration should specify the journal timezone explicitly.

#### Worker registry cleanup was undefined

Before PR #98, the plugin added worker IDs to an in-memory set and never removed them. The operation store now removes fully completed and terminal failed operations while retaining active and pending ownership.

The parent-owned Task workflow removes the worker registry and operation store. Task completes inside the parent turn.

#### Archive policy depended on unrelated downstream success

Workers were archived only after title extraction and rename succeeded. A completed write with a downstream failure could remain open indefinitely.

PR #98 made archive an independent operation stage and attempts it after verified Logseq completion even when rename fails.

The parent-owned Task workflow creates no addressable worker thread, so it has no archive stage.

#### Tests covered only a narrow timeout slice

Before PR #98, tests covered 3 `waitForWorkerResponse` cases. The focused suite now covers ordered state changes, uncertain creation and message delivery, pending state, partial writes, strict results, same-worker repair, later-action failures and registry cleanup. Task metadata, timezone and graph resolution remain open.

## Decisions and scope

The investigation first set these boundaries:

- support manual command-palette invocation only; do not register an agent tool or agent-turn routing hooks
- keep Backlog-first logging followed by a short journal pointer
- keep the `high` worker while one general-purpose agent reconstructs intent, applies rules, changes 2 files and verifies the result
- preserve PR #111 project and customer labels as a separate downstream stage
- store user-specific titles, customer aliases and task-ID rules in the Logseq graph, linked from `pages/Canonical Pages.md`
- keep task identity and user-specific naming rules outside P0
- recover ownership across plugin reloads only after the disposable parent-to-worker checkpoint is committed
- do not claim durable ownership before checkpoint commit or that the coordinator independently verifies the graph's meaning
- let the worker follow Amp's native tool policy; Oracle prohibition is not part of the Logseq reliability contract

The parent-owned Task change keeps manual command-palette invocation and Backlog-first logging. It replaces the other runtime boundaries:

- the command queues one normal turn in the active parent thread
- the parent interprets its live context and writes a standalone Task brief
- Task owns Logseq writes, file read-back and parent metadata updates
- Task returns task identity and verification evidence to the parent
- the parent checks the result and reports completion in the same thread
- retries run as later parent turns and inspect existing parent-linked state before writing

## Resolution status

| Finding | Priority | Status | Resolution |
| --- | --- | --- | --- |
| In-thread agent routing | P0 | Superseded | PR #108 removed the agent tool; logging is command-only |
| Truthful timeout state | P0 | Superseded | No hidden worker wait remains; the normal parent turn reports Task outcome |
| Explicit operation lifecycle | P0 | Superseded | Task completes inside the parent turn; the command only confirms queued delivery |
| Duplicate active writers | P0 | Resolved | Parent turns run in order and every Task inspects parent-linked state before mutation |
| Two-file partial state | P0 | Resolved within Task trust boundary | Task re-reads both files and a later invocation repairs existing state |
| Downstream status conflation | P0 | Resolved | Task reports file verification and parent metadata separately to the parent |
| Free-form control protocol | P0 | Superseded | The plugin no longer parses agent output; the parent checks Task's done report |
| Project and customer labels | P1 | Resolved | Task derives and applies these labels after Logseq verification |
| Task identity | P1 | Resolved | Task returns the UUID, title, state and file locations to the parent |
| Task-link label | P1 | Open | Requires collision-safe UUID encoding |
| Customer-aware title rules | P1 | Open | Must be defined in the Logseq canonical map |
| Worker reasoning cost and context fidelity | P2 | Resolved | Parent interprets live context and sends Task a standalone brief |
| Graph resolution and timezone | P3 | Open | Requires explicit portable configuration |
| Registry cleanup and archive policy | P3 | Superseded | The current workflow has no hidden worker registry or archive stage |

## Follow-up

1. Add canonical Amp thread rules inside the Logseq graph for task-ID encoding, customer aliases and title patterns.
2. Apply the task-link label and customer-aware title from those canonical rules.
3. Add portable graph resolution and an explicit journal timezone.
4. Replace broad canonical page reads with a direct canonical index when lookup cost becomes material.

## Validation

A parent-owned Task implementation must meet these criteria:

- the command appends one normal user turn to the active thread
- the queued prompt requires built-in Task and a standalone parent-authored brief
- the prompt makes original intent, redirects, outcome, decisions, next action and links explicit brief inputs
- Task treats the parent-authored brief as its primary intent source and limits any available `read_thread` fallback to a specific missing fact
- Task searches for an existing parent-linked task before mutation
- Task writes Backlog first and adds a journal pointer to the same UUID
- Task re-reads both files before updating parent metadata
- Task returns task identity, file locations and separate verification results
- the parent inspects the Task result and reports completion or a precise blocker
- cancellation and missing-thread paths append no logging turn
- command delivery failure is reported without claiming that work was queued

PR #98 added focused tests for the former hidden-worker coordinator. The current focused suite tests prompt construction, command delivery, cancellation and failure reporting.

A full command-palette test must confirm that the active parent agent calls Task with a context-rich brief and reports Task's verified result.

Later work should test task-link encoding, customer-aware titles, timezone behavior and graph resolution.

## Maintenance notes

Maintain this issue as follows:

- preserve Trigger, Original intent and Evidence as historical facts
- update Findings, Resolution status, Follow-up and `updated` when work resolves or replaces an item
- keep current runtime behaviour in the command capability document
- keep the frontmatter aligned with the [issue schema](./_schema.md)
- keep all implementation paths valid
