---
name: delegating-subagents
description: "Chooses between direct work, Amp's built-in Task tool, and spawn_subagent. Use before delegating or splitting independent work across agents."
---

# Delegating Subagents

Choose the delegation mechanism from what the parent needs next.

The source of truth for these rules is the [Spawn Subagent capability document](../../amp/docs/tools/spawn-subagent.md). Update that document before changing this skill.

## Decision

1. Use a direct or specialist tool when it already covers the job or delegation overhead is greater than the task. Do not delegate exact reads, simple searches, one localized edit, or work owned by `finder`, `librarian`, or `oracle`.
2. Use built-in `Task` for ordinary bounded delegation when the parent needs the result in the current turn. The worker returns one final summary through the current tool call.
3. Use `spawn_subagent` when the work needs durable asynchronous execution, visible child-thread history, or possible parent follow-up. It creates an addressable child thread that reports back later through `send_to_thread`.

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
