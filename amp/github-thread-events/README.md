# GitHub thread event configuration

This directory is the source of truth for non-secret GitHub thread event configuration and policy. `sync-skills.sh` projects the complete directory to `${AMP_CONFIG_DIR}/github-thread-events/`.

The files define configuration only. They do not deploy Cloudflare resources, register webhooks, store credentials or enable event delivery. Runtime ownership and delivery state belongs in `${AMP_CONFIG_DIR}/state/github-thread-events.sqlite`. It must never appear in this directory.

## Files

- `config.schema.json` defines the deployment assumptions and monitored repositories
- `config.json` contains accepted non-secret values for the first deployment
- `policy-set.schema.json` defines both global and project policy sets
- `policies/global.json` contains global fallback policies
- `policies/projects/<owner>/<repository>.json` contains complete project overrides

All objects are closed. A new field or breaking change needs a new format version and schema update.

## Policy lookup

For repository `owner/repository` and an exact policy ID, the consumer must:

1. Load `policies/projects/owner/repository.json` when it exists. If the file is invalid, fail closed.
2. Return the complete matching project policy when it exists. Do not merge it with the global policy.
3. Otherwise load `policies/global.json`. If the file is invalid, fail closed.
4. Return the complete matching global policy when it exists.
5. Otherwise return `missing-event-policy`. Do not resume a thread or invent an action.

An invalid project file blocks global fallback for that repository. An invalid global file blocks only lookups that need the global file.

Project paths and configured repository names must use lowercase `owner/repository`. Policy IDs are exact and case-sensitive.

## Policy boundary

Each policy supplies a fixed action. Event text remains untrusted evidence. A delivered message may include only source pointers named by the selected policy. It must not paste a webhook body, pull-request body, review comment, commit message or log into the thread.

The consumer must run the policy's current-state preflight immediately before submitting its fixed action. A policy does not expand the owner thread's existing authority.

## Validation

Install the pinned validator dependency and run:

```shell
python3 amp/scripts/validate-github-thread-events.py
python3 -m unittest amp/scripts/test_validate_github_thread_events.py
```

Validation checks the JSON Schemas and repository invariants. Runtime policy loading and event delivery are later RFC-0009 work.
