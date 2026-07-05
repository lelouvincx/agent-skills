---
doc_schema: "amp-rfc-schema/v1.3"
version: "1.3"
code: "RFC-SCHEMA"
title: "Amp RFC Schema"
slug: "amp-rfc-schema"
file: "_rfc_schema.md"
status: "active"
summary: "Schema and template for Amp RFC documents."
created: "2026-07-01"
updated: "2026-07-05"
last_reviewed: "2026-07-01"
amp_thread_id:
  T-019f3186-1f2b-76fe-a23b-ec9ff79018b9: "schema maintenance v1.2, v1.3"
dependency: []
implementation: []
supersedes: []
superseded_by: null
related: []
tags: []
---

# Amp RFC schema

Use `doc_schema: "amp-rfc/v1"` for one document per design decision or architectural proposal.

## Frontmatter contract

Required top-level fields:

```yaml
doc_schema: "amp-rfc/v1"
code: "RFC-0001"
title: "Human-readable RFC title"
slug: "stable-url-safe-slug"
file: "rfc-0001-example.md"
status: "Draft | Accepted | Implemented | Superseded"
summary: "One-sentence description."
created: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
amp_thread_id:
  T-...: "Thread intent or contribution"
```

`amp_thread_id` is a dictionary keyed by Amp thread ID. Values are short free-form descriptions of each thread's intent or contribution to the RFC.

Optional relationship metadata:

```yaml
dependency: []
implementation: []
inputs: []
outputs: []
supersedes: []
superseded_by: null
related: []
tags: []
```

`inputs` and `outputs` are optional lists. Use them when the RFC defines a tool, command, event, dataset, script, API, or workflow boundary. Leave them empty for pure decisions. Items are intentionally flexible; each item should describe the name, kind, and purpose.

## Required Markdown headings

Each RFC should use this H2 order:

```markdown
## Summary

## Context

## Decision

## Contract

## Behavior

## Permissions and side effects

## Examples

## Maintenance notes

## Open questions
```

Keep headings identical when possible. If an older RFC predates this schema, update its frontmatter first and migrate body structure opportunistically when the RFC is next edited for substance.

## Template

Use this template for new RFCs:

```markdown
---
doc_schema: "amp-rfc/v1"
code: "RFC-0000"
title: "Human-readable RFC title"
slug: "stable-url-safe-slug"
file: "rfc-0000-example.md"
status: "Draft"
summary: "One-sentence description."
created: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
amp_thread_id:
  T-...: "Thread intent or contribution"
dependency: []
implementation: []
inputs: []
outputs: []
supersedes: []
superseded_by: null
related: []
tags: []
---

# RFC-0000: Human-readable RFC title

## Summary

Summarize the proposal or decision in one or two short paragraphs.

## Context

Explain the problem, constraints, and why this decision is needed now.

## Decision

State the chosen direction clearly. Include alternatives only when they clarify the decision.

## Contract

Document user-facing, API, schema, file, command, or process contracts affected by this RFC.

## Behavior

Describe expected runtime or workflow behavior, including important edge cases.

## Permissions and side effects

List reads, writes, spawned processes, network calls, thread changes, logs, safety gates, and other side effects.

## Examples

Provide realistic examples, snippets, diagrams, or before/after flows.

## Maintenance notes

Document source-of-truth files, drift risks, follow-up updates, and verification steps.

## Open questions

List unresolved questions or write `None`.
```
