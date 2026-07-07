# writing-investigation-docs tests

Use these fixtures to check whether `writing-investigation-docs` reliably produces evidence-first investigation and decision notes.

## Run prompt

Paste one fixture into a fresh agent turn with this prompt:

```text
Use /writing-investigation-docs on this fixture.

Return:
1. a brief diagnosis of the original structure
2. the rewritten doc
3. an evidence-spine self-check
4. any skill weakness exposed by this test

Fixture:
<paste fixture>
```

Start with explicit invocation. Test automatic invocation only after the behavior is stable.

## Acceptance checks

The rewritten document passes when:

- trigger, problem statement and current state or findings appear before analysis and decision
- no root cause, fix or recommendation appears before the reader has the trigger and evidence
- each section has one job
- each fact has one home
- repeated root-cause language is collapsed
- long SQL, logs and runbook details are summarized or linked unless needed for the decision
- validation or next step is specific enough to check

## Fixtures

- `WID-001` in `fixtures/001-solution-first.md`: catches solution-first structure.
- `WID-002` in `fixtures/002-duplicated-root-cause.md`: catches repeated meanings and overlong evidence.

When a skill edit fixes one fixture, rerun the other as a holdout.
