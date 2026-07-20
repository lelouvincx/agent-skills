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
updated: "2026-07-18"
amp_thread_id:
  T-019f63f5-d4b8-76e8-870e-b6ec96584a2d: "incident thread containing the original Logseq logging request and recovery"
  T-019f6417-0880-755e-bc60-ce2faebe753d: "worker thread that completed Logseq writes after the coordinator reported a timeout"
  T-019f6428-596b-70ce-ae87-1a13d907cbb5: "investigated the incident and defined the prioritized reliability scope"
  T-019f645f-41cb-7434-a0d9-d9d4d88fa5c3: "reviewed and tightened the P0 implementation plan"
  T-019f644b-4e40-7721-be21-ad60c2cfd428: "organized the issue record and revised its scope after the command-only change"
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

[PR #108](https://github.com/lelouvincx/agent-skills/pull/108) removed the agent-callable tool on 18 July 2026 because the command works on Amp Web. In-thread requests are no longer part of the supported contract. The command must still solve worker lifecycle and data integrity problems.

PR #98 now applies its process-scoped coordinator and worker-attested read-back checks to the command only. [PR #111](https://github.com/lelouvincx/agent-skills/pull/111) also adds parent project and customer labels. Task identity, customer-aware titles, worker cost, graph configuration and timezone behaviour remain open.

The current contract is [Logseq: log current task command](../tools/logseq-log-current-task-command.md). This issue remains the source of truth for historical evidence, revised intent, decisions and follow-up.

## Trigger

[Amp thread T-019f63f5](https://ampcode.com/threads/T-019f63f5-d4b8-76e8-870e-b6ec96584a2d) triggered this investigation. It began with the request:

> log this into logseq today journal, keep TODO

The parent agent edited the journal directly. The user then required the Logseq plugin. The plugin started [worker thread T-019f6417](https://ampcode.com/threads/T-019f6417-0880-755e-bc60-ce2faebe753d) and reported a timeout. The worker later completed both Logseq writes.

The user needed further turns to recover the task ID, add Amp labels and correct the parent thread title.

The source investigation is [Amp thread T-019f6428](https://ampcode.com/threads/T-019f6428-596b-70ce-ae87-1a13d907cbb5). The reviewed P0 design was implemented in [PR #98](https://github.com/lelouvincx/agent-skills/pull/98).

PR #108 later removed the agent tool and retained the command-palette workflow. [Amp thread T-019f644b](https://ampcode.com/threads/T-019f644b-4e40-7721-be21-ad60c2cfd428) revised this issue to reflect that decision.

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

#### The plugin does not return the Logseq task ID

The parent needs the generated task ID to link the Amp thread back to Logseq. The worker's required response does not include it. The parent must inspect the graph or worker transcript to recover it.

The structured result should return the task ID, task state, Backlog location, and journal location.

#### Amp labels are outside the logging operation

The worker already determines `project::`, `customer::` and `id::`. The plugin does not use them to label the parent thread. The user needs separate turns and CLI commands.

PR #111 added Backlog project, working-project and customer labels. PR #98 carries them in the strict worker result and applies them as an independent downstream stage. A label failure does not erase Logseq completion or block worker archive.

The task-ID link label remains open because its encoding is not defined.

#### Task-ID label serialization is undefined

Removing hyphens from a UUID produces 32 characters. Adding `l-` exceeds Amp's 32-character label limit. Truncating the value loses information and creates a collision risk.

The Logseq canonical rules should define one collision-safe compact encoding, such as base64url encoding of the UUID bytes without padding.

#### Thread title and customer conventions are missing from canonical Logseq rules

The plugin currently derives `[Project] task title`, while the observed required title was `[Presales] DEX - <title>`.

Add a canonical Logseq page such as `pages/Amp Thread Rules.md`. Link it from `pages/Canonical Pages.md` and define:

- project title patterns
- customer aliases used in titles
- normalized project and customer labels
- task-ID label encoding

The worker should read this page through the existing canonical-page workflow rather than embedding user conventions in TypeScript.

#### Recovery metadata remains too manual

PR #98 reconciles pending and partial P0 operation state automatically. PR #111 supplies project and customer labels. Recovering task identity and enforcing customer-aware title conventions still requires separate work.

### P2: reasoning cost and worker design

#### `high` is compensating for an under-structured workflow

The current worker must reconstruct intent, resolve redirects and interpret canonical pages. It must also choose a task, edit 2 files and verify the result. Keep it on `high` while it owns all of these decisions and changes.

`read_thread` already summarises the parent thread before the worker applies canonical rules. Test normal cases on `medium` after the workflow has structured context, direct lookup, validated results and limited write actions. Keep `high` for conflicting redirects, several possible Backlog matches, unclear state or conflicting rules.

#### Full-thread reconstruction is unconditional

The worker must call `read_thread` even when the hint contains a complete task summary and source links. Long or multi-topic threads increase response time, token use and timeout risk.

A future structured parent payload can act as a candidate result that `read_thread` verifies or enriches instead of forcing the worker to rediscover every detail.

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

#### Archive policy depended on unrelated downstream success

Workers were archived only after title extraction and rename succeeded. A completed write with a downstream failure could remain open indefinitely.

PR #98 made archive an independent operation stage and attempts it after verified Logseq completion even when rename fails.

#### Tests covered only a narrow timeout slice

Before PR #98, tests covered 3 `waitForWorkerResponse` cases. The focused suite now covers ordered state changes, uncertain creation and message delivery, pending state, partial writes, strict results, same-worker repair, later-action failures and registry cleanup. Task metadata, timezone and graph resolution remain open.

## Decisions and scope

The investigation set these boundaries:

- support manual command-palette invocation only; do not register an agent tool or agent-turn routing hooks
- keep Backlog-first logging followed by a short journal pointer
- keep the `high` worker while one general-purpose agent reconstructs intent, applies rules, changes 2 files and verifies the result
- preserve PR #111 project and customer labels as a separate downstream stage
- store user-specific titles, customer aliases and task-ID rules in the Logseq graph, linked from `pages/Canonical Pages.md`
- keep task identity and user-specific naming rules outside P0
- limit the P0 ownership guarantee to one plugin process and rely on worker-attested read-back checks
- do not claim durable ownership across plugin reloads or that the coordinator independently verifies the graph's meaning

## Resolution status

| Finding | Priority | Status | Resolution |
| --- | --- | --- | --- |
| In-thread agent routing | P0 | Superseded | PR #108 removed the agent tool; logging is command-only |
| Truthful timeout state | P0 | Resolved | Active and uncertain operations report pending |
| Explicit operation lifecycle | P0 | Resolved | Parent-scoped in-memory operation store |
| Duplicate active writers | P0 | Resolved within one plugin load | Ordered create, append, consume, rename, label and archive transitions |
| Two-file partial state | P0 | Resolved within worker trust boundary | Exact result plus post-write read-back attestation and repair |
| Downstream status conflation | P0 | Resolved | Independent Logseq, rename, labels and archive outcomes |
| Free-form control protocol | P0 | Resolved | Strict versioned JSON and isolated timeout compatibility |
| Project and customer labels | P1 | Resolved | PR #111 labels are part of the strict result and a retryable stage |
| Task identity and task-link label | P1 | Open | Requires structured task metadata and collision-safe encoding |
| Customer-aware title rules | P1 | Open | Must be defined in the Logseq canonical map |
| Worker reasoning cost | P2 | Open | Benchmark only after inputs, lookup, and writes become more structured |
| Graph resolution and timezone | P3 | Open | Requires explicit portable configuration |
| Registry cleanup, archive policy, and focused lifecycle tests | P3 | Resolved | Delivered by PR #98 |

## Follow-up

1. Add canonical Amp thread rules inside the Logseq graph for task-ID encoding, customer aliases and title patterns.
2. Add task identity and locations to the worker result. Then apply the task-link label and customer-aware title as separate actions.
3. Add portable graph resolution and an explicit journal timezone.
4. Reduce context and canonical lookup work. Then test normal structured cases on `medium` while keeping `high` for unclear cases.

## Validation

A P0 implementation must meet these criteria:

- a running worker timeout returns `pending`
- a completed response is reconciled
- concurrent or repeated calls for the same parent reuse one operation
- successful Logseq write plus rename failure preserves Logseq success
- successful Logseq write plus label failure preserves Logseq success and still attempts archive
- successful Logseq write plus archive failure preserves Logseq success
- malformed worker output is rejected without misreporting a write
- partial Backlog/journal state is reported and can be reconciled
- timeout compatibility fallback is isolated and tested
- every create, append, result-consumption, rename, label and archive transition is handled in order
- ambiguous worker creation or message delivery remains pending without launching duplicate work
- only a fresh assistant message can satisfy the current worker turn
- the plugin registers the command and a `tool.call` Oracle guard, but does not add agent-turn routing or automatic logging
- a failed downstream stage can be retried without another Logseq write

PR #98 added focused tests in `amp/scripts/logseq-manual-log.test.ts`. It also passed document validation, plugin builds, isolated projection and live projection.

Execute mode does not expose `agent.createThread`, so a full command-palette worker test remains open.

Later work should test task-ID output and encoding, customer-aware titles, timezone behaviour and graph resolution.

## Maintenance notes

Maintain this issue as follows:

- preserve Trigger, Original intent and Evidence as historical facts
- update Findings, Resolution status, Follow-up and `updated` when work resolves or replaces an item
- keep current runtime behaviour in the command capability document
- keep the frontmatter aligned with the [issue schema](./_schema.md)
- keep all implementation paths valid
