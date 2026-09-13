# govuk-style tests

Use these fixtures to check whether the merged `govuk-style` skill routes writing tasks to the right mode and preserves the behaviour formerly split across `govuk-style`, `technical-precision` and `writing-for-agents`.

## Run prompt

Paste one fixture into a fresh agent turn with this prompt:

```text
Use /govuk-style on this fixture.

Return:
1. the selected writing mode and a one-sentence diagnosis
2. the rewritten output
3. a brief mode-specific self-check
4. any skill weakness exposed by this test, or "none"

Fixture:
<paste fixture>
```

Judge the rewritten output, not only the self-report. Start with explicit invocation. Test automatic invocation only after explicit behaviour is stable.

## Acceptance checks

The rewritten output passes when:

- it selects the mode named by the fixture
- it applies that mode without bleeding in unrelated rules
- it preserves technical facts, literal values, commands, product names, interface labels and links
- it removes jargon, duplication and vague abstractions only when doing so does not remove needed evidence
- it identifies material ambiguity instead of guessing
- it exposes a concise skill weakness only when the fixture reveals one

## Failure tags

Use these tags in addition to the shared tags from `skill-tests/README.md`:

- `wrong mode`: selects or behaves like the wrong writing mode
- `mode bleed`: applies rules from another mode in a way that hurts the output
- `technical reference missed`: misses explanation-repair or controlled-English behaviour from `reference/technical-precision.md`
- `agent reference missed`: misses agent-facing document behaviour from `reference/writing-for-agents.md`
- `skill mechanics missed`: misses skill-specific frontmatter or invocation guidance from `reference/skill-mechanics.md`
- `Slack shape missed`: ignores the customer-facing Slack shape
- `fact drift`: changes a fact, literal, limit, date, command, label or support status
- `ambiguity guessed`: silently chooses a technical interpretation the fixture did not provide
- `internal detail leak`: exposes a value marked internal-only

## Fixtures

- `GOV-001` in `fixtures/001-plain-status-routing.md`: catches over-routing technical prose into a tutorial, runbook or customer message.
- `GOV-002` in `fixtures/002-idempotency-explanation-repair.md`: catches missed explanation-repair behaviour.
- `GOV-003` in `fixtures/003-failover-runbook.md`: catches missed controlled-English procedure behaviour and ambiguity guessing.
- `GOV-004` in `fixtures/004-agent-skill-routing.md`: catches missed agent-writing and skill-mechanics behaviour.
- `GOV-005` in `fixtures/005-customer-product-gap-slack.md`: catches customer-facing Slack shape and product-gap handling.

Use `GOV-001` as the holdout after routing changes. Use `GOV-002` and `GOV-003` as mutual holdouts for technical-reference changes. Use `GOV-004` as the holdout for agent-writing changes.
