---
doc_schema: "amp-experiment-doc-schema/v1"
code: "EXPERIMENT-SCHEMA"
title: "Amp Experiment Schema"
slug: "amp-experiment-schema"
status: "active"
version: "1"
last_reviewed: "2026-10-02"
---

# Amp experiment schema

Use `doc_schema: "amp-experiment/v1"` for one time-boxed trial of a change to agent behaviour, such as an `AGENTS.md` rule, skill or plugin. An experiment doc records the question, the change under test, the evidence collected while it runs and the final decision.

The change itself stays in its own source file. The experiment doc points to that file instead of copying the rule.

The contract is closed by default. Add fields here and to `amp/scripts/validate-plugin-docs.py` before using them.

## Frontmatter contract

Required top-level fields:

```yaml
doc_schema: "amp-experiment/v1"
code: "EXPERIMENT-0001"
title: "Human-readable experiment title"
slug: "stable-url-safe-slug"
file: "experiment-0001-example.md"
status: "Running"
summary: "One-sentence description."
owner: "Chinh"
start: "YYYY-MM-DD"
end: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
amp_thread_id:
  T-...: "Thread intent or contribution"
changes: []
related: []
tags: []
```

The filename must match the lowercased code and slug: `EXPERIMENT-0001` plus `example` becomes `experiment-0001-example.md`.

`start` is the first day the change applies. `end` is the planned review date; it is an agreement, and nothing enforces it. `end` must not be earlier than `start`.

`amp_thread_id` maps each thread that designed, ran or reviewed the experiment to its contribution.

`changes` lists the files under test, relative to the experiment file:

```yaml
changes:
  - path: "../../AGENTS.md"
```

`related` contains other experiment codes such as `EXPERIMENT-0002`.

## Enum values

`status` values:

- `Planned`: designed, and the change is not active yet
- `Running`: the change is active and observations are being collected
- `Concluded`: the result is recorded and the change was kept, adjusted or removed
- `Abandoned`: stopped without a result; record why under `Result`

## Required Markdown headings

Each experiment doc must use this H2 order:

```markdown
## Summary
## Question
## Hypothesis
## Change under test
## Method
## Measures
## Decision criteria
## Observation log
## Result
## Maintenance notes
```

Give each section one job:

- `Summary`: what is being tried, the present status and the planned review date.
- `Question`: the single question the experiment answers.
- `Hypothesis`: the expected effect and the observation that would confirm it.
- `Change under test`: what changed, why it was needed and a link to its source of truth.
- `Method`: separate steps for Chinh and for the agent while the experiment runs.
- `Measures`: the signals collected and where they are recorded.
- `Decision criteria`: which observed pattern leads to keeping, adjusting or removing the change.
- `Observation log`: one dated row for each observation, with its thread.
- `Result`: the decision, its reason and the follow-up change, or `Not yet decided`.
- `Maintenance notes`: how to add observations and what to preserve when concluding.

## Template

```markdown
---
doc_schema: "amp-experiment/v1"
code: "EXPERIMENT-0000"
title: "Human-readable experiment title"
slug: "stable-url-safe-slug"
file: "experiment-0000-example.md"
status: "Planned"
summary: "One-sentence description."
owner: "Chinh"
start: "YYYY-MM-DD"
end: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
amp_thread_id:
  T-...: "designed the experiment"
changes: []
related: []
tags: []
---

# EXPERIMENT-0000: Human-readable experiment title

## Summary

State what is being tried, the present status and the planned review date.

## Question

State the single question this experiment answers.

## Hypothesis

State the expected effect and the observation that would confirm it.

## Change under test

Describe the change, why it was needed and link to its source of truth.

## Method

List the steps for Chinh and for the agent while the experiment runs.

## Measures

List the signals collected and where they are recorded.

## Decision criteria

Map each observed pattern to keeping, adjusting or removing the change.

## Observation log

| Date | Thread | Type | Note |
| --- | --- | --- | --- |

## Result

Not yet decided.

## Maintenance notes

Explain how to add observations and what to preserve when concluding.
```
