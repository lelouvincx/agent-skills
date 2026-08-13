---
name: delegating-subagents
description: "Routes delegation to direct work, specialist tools, Task, create_thread, or spawn_subagent. Use before delegating, splitting independent work, or handling side questions introduced with 'btw' or '|btw'."
---

# Delegating Subagents

Choose the delegation mechanism from what the parent needs next.

The [Delegating Subagents artifact document](../../amp/docs/tools/delegating-subagents.md) is the source of truth for these rules.
Keep the skill aligned with the related [Spawn Subagent](../../amp/docs/tools/spawn-subagent.md) and [Subagent Control](../../amp/docs/tools/subagent-control.md) capability documents.

## Choose the delegation mechanism

1. Use a direct or specialist tool when it already covers the job or delegation overhead is greater than the task. Do not delegate exact reads, simple searches, one localized edit, or work owned by `finder`, `librarian`, or `oracle`.
2. If the user explicitly requests Claude or Claude Code, use `claude_code_subagent`. If they explicitly request Claude Design, use `claude_design_subagent`. If they explicitly request Pi, pi.dev, or Pi Coding Agent, use `pi_code_subagent`. Do not infer these requests from generic agent wording or substitute one named specialist for another.
3. Use `oracle` for a focused expert second opinion on a genuinely hard judgment call, tricky review, alternative analysis, or complex plan.
4. Use Ultra mode for a genuinely hard independent review of completed parent work when its current routing adds an independent perspective. Choose the child-thread mechanism separately. Make the brief read-only, state intended behavior, include exact change-set evidence when line-level fidelity matters, and ask for high-confidence findings only. Ultra intentionally consumes Amp credits.
5. Use `spawn_subagent` when the task needs local workspace state, an arbitrary local `cwd`, hard Oracle rejection, active-turn cancellation, mandatory `read_thread` reconstruction, managed reporting and archiving, or an explicit `/subagent`, `|subagent`, or “spawn a subagent” request.
6. Otherwise, use built-in `create_thread` for normal addressable cross-turn work when it is available and its executor can see the required state. This includes Ultra reviews, Orb or runner execution, another project, later messaging, or required follow-up.
7. If addressable cross-turn work still needs a child but `create_thread` is unavailable or cannot see the required state, use `spawn_subagent` when its executor can see that state. Otherwise, keep the work in the parent.
8. Use built-in `Task` for ordinary bounded one-shot delegation, including independent concurrent calls. The parent turn stays open until each Task returns one final summary.

Claude Code and Pi are read-only advisers for review, patch proposals, or research. Amp applies and verifies any proposed changes. Claude Design may create or modify cloud-hosted design projects, but it cannot edit local files.

Default Oracle and Ultra review are complementary. When diversity matters, choose the reviewer whose current model or provider differs from the parent. This can reduce correlated model bias. Do not assume routing stays fixed.

## Choose an addressable child mechanism

Ultra mode does not select the mechanism. Resolve `spawn_subagent`-specific requirements first. Otherwise, use `create_thread` for normal addressable work when it is available and its executor can see the required state. If either condition fails, use `spawn_subagent` when its executor can see that state. Otherwise, keep the work in the parent.

When managed controls require `spawn_subagent`, keep it local by default. Use its `executor` only when those controls are still needed in an Orb or on a known runner. Do not pass `cwd` for remote execution.

## Control a child

Use `thread_interact` for native child messaging and metadata. Use `subagent_control` only for a child created by `spawn_subagent` when the user asks to inspect, diagnose, or cancel it. Normal managed-child completion arrives through `send_to_thread`; do not poll status while waiting.

## Delegate side questions

When the user introduces a side question with `btw` or triggers `|btw`, delegate that question so it does not displace the parent's current task. Remove the trigger from the delegated brief. This is a request to delegate, not a request for a specific mechanism. Use built-in `Task` by default. Use `create_thread` when the question must report across turns or needs follow-up and its executor can see the required state; if not, use `spawn_subagent` when that wrapper can.

## Constraints

- Give every delegated task a bounded brief with scope, constraints and non-goals, success criteria, validation, and a completion contract.
- The completion contract requires a done report with evidence or a blocked report naming the smallest parent input needed.
- When a child reports blocked or a required input is one only the user can provide, ask the user rather than guessing.
- Inspect and integrate an Ultra review result before treating that review as complete.
- Use `subagent_control` for explicit inspection, diagnosis, or cancellation, not routine completion checks.
- The parent owns synthesis, integration, and final verification. Check each result against its success criteria, then integrate it, close gaps directly, or use a focused follow-up supported by the mechanism.

## Stress cases

- “Btw, why does this test use a fake clock?” or `|btw ...` → delegate with built-in `Task` by default, after removing the trigger.
- A `btw` aside that can report later or may need parent follow-up → `create_thread`.
- “Ask an agent”, “use a subagent”, or “run this in parallel” → built-in `Task`; generic wording and parallelism alone do not select an addressable thread.
- “Spawn a subagent”, `/subagent`, or `|subagent` → `spawn_subagent`; the user explicitly selected the addressable mechanism.
- “Ask Claude Code to review this diff” → `claude_code_subagent`; named specialists are explicit-only and never substituted for each other.
- A genuinely hard review of completed parent changes using Ultra's current routing → choose an Ultra child; prohibit edits, provide exact change-set evidence, then select its mechanism from required controls.
- Two workers editing the same file or depending on each other's changes → do not parallelize.
- Product direction is undecided → keep designing in the parent; do not delegate understanding.

Explicit mechanism requests override the default decision order unless they would create unsafe or overlapping writes. Use `Task` for bounded one-turn work and `create_thread` for normal addressable cross-turn work when it can see the required state. Use `spawn_subagent` for managed-local controls, an explicit spawn request, or as the addressable fallback when `create_thread` is unavailable. Ultra is a mode choice, not a mechanism choice, and complements rather than replaces default Oracle.
