---
doc_schema: "amp-issue-doc-schema/v1"
code: "ISSUE-SCHEMA"
title: "Amp Issue Schema"
slug: "amp-issue-schema"
status: "active"
version: "1"
last_reviewed: "2026-07-16"
---

# Amp issue schema

Use `doc_schema: "amp-issue/v1"` for one durable issue or investigation record. Issue docs preserve why a capability contract exists: original intent, incident evidence, findings, decisions, delivery status, and unresolved follow-up.

The contract is closed by default. Add fields here and to `amp/scripts/validate-plugin-docs.py` before using them.

## Frontmatter contract

Required top-level fields:

```yaml
doc_schema: "amp-issue/v1"
code: "ISSUE-0001"
title: "Human-readable issue title"
slug: "stable-url-safe-slug"
file: "issue-0001-example.md"
status: "Open"
priority: "P1"
summary: "One-sentence description."
created: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
amp_thread_id:
  T-...: "Thread intent or contribution"
artifacts: []
implementation: []
pull_requests: []
related: []
tags: []
```

`amp_thread_id` maps each source or implementation thread to its intent or contribution. Keep the original incident thread when one exists.

The filename must match the lowercased code and slug: `ISSUE-0001` plus `example` becomes `issue-0001-example.md`.

`artifacts` contains affected `amp-artifact/v2` slugs. `implementation` contains paths relative to the issue file and uses this shape:

```yaml
implementation:
  - path: "../tools/example.md"
  - path: "../../plugins/example.ts"
```

`pull_requests` contains full pull request URLs. `related` contains other issue codes such as `ISSUE-0002`.

## Enum values

`status` values:

- `Open`
- `In progress`
- `Partially resolved`
- `Resolved`
- `Superseded`

`priority` values:

- `P0`
- `P1`
- `P2`
- `P3`

Use the highest unresolved or historically defining priority. A partially resolved issue can retain `P0` when it records a P0 incident and lower-priority follow-up.

## Required Markdown headings

Each issue doc must use this H2 order:

```markdown
## Summary
## Trigger
## Original intent
## Evidence
## Findings
## Decisions and scope
## Resolution status
## Follow-up
## Validation
## Maintenance notes
```

Give each section one job:

- `Summary`: the problem, present status, and why the record remains useful.
- `Trigger`: what prompted the investigation.
- `Original intent`: what the user or system needed before implementation choices were made.
- `Evidence`: the workflow and concrete observations at the time.
- `Findings`: why the observed state failed the intent, grouped by priority.
- `Decisions and scope`: accepted trade-offs, non-problems, and explicit boundaries.
- `Resolution status`: what is resolved, open, deferred, or superseded and where it changed.
- `Follow-up`: the smallest ordered next steps for unresolved findings.
- `Validation`: acceptance criteria and checks that demonstrate a resolution.
- `Maintenance notes`: source-of-truth links and instructions for preserving history.

## Template

```markdown
---
doc_schema: "amp-issue/v1"
code: "ISSUE-0000"
title: "Human-readable issue title"
slug: "stable-url-safe-slug"
file: "issue-0000-example.md"
status: "Open"
priority: "P1"
summary: "One-sentence description."
created: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
amp_thread_id:
  T-...: "captured the original intent and evidence"
artifacts: []
implementation: []
pull_requests: []
related: []
tags: []
---

# ISSUE-0000: Human-readable issue title

## Summary

State the problem, present status, and why this record remains useful.

## Trigger

Record the request or incident that prompted the investigation.

## Original intent

Describe the desired outcome independently of the eventual implementation.

## Evidence

Record the historical workflow and observations with source links.

## Findings

Explain why the evidence failed the original intent, grouped by priority.

## Decisions and scope

Record accepted decisions, non-problems, boundaries, and trade-offs.

## Resolution status

Map each finding to its current status and implementation reference.

## Follow-up

List unresolved next steps in priority order or write `None`.

## Validation

Define acceptance criteria and record the checks that demonstrate resolution.

## Maintenance notes

Link current capability contracts and explain what future updates must preserve.
```
