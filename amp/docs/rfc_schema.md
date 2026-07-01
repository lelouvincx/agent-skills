---
doc_schema: "amp-rfc-schema/v1"
title: "Amp RFC Schema"
slug: "amp-rfc-schema"
status: "active"
last_reviewed: "2026-07-01"
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
amp_thread_id: "T-..."
```

Optional relationship metadata:

```yaml
dependency: []
implementation: []
supersedes: []
superseded_by: null
related: []
tags: []
```

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
