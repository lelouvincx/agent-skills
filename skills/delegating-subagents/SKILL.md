---
name: delegating-subagents
description: "Chooses between direct work, Amp's built-in Task tool, and spawn_subagent. Use before delegating or splitting independent work across agents, including side questions introduced with 'btw' or triggered with '|btw'."
---

# Delegating Subagents

Choose the delegation mechanism from what the parent needs next.

The source of truth for these rules is the [Delegating Subagents artifact document](../../amp/docs/tools/delegating-subagents.md). Keep it aligned with the related [Spawn Subagent capability document](../../amp/docs/tools/spawn-subagent.md).

## Decision

1. Use a direct or specialist tool when it already covers the job or delegation overhead is greater than the task. Do not delegate exact reads, simple searches, one localized edit, or work owned by `finder`, `librarian`, or `oracle`.
2. Use built-in `Task` for ordinary bounded delegation when the parent needs the result in the current turn. The worker returns one final summary through the current tool call.
3. Use `spawn_subagent` when the work needs durable asynchronous execution, visible child-thread history, or possible parent follow-up. It creates an addressable child thread that reports back later through `send_to_thread`.

Additionally, when the user introduces a side question with `btw` or triggers `|btw`, delegate that question so it does not displace the parent's current task. Remove the trigger from the delegated brief. This is a request to delegate, not a request for a specific mechanism: use built-in `Task` by default when the answer is needed now, or `spawn_subagent` when it should run asynchronously or may need later follow-up.

## Constraints

- Delegate only a bounded task with scope, constraints, expected output, and validation.
- Treat Task workers as isolated: include the context they need because they start without the parent conversation.
- Do not wait for or poll `spawn_subagent`; continue useful parent work.
- Use parallel subagents only for independent work. Avoid concurrent edits to overlapping files.
- The parent owns synthesis, integration, and final verification.

## Quick test

Ask in order:

1. Does a direct or specialist tool cover the job, or is the task too small to delegate? → use that tool or work directly.
2. Does the work need durable asynchronous execution, visible child-thread history, or possible parent follow-up? → `spawn_subagent`.
3. Is bounded delegation still worthwhile and its result needed in the current turn? → `Task`.

## Stress cases

- “Btw, why does this test use a fake clock?” or `|btw why does this test use a fake clock?` → delegate with built-in `Task` by default, after removing the trigger.
- A `btw` aside that can report later or may need parent follow-up → `spawn_subagent`.
- “Ask an agent” or “use a subagent” without an asynchronous requirement → built-in `Task`.
- “Spawn a subagent”, “run this in parallel”, `/subagent`, or `|subagent` → `spawn_subagent`; the user explicitly selected the durable mechanism.
- Two independent results needed now → parallel built-in `Task` calls.
- Work continuing while the parent designs, or work that may need later parent input → `spawn_subagent`.
- Two workers editing the same file or depending on each other's changes → do not parallelize.
- Product direction is undecided → keep designing in the parent; do not delegate understanding.

Explicit mechanism requests override the default decision order unless they would create unsafe or overlapping writes. Task difficulty alone never decides between built-in `Task` and `spawn_subagent`; lifecycle does.
