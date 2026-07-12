---
name: delegating-subagents
description: "Chooses between Amp's built-in Task tool and spawn_subagent. Use whenever considering delegation, subagents, parallel agent work, background work, or splitting a coding task across agents."
---

# Delegating Subagents

Choose the delegation mechanism from what the parent needs next.

The source of truth for these rules is the [Spawn Subagent capability document](../../amp/docs/tools/spawn-subagent.md). Update that document before changing this skill.

## Decision

1. Use built-in `Task` when the parent needs the result before it can continue. The worker returns one final summary inside the current turn.
2. Use `spawn_subagent` when the task is independent and the parent should keep working. It creates an addressable child thread that reports back later through `send_to_thread`.
3. Do the work directly when delegation overhead is greater than the task. Do not delegate exact reads, simple searches, or one localized edit.

## Constraints

- Delegate only a bounded task with scope, constraints, expected output, and validation.
- Treat Task workers as isolated: include the context they need because they start without the parent conversation.
- Do not wait for or poll `spawn_subagent`; continue useful parent work.
- Use parallel subagents only for independent work. Avoid concurrent edits to overlapping files.
- The parent owns synthesis, integration, and final verification.

## Quick test

Ask: **Can the parent make useful progress before this result arrives?**

- No → `Task`
- Yes → `spawn_subagent`
- The task is tiny → neither
