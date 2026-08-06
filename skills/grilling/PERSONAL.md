## Round and question format

Keep the dependency-aware frontier-round workflow above. Number rounds from `Round 1`, and number questions globally from `Q1` across the whole session; do not restart question numbering in a new round. Ask every currently answerable frontier question in the same numbered round. For question `QN`, label every option `QN.1`, `QN.2`, `QN.3`, and so on.

For every question, preserve the upstream `❓ **QN**` format and include these fields in its body:

- the decision question
- **Why I am asking:** how the answer affects the plan or a later decision
- **Options:** the available answers, each with its `QN.x` label
- the upstream `➡️` recommendation, identifying the recommended option by its `QN.x` label and explaining why it best fits the current context

## Persisting decisions

When asked to persist a grilling session, create one decision record for every asked `QN`, in question order. Record the round in which it was asked and start each record with the complete original question text exactly as asked. Populate:

- **Outcome:** Record `Selected — QN.x: <option text>`, including any adjustment the user made, or record `Deferred`.
- **User rationale (verbatim):** Quote the user's exact words explaining the outcome or adjustment, including every rationale sentence or clause introduced by "because". Record `Not provided` when the user gave no rationale.
- **Validated evidence:** Record every fact checked during the discussion that informed this question, its validated finding, and the evidence used. Record `None validated` when no evidence was checked.
- **Other options at that point:** For a selected outcome, list every other `QN.x` option presented and every additional option introduced by the user that is not represented by a `QN.x` label. For each, record the reason established during the discussion for setting it aside at that time, preserving the user's wording verbatim; record `Reason not established` when no reason was established. For a deferred outcome, list every option as `Open`.

Persistence is complete when the number of decision records equals the number of questions asked across all rounds, every `QN` appears exactly once under its original round number, and every record contains all four fields with captured content or the explicit state marker defined above.
