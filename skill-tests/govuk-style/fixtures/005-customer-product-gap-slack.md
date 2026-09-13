# Fixture GOV-005: customer product-gap Slack reply

## Task

Turn these internal notes into a Slack reply for the customer.

Keep the support status and limits exact. Do not expose internal ticket numbers or internal implementation detail.

Expected mode: Customer-facing.

## Internal notes

Customer question 1: Can they have one centrally managed dashboard filter that editors cannot change?

Current status: unsupported today. Product is considering it, but there is no delivery date. Internal ticket: `PROD-482`. Current workaround: use local conditions and audit them through **Code Search**. Documentation URL: https://docs.holistics.io/docs/code-search

Architecture note, internal only: filter state currently resolves inside each dashboard block, not through a global immutable policy layer.

Customer question 2: How many rows can CSV export handle?

Current limit: CSV export supports up to 1,000,000 rows. Larger exports require scheduled S3 delivery.

Bad draft:

> Unfortunately our architecture does not currently have the global policy layer needed for this, tracked in PROD-482, so you will need to use local conditions. Also CSV supports 1m rows and beyond that use S3. We may improve this going forward.

## Acceptance checks

- selects Customer-facing
- separates the 2 unrelated answers with short, scannable labels or sections
- uses short paragraphs and restrained Slack formatting; sparse bold is acceptable
- acknowledges and restates the desired global-filter capability
- says clearly that it is unsupported and under consideration without implying a roadmap commitment
- gives the local-condition and **Code Search** workaround
- preserves the 1,000,000-row limit and scheduled S3 option
- omits `PROD-482` and internal architecture
- uses descriptive link text for the documentation URL
- ends with a useful priority question or an offer to help test the workaround
- remains skimmable in about 20 seconds

## Failure tags

`wrong mode`, `Slack shape missed`, `support status drift`, `internal detail leak`, `next action missing`, `fact drift`, `too long`
