---
doc_schema: "amp-artifact/v2"
title: "Delegating Subagents"
slug: "delegating-subagents"
status: "active"
summary: "Guides agents to delegate side questions and choose built-in Task or spawn_subagent based on lifecycle and coordination needs."
artifact:
  id: "delegating-subagents"
  type: "skill"
  surface: "agent_context"
  invocation: "skill_load"
  api_stability: "stable"
source:
  kind: "skill"
  file: "skills/delegating-subagents/SKILL.md"
  scope: "system"
  install_source: "local"
  registration_api: null
  metadata_comments: []
amp:
  docs_sources:
    api_docs: null
    agent_options: null
  last_verified: "2026-07-12"
contract:
  input_kind: "natural_language"
  output_kind: "instructions"
  trigger: "description_match_or_explicit_load"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "direct and specialist tools"
    - "built-in Task"
    - "spawn_subagent"
  dependencies:
    - "spawn-subagent capability contract"
  env: []
  reads:
    - "current task scope and coordination requirements"
  writes: []
  network: []
  logs: []
safety:
  permission_level: "guidance-only"
  user_gate: "description match, explicit skill load, or repository instruction before delegation"
  constraints:
    - "Prefer direct or specialist tools when delegation overhead exceeds the task."
    - "Treat questions framed as an aside with 'btw', '/btw', or '|btw' as delegation requests so the parent can preserve its current task."
    - "Use built-in Task for bounded work whose result is needed in the current turn."
    - "Use spawn_subagent only for durable asynchronous work, visible child-thread history, or possible parent follow-up."
    - "The parent remains responsible for synthesis, integration, and final verification."
  risks:
    - "Choosing asynchronous delegation for ordinary in-turn work adds unnecessary coordination overhead."
    - "Concurrent agents editing overlapping files can create conflicting changes."
related:
  - "spawn-subagent"
tags:
  - "skill"
  - "delegation"
  - "subagent"
  - "coordination"
---

# Delegating Subagents

## Summary

`delegating-subagents` provides the reusable decision rules for choosing direct work, Amp's built-in `Task`, or the `spawn_subagent` capability. It keeps ordinary bounded delegation in the current turn and reserves durable child threads for work that benefits from asynchronous execution or later parent follow-up.

## Invocation

- Surface: agent context
- Source: `skills/delegating-subagents/SKILL.md`
- Invocation: description match or explicit skill load
- ID: `delegating-subagents`

Repository instructions require loading this skill before delegating work.

## Contract

The skill receives the current task and its coordination requirements through conversation context. It returns instructions for selecting one of three paths:

1. Work directly or use a specialist tool when it already covers the task.
2. Use built-in `Task` when bounded delegated work must return during the current turn.
3. Use `spawn_subagent` when work needs durable asynchronous execution, visible child-thread history, or possible parent follow-up.

The skill declares no tool allowlist.

## Behavior

The skill first tests whether delegation is worthwhile. A question framed as an aside with `btw`, `/btw`, or `|btw` always makes delegation worthwhile because the parent should preserve its current task. The skill delegates the question after removing the trigger, using built-in `Task` by default when the answer is needed now or `spawn_subagent` when the aside should run asynchronously or may need later follow-up. It then applies constraints for bounded briefs, independent parallel work, parent-owned integration, and final verification.

## Permissions and side effects

Loading the skill only adds instructions to agent context. The skill itself does not create threads, invoke tools, edit files, access the network, or write logs. Side effects occur only if the agent subsequently chooses and invokes a delegation mechanism.

## Examples

- Reading one known file: work directly.
- Running a bounded test investigation needed before the current response: use built-in `Task`.
- Implementing an independent slice that should report back to a continuing coordinator thread: use `spawn_subagent`.

### Scenario stress test

| Scenario | Choice | Why |
| --- | --- | --- |
| Read one known file, find one exact symbol, or make one localized edit | Direct work | Delegation costs more than the task. |
| Trace a behavior across several local modules | `finder` | A specialist search tool already owns the job. |
| Explain architecture in an external repository | `librarian` | External codebase understanding is specialist work. |
| Get a second opinion on a genuinely hard review or design decision | `oracle` | Expert judgment is needed, not a general worker. |
| Investigate a bounded failure whose result determines the current response | Built-in `Task` | The parent needs the result before this turn can finish. |
| Run two independent checks whose results are both needed now | Parallel built-in `Task` calls | The work is independent and remains in-turn. |
| Implement an independent slice while the parent continues shaping the design | `spawn_subagent` | The work benefits from a durable child thread and asynchronous reporting. |
| Investigate a slice that may require a later product or architecture decision from the parent | `spawn_subagent` | The child can remain open for required follow-up. |
| "Ask an agent to check this" with no asynchronous or durable-thread requirement | Built-in `Task` | Generic requests for an agent do not imply `spawn_subagent`. |
| “Btw, why does this test use a fake clock?”, `/btw why does this test use a fake clock?`, or `\|btw why does this test use a fake clock?` | Built-in `Task` by default | The aside must not displace the parent's current task; delegate the question after removing the trigger. |
| A `btw` aside that can report later or may need parent follow-up | `spawn_subagent` | The aside is delegated, and its lifecycle benefits from a durable child thread. |
| "Spawn a subagent", "run this in parallel", `/subagent`, or `\|subagent` | `spawn_subagent` | The user explicitly selected the durable asynchronous mechanism. Bound the brief before invoking it. |
| Two workers would edit the same file or depend on each other's uncommitted changes | Do not parallelize | Overlapping writes are not independent; use one worker or work directly. |
| The parent has not decided what should be built | Keep designing in the parent | Do not delegate understanding or ask a worker to choose the product direction. |
| The result is neither needed now nor useful as durable follow-up | Do not delegate | There is no useful coordination outcome. |

An explicit mechanism request wins over the default decision order, unless it would create an unsafe or overlapping write. Explicit `spawn_subagent` requests still need a bounded brief; they do not justify broad delegation.

The stress-test invariants are:

- lifecycle decides between built-in `Task` and `spawn_subagent`, not task difficulty alone
- `btw`, `/btw`, and `|btw` mark a side question for delegation; they do not select a delegation mechanism
- generic “agent” wording selects built-in `Task`; explicit spawn or parallel-thread wording selects `spawn_subagent`
- parallelism requires independent work and non-overlapping writes
- the parent always owns decisions, synthesis, integration, and final verification

## Troubleshooting

- Skill unavailable: confirm `skills/delegating-subagents/SKILL.md` exists and run `./sync-skills.sh`.
- Wrong delegation mechanism selected: compare whether the result is needed in the current turn or requires a durable child thread.
- Parallel edits conflict: delegate only independent slices with non-overlapping write targets.

## Maintenance notes

This document is the source of truth for the skill artifact. Keep it aligned with `skills/delegating-subagents/SKILL.md`, the related `spawn-subagent` capability document, and repository instructions that require loading the skill before delegation.
