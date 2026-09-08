---
name: delegating-subagents
description: "Routes delegated work and verifies its outcome. Use before delegation or expert consultation, and for /subagent, |subagent, btw or |btw requests."
---

# Delegating subagents

Choose the smallest mechanism that fits the work. Keep synthesis, integration and final verification in the parent.

## Route the request

Honor explicit triggers first:

| Request | Route |
| --- | --- |
| “Spawn a subagent”, `/subagent` or `\|subagent` | `create_thread`; use the remaining request as the brief |
| “Ask an agent”, “use a subagent” or “run this in parallel” | `Task` for bounded current-turn work |
| `btw` or `\|btw` | Delegate the side question without displacing the parent task; `Task` unless cross-turn reporting or follow-up needs `create_thread` |
| Claude, Claude Code, Claude Design, Pi or pi.dev | Use only the matching named specialist; read [its boundary](../../amp/docs/tools/delegating-subagents.md#use-named-specialists-only-when-requested) first |

Prefer `|subagent` in prompts because `/` is reserved for the command palette. Generic agent wording does not select a named specialist or a model. Use Ultra only when explicitly requested; read the [review constraints](../../amp/docs/tools/delegating-subagents.md#behavior) first.

Otherwise route by the work:

1. Keep simple reads, exact searches, localized edits, overlapping work and unresolved product decisions in the parent.
2. Use `finder` for local code discovery and `librarian` for external repository understanding.
3. Use `oracle` only when direct investigation leaves one specific, unresolved high-impact judgment.
4. Use `Task` for independent concurrent work or a bounded unit whose intermediate detail would crowd the parent context.
5. Use `create_thread` when work needs its own addressable thread, cross-turn reporting or later follow-up.

Before creating or managing a native child thread, read the [native-thread contract](../../amp/docs/tools/delegating-subagents.md#use-create_thread-for-addressable-work). It owns runner placement, reply-versus-wait selection, follow-up and archive rules.

## Brief and verify

1. Define the outcome, why it matters, bounded scope and starting evidence. Include constraints, non-goals, checkable success criteria and validation to run. Parallel write targets must be disjoint and independent of each other's uncommitted changes.
2. Require either a done report with evidence or a blocked report naming the smallest missing input. Tell the child to surface uncertainty; ask the human when only they can provide the answer.
3. Inspect the returned evidence or diff against every success criterion. Integrate the result and run combined validation. Resolve gaps directly or with a focused follow-up before reporting completion to the user.

## Browser session handoff

When a child needs an existing browser session, read the [browser conventions](../../amp/conventions/agent-browser.md) and [subagent-sharing workflow](../../amp/conventions/agent-browser-lifecycle.md#subagent-sharing) before dispatch. Include those references and the session coordinates in the brief. That workflow owns attachment, tab isolation, detachment and owner shutdown; a child's done message alone is not proof of detachment.
