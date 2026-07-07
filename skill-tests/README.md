# Skill tests

Use this folder for behavior regression tests and feedback loops for skills.

A skill test is a repeatable user-agent review. It is not an automated unit test. It captures the fixture, prompt shape, acceptance checks and feedback tags that help us decide whether to edit the skill.

## Structure

```text
skill-tests/
  README.md
  <skill-name>/
    README.md
    fixtures/
      <case-name>.md
```

Use each skill folder for:

- fixtures that expose real failure modes
- the prompt used to run the test
- acceptance checks for the rewritten output
- rules for when feedback should change the skill

Do not commit routine full transcripts. Use the PR thread or Amp thread as the run log. Commit a new fixture or skill change only when the failure generalizes.

## Feedback loop

1. Pick a fixture from `fixtures/`.
2. Run the skill with the prompt in that skill's test README.
3. Ask the agent to return a diagnosis, rewritten output, self-check and exposed skill weakness.
4. Review the output using failure tags.
5. Change the skill only when the failure is repeatable or the instruction is ambiguous.
6. Rerun the failing fixture and one holdout fixture.

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
