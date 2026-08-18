---
doc_schema: "amp-artifact/v2"
title: "Delegating Subagents"
slug: "delegating-subagents"
status: "active"
summary: "Guides agents to choose direct work, specialist tools, Task, or create_thread, then manage native child-thread follow-up and completion."
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
  last_verified: "2026-08-18"
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
    - "built-in thread_interact"
    - "built-in wait_for_threads"
    - "built-in read_thread"
  dependencies:
    - "built-in Task contract"
    - "built-in create_thread contract"
    - "built-in thread lifecycle tools"
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
    - "Prefer direct or specialist tools when delegation overhead exceeds the task."
    - "Give every delegated task a bounded brief with scope, constraints, non-goals, success criteria, validation, and a completion contract."
    - "Use Task for bounded work whose result is needed in the current parent turn."
    - "Use create_thread for addressable cross-turn work whose selected executor can see the required state."
    - "Choose exactly one create_thread result path: asynchronous reply or blocking wait."
    - "Use thread_interact for native follow-up and metadata operations."
    - "Use wait_for_threads and read_thread when the parent must block for and inspect a complete child result."
    - "Ask the user when a child or parent needs input only the user can provide."
    - "Use Claude Code, Claude Design, and Pi subagents only when the user explicitly requests the named specialist."
    - "The parent remains responsible for synthesis, integration, and final verification."
  risks:
    - "Choosing a cross-turn child thread for ordinary in-turn work adds unnecessary coordination overhead."
    - "An Orb cannot see uncommitted local state unless that state is transferred or otherwise made available."
    - "Concurrent agents editing overlapping files can create conflicting changes."
    - "Native thread_interact does not currently expose active-turn cancellation."
related:
  - "claude-code-subagent"
  - "claude-design-subagent"
  - "pi-code-subagent"
tags:
  - "skill"
  - "delegation"
  - "subagent"
  - "coordination"
---

# Delegating Subagents

## Summary

Choose the smallest mechanism that gives the parent the result and lifecycle it needs:

| Parent need | Choice |
| --- | --- |
| The task is small or a specialist tool already owns it | work directly or use the specialist tool |
| The result is needed before the current parent turn can finish | built-in `Task` |
| The work needs an addressable thread, later messaging, cross-turn reporting, another project, an Orb, or a runner | built-in `create_thread` |
| The parent needs a focused expert judgment on one unresolved high-impact decision | `oracle` |
| The user explicitly asks for Claude Code, Claude Design, or Pi | the matching named specialist |

`Task` and `create_thread` are the generic delegation paths. Do not add a wrapper when the native tools cover the lifecycle.

## Invocation

- Surface: agent context
- Source: `skills/delegating-subagents/SKILL.md`
- Invocation: description match or explicit skill load
- ID: `delegating-subagents`

Repository instructions require agents to consider delegation before non-trivial work. They also route explicit `/subagent`, `|subagent`, and “spawn a subagent” requests to native `create_thread`.

## Contract

Every delegated brief must state:

- the outcome and why it matters
- the bounded scope and useful starting evidence
- constraints and non-goals
- success criteria
- validation to run
- the expected done report, or the smallest input to request when blocked

The parent must inspect the result, verify it against the success criteria, and close any gap directly or through one focused follow-up.

### Use Task for current-turn results

Use `Task` when the parent cannot complete its current response without the delegated result. This includes independent workstreams that can run concurrently and bounded work whose intermediate detail would crowd the parent context.

Do not use `Task` for simple reads, exact searches, one localized edit, ordinary self-review, or work already owned by `finder`, `librarian`, or another specialist.

`Task` returns one final result to the parent. It does not expose a durable child-thread lifecycle for later messaging.

### Use create_thread for addressable work

Use `create_thread` when the work should continue across turns or needs an addressable thread for later follow-up. Choose an executor and project that can see the required workspace state. Do not assume a new Orb can see the current machine's uncommitted changes.

Choose exactly one completion path:

1. **Asynchronous reply:** ask the child in its initial prompt to reply to the source thread when finished. `create_thread` attaches the authenticated source-thread ID and reply route automatically; the child must use that route instead of leaving the report only in its own final answer. Continue useful parent work. Do not also call `wait_for_threads`.
2. **Blocking join:** do not ask the child to reply. Call `wait_for_threads` only when the parent cannot progress without the result, then use `read_thread` to inspect the complete outcome.

Use `thread_interact` for later messages, status previews, metadata, and user-authorized archive operations. Use `read_thread` rather than message previews when the parent needs the child's full result, rationale, evidence, or error.

Set `archive_when_done` only for a disposable one-off task that will not need review or follow-up. Do not archive a reviewable implementation merely because its current turn finished.

### Native control boundary

The native `thread_interact` contract does not currently expose active-turn cancellation. Archiving a thread is not a substitute: it changes visibility but does not mean the active turn stopped.

Do not add a custom cancellation subsystem for occasional use. If active-turn cancellation becomes a recurring need, request a native `thread_interact` cancellation action from Amp.

### Use named specialists only when requested

| User request | Tool | Boundary |
| --- | --- | --- |
| Use Claude or Claude Code | `claude_code_subagent` | Read-only review, patch proposal, or research. Amp makes and verifies local edits. |
| Use Claude Design | `claude_design_subagent` | May modify a cloud-hosted design project. It cannot edit local files. |
| Use Pi, pi.dev, or Pi Coding Agent | `pi_code_subagent` | Read-only review, patch proposal, or research. Amp makes and verifies local edits. |

Do not infer a named specialist from generic “agent” or “subagent” wording, and do not substitute one named specialist for another.

### Delegate side questions

When the user introduces a side question with `btw` or `|btw`, delegate it so it does not displace the parent's current task:

- remove the trigger from the delegated brief
- use `Task` by default
- use `create_thread` when the question should report across turns or may need follow-up

## Behavior

The skill applies this order:

1. Keep direct, simple, overlapping, or unresolved design work in the parent.
2. Prefer a specialist tool when one owns the task.
3. Honor explicit named-specialist requests.
4. Use `oracle` only for a specific unresolved high-impact judgment.
5. Use `Task` for bounded work needed in the current turn.
6. Use `create_thread` for addressable cross-turn work.

An explicit request to “spawn a subagent”, `/subagent`, or `|subagent` means the user wants an addressable native child thread, so use `create_thread`. Prefer `|subagent` at the start of an Amp prompt because `/` is reserved for the command palette.

Ultra is a mode choice, not a separate lifecycle. Use it only for a genuinely hard independent review of completed work. Make the brief read-only, state the intended behavior, include exact change-set evidence when line-level fidelity matters, and ask for high-confidence findings only. Do not assume model routing stays fixed.

## Permissions and side effects

Loading the skill only adds instructions to agent context. Side effects begin when the agent invokes a selected tool.

- `Task` performs delegated work within the parent turn.
- `create_thread` creates and prompts another Amp thread.
- `thread_interact` can message or change metadata for an existing thread.
- archive and external shared-state operations still require the user authorization defined by their native tool contracts.

## Examples

| Scenario | Choice | Why |
| --- | --- | --- |
| Read one known file or make one localized edit | Direct work | Delegation costs more than the task. |
| Trace behavior across several local modules | `finder` | A specialist search tool owns codebase discovery. |
| Explain architecture in an external repository | `librarian` | External codebase understanding is specialist work. |
| Investigate two independent failures needed for the current response | Parallel `Task` calls | Both results are required in this turn. |
| Run durable work in an Orb, on a runner, or in another project | `create_thread` | The work needs an addressable cross-turn lifecycle. |
| “Spawn a subagent to review this later” or `|subagent ...` | `create_thread` | The user explicitly selected an addressable child thread. |
| “Ask Claude Code to review this diff” | `claude_code_subagent` | The user explicitly selected the named adviser. |
| Two workers would edit the same file | Do not parallelize | The write targets overlap. |
| Product direction is undecided | Keep designing in the parent | Do not delegate understanding or product ownership. |

## Troubleshooting

- A native child cannot see required local state: select an executor that can, transfer the required files, or use `Task` when the result belongs in the current turn.
- Native completion is ambiguous: choose either an asynchronous reply or a blocking `wait_for_threads` join, never both. Use `read_thread` for the complete result.
- A child needs more context: send one focused follow-up with `thread_interact`.
- A child is active but should stop: native `thread_interact` has no cancellation action. Do not claim archive cancels it.
- Parallel edits conflict: delegate only independent slices with non-overlapping write targets.

## Maintenance notes

- Keep this document as the source of truth for `skills/delegating-subagents/SKILL.md`.
- Keep stable routing rules in `amp/AGENTS.md` and detailed lifecycle guidance here and in the skill.
- Prefer native Amp tools over custom wrappers.
- Re-check the contract when Amp changes `Task`, `create_thread`, `thread_interact`, `wait_for_threads`, or `read_thread`.
