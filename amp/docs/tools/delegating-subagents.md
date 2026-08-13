---
doc_schema: "amp-artifact/v2"
title: "Delegating Subagents"
slug: "delegating-subagents"
status: "active"
summary: "Guides agents to choose direct work, a specialist, built-in Task, create_thread, or spawn_subagent based on user intent and delegation needs."
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
  last_verified: "2026-08-10"
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
    - "oracle"
    - "claude_code_subagent"
    - "claude_design_subagent"
    - "pi_code_subagent"
    - "built-in Task"
    - "built-in create_thread"
    - "spawn_subagent"
    - "subagent_control"
  dependencies:
    - "Claude Code subagent capability contract"
    - "Claude Design subagent capability contract"
    - "Pi Code subagent capability contract"
    - "built-in create_thread contract"
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
    - "Keep the default oracle available for focused expert judgment; Ultra review complements rather than replaces it."
    - "When diversity matters, choose the reviewer whose current model or provider differs from the parent to reduce correlated model bias; do not assume routing stays fixed."
    - "Treat Ultra as a mode choice, not a reason to select spawn_subagent."
    - "An ultra review brief must be read-only and include the exact change-set evidence when line-level fidelity matters."
    - "Give every delegated task a bounded brief with scope, constraints and non-goals, success criteria, validation, and a completion contract."
    - "Require a done report with evidence or a blocked report naming the smallest parent input needed; verify the result and close gaps directly or through a focused follow-up."
    - "Ask the user when a blocked child or the parent needs input only the user can provide; neither the parent nor the child may guess."
    - "Use Claude Code, Claude Design, and Pi subagents only when the user explicitly requests the named specialist."
    - "Treat Claude Code and Pi as read-only advisers; Amp applies and verifies any proposed changes."
    - "Treat Claude Design as a cloud design write tool, not a read-only adviser or local implementation worker."
    - "Treat side questions introduced with 'btw' or triggered with '|btw' as delegation requests so the parent can preserve its current task."
    - "Use built-in Task by default for bounded one-shot work, including independent Task calls that run concurrently within one parent turn."
    - "Use built-in create_thread for normal addressable cross-turn work when it is available and its executor can see the required state."
    - "Use spawn_subagent when its managed-local controls or an explicit spawn request are required, or as the addressable fallback when create_thread is unavailable and the selected executor can see the required state."
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
| The parent needs a focused expert second opinion on a hard judgment call, tricky review, alternative analysis or complex plan | use `oracle` |
| The parent needs a full independent review of completed work using Ultra's current model routing | use an Ultra-mode child thread and choose its mechanism from the required controls |
| The parent needs bounded one-shot work, including concurrent independent calls within this turn | use built-in `Task` |
| The work needs a normal addressable child thread, cross-turn reporting, later messaging, an Orb, a runner or another project | use built-in `create_thread` when its executor can see the required state |
| The work needs local workspace state, an arbitrary local `cwd`, Oracle rejection, active cancellation, mandatory parent-intent reconstruction, managed reporting and archiving, or an addressable fallback when `create_thread` is unavailable | use `spawn_subagent` when its executor can see the required state |

Default Oracle and an Ultra reviewer are complementary. Use Oracle for a focused expert opinion. Use Ultra for a full review of completed work when its current routing provides an independent perspective. When diversity matters, choose the reviewer whose current model or provider differs from the parent. This can reduce correlated model bias. Do not assume routing stays fixed.

Ultra selects review capability, not thread creation. Choose `create_thread` or `spawn_subagent` from lifecycle and control needs. Do not choose `spawn_subagent` only because the child uses Ultra mode.

## Invocation

- Surface: agent context
- Source: `skills/delegating-subagents/SKILL.md`
- Invocation: description match or explicit skill load
- ID: `delegating-subagents`

Repository instructions require agents to consider delegation before non-trivial work. Agents load this skill when delegation could reduce latency or preserve the parent thread's focus.

## Contract

The skill receives the current task and its coordination needs from conversation context.

It returns instructions for choosing one path. The decision order is the Summary table above: resolve specialist tools and explicit named-specialist requests first, then Oracle, then Ultra review capability, then decisive `spawn_subagent` requirements, then `create_thread` for normal addressable cross-turn work, with `spawn_subagent` as the addressable fallback and built-in `Task` for ordinary bounded one-shot delegation.

The skill declares no tool allowlist.

### Use named specialist subagents

Named specialist subagents are explicit-only exceptions to the normal delegation choice:

| User request | Tool | Boundary |
| --- | --- | --- |
| Use Claude or Claude Code | `claude_code_subagent` | Read-only review, patch proposal or research. Amp makes and verifies edits. |
| Use Claude Design | `claude_design_subagent` | May create or modify a cloud-hosted Claude Design project. It cannot edit local files. |
| Use Pi, pi.dev or Pi Coding Agent | `pi_code_subagent` | Read-only review, patch proposal or research. Amp makes and verifies edits. |

Do not substitute one named specialist for another. Do not invoke any of them without the matching explicit user request.

### Choose an addressable child mechanism

Choose the mechanism from the controls the task needs. Ultra mode does not decide this choice.

| Need | Mechanism |
| --- | --- |
| Normal cross-turn work, later messaging, an Orb, a runner, another project or an Ultra review whose state is available there | built-in `create_thread` |
| Local workspace state, an arbitrary local `cwd`, hard Oracle rejection, active-turn cancellation, mandatory `read_thread` reconstruction or managed reporting and archiving | `spawn_subagent` |
| An explicit `/subagent`, `|subagent` or “spawn a subagent” request | `spawn_subagent` |

Use the native route only when `create_thread` is available in the current surface and its executor can see the required workspace state. If either condition fails, use `spawn_subagent` when its executor can see that state. Otherwise, keep the work in the parent.

For a native child, use one completion path: ask the child to reply and continue without waiting, or omit the reply request and use `wait_for_threads` when progress depends on its result. Never combine both paths. Inspect the outcome with `read_thread` before treating it as successful.

### Choose where a managed child runs

Choose the execution target only after choosing `spawn_subagent`:

| Need | Target |
| --- | --- |
| Use the parent's current machine and working directory | local execution, which is the default |
| Use an Amp cloud sandbox | Orb execution |
| Use a known live Amp runner | runner execution with its stable ID |

Orb children use the Orb workspace. Runner children use the selected runner's workspace. Do not pass a parent-machine `cwd` to either remote target.

`spawn_subagent` cannot discover runners. Use only a stable runner ID supplied by the user or existing context.

See [Choose where the subagent runs](./spawn-subagent.md#choose-where-the-subagent-runs) for the full `executor` and `cwd` contract.

### Control a child

Use `thread_interact` for native child messaging and metadata. Use `subagent_control` only for a child created by `spawn_subagent` when the user asks to inspect, diagnose or cancel it.

Normal managed-child completion arrives through `send_to_thread`. Do not poll while waiting.

## Behavior

Repository instructions contain the stable delegation rules that agents need before loading this skill. Agents consider independent, bounded workstreams before non-trivial work. They keep simple reads, searches, localised edits and unresolved design decisions in the parent. They also recognise explicit subagent and side-question triggers.

The skill contains the detailed routing rules. It first checks whether direct work or a specialist already covers the task. For child work, it resolves decisive `spawn_subagent` requirements before the broader `create_thread` branch. It uses built-in `Task` for ordinary bounded work that does not need an addressable thread.

Default Oracle remains the focused expert path for hard judgment calls, tricky reviews, alternative analysis and complex plans. An Ultra child provides a full review of completed work with an isolated agent. Its current routing can also add an independent perspective. Neither path replaces the other. When diversity matters, choose the reviewer whose current model or provider differs from the parent. This can reduce correlated model bias. Do not assume routing stays fixed.

Ultra mode does not select the child-thread mechanism. The review brief must prohibit edits, state the intended behavior, include exact change-set evidence when line-level fidelity matters, and ask for high-confidence findings only. The parent integrates the result before it treats the review as complete.

It applies the same safety rules to every mechanism. Each brief defines its scope, constraints and non-goals, success criteria, validation, and completion contract. The completion contract requires either a done report with evidence or a blocked report naming the smallest parent input needed. When a child reports blocked, or a required input is one only the user can provide, the parent asks the user rather than guessing.

The parent checks the result against the success criteria. If a criterion is not met, the parent closes the gap directly or uses a focused follow-up supported by the mechanism. This feedback is event-driven: agents do not poll spawned children for completion.

### Delegate side questions

A side question introduced with `btw` or `|btw` always makes delegation worthwhile. Delegating it lets the parent preserve its current task.

Remove the trigger from the delegated brief. Use built-in `Task` by default, including when the parent continues useful work in the same turn. Use `create_thread` when the question must report across parent turns or needs later messaging or follow-up and its executor can see the required state. If it is unavailable or cannot see the state, use `spawn_subagent` when that wrapper can.

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
| Get a focused second opinion on a genuinely hard judgment call, tricky review or complex plan | `oracle` | Expert judgment is needed without the lifecycle of a full child thread. |
| Review completed work with Ultra's current model routing | Ultra-mode child thread | Choose `create_thread` or `spawn_subagent` from the required lifecycle and controls. |
| "Ask Claude Code to review this diff" | `claude_code_subagent` | The user explicitly selected the read-only Claude Code adviser. |
| "Use Claude Design to create this design" | `claude_design_subagent` | The user explicitly authorised the cloud design workflow and its possible cloud writes. |
| "Ask Pi to propose a patch" | `pi_code_subagent` | The user explicitly selected the read-only Pi adviser. |
| Investigate a bounded failure whose result determines the current response | Built-in `Task` | The parent needs the result before this turn can finish. |
| Run two independent checks while the parent does other useful work in the same turn | Concurrent built-in `Task` calls | Each Task returns one final summary before the parent turn ends. |
| Implement a bounded independent slice while the parent continues shaping the design in the same turn | Built-in `Task` | Concurrent work within a turn does not need an addressable child thread. |
| Run durable delegated work in an Amp Orb, on a known live runner or in another project | Built-in `create_thread` | Native threads support these normal execution targets. |
| Investigate a slice that may require a later product or architecture decision from the parent | Built-in `create_thread` | The child can remain open for required follow-up. |
| "Ask an agent to check this" or "run this in parallel" | Built-in `Task` | Generic agent wording and concurrency alone do not imply an addressable child thread. |
| “Btw, why does this test use a fake clock?” or `\|btw why does this test use a fake clock?` | Built-in `Task` by default | The aside must not displace the parent's current task; delegate the question after removing the trigger. |
| A `btw` aside that can report later or may need parent follow-up | Built-in `create_thread` | The aside benefits from a normal addressable child thread. |
| "Spawn a subagent", `/subagent`, or `\|subagent` | `spawn_subagent` | The user explicitly selected an addressable child thread. Bound the brief before invoking it. |
| "Which subagents are running?" | `subagent_control` with `list` | Return a point-in-time view of child states and report statuses without waiting. |
| "Check that subagent" | `subagent_control` with `status` | Return that child's point-in-time state, report status, and report summary without waiting. |
| "Stop that subagent" | `subagent_control` with `cancel` | Stop the owned child's active turn without archiving or deleting its thread. |
| Two workers would edit the same file or depend on each other's uncommitted changes | Do not parallelize | Overlapping writes are not independent; use one worker or work directly. |
| The parent has not decided what should be built | Keep designing in the parent | Do not delegate understanding or ask a worker to choose the product direction. |
| The result is neither needed now nor useful as durable follow-up | Do not delegate | There is no useful coordination outcome. |

An explicit mechanism request wins over the default decision order unless it would create unsafe or overlapping work. An explicit `spawn_subagent` request still needs a bounded brief.

## Troubleshooting

- Skill unavailable: confirm `skills/delegating-subagents/SKILL.md` exists and run `./sync-skills.sh`.
- Hard judgment used the wrong review path: use default Oracle for a focused expert opinion. Use an Ultra-mode child for a full independent review of completed work, then choose its mechanism from the required controls.
- Review lacks model diversity: choose the reviewer whose current model or provider differs from the parent. Do not assume routing stays fixed.
- Named specialist not selected: confirm the user explicitly requested Claude Code, Claude Design or Pi. Generic agent wording does not qualify.
- Wrong delegation mechanism selected: resolve `spawn_subagent` requirements first. Otherwise use `create_thread` for normal addressable work when it is available and can see the required state, falling back to `spawn_subagent` when that wrapper can see the state. Use `Task` for ordinary one-turn work.
- Native child completion is ambiguous: choose either an asynchronous reply or `wait_for_threads`. Never use both, and inspect the outcome with `read_thread`.
- Spawned child needs inspection or cancellation: use `subagent_control`; do not repeatedly query it for completion.
- Parallel edits conflict: delegate only independent slices with non-overlapping write targets.

## Maintenance notes

This document is the source of truth for the skill artifact. Keep detailed routing rules in the skill and only stable delegation rules in repository instructions. Keep both aligned with default Oracle, mechanism-neutral Ultra reviews, built-in `create_thread`, and the managed-local `spawn_subagent` wrapper. Also keep them aligned with named specialist contracts and the `spawn-subagent` and `subagent-control` capability documents. The skill intentionally omits lifecycle rules that built-in tool descriptions already carry, such as the Task, create_thread and wait_for_threads completion contracts. The skill has no quick-test section and keeps only the ambiguous stress cases; the examples table in this document remains the full maintainer-facing set.
