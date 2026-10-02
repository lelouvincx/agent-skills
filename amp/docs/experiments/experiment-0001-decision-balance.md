---
doc_schema: "amp-experiment/v1"
code: "EXPERIMENT-0001"
title: "Balance Chinh's decisions and agent decisions"
slug: "decision-balance"
file: "experiment-0001-decision-balance.md"
status: "Running"
summary: "Tests a standing rule that tells agents which judgement calls to ask Chinh about with ask_user_choice and which to decide themselves."
owner: "Chinh"
start: "2026-10-02"
end: "2026-10-16"
updated: "2026-10-02"
amp_thread_id:
  T-01a0fa53-3807-777b-878e-ccd842926470: "designed the experiment, added the Decisions rule and defined the experiment schema"
changes:
  - path: "../../AGENTS.md"
related: []
tags:
  - "ask-user-choice"
  - "decisions"
---

# EXPERIMENT-0001: Balance Chinh's decisions and agent decisions

## Summary

Agents follow a standing rule that tells them which decisions to ask Chinh about and which to make themselves. The experiment is running from 2 October 2026 and is due for review on 16 October 2026.

## Question

Which decisions should agents ask Chinh about, and which should they make themselves, to get the best outcome for the least interruption?

## Hypothesis

Agents give better outcomes when they ask Chinh about judgement calls and settle facts themselves. A judgement call has at least 2 viable options, evidence cannot settle it, and it depends on Chinh's preferences, product direction or taste, or is expensive to reverse.

The hypothesis holds if Chinh sees few unnecessary questions and rarely overrides decisions that agents made alone.

## Change under test

The `ask_user_choice` tool description tells agents to use it only when the user explicitly asks to be asked questions. Before this experiment, only the `grilling` skill overlay gave that permission, so agents outside grilling made judgement calls silently.

The `Decisions` section of [`amp/AGENTS.md`](../../AGENTS.md) is the source of truth for the rule. In summary, it:

- gives Chinh's standing permission to ask with `ask_user_choice`
- defines a judgement call and tells agents to settle facts and cheap, reversible choices themselves
- caps questions at 3 per task, asked before implementation
- requires one recommendation, 2 to 5 options and a free-text alternative
- lets Chinh set `ask: low` or `ask: high` for a thread
- requires a "Decisions I made" list at the end of each task that changed something

The `grilling` skill keeps its own question workflow.

## Method

Chinh:

1. Work as usual until the review date. Set `ask: low` or `ask: high` in a thread when the default feels wrong.
2. After a question that was not needed, tell the agent "unnecessary question".
3. After a "Decisions I made" item you would have chosen differently, tell the agent "should have asked".

Agent:

1. Follow the `Decisions` rule in every thread.
2. When Chinh gives calibration feedback, add one row to the observation log.

## Measures

Count these observation types in the observation log:

- `unnecessary question`: a question Chinh says did not need asking
- `missed question`: a decision an agent made alone that Chinh would have chosen differently
- `override`: a "Decisions I made" item Chinh reversed, whether or not it should have been asked
- `ask-level change`: a thread where Chinh set `ask: low` or `ask: high`, and why

## Decision criteria

At the review, choose one outcome:

- keep the rule when unnecessary and missed questions are both rare
- tighten the judgement call definition when unnecessary questions dominate
- widen the definition, or raise the cap, when missed questions dominate
- change the default ask level when Chinh set the same level in most threads
- remove the rule when it did not change outcomes compared with silent decisions

## Observation log

| Date | Thread | Type | Note |
| --- | --- | --- | --- |

## Result

Not yet decided.

## Maintenance notes

Add observations as new rows and update `updated` in the frontmatter. When concluding, record the outcome and reason under `Result`, set `status` to `Concluded`, and change the `Decisions` rule in `amp/AGENTS.md` to match.
