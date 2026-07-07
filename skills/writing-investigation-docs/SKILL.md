---
name: writing-investigation-docs
description: Writes and revises evidence-first Markdown investigation notes, incident write-ups, PR decision docs and RFCs. Use when these docs feel solution-oriented, too long or duplicated, and need trigger, problem, current state and findings before analysis or solution.
---

# Writing investigation docs

Use this for evidence-first documents: the reader sees what happened and what is known before they judge what should change.

The leading word is evidence spine. Use it as the spine of every rewrite and pruning pass.

## Process

1. Check the document shape. Use this skill when the document explains what happened and what should change. Use `govuk-style` instead for customer replies, Slack updates, guidance and answer-first status notes. Done when the document goal is clear.
2. Build the evidence spine. Put the sections in this order:
   - trigger
   - problem statement
   - current state or findings
   - analysis
   - proposed solution or decision
   - validation or next step
   Done when no root cause, fix or recommendation appears before the trigger, problem and current state unless the reader already knows them.
3. Give each section one job:
   - trigger: what prompted the work, with the Slack, issue, PR or customer link when available
   - problem statement: what should happen, what actually happened and why it matters
   - current state or findings: what exists today, what the evidence shows and what is still unknown
   - analysis: why the current state causes the problem, without repeating every finding
   - proposed solution or decision: what should change, why this option is right and what trade-off it accepts
   - validation or next step: how we know the change works, what to monitor or what remains open
   Done when each fact has exactly one home.
4. Prune the document. Delete repeated root causes, duplicated sections and long SQL, log or runbook detail unless the reader needs them to decide. Link to supporting detail when a short finding is enough. Done when each meaning has one source of truth.
5. Polish the prose. Use `govuk-style` for plain English without changing the evidence-first order. Done when the document is clear, short and still evidence-first.

## Answer-first exception

For investigation docs, front-load the situation, not the fix. Do not open with the root cause, final fix or recommendation unless the reader already knows the trigger and evidence.

Bad shape:

1. summary
2. root cause
3. fix
4. background

Replace this with the evidence spine from the process.

## Extra pruning trigger

If the document still feels long or repetitive after the process, load `writing-great-skills` and apply its duplication, no-op and sprawl checks.
