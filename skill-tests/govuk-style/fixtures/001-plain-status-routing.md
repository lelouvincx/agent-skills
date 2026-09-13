# Fixture GOV-001: plain status with technical literals

## Task

Rewrite this as a concise internal status note for engineering and support.

Preserve every technical fact and literal. Do not add background information.

Expected mode: Plain English.

## Draft

As part of our ongoing efforts to leverage the new cache optimisation workstream, `schema_cache_v2` has now been enabled for 50% of EU workspaces as of 14 September 2026 and we are continuing to closely monitor the operational landscape in order to make sure that there are no adverse impacts going forward.

Initial monitoring shows no increase in HTTP 5xx responses.

If the overnight error rate remains below 0.5%, we plan to expand the rollout to 100% on 16 September 2026.

If support sees a workspace-specific issue, the rollback command is `deployctl flags set schema_cache_v2 0`.

## Acceptance checks

- selects Plain English
- leads with current rollout status and the conditional next action
- preserves `schema_cache_v2`, 50%, EU, 14 September 2026, HTTP 5xx, 0.5%, 100%, 16 September 2026 and `deployctl flags set schema_cache_v2 0`
- removes marketing or vague phrases such as "leverage", "ongoing efforts" and "going forward"
- does not turn the note into a tutorial, runbook or customer message
- does not invent reasons for the error threshold or rollout dates

## Failure tags

`wrong mode`, `mode bleed`, `fact drift`, `over-pruned`, `too long`
