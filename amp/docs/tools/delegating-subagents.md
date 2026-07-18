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
  user_gate: "description match, explicit skill load, or repository instruction before delegation"
  constraints:
    - "Prefer direct or specialist tools when delegation overhead exceeds the task."
    - "Use Claude Code, Claude Design, and Pi subagents only when the user explicitly requests the named specialist."
    - "Treat Claude Code and Pi as read-only advisers; Amp applies and verifies any proposed changes."
    - "Treat Claude Design as a cloud design write tool, not a read-only adviser or local implementation worker."
    - "Treat side questions introduced with 'btw' or triggered with '|btw' as delegation requests so the parent can preserve its current task."
    - "Use built-in Task for bounded work whose result is needed in the current turn."
    - "Use spawn_subagent only for durable asynchronous work, visible child-thread history, or possible parent follow-up."
    - "Use subagent_control only for explicit inspection, diagnosis, or cancellation; do not poll spawned children for completion."
    - "The parent remains responsible for synthesis, integration, and final verification."
  risks:
    - "Choosing asynchronous delegation for ordinary in-turn work adds unnecessary coordination overhead."
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
| The parent needs the delegated result in this turn | use built-in `Task` |
| The work needs an addressable child thread, asynchronous execution or later follow-up | use `spawn_subagent` |

Task difficulty does not decide between `Task` and `spawn_subagent`. The lifecycle does.

## Invocation

- Surface: agent context
- Source: `skills/delegating-subagents/SKILL.md`
- Invocation: description match or explicit skill load
- ID: `delegating-subagents`

Repository instructions require loading this skill before delegating work.

## Contract

The skill receives the current task and its coordination needs from conversation context. It returns instructions for choosing one of these paths:

1. Work directly or use a specialist tool when it already covers the task.
2. Use the named Claude Code, Claude Design or Pi subagent when the user explicitly requests it.
3. Use built-in `Task` when bounded delegated work must return during the current turn.
4. Use `spawn_subagent` when work needs durable asynchronous execution, visible child-thread history, or possible parent follow-up.

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

The skill first checks for an explicit named-specialist request. Otherwise, it checks whether delegation is worthwhile. It then separates in-turn work from durable asynchronous work.

It applies the same safety rules to both mechanisms. Briefs must be bounded, parallel work must be independent, and the parent owns integration and final checks.

### Delegate side questions

A side question introduced with `btw` or `|btw` always makes delegation worthwhile. Delegating it lets the parent preserve its current task.

Remove the trigger from the delegated brief. Use built-in `Task` when the answer is needed now. Use `spawn_subagent` when the question can report later or may need follow-up.

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
| Run two independent checks whose results are both needed now | Parallel built-in `Task` calls | The work is independent and remains in-turn. |
| Implement an independent slice while the parent continues shaping the design | `spawn_subagent` | The work benefits from a durable child thread and asynchronous reporting. |
| Run durable delegated work in an Amp Orb or on a known live runner | `spawn_subagent` with `executor` | Select `orb` or pass the runner's stable ID; do not pass a local `cwd` to remote execution. |
| Investigate a slice that may require a later product or architecture decision from the parent | `spawn_subagent` | The child can remain open for required follow-up. |
| "Ask an agent to check this" with no asynchronous or durable-thread requirement | Built-in `Task` | Generic requests for an agent do not imply `spawn_subagent`. |
| “Btw, why does this test use a fake clock?” or `\|btw why does this test use a fake clock?` | Built-in `Task` by default | The aside must not displace the parent's current task; delegate the question after removing the trigger. |
| A `btw` aside that can report later or may need parent follow-up | `spawn_subagent` | The aside is delegated, and its lifecycle benefits from a durable child thread. |
| "Spawn a subagent", "run this in parallel", `/subagent`, or `\|subagent` | `spawn_subagent` | The user explicitly selected the durable asynchronous mechanism. Bound the brief before invoking it. |
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
- generic “agent” wording selects built-in `Task`; explicit spawn or parallel-thread wording selects `spawn_subagent`
- parallelism requires independent work and non-overlapping writes
- the parent always owns decisions, synthesis, integration, and final verification

## Troubleshooting

- Skill unavailable: confirm `skills/delegating-subagents/SKILL.md` exists and run `./sync-skills.sh`.
- Named specialist not selected: confirm the user explicitly requested Claude Code, Claude Design or Pi. Generic agent wording does not qualify.
- Wrong delegation mechanism selected: compare whether the result is needed in the current turn or requires a durable child thread.
- Spawned child needs inspection or cancellation: use `subagent_control`; do not repeatedly query it for completion.
- Parallel edits conflict: delegate only independent slices with non-overlapping write targets.

## Maintenance notes

This document is the source of truth for the skill artifact. Keep it aligned with `skills/delegating-subagents/SKILL.md`, the named specialist subagent contracts, the `spawn-subagent` and `subagent-control` capability documents, and repository instructions that require loading the skill before delegation.
