## Round and question workflow

Keep the dependency-aware frontier-round workflow above. Number rounds from `Round 1`, and number questions globally from `Q1` across the whole session without restarting in a new round. Identify every currently answerable frontier question at the start of a round, then ask them sequentially under that same round number because each tool call waits for an answer.

Use `ask_user_choice` for every decision question. Do not present decision questions as plain-text option lists. For question `QN`:

- set `question` to `Round R · Question QN: <decision question>`, followed by why the answer matters and `Recommendation: QN.x: <reason>`
- pass two to five concrete `options`, each beginning `QN.1:`, `QN.2:`, and so on
- recommend one listed option, never the free-text alternative
- set `allowOther` to `true` so the user can enter an option that is not listed

When the user enters a free-text answer, assign it the next available `QN.x` label, state that label when acknowledging the answer, and treat it as the selected option. Then continue with the next question already identified for the current round. After all questions in the round are answered, recompute the frontier before starting the next round.

## Persisting decisions

When asked to persist a grilling session, create one decision record for every asked `QN`, in question order. Record the round in which it was asked and start each record with the complete original question text exactly as asked. Populate:

- **Outcome:** Record `Selected: QN.x: <option text>`, including any adjustment the user made, or record `Deferred`.
- **User rationale (verbatim):** Quote the user's exact words explaining the outcome or adjustment, including every rationale sentence or clause introduced by "because". Record `Not provided` when the user gave no rationale.
- **Validated evidence:** Record every fact checked during the discussion that informed this question, its validated finding, and the evidence used. Record `None validated` when no evidence was checked.
- **Other options at that point:** For a selected outcome, list every other `QN.x` option presented and every additional option introduced by the user that is not represented by a `QN.x` label. For each, record the reason established during the discussion for setting it aside at that time, preserving the user's wording verbatim; record `Reason not established` when no reason was established. For a deferred outcome, list every option as `Open`.

Persistence is complete when the number of decision records equals the number of questions asked across all rounds, every `QN` appears exactly once under its original round number, and every record contains all four fields with captured content or the explicit state marker defined above.
