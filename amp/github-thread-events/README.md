# GitHub thread event configuration

This directory is the source of truth for non-secret GitHub thread event configuration and policy. `sync-skills.sh` projects the complete directory to `${AMP_CONFIG_DIR}/github-thread-events/`. The opted-in plugin reads only this projected runtime directory. It does not rely on a repository checkout.

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

An invalid project file blocks global fallback for that repository. The plugin validates the global file at opted-in startup, so an invalid global file stops startup before any lookup or tool registration.

Project paths and configured repository names must use lowercase `owner/repository`. Policy IDs are exact and case-sensitive.

## Runtime loading

The exact opt-in value `AMP_GITHUB_THREAD_EVENTS_ENABLED=1` makes the plugin load this contract before it opens ownership state or registers tools. It reads:

- `${AMP_CONFIG_DIR:-~/.config/amp}/github-thread-events/config.json`
- `${AMP_CONFIG_DIR:-~/.config/amp}/github-thread-events/policies/global.json`
- an existing exact project file at `${AMP_CONFIG_DIR:-~/.config/amp}/github-thread-events/policies/projects/<owner>/<repository>.json` for each configured repository

Startup fails closed when a required file is missing or unreadable, JSON is malformed, a format version is unsupported, or an applicable object is invalid. It also rejects unknown or forbidden fields, duplicate repositories or policy IDs, unsafe or mismatched project paths, and invalid policy or source-pointer invariants. Errors name the file and invalid field or rule. They do not include file contents or secret values.

Runtime validation repeats the trust-boundary rules needed to use projected data safely. It checks closed object shapes, fixed versions and configured values, repository and policy identifiers, duplicates, forbidden secret and runtime-state fields, project path matching, and policy pointer invariants. Repository validation remains responsible for checking the JSON Schemas themselves, requiring the initial global policy set, checking every source-tree project file, and preserving the reviewed repositories, actors and fixed actions.

A missing exact project file is valid. An invalid existing exact project file is not. The loader validates every applicable file at startup, even if the first policy lookup would not select it. A valid project file completely replaces the matching global policy. When it lacks the requested ID, lookup uses the validated global policy. If neither file defines the ID, lookup returns the typed `missing-policy` result with reason `missing-event-policy`.

## Scheduler foundation

The local scheduler accepts an injected pull function and sleep function. It polls once immediately. A non-empty result schedules the next pull after the configured 15-second active interval and resets empty backoff. The first consecutive empty result waits 30 seconds. The second and later consecutive empty results wait the configured 60-second maximum.

An all-day empty queue therefore causes 1,441 pull operations in a 24-hour half-open window starting with the immediate pull. This is below the checked-in Free-plan limit of 10,000 daily Queue operations. This slice counts pull operations only. Queue writes, acknowledgements, retries and metrics checks remain future budget inputs.

The plugin does not start this scheduler in production yet. Tests use only injected pull and sleep functions. This slice makes no HTTP call, reads no Cloudflare or GitHub credential or resource ID, acknowledges no message, appends to no thread and changes no delivery state.

## Policy boundary

Each policy supplies a fixed action. Event text remains untrusted evidence. A delivered message may include only source pointers named by the selected policy. It must not paste a webhook body, pull-request body, review comment, commit message or log into the thread.

The consumer must run the policy's current-state preflight immediately before submitting its fixed action. A policy does not expand the owner thread's existing authority.

## Validation

Install the pinned validator dependency and run:

```shell
python3 amp/scripts/validate-github-thread-events.py
python3 -m unittest amp/scripts/test_validate_github_thread_events.py
```

Validation checks the JSON Schemas and repository invariants. The plugin repeats the documented runtime subset. Queue transport, production polling and event delivery remain later RFC-0009 work.
