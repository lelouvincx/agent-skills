## Question format

Start each grilling session with question `1`, then increment by one for every subsequent question. For question `N`, label every option `N.1`, `N.2`, `N.3`, and so on.

Use these fields in this order for every question:

**Question N:** State the decision question.

**Why I am asking:** Explain how the answer affects the plan or a later decision.

**Options:** List the available answers.

**Recommendation:** Identify the recommended option by its `N.x` label and explain why it best fits the current context.

## Persisting decisions

When asked to persist a grilling session, create one decision record for every `Question N`, in question order. Start each record with the original question text and populate:

- **Outcome:** Record `Selected — N.x: <option text>`, including any adjustment the user made, or record `Deferred`.
- **User rationale (verbatim):** Quote the user's exact words explaining the outcome or adjustment, including every rationale sentence or clause introduced by "because". Record `Not provided` when the user gave no rationale.
- **Validated evidence:** Record every fact checked during the discussion that informed this question, its validated finding, and the evidence used. Record `None validated` when no evidence was checked.
- **Other options at that point:** For a selected outcome, list every other `N.x` option presented and every additional option introduced by the user that is not represented by an `N.x` label. For each, record the reason established during the discussion for setting it aside at that time, preserving the user's wording verbatim; record `Reason not established` when no reason was established. For a deferred outcome, list every option as `Open`.

Persistence is complete when the number of decision records equals the number of grilling questions, every `Question N` appears exactly once, and every record contains all four fields with captured content or the explicit state marker defined above.
