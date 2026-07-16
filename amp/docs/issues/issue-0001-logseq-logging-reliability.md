---
doc_schema: "amp-issue/v1"
code: "ISSUE-0001"
title: "Logseq logging reliability"
slug: "logseq-logging-reliability"
file: "issue-0001-logseq-logging-reliability.md"
status: "Partially resolved"
priority: "P0"
summary: "Preserves the intent, incident evidence, reliability decisions, and follow-up behind the Logseq logging lifecycle."
created: "2026-07-15"
updated: "2026-07-16"
amp_thread_id:
  T-019f63f5-d4b8-76e8-870e-b6ec96584a2d: "incident thread containing the original Logseq logging request and recovery"
  T-019f6417-0880-755e-bc60-ce2faebe753d: "worker thread that completed Logseq writes after the coordinator reported a timeout"
  T-019f6428-596b-70ce-ae87-1a13d907cbb5: "investigated the incident and defined the prioritized reliability scope"
  T-019f645f-41cb-7434-a0d9-d9d4d88fa5c3: "reviewed and tightened the P0 implementation plan"
artifacts:
  - "logseq-log-current-task"
  - "logseq-log-current-task-command"
implementation:
  - path: "../tools/logseq-log-current-task.md"
  - path: "../tools/logseq-log-current-task-command.md"
  - path: "../../plugins/logseq-manual-log.ts"
  - path: "../../scripts/logseq-manual-log.test.ts"
pull_requests:
  - "https://github.com/lelouvincx/agent-skills/pull/98"
related: []
tags:
  - "logseq"
  - "reliability"
  - "data-integrity"
  - "worker-lifecycle"
---

# ISSUE-0001: Logseq logging reliability

## Summary

This issue preserves why the Logseq logging contract exists. The incident exposed false terminal status, duplicate-writer risk, partial two-file state, direct capability bypass, and downstream status conflation. PR #98 resolves the P0 lifecycle and data-integrity findings with a process-scoped coordinator and worker-attested read-back verification. Metadata completeness, worker cost, graph configuration, and timezone behavior remain open.

The current contracts live in [Logseq: Log Current Task](../tools/logseq-log-current-task.md) and [Logseq: Log Current Task Command](../tools/logseq-log-current-task-command.md). This document remains the source of truth for original intent, historical evidence, accepted trade-offs, and follow-up.

## Trigger

This investigation started from the real workflow in [Amp thread T-019f63f5](https://ampcode.com/threads/T-019f63f5-d4b8-76e8-870e-b6ec96584a2d), beginning with the request:

> log this into logseq today journal, keep TODO

The parent agent initially edited the journal directly. After the user required the Logseq plugin, the plugin spawned [worker thread T-019f6417](https://ampcode.com/threads/T-019f6417-0880-755e-bc60-ce2faebe753d). The plugin reported a timeout, but the worker later completed both Logseq writes. Further user turns were needed to recover the task ID, add Amp labels, and correct the parent thread title.

The source investigation is [Amp thread T-019f6428](https://ampcode.com/threads/T-019f6428-596b-70ce-ae87-1a13d907cbb5). The reviewed P0 design was implemented in [PR #98](https://github.com/lelouvincx/agent-skills/pull/98).

## Original intent

The capability should turn an explicit request to log the current Amp task into one reliable, inspectable workflow. The user should be able to tell whether Logseq was updated, whether the operation is still running, and which downstream Amp metadata actions succeeded.

The intended guarantees are:

- explicit current-task Logseq requests use the logging capability rather than ad hoc graph edits;
- one operation owns active or unresolved work for each parent thread;
- an active or ambiguously accepted worker is reported as pending, never terminal failure;
- completion requires read-back verification of the parent-linked Backlog task and its matching journal pointer;
- Logseq, parent-thread rename, and worker archive outcomes remain independently inspectable;
- Backlog-first logging followed by a short journal pointer remains the canonical write pattern; and
- later phases can return task identity and apply Amp metadata without weakening the P0 lifecycle.

## Evidence

At the time of the incident, responsibility was distributed across the parent agent, a plugin coordinator, a general-purpose high-mode worker, free-form worker output, and separate Amp CLI commands:

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

## Findings

### P0: correctness and data integrity

#### Explicit Logseq requests could bypass the capability

The registered tool description asked the model to use the tool when the user requested Logseq logging, but it did not enforce routing. A direct generic file edit could silently replace the intended workflow.

PR #98 added turn-scoped guidance and rejected recognized graph mutations for explicit logging turns. Unknown mutation forms still fail open because the plugin API cannot identify every possible write safely.

#### A timeout could disagree with the actual write state

The incident produced a terminal-looking failure result while the worker remained active and later wrote successfully. The plugin contained response-reconciliation logic, but a worker could still finish after the final grace window.

PR #98 made an uncancelled or ambiguously accepted worker `pending`. `Failed` now requires a terminal typed worker state or a validated failure result.

#### There was no explicit operation lifecycle

The capability did not model the stages between worker creation and cleanup. This made it difficult to distinguish an active writer, a verified Logseq write, a rename failure, and an archive failure.

A minimal lifecycle needed to represent:

```text
created
→ running
→ pending | worker-result-received
→ logseq-complete | logseq-partial | failed
→ rename-complete | rename-failed
→ archive-complete | archive-failed
```

PR #98 implemented that lifecycle in memory and documented that plugin reload can lose pending-operation ownership because Amp exposes no dedicated operation store or child-thread enumeration.

#### Concurrent calls and retries could create duplicate writers

The worker prompt asked the agent to deduplicate by parent thread ID, but the coordinator could still spawn another worker for the same parent while the first was active. Agent prompt compliance was not a concurrency guarantee.

PR #98 synchronously records and serializes one operation per parent thread. Concurrent calls return its current snapshot, and retries reconcile the same worker while acceptance remains active or uncertain.

#### The Backlog and journal update is not transactional

The worker uses generic file tools to mutate two Markdown files. One write can succeed while the other fails, or concurrent graph changes can invalidate patch context.

The architecture still has no filesystem transaction. PR #98 instead requires post-write read-back of both files, reports verified Backlog-only state as partial, and constrains reconciliation to repair existing parent-linked state before creating anything.

#### Logseq write status was conflated with downstream status

The coordinator treated title parsing, parent rename, and worker archive as one success path. A completed Logseq write followed by rename or archive failure was therefore presented as a broad workflow failure.

The result needed to preserve separate statuses for:

- Logseq write
- parent thread rename
- worker archive

PR #98 made these independent stages. A successful durable write remains successful when rename or archive fails, and a later invocation retries only unfinished downstream work.

#### Control flow depended on free-form text and English error strings

The plugin extracted `Thread title:` from assistant prose with a regular expression. It also classified timeouts by matching English substrings such as `Timed out waiting for agent response`.

PR #98 replaced prose parsing with an exact versioned JSON result, uses typed worker state where available, and isolates the two unavoidable English timeout compatibility strings.

### P1: complete the end-to-end workflow

#### The plugin does not return the Logseq task ID

The generated task ID is required to link the Amp thread back to Logseq, but it is absent from the worker's required final response. The parent must inspect the graph or worker transcript to recover it.

The structured result should return the task ID, task state, Backlog location, and journal location.

#### Amp labels are outside the logging operation

The worker already determines `project::`, `customer::`, and `id::`, but the plugin does not use them to label the parent thread. Separate user turns and CLI commands are required.

After P0 establishes a structured result, the plugin should apply canonical task-link, project, and customer labels as downstream actions with their own statuses.

#### Task-ID label serialization is undefined

Removing hyphens from a UUID produces 32 characters; adding `l-` exceeds Amp's 32-character label limit. Truncating the value loses information and creates avoidable collision risk.

The Logseq canonical rules should define one collision-safe compact encoding, such as base64url encoding of the UUID bytes without padding.

#### Thread title and customer conventions are missing from canonical Logseq rules

The plugin currently derives `[Project] task title`, while the observed required title was `[Presales] DEX - <title>`.

Add a canonical Logseq page such as `pages/Amp Thread Rules.md`, link it from `pages/Canonical Pages.md`, and define:

- project title patterns
- customer aliases used in titles
- normalized project and customer labels
- task-ID label encoding

The worker should read this page through the existing canonical-page workflow rather than embedding user conventions in TypeScript.

#### Recovery metadata remains too manual

PR #98 now reconciles pending and partial P0 operation state automatically. Recovering task identity, applying labels, and enforcing customer-aware title conventions still requires separate work.

### P2: reasoning cost and worker design

#### `high` is compensating for an under-structured workflow

The current worker must reconstruct intent, resolve redirects, interpret canonical pages, choose or update a task, edit files, and verify the result. Keeping it on `high` is reasonable while it owns all of that judgment and mutation.

However, `read_thread` has already performed semantic compression before the worker maps the result to canonical rules. Once the workflow has structured context, deterministic lookup, a validated result, and a constrained writer, normal cases should be benchmarked on `medium`. `High` can remain an escalation path for conflicting redirects, multiple plausible backlog matches, unclear state, or conflicting taxonomy.

#### Full-thread reconstruction is unconditional

The worker must call `read_thread` even when the parent hint may already contain a complete task summary and source links. Long or multi-topic threads increase latency, token use, and timeout risk.

A future structured parent payload can act as a candidate result that `read_thread` verifies or enriches instead of forcing the worker to rediscover every detail.

#### Canonical lookup uses broad general-purpose reads and searches

The observed worker read several complete pages and ran multiple searches before writing. A more direct canonical index could identify the relevant project rules, customer alias, naming convention, priority, and Backlog section with less search work.

### P3: operational robustness and maintainability

#### The fallback graph path is machine-specific

The plugin defaults to `/Users/lelouvincx/Developer/second-brain-logseq`. Other machines or orbs fail later inside the worker.

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

Before PR #98, tests covered three `waitForWorkerResponse` cases. The focused suite now covers routing, operation serialization, ambiguous creation and append outcomes, pending state, partial writes, strict result validation, same-worker repair, downstream failures, and registry cleanup. Task metadata, timezone, and graph resolution remain later-phase concerns.

## Decisions and scope

- Backlog-first logging followed by a short journal pointer is expected behavior. It is not a problem and remains the default.
- The explicit `high` worker remains appropriate while one general-purpose agent reconstructs intent, resolves canonical rules, mutates two files, and verifies the result.
- User-specific title, customer alias, and label conventions belong in the Logseq graph, linked from `pages/Canonical Pages.md`; they must not be hard-coded in the plugin.
- P0 covers correctness and data integrity. Task identity, Amp labels, and user-specific naming conventions remain P1.
- The P0 guarantee is process-scoped and worker-attested. Durable ownership across plugin reloads and coordinator-side semantic parsing require stable task identity and are not claimed.
- Routing protection is deliberately narrow and fail-open outside recognized file mutations to avoid intercepting unrelated work.

## Resolution status

| Finding | Priority | Status | Resolution |
| --- | --- | --- | --- |
| Explicit-request routing | P0 | Resolved | Turn-scoped guidance and recognized graph-write rejection in PR #98 |
| Truthful timeout state | P0 | Resolved | Active and uncertain operations report pending |
| Explicit operation lifecycle | P0 | Resolved | Parent-scoped in-memory operation store |
| Duplicate active writers | P0 | Resolved within one plugin load | Serialized create, append, consume, rename, and archive transitions |
| Two-file partial state | P0 | Resolved within worker trust boundary | Exact result plus post-write read-back attestation and repair |
| Downstream status conflation | P0 | Resolved | Independent Logseq, rename, and archive outcomes |
| Free-form control protocol | P0 | Resolved | Strict versioned JSON and isolated timeout compatibility |
| Task identity and Amp labels | P1 | Open | Requires structured task metadata and canonical label rules |
| Customer-aware title rules | P1 | Open | Must be defined in the Logseq canonical map |
| Worker reasoning cost | P2 | Open | Benchmark only after inputs, lookup, and writes become more structured |
| Graph resolution and timezone | P3 | Open | Requires explicit portable configuration |
| Registry cleanup, archive policy, and focused lifecycle tests | P3 | Resolved | Delivered by PR #98 |

## Follow-up

1. Add canonical Amp thread rules inside the Logseq graph for task-ID encoding, labels, customer aliases, and title patterns.
2. Extend the structured worker result with task identity and locations, then apply labels and customer-aware title as independent downstream stages.
3. Add portable graph resolution and an explicit journal timezone.
4. Reduce broad context and canonical lookup work, then benchmark ordinary structured cases on `medium` while retaining `high` for ambiguity.

## Validation

P0 implementation should demonstrate at minimum:

- a running worker timeout returns `pending`
- a completed response is reconciled
- concurrent or repeated calls for the same parent reuse one operation
- successful Logseq write plus rename failure preserves Logseq success
- successful Logseq write plus archive failure preserves Logseq success
- malformed worker output is rejected without misreporting a write
- partial Backlog/journal state is reported and can be reconciled
- timeout compatibility fallback is isolated and tested
- every create, append, result-consumption, rename, and archive transition is serialized
- ambiguous worker creation or message delivery remains pending without launching duplicate work
- only a fresh assistant message can satisfy the current worker turn
- routing protection is turn-scoped, worker-exempt, path-contained, and fail-open for unknown mutations

PR #98 added focused coverage for the P0 acceptance criteria in `amp/scripts/logseq-manual-log.test.ts`, plus artifact validation, plugin builds, isolated projection, and live projection. Execute-mode routing reached the capability and preserved a disposable graph when worker creation was unavailable. A full interactive hidden-worker smoke remains the only runtime check not reproduced in execute mode because that context does not expose `agent.createThread`.

Later phases should add coverage for task-ID output and encoding, canonical customer-aware titles and labels, timezone behavior, and graph resolution.

## Maintenance notes

- Preserve the Trigger, Original intent, and Evidence sections as historical facts. Do not rewrite them to match current behavior.
- Update Findings, Resolution status, Follow-up, and `updated` when later work resolves or supersedes an item.
- Keep current runtime behavior in the two capability docs, not here.
- Keep the frontmatter aligned with [`_schema.md`](./_schema.md) and the implementation paths valid.
