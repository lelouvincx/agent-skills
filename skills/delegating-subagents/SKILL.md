---
name: delegating-subagents
description: "Routes delegation to direct work, specialist tools, Task, or create_thread. Use before delegating, splitting independent work, or handling side questions introduced with 'btw' or '|btw'."
---

# Delegating Subagents

Choose the smallest mechanism that gives the parent the result and lifecycle it needs.

The [Delegating Subagents artifact document](../../amp/docs/tools/delegating-subagents.md) is the source of truth for these rules.

## Route the work

1. Work directly when delegation overhead exceeds the task. Keep simple reads, exact searches, one localized edit, overlapping work, and unresolved product or design decisions in the parent.
2. Use a specialist tool when it owns the task. Prefer `finder` for codebase discovery and `librarian` for external repository understanding.
3. If the user explicitly requests Claude or Claude Code, use `claude_code_subagent`. If they explicitly request Claude Design, use `claude_design_subagent`. If they explicitly request Pi, pi.dev, or Pi Coding Agent, use `pi_code_subagent`. Do not infer a named specialist from generic agent wording or substitute one named specialist for another.
4. Use `oracle` only for one specific unresolved high-impact judgment after direct investigation.
5. Use built-in `Task` for bounded work whose result is needed in the current parent turn. This includes independent concurrent workstreams.
6. Use built-in `create_thread` for addressable cross-turn work, later follow-up, another project, an Orb, or a runner. Choose an executor that can see the required workspace state.

Ultra is a mode choice, not a separate lifecycle. Reserve it for a genuinely hard independent review of completed parent work. Make the brief read-only, state the intended behavior, include exact change-set evidence when line-level fidelity matters, and request high-confidence findings only. Do not assume model routing stays fixed.

Claude Code and Pi are read-only advisers. Amp applies and verifies local changes. Claude Design may modify a cloud-hosted design project, but it cannot edit local files.

## Brief every delegated task

Include:

- the outcome and why it matters
- bounded scope and useful starting evidence
- constraints and non-goals
- success criteria
- validation to run
- a done report with evidence, or a blocked report naming the smallest parent input needed

Ask the user when the child or parent needs input only the user can provide. The parent owns synthesis, integration, and final verification.

## Manage native child threads

For `create_thread`, choose exactly one result path:

- **Asynchronous reply:** ask the child in its initial prompt to reply when finished. Continue useful parent work. Do not also call `wait_for_threads`.
- **Blocking join:** omit the reply request, call `wait_for_threads` only when the parent cannot progress without the result, then use `read_thread` for the complete outcome.

Use `thread_interact` for follow-up messages and metadata. Use `read_thread`, not message previews, when the result, rationale, evidence, or error matters.

Set `archive_when_done` only for a disposable one-off task that needs no review or follow-up. Follow the native user-approval rules for later archive operations.

Native `thread_interact` does not currently expose active-turn cancellation. Archive changes visibility; it does not prove an active turn stopped. If cancellation becomes a recurring need, request a native cancellation action from Amp rather than adding another wrapper.

## Handle explicit triggers and side questions

- “Spawn a subagent”, `/subagent`, or `|subagent` → use native `create_thread` with the remaining request as the bounded brief. Prefer `|subagent` because `/` is reserved for the command palette.
- “Ask an agent”, “use a subagent”, or “run this in parallel” → use `Task` when bounded work is needed in the current turn. Generic wording alone does not require an addressable thread.
- `btw` or `|btw` → remove the trigger and delegate the side question so it does not displace the parent task. Use `Task` by default; use `create_thread` when it should report across turns or may need follow-up.

Do not parallelize workers that would edit the same files or depend on each other's uncommitted changes.
