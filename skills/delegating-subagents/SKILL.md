---
name: delegating-subagents
description: "Chooses between direct work, named Claude Code, Claude Design, or Pi specialists, Amp's built-in Task tool, and spawn_subagent. Use before delegating or splitting independent work across agents, including side questions introduced with 'btw' or triggered with '|btw'."
---

# Delegating Subagents

Choose the delegation mechanism from what the parent needs next.

The [Delegating Subagents artifact document](../../amp/docs/tools/delegating-subagents.md) is the source of truth for these rules.
Keep the skill aligned with the related [Spawn Subagent](../../amp/docs/tools/spawn-subagent.md) and [Subagent Control](../../amp/docs/tools/subagent-control.md) capability documents.

## Choose the delegation mechanism

1. Use a direct or specialist tool when it already covers the job or delegation overhead is greater than the task. Do not delegate exact reads, simple searches, one localized edit, or work owned by `finder`, `librarian`, or `oracle`.
2. If the user explicitly requests Claude or Claude Code, use `claude_code_subagent`. If they explicitly request Claude Design, use `claude_design_subagent`. If they explicitly request Pi, pi.dev, or Pi Coding Agent, use `pi_code_subagent`. Do not infer these requests from generic agent wording or substitute one named specialist for another.
3. Use built-in `Task` by default for ordinary bounded one-shot delegation, including independent concurrent calls. The parent turn stays open until each Task returns one final summary.
4. Use `spawn_subagent` when the work needs an exposed, addressable child thread: cross-turn execution or reporting, later messaging or required follow-up, visible history, status, cancellation or diagnosis, an explicit `/subagent`, `|subagent`, or “spawn a subagent” request, or custom local, Orb, or runner selection. It reports through `send_to_thread`.

Claude Code and Pi are read-only advisers for review, patch proposals, or research. Amp applies and verifies any proposed changes. Claude Design may create or modify cloud-hosted design projects, but it cannot edit local files.

## Choose where the child runs

Keep `spawn_subagent` local by default. Select `executor: "orb"` only when the task needs an Amp Orb, or pass `{ "type": "runner", "id": "<stable-id>" }` for a known live runner. Do not pass `cwd` for either remote target; the Orb or selected runner supplies the workspace. The tool cannot discover runners, so never guess or resolve a runner name.

See [Choose where the subagent runs](../../amp/docs/tools/spawn-subagent.md#choose-where-the-subagent-runs) for the full contract.

## Control a spawned child

After spawning, use `subagent_control` only when the user asks to list or inspect children, when a child needs diagnosis, or when an active child turn must be cancelled. Normal completion arrives through `send_to_thread`; do not poll status while waiting.

Additionally, when the user introduces a side question with `btw` or triggers `|btw`, delegate that question so it does not displace the parent's current task. Remove the trigger from the delegated brief. This is a request to delegate, not a request for a specific mechanism: use built-in `Task` by default, including while the parent continues useful work in the same turn. Use `spawn_subagent` only when the aside needs an addressable cross-turn thread, later messaging, or required follow-up.

## Constraints

- Give every delegated task a bounded brief with scope, constraints and non-goals, success criteria, required context, validation, and a completion contract.
- The completion contract requires a done report with evidence or a blocked report naming the smallest parent input needed.
- Treat Task workers as isolated: include the context they need because they start without the parent conversation.
- Do not wait for or poll `spawn_subagent`; continue useful parent work.
- Use `subagent_control` for explicit inspection, diagnosis, or cancellation, not routine completion checks.
- Use parallel subagents only for independent work. Avoid concurrent edits to overlapping files.
- The parent owns synthesis, integration, and final verification. Check each result against its success criteria, then integrate it, close gaps directly, or use a focused follow-up supported by the mechanism.

## Quick test

Ask in order:

1. Does a direct or specialist tool cover the job, or is the task too small to delegate? → use that tool or work directly.
2. Did the user explicitly request Claude Code, Claude Design, or Pi? → use the matching named specialist subagent.
3. Does the work need an addressable cross-turn thread, later messaging or required follow-up, visible control or diagnosis, an explicit spawn request, or custom execution selection? → `spawn_subagent`.
4. Is ordinary bounded one-shot delegation still worthwhile, including independent concurrent work? → `Task`; keep the parent turn open for every final summary.

## Stress cases

- “Btw, why does this test use a fake clock?” or `|btw why does this test use a fake clock?` → delegate with built-in `Task` by default, after removing the trigger.
- A `btw` aside that can report later or may need parent follow-up → `spawn_subagent`.
- “Ask Claude Code to review this diff” → `claude_code_subagent`; it returns read-only advice for Amp to apply and verify.
- “Use Claude Design to create this design” → `claude_design_subagent`; the explicit request authorizes the named cloud design workflow.
- “Ask Pi to propose a patch” → `pi_code_subagent`; it returns a read-only proposal for Amp to apply and verify.
- “Ask an agent”, “use a subagent”, or “run this in parallel” → built-in `Task`; generic wording and parallelism alone do not select an addressable thread.
- “Spawn a subagent”, `/subagent`, or `|subagent` → `spawn_subagent`; the user explicitly selected the addressable mechanism.
- Durable work explicitly requested in an Orb or on a known live runner → `spawn_subagent` with the requested executor; omit `cwd` for remote execution.
- “Which subagents are running?” → `subagent_control` with `list`; return point-in-time child states and report statuses without waiting.
- “Check that subagent” → `subagent_control` with `status`; return that child's point-in-time state, report status, and report summary without waiting.
- “Stop that subagent” → `subagent_control` with `cancel`; stop its active turn without archiving or deleting its thread.
- Two independent results needed now → parallel built-in `Task` calls.
- A bounded independent slice while the parent continues useful work in the same turn → built-in `Task`.
- Work that must report across turns or may require later parent input → `spawn_subagent`.
- Two workers editing the same file or depending on each other's changes → do not parallelize.
- Product direction is undecided → keep designing in the parent; do not delegate understanding.

Explicit mechanism requests override the default decision order unless they would create unsafe or overlapping writes. Task difficulty or bare “asynchronous” wording never decides between built-in `Task` and `spawn_subagent`: ordinary bounded one-shot work uses `Task`; addressable cross-turn coordination uses `spawn_subagent`.
