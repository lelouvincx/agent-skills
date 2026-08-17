## Round and question format

Use these round and option rules:

- keep the dependency-aware frontier-round workflow above
- number rounds from `Round 1`
- number questions globally from `Q1` across the whole session
- keep question numbering continuous across rounds
- ask every currently answerable frontier question in the same numbered round
- label each option for question `QN` as `QN.1`, `QN.2`, `QN.3`, and so on
- end every option list with `QN.+` so the user can add an option when none fits
- treat `QN.+` as an input code, not an option the agent can recommend

The following plain-text format replaces the upstream question and recommendation example. Use it for every question:

```
**Question QN:** <decision question>

**Why I am asking:** <how the answer affects the plan or a later decision>

**Options:**
- **QN.1:** <option>
- **QN.2:** <option>
- **QN.+:** Add another option: `<describe it>`

**Recommendation:** <recommended QN.x option and why it best fits the current context>
```

When the user replies `QN.+: <new option>`:

- add their text under the next available numeric label for that question
- state the assigned label when acknowledging the addition, for example `Q3.3`
- if the same reply selects a numbered option, treat the new option as add-only and keep the numbered selection
- otherwise, treat the newly numbered option as their selection unless they only want to add it
- if they only want to add it, present the updated options and wait for their selection

## Persisting decisions

When asked to persist a grilling session, create one decision record for every asked `QN`, in question order. Record the round in which it was asked and start each record with the complete original question text exactly as asked. Populate:

- **Outcome:** Record `Selected — QN.x: <option text>`, including any adjustment the user made, or record `Deferred`.
- **User rationale (verbatim):** Quote the user's exact words explaining the outcome or adjustment, including every rationale sentence or clause introduced by "because". Record `Not provided` when the user gave no rationale.
- **Validated evidence:** Record every fact checked during the discussion that informed this question, its validated finding, and the evidence used. Record `None validated` when no evidence was checked.
- **Other options at that point:** For a selected outcome, list every other `QN.x` option presented and every additional option introduced by the user that is not represented by a `QN.x` label. For each, record the reason established during the discussion for setting it aside at that time, preserving the user's wording verbatim; record `Reason not established` when no reason was established. For a deferred outcome, list every option as `Open`.

Persistence is complete when the number of decision records equals the number of questions asked across all rounds, every `QN` appears exactly once under its original round number, and every record contains all four fields with captured content or the explicit state marker defined above.
