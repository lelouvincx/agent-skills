# Skill tests

Use this folder for behavior regression tests and feedback loops for skills.

A skill test is a repeatable user-agent review. It is not an automated unit test. It captures the fixture, prompt shape, acceptance checks and feedback tags that help us decide whether to edit the skill.

Keep model-backed runs manual. Their results depend on model and context, so they are evidence for a skill change, not a deterministic CI gate.

## Structure

```text
skill-tests/
  README.md
  <skill-name>/
    README.md
    fixtures/
      001-<case-name>.md
```

Use each skill folder for:

- fixtures that expose real failure modes
- a no-skill baseline using the same fixture and acceptance checks
- the prompt used to run the test
- acceptance checks for the rewritten output
- rules for when feedback should change the skill

Give every fixture a stable ID in the filename and title. Use the skill prefix plus a 3-digit number in the title, for example `WID-001`, so feedback can refer to fixtures without relying only on filenames.

Do not commit routine full transcripts. Use the PR thread or Amp thread as the run log. Commit a new fixture or skill change only when the failure generalizes.

## Feedback loop

```diagram
╭─────────╮     ╭─────────────╮     ╭────────────╮
│ Fixture │────▶│ Skill run   │────▶│ User review│
╰────┬────╯     ╰──────┬──────╯     ╰──────┬─────╯
     │                 │                   │
     │                 ▼                   ▼
     │          ╭─────────────╮     ╭────────────╮
     │          │ Self-check  │◀────│ Failure tag│
     │          ╰──────┬──────╯     ╰──────┬─────╯
     │                 │                   │
     │                 ▼                   ▼
     │          ╭─────────────╮     ╭────────────╮
     ╰─────────▶│ Skill change│────▶│ Rerun      │
                │ decision    │     │ fixtures   │
                ╰─────────────╯     ╰────────────╯
```

1. Pick a fixture from `fixtures/`.
2. In a fresh context, run the prompt without loading or naming the target skill. Record the acceptance checks it passes as the no-skill baseline.
3. In another fresh context, run the skill with the same fixture and the prompt in that skill's test README.
4. Ask the agent to return a diagnosis, rewritten output, self-check and exposed skill weakness.
5. Classify the failure, then review the output using failure tags.
6. Change the skill only when the failure is repeatable or the instruction is ambiguous.
7. Rerun the failing fixture and one untouched holdout fixture in fresh contexts.

For a material trigger or instruction wording change, use at least 5 fresh-context skill runs. Compare them with the no-skill baseline. A single good run can be luck; a skill change should improve the target behavior consistently without damaging the holdout.

## Scenario design

Use realistic pressure that could make an agent skip or bend the skill: time pressure, sunk work, an authoritative request, incomplete evidence or a competing instruction. Keep the requested task plausible and include only the pressure needed to expose the failure mode. Do not use cartoon prompts that reveal the expected answer.

Keep one fixture out of the edit loop as a holdout. Use it only after the changed skill passes the failing scenario, then rotate or add a holdout when repeated use makes it familiar.

## Failure classification

Classify the failure before changing the skill:

- `discipline`: the instruction is clear, but the agent ignores it under pressure
- `output shape`: the response contains the right substance in the wrong structure or format
- `omitted slot`: a required section, check or result is missing
- `conditional`: the behavior changes across fresh contexts or only fails under a specific condition
- `one-off preference`: the output is acceptable and the requested change is personal wording or taste

Use the classification to choose the response. Strengthen a completion gate for repeatable discipline failures, clarify the named shape or slot, and add the smallest realistic condition that reproduces a conditional failure. Do not edit the skill for a one-off preference.

## Failure tags

Use short tags so feedback is easy to compare across runs:

- `solution-first leak`: the answer or fix appears before the reader has the trigger and evidence
- `evidence buried`: findings are too late, too thin or mixed into the solution
- `duplicate meaning`: the same point appears in multiple sections
- `over-pruned`: the rewrite removed evidence needed to trust the decision
- `too long`: the rewrite kept detail that should be summarized or linked
- `section job unclear`: a section mixes trigger, findings, analysis and decision
- `wrong sibling skill`: the output follows a neighbouring skill instead of the target skill

## Skill change rule

Update the skill when at least one of these is true:

- the failure repeats across 2 fixtures
- the current skill instruction is ambiguous
- the output violates a core invariant of the skill
- the fix can be expressed as a small rule or completion criterion

Do not update the skill for one-off wording preferences. Record the preference in the PR or thread instead.

After an edit, rerun the failing fixture first. If it passes consistently, run the holdout once in a fresh context. Reopen the skill only for a repeatable regression; otherwise record the result in the PR or thread without committing routine transcripts.
