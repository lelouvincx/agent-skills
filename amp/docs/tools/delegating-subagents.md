---
doc_schema: "amp-artifact/v2"
title: "Delegating Subagents"
slug: "delegating-subagents"
status: "active"
summary: "Guides agents to choose direct work, a specialist subagent, built-in Task, or spawn_subagent based on user intent and delegation lifecycle."
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
  last_verified: "2026-07-23"
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
    - "claude_code_subagent"
    - "claude_design_subagent"
    - "pi_code_subagent"
    - "built-in Task"
    - "spawn_subagent"
    - "subagent_control"
  dependencies:
    - "Claude Code subagent capability contract"
    - "Claude Design subagent capability contract"
    - "Pi Code subagent capability contract"
    - "spawn-subagent capability contract"
    - "subagent-control capability contract"
  env: []
  reads:
    - "current task scope and coordination requirements"
  writes: []
  network: []
  logs: []
safety:
  permission_level: "guidance-only"
  user_gate: "description match, explicit skill load, or repository instruction to evaluate delegation"
  constraints:
    - "Before non-trivial work, consider whether independent bounded workstreams make delegation worthwhile."
    - "Prefer direct or specialist tools when delegation overhead exceeds the task."
    - "Give every delegated task a bounded brief with scope, constraints and non-goals, success criteria, validation, and a completion contract."
    - "Require a done report with evidence or a blocked report naming the smallest parent input needed; verify the result and close gaps directly or through a focused follow-up."
    - "Use Claude Code, Claude Design, and Pi subagents only when the user explicitly requests the named specialist."
    - "Treat Claude Code and Pi as read-only advisers; Amp applies and verifies any proposed changes."
    - "Treat Claude Design as a cloud design write tool, not a read-only adviser or local implementation worker."
    - "Treat side questions introduced with 'btw' or triggered with '|btw' as delegation requests so the parent can preserve its current task."
    - "Use built-in Task by default for bounded one-shot work, including independent Task calls that run concurrently within one parent turn."
    - "Use spawn_subagent only for an addressable child thread, cross-turn execution or reporting, later messaging or required follow-up, visible control and diagnosis, explicit spawn requests, or custom execution targets."
    - "Use subagent_control only for explicit inspection, diagnosis, or cancellation; do not poll spawned children for completion."
    - "The parent remains responsible for synthesis, integration, and final verification."
  risks:
    - "Choosing a cross-turn child thread for ordinary in-turn work adds unnecessary coordination overhead."
    - "Concurrent agents editing overlapping files can create conflicting changes."
related:
  - "claude-code-subagent"
  - "claude-design-subagent"
  - "pi-code-subagent"
  - "spawn-subagent"
tags:
  - "skill"
  - "delegation"
  - "subagent"
  - "coordination"
---

# Delegating Subagents

## Summary

Choose the delegation mechanism from what the parent needs next:

| Parent need | Choice |
| --- | --- |
| The task is small or a specialist tool already covers it | work directly or use the specialist tool |
| The user explicitly asks for Claude or Claude Code advice | use `claude_code_subagent` |
| The user explicitly asks to use Claude Design | use `claude_design_subagent` |
| The user explicitly asks for Pi, pi.dev or Pi Coding Agent advice | use `pi_code_subagent` |
| The parent needs bounded one-shot work, including concurrent independent calls within this turn | use built-in `Task` |
| The work needs an addressable child thread, cross-turn reporting, later messaging, visible control or a custom execution target | use `spawn_subagent` |

Task difficulty does not decide between `Task` and `spawn_subagent`. The lifecycle does.

## Invocation

- Surface: agent context
- Source: `skills/delegating-subagents/SKILL.md`
- Invocation: description match or explicit skill load
- ID: `delegating-subagents`

Repository instructions require agents to consider delegation before non-trivial work. Agents load this skill when delegation could reduce latency or preserve the parent thread's focus.

## Contract

The skill receives the current task and its coordination needs from conversation context. It returns instructions for choosing one of these paths:

1. Work directly or use a specialist tool when it already covers the task.
2. Use the named Claude Code, Claude Design or Pi subagent when the user explicitly requests it.
3. Use built-in `Task` by default for bounded one-shot delegation. The parent turn stays open until each Task returns one final summary. This includes multiple independent Task calls running concurrently.
4. Use `spawn_subagent` for an exposed, addressable child thread. Choose it for execution or reporting across parent turns, later parent-child messaging, required follow-up, visible history, status, cancellation or diagnosis, explicit spawn requests, or custom local, Orb or runner selection.

The skill declares no tool allowlist.

### Use named specialist subagents

Named specialist subagents are explicit-only exceptions to the normal `Task` and `spawn_subagent` choice:

| User request | Tool | Boundary |
| --- | --- | --- |
| Use Claude or Claude Code | `claude_code_subagent` | Read-only review, patch proposal or research. Amp makes and verifies edits. |
| Use Claude Design | `claude_design_subagent` | May create or modify a cloud-hosted Claude Design project. It cannot edit local files. |
| Use Pi, pi.dev or Pi Coding Agent | `pi_code_subagent` | Read-only review, patch proposal or research. Amp makes and verifies edits. |

Do not substitute one named specialist for another. Do not invoke any of them without the matching explicit user request.

### Choose where a spawned child runs

Choose the execution target only after choosing `spawn_subagent`:

| Need | Target |
| --- | --- |
| Use the parent's current machine and working directory | local execution, which is the default |
| Use an Amp cloud sandbox | Orb execution |
| Use a known live Amp runner | runner execution with its stable ID |

Orb children use the Orb workspace. Runner children use the selected runner's workspace. Do not pass a parent-machine `cwd` to either remote target.

`spawn_subagent` cannot discover runners. Use only a stable runner ID supplied by the user or existing context.

See [Choose where the subagent runs](./spawn-subagent.md#choose-where-the-subagent-runs) for the full `executor` and `cwd` contract.

### Control a spawned child

Use `subagent_control` only when the user asks to list or inspect children, when a child needs diagnosis, or when an active child turn must be cancelled.

Normal completion arrives through `send_to_thread`. Do not poll while waiting.

## Behavior

Repository instructions contain the stable delegation rules that agents need before loading this skill. Agents consider independent, bounded workstreams before non-trivial work. They keep simple reads, searches, localised edits and unresolved design decisions in the parent. They also recognise explicit subagent and side-question triggers.

The skill contains the detailed routing rules. It first checks for an explicit named-specialist request. Otherwise, it checks whether delegation is worthwhile. It then separates concurrent work within one parent turn from work that needs an addressable cross-turn thread.

It applies the same safety rules to every mechanism. Each brief defines its scope, constraints and non-goals, success criteria, validation, and completion contract. The completion contract requires either a done report with evidence or a blocked report naming the smallest parent input needed.

The parent checks the result against the success criteria. If a criterion is not met, the parent closes the gap directly or uses a focused follow-up supported by the mechanism. This feedback is event-driven: agents do not poll spawned children for completion.

### Delegate side questions

A side question introduced with `btw` or `|btw` always makes delegation worthwhile. Delegating it lets the parent preserve its current task.

Remove the trigger from the delegated brief. Use built-in `Task` by default, including when the parent continues useful work in the same turn. Use `spawn_subagent` when the question must report across parent turns or needs later messaging or follow-up.

## Permissions and side effects

Loading the skill only adds instructions to agent context. The skill does not create threads, invoke tools, edit files, access the network or write logs.

Side effects start only when the agent invokes a delegation mechanism.

## Examples

### Test the decision

| Scenario | Choice | Why |
| --- | --- | --- |
| Read one known file, find one exact symbol, or make one localized edit | Direct work | Delegation costs more than the task. |
| Trace a behavior across several local modules | `finder` | A specialist search tool already owns the job. |
| Explain architecture in an external repository | `librarian` | External codebase understanding is specialist work. |
| Get a second opinion on a genuinely hard review or design decision | `oracle` | Expert judgment is needed, not a general worker. |
| "Ask Claude Code to review this diff" | `claude_code_subagent` | The user explicitly selected the read-only Claude Code adviser. |
| "Use Claude Design to create this design" | `claude_design_subagent` | The user explicitly authorised the cloud design workflow and its possible cloud writes. |
| "Ask Pi to propose a patch" | `pi_code_subagent` | The user explicitly selected the read-only Pi adviser. |
| Investigate a bounded failure whose result determines the current response | Built-in `Task` | The parent needs the result before this turn can finish. |
| Run two independent checks while the parent does other useful work in the same turn | Concurrent built-in `Task` calls | Each Task returns one final summary before the parent turn ends. |
| Implement a bounded independent slice while the parent continues shaping the design in the same turn | Built-in `Task` | Concurrent work within a turn does not need an addressable child thread. |
| Run durable delegated work in an Amp Orb or on a known live runner | `spawn_subagent` with `executor` | Select `orb` or pass the runner's stable ID; do not pass a local `cwd` to remote execution. |
| Investigate a slice that may require a later product or architecture decision from the parent | `spawn_subagent` | The child can remain open for required follow-up. |
| "Ask an agent to check this" or "run this in parallel" | Built-in `Task` | Generic agent wording and concurrency alone do not imply `spawn_subagent`. |
| “Btw, why does this test use a fake clock?” or `\|btw why does this test use a fake clock?` | Built-in `Task` by default | The aside must not displace the parent's current task; delegate the question after removing the trigger. |
| A `btw` aside that can report later or may need parent follow-up | `spawn_subagent` | The aside is delegated, and its lifecycle benefits from a durable child thread. |
| "Spawn a subagent", `/subagent`, or `\|subagent` | `spawn_subagent` | The user explicitly selected an addressable child thread. Bound the brief before invoking it. |
| "Which subagents are running?" | `subagent_control` with `list` | Return a point-in-time view of child states and report statuses without waiting. |
| "Check that subagent" | `subagent_control` with `status` | Return that child's point-in-time state, report status, and report summary without waiting. |
| "Stop that subagent" | `subagent_control` with `cancel` | Stop the owned child's active turn without archiving or deleting its thread. |
| Two workers would edit the same file or depend on each other's uncommitted changes | Do not parallelize | Overlapping writes are not independent; use one worker or work directly. |
| The parent has not decided what should be built | Keep designing in the parent | Do not delegate understanding or ask a worker to choose the product direction. |
| The result is neither needed now nor useful as durable follow-up | Do not delegate | There is no useful coordination outcome. |

An explicit mechanism request wins over the default decision order unless it would create unsafe or overlapping work. An explicit `spawn_subagent` request still needs a bounded brief.

Keep these rules:

- explicit Claude Code, Claude Design and Pi requests select their matching specialist tool
- never invoke these named specialist subagents from generic “agent” or “subagent” wording
- Claude Code and Pi stay read-only; Claude Design may write only to its cloud-hosted projects
- lifecycle decides between built-in `Task` and `spawn_subagent`, not task difficulty alone
- natural `btw` side questions and the `|btw` trigger mark work for delegation; they do not select a delegation mechanism
- generic “agent” wording and “run this in parallel” select built-in `Task`; explicit `/subagent`, `|subagent` or “spawn a subagent” wording selects `spawn_subagent`
- concurrent work requires independent tasks and non-overlapping writes
- the parent always owns decisions, synthesis, integration, and final verification

## Troubleshooting

- Skill unavailable: confirm `skills/delegating-subagents/SKILL.md` exists and run `./sync-skills.sh`.
- Named specialist not selected: confirm the user explicitly requested Claude Code, Claude Design or Pi. Generic agent wording does not qualify.
- Wrong delegation mechanism selected: use `Task` for ordinary one-shot work, including concurrent calls within a turn. Use `spawn_subagent` only when the work needs an addressable cross-turn thread or custom execution target.
- Spawned child needs inspection or cancellation: use `subagent_control`; do not repeatedly query it for completion.
- Parallel edits conflict: delegate only independent slices with non-overlapping write targets.

## Maintenance notes

This document is the source of truth for the skill artifact. Keep detailed routing rules in the skill and only the stable delegation rules in repository instructions. Keep both aligned with the distinction between concurrent Task calls within a turn and addressable cross-turn child threads. Also keep them aligned with the named specialist subagent contracts and the `spawn-subagent` and `subagent-control` capability documents.
