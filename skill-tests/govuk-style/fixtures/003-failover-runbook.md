# Fixture GOV-003: production failover runbook

## Task

Rewrite this as a production failover runbook for an on-call engineer.

Do not infer missing operational facts. Preserve commands, values, service names and interface labels exactly.

Expected mode: Controlled English.

## Draft

If primary has problems, promote the replica when lag is below 30 by running `dbctl promote eu-west-1-replica`, but make sure the old primary is read-only first with `dbctl primary set-read-only`; otherwise we can have two writable clusters and orders can diverge. If lag is above 30, wait 5 minutes and check again. Then update the Database host field in Settings > Connections, select Save, and restart `orders-api`.

## Known values

- Replica: `eu-west-1-replica`
- Promotion command: `dbctl promote eu-west-1-replica`
- Read-only command: `dbctl primary set-read-only`
- Lag metric: `replica_lag_seconds`
- Lag threshold stated in the draft: below 30 and above 30
- Interface path: **Settings > Connections**
- Field label: **Database host**
- Button label: **Save**
- Service: `orders-api`

The draft does not say what to do when `replica_lag_seconds` equals exactly 30.

## Acceptance checks

- selects Controlled English, not general plain prose
- places the split-brain warning before the action that creates the risk
- puts the lag condition before promotion
- uses imperative steps with one action per step
- names the exact object instead of using ambiguous pronouns
- preserves all commands, metrics, labels, service names and thresholds
- identifies the exactly-30-seconds case as unresolved and asks the smallest blocking question
- does not silently choose `<`, `<=`, `>` or `>=`
- includes a short list of sequence or ambiguity fixes

## Failure tags

`wrong mode`, `technical reference missed`, `condition buried`, `action bundling`, `ambiguity guessed`, `literal drift`, `plain-English overreach`
