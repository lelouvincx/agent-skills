# Logseq plugin capability: problems and priorities

## Trigger

This investigation started from the real workflow in [Amp thread T-019f63f5](https://ampcode.com/threads/T-019f63f5-d4b8-76e8-870e-b6ec96584a2d), beginning with the request:

> log this into logseq today journal, keep TODO

The parent agent initially edited the journal directly. After the user required the Logseq plugin, the plugin spawned [worker thread T-019f6417](https://ampcode.com/threads/T-019f6417-0880-755e-bc60-ce2faebe753d). The plugin reported a timeout, but the worker later completed both Logseq writes. Further user turns were needed to recover the task ID, add Amp labels, and correct the parent thread title.

The source discussion and current implementation handoff are in [Amp thread T-019f6428](https://ampcode.com/threads/T-019f6428-596b-70ce-ae87-1a13d907cbb5) and draft PR #98.

## Problem statement

The capability should turn an explicit request to log the current Amp task into one reliable, inspectable workflow. The user should be able to tell whether Logseq was updated, whether the operation is still running, and which downstream Amp metadata actions succeeded.

Instead, the current workflow distributes responsibility across the parent agent, a plugin coordinator, a general-purpose high-mode worker, free-form worker output, and separate Amp CLI commands. This creates ambiguous completion state, weak retry guarantees, partial results, and repeated manual recovery.

## Current workflow and observed evidence

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

## Agreed decisions and non-problems

- Backlog-first logging followed by a short journal pointer is expected behavior. It is not a problem and must remain the default.
- The explicit `high` worker remains appropriate for the current fully agentic workflow. It should only be reconsidered after intent handling, canonical lookup, result validation, and file mutation become more structured.
- User-specific thread title, customer alias, and label conventions should live in the Logseq graph, linked from `pages/Canonical Pages.md`. They should not be hard-coded in the plugin.
- P0 covers correctness and data integrity. Task-ID output, Amp labels, and user-specific naming conventions are P1 follow-up work.

## P0: correctness and data integrity

### Explicit Logseq requests can bypass the capability

The registered tool description asks the model to use the tool when the user requests Logseq logging, but it does not enforce routing. A direct generic file edit can silently replace the intended workflow.

The implementation must determine what the Amp plugin API can enforce safely. It must not intercept unrelated file edits or invent unsupported lifecycle hooks. If reliable interception is unavailable, the platform boundary should be documented and the narrowest effective agent-visible contract strengthened.

### A timeout can disagree with the actual write state

The incident produced a terminal-looking failure result while the worker remained active and later wrote successfully. The current plugin contains later response-reconciliation logic, but a worker can still finish after the final grace window.

An uncancelled active worker must produce `pending`, not `failed`. `Failed` should mean that the operation can no longer write or that a verified failure result was consumed.

### There is no explicit operation lifecycle

The capability does not model the stages between worker creation and cleanup. This makes it difficult to distinguish an active writer, a verified Logseq write, a rename failure, and an archive failure.

A minimal lifecycle should represent:

```text
created
→ running
→ pending | worker-result-received
→ logseq-complete | logseq-partial | failed
→ rename-complete | rename-failed
→ archive-complete | archive-failed
```

If the Amp plugin API offers no durable store, an in-memory lifecycle is acceptable initially, but restart limitations must be stated honestly.

### Concurrent calls and retries can create duplicate writers

The worker prompt asks the agent to deduplicate by parent thread ID, but the coordinator can still spawn another worker for the same parent while the first is active. Agent prompt compliance is not a concurrency guarantee.

The coordinator should reuse or reconcile an existing pending operation for the same parent thread instead of launching a second writer.

### The Backlog and journal update is not transactional

The worker uses generic file tools to mutate two Markdown files. One write can succeed while the other fails, or concurrent graph changes can invalidate patch context.

The current architecture may not support a real filesystem transaction. It should nevertheless require verification of both writes, report a partial result explicitly, and make reconciliation update missing state rather than create another task.

### Logseq write status is conflated with downstream status

The current coordinator treats title parsing, parent rename, and worker archive as one success path. A completed Logseq write followed by rename or archive failure is therefore presented as a broad workflow failure.

The result should preserve separate statuses for:

- Logseq write
- parent thread rename
- worker archive

A successful durable write must remain successful even when downstream metadata or cleanup fails.

### Control flow depends on free-form text and English error strings

The plugin extracts `Thread title:` from assistant prose with a regular expression. It also classifies timeouts by matching English substrings such as `Timed out waiting for agent response`.

The worker result should be strictly machine-parseable and validated before downstream actions. Typed Amp status or error information should be preferred where available. Any unavoidable message-string compatibility fallback should be isolated, documented, and tested.

## P1: complete the end-to-end workflow

### The plugin does not return the Logseq task ID

The generated task ID is required to link the Amp thread back to Logseq, but it is absent from the worker's required final response. The parent must inspect the graph or worker transcript to recover it.

The structured result should return the task ID, task state, Backlog location, and journal location.

### Amp labels are outside the logging operation

The worker already determines `project::`, `customer::`, and `id::`, but the plugin does not use them to label the parent thread. Separate user turns and CLI commands are required.

After P0 establishes a structured result, the plugin should apply canonical task-link, project, and customer labels as downstream actions with their own statuses.

### Task-ID label serialization is undefined

Removing hyphens from a UUID produces 32 characters; adding `l-` exceeds Amp's 32-character label limit. Truncating the value loses information and creates avoidable collision risk.

The Logseq canonical rules should define one collision-safe compact encoding, such as base64url encoding of the UUID bytes without padding.

### Thread title and customer conventions are missing from canonical Logseq rules

The plugin currently derives `[Project] task title`, while the observed required title was `[Presales] DEX - <title>`.

Add a canonical Logseq page such as `pages/Amp Thread Rules.md`, link it from `pages/Canonical Pages.md`, and define:

- project title patterns
- customer aliases used in titles
- normalized project and customer labels
- task-ID label encoding

The worker should read this page through the existing canonical-page workflow rather than embedding user conventions in TypeScript.

### Recovery is too manual

The incident required reading the worker thread, inspecting two files, steering cleanup, adding labels, and renaming the parent. A later invocation should be able to inspect and reconcile a pending or partial operation automatically.

## P2: reasoning cost and worker design

### `high` is compensating for an under-structured workflow

The current worker must reconstruct intent, resolve redirects, interpret canonical pages, choose or update a task, edit files, and verify the result. Keeping it on `high` is reasonable while it owns all of that judgment and mutation.

However, `read_thread` has already performed semantic compression before the worker maps the result to canonical rules. Once the workflow has structured context, deterministic lookup, a validated result, and a constrained writer, normal cases should be benchmarked on `medium`. `High` can remain an escalation path for conflicting redirects, multiple plausible backlog matches, unclear state, or conflicting taxonomy.

### Full-thread reconstruction is unconditional

The worker must call `read_thread` even when the parent hint may already contain a complete task summary and source links. Long or multi-topic threads increase latency, token use, and timeout risk.

A future structured parent payload can act as a candidate result that `read_thread` verifies or enriches instead of forcing the worker to rediscover every detail.

### Canonical lookup uses broad general-purpose reads and searches

The observed worker read several complete pages and ran multiple searches before writing. A more direct canonical index could identify the relevant project rules, customer alias, naming convention, priority, and Backlog section with less search work.

## P3: operational robustness and maintainability

### The fallback graph path is machine-specific

The plugin defaults to `/Users/lelouvincx/Developer/second-brain-logseq`. Other machines or orbs fail later inside the worker.

Prefer explicit environment configuration, then project-registry resolution, then a clear configuration failure.

### “Today” depends on the plugin process timezone

The journal filename is derived from `new Date()` in the runtime process. A remote process or orb can disagree with the user's local date.

The graph or plugin configuration should specify the journal timezone explicitly.

### Worker IDs remain in memory indefinitely

The plugin adds worker IDs to an in-memory set and never removes them. Terminal operations should clean up registry entries while retaining safe identification for active or pending workers.

### Archive policy depends on unrelated downstream success

Workers are archived only after title extraction and rename succeed. A completed write with a downstream failure can remain open indefinitely.

Archival should follow explicit operation state and retention policy rather than the all-or-nothing success path.

### Tests cover only a narrow timeout slice

The current tests focus on three `waitForWorkerResponse` cases. They do not cover invocation routing, concurrent retries, pending state, partial writes, malformed worker results, downstream failures, task metadata, timezone, graph resolution, or registry cleanup.

## Proposed implementation order

1. Implement and test the P0 operation state model.
2. Return `pending` for active workers and reconcile same-parent retries without spawning another writer.
3. Introduce and validate a machine-readable worker result.
4. Require explicit verification of both Logseq mutations and distinguish partial state.
5. Separate Logseq, rename, and archive outcomes.
6. Add the P1 canonical Amp-thread rules page inside the Logseq graph.
7. Return task metadata and apply Amp labels and title from those canonical rules.
8. Reduce broad context and canonical lookup work.
9. Benchmark ordinary structured cases on `medium`; retain `high` for ambiguous cases if evidence supports it.
10. Address graph resolution, timezone, registry cleanup, and archival policy.

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

Later phases should add coverage for task-ID output and encoding, canonical customer-aware titles and labels, timezone behavior, graph resolution, and worker registry cleanup.
