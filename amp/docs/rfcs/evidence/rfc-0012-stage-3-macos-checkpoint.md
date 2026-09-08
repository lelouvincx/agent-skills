# RFC-0012 stage 3 macOS checkpoint evidence

> Supersedes the earlier evidence in this file. The prior run was incomplete because it relied on descendant inventory after an absent root, lacked assertions, risked parent fd3/fd4 descriptor overwrite, and moved profiles from an automatically deleted temporary root.

## Summary

- outcome: **NOT PASSED**
- process result: assertions passed, script exits **2** because the completeness gate is inconclusive
- real Chrome main-first crash: **not tested**
- scope: disposable headless Chrome instances with private profiles only; no personal Chrome inspection and no signals
- raw machine evidence with exact process IDs: `amp/docs/rfcs/evidence/rfc-0012-stage-3-macos-checkpoint.md.json`
- leftover private fixture root: `/Users/lelouvincx/Developer/agent-skills/.amp/in/artifacts/rfc0012-stage3-private-nti069oc`

## Outcome table

| Check | Result | Evidence |
| --- | --- | --- |
| Expected safety refusals | passed | PID reuse, listener conflict, and inspection uncertainty all refused. |
| Real Chrome normal close | partially observed | Target main and each saved observed target helper were absent after Browser.close; survivor stayed usable. |
| Observed helper state reporting | passed for observed set only | Saved helper identities were rechecked directly and classified as matching alive, reused, absent, or unavailable. |
| Main-first failure | simulated only | Controlled Python parent exited first; helper remained alive until explicit fixture pipe cleanup. |
| Stage 3 completeness gate | NOT PASSED | normal Chrome close was observed, but complete helper cleanup cannot be proven and real Chrome main-first crash was not tested |

## Key observed state counts

- target main after close: matching alive 0; reused 0; absent 1; unavailable 0
- target saved observed helpers after close: matching alive 0; reused 0; absent 8; unavailable 0
- survivor saved observed helpers while survivor alive: matching alive 8; reused 0; absent 0; unavailable 0
- survivor main after close: matching alive 0; reused 0; absent 1; unavailable 0
- survivor saved observed helpers after close: matching alive 0; reused 0; absent 8; unavailable 0
- simulated helper after parent exit: matching alive 1; reused 0; absent 0; unavailable 0
- simulated helper after explicit pipe cleanup: matching alive 0; reused 0; absent 1; unavailable 0

## Important limitations

- Rechecking saved helpers proves only the state of helpers observed before close.
- It still cannot prove that no unobserved or reparented Chrome helper existed.
- The main-first failure scenario uses a controlled Python fixture, not a real Chrome crash.
- Private fixture profiles were left in place and were not moved or deleted because active ownership cannot be proven completely.

## Command

```bash
scripts/check-agent-browser-ownership-macos --evidence amp/docs/rfcs/evidence/rfc-0012-stage-3-macos-checkpoint.md
```

## Environment

- started: 2026-09-07 14:47:25 +07
- Chrome binary: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- process identity module: `/Users/lelouvincx/Developer/agent-skills/amp/agent-browser-lifecycle/process_identity.py`
