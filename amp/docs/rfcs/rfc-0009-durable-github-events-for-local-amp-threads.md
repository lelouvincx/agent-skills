---
doc_schema: "amp-rfc/v1"
code: "RFC-0009"
title: "Durable GitHub events for local Amp threads"
slug: "durable-github-events-for-local-amp-threads"
file: "rfc-0009-durable-github-events-for-local-amp-threads.md"
status: "Accepted"
summary: "Queue verified GitHub events in Cloudflare and use source-neutral policies to return actionable events to the thread that owns each pull request."
created: "2026-07-26"
updated: "2026-07-26"
amp_thread_id:
  T-019f9241-c27f-7395-8fd1-f6284344d869: "defined the local runner, offline queue, thread routing and unattended secret requirements"
  T-019f4f39-34b7-7169-9005-a5d36a49c642: "provided related unattended 1Password service-account design evidence"
  T-019f9d13-530a-7613-b1a0-32a2ff10c740: "aligned the RFC contract with ISSUE-0002's policy, ownership, trust and completion intent"
  T-019f9d2f-33b0-76ce-ad76-9b75ed3944e5: "verified Amp, Cloudflare and GitHub contracts and defined measurable Draft prerequisites"
dependency:
  - type: "issue"
    code: "ISSUE-0002"
    title: "Durable GitHub events for local Amp threads"
    path: "../issues/issue-0002-durable-github-events-for-local-amp-threads.md"
implementation:
  - path: "../tools/bind-pr-to-thread.md"
  - path: "../tools/register-thread-event-recipient.md"
  - path: "../tools/transfer-pr-thread-owner.md"
  - path: "../../github-thread-events/README.md"
  - path: "../../github-thread-events/config.schema.json"
  - path: "../../github-thread-events/policy-set.schema.json"
  - path: "../../plugins/github-thread-events.ts"
  - path: "../../scripts/github-thread-events.test.ts"
  - path: "../../scripts/validate-github-thread-events.py"
  - path: "../../scripts/test_validate_github_thread_events.py"
inputs:
  - name: "GitHub webhook delivery"
    kind: "signed HTTP request"
    purpose: "Report a candidate CI, merge, review or merge-conflict event."
  - name: "event policy"
    kind: "source-neutral project or global policy"
    purpose: "Decide whether an event is actionable, which source state to verify and what fixed instruction to submit."
  - name: "pull-request thread binding"
    kind: "repository, pull-request number, owner thread and execution prerequisite"
    purpose: "Identify the one existing thread responsible for the pull request and control explicit ownership transfer."
  - name: "Cloudflare Queue message"
    kind: "leased normalized event"
    purpose: "Preserve an accepted event until a local consumer handles it."
outputs:
  - name: "queued GitHub event"
    kind: "normalized Cloudflare Queue message"
    purpose: "Decouple webhook acceptance from local runner availability."
  - name: "resumed Amp thread"
    kind: "user message appended to an existing thread"
    purpose: "Return a policy-supported event to the thread that owns the pull request."
  - name: "preserved review event"
    kind: "dead-letter record and operational notification"
    purpose: "Retain a valid event that has no applicable policy instead of asking a thread to guess an action."
  - name: "stale backlog notification"
    kind: "cloud-side notification for Chinh"
    purpose: "Report events that wait while the runner is unavailable."
supersedes: []
superseded_by: null
related: []
tags:
  - "amp-plugin"
  - "amp-runner"
  - "cloudflare-queues"
  - "github-webhooks"
  - "thread-routing"
---

# RFC-0009: Durable GitHub events for local Amp threads

## Summary

Receive selected GitHub webhook events through a Cloudflare Worker and store them in Cloudflare Queues. A plugin in the supervised stable-runner process resolves each event against a source-neutral event policy and the pull request's current owner. It appends only policy-supported, currently actionable events to an eligible thread created and running in that process.

GitHub is the first source. The initial policy set covers failed CI, pull-request merges, review feedback and merge conflicts. Project policy takes precedence over global fallback policy. An event without either policy does not resume a thread. The system preserves it for review and sends one operational notification.

This design does not use an Orb or expose the local machine through a production Tunnel. The queue accepts events while the runner is offline. A dead-letter queue preserves messages that need review or exhaust their retries. Each queue's configured retention period remains its final expiry boundary.

The local pull-request ownership slice is implemented. Source-controlled configuration, policy schemas, runtime loading and exact project-over-global lookup are also implemented. Projection remains isolated from runtime state. An injected adaptive scheduler proves the empty-pull budget without starting production polling. Queue transport, GitHub preflight, thread delivery and cloud phases remain open. This RFC therefore remains `Accepted` rather than `Implemented`.

## Context

Amp's `createWebhook` API provides durable ingress for an owning Orb thread. Its handler can create work on a named local runner, but each event still wakes the Orb first. This adds an unwanted cloud execution hop and Orb cost.

A direct Cloudflare Tunnel avoids the Orb while the local connector is online. It does not preserve events during sleep, power loss, network loss or runner maintenance. GitHub does not automatically retry failed webhook deliveries, so this design can lose the exact CI failure or merge event that should resume the thread.

Cloudflare Queues supports pull consumers outside Cloudflare. This reverses the connection: the local plugin asks Cloudflare for work only when it is ready. The public webhook endpoint stays available independently of the local runner.

The design must also correlate 2 durable identities:

- GitHub identifies work by repository and pull-request number
- Amp identifies the responsible conversation by thread ID

The plugin must record that binding when an eligible thread opens a pull request. One thread owns the pull request at a time. The owner may be a top-level thread or a subagent. Only the current owner can transfer ownership in the first version.

Transport routing alone is not enough. A policy must decide whether an event is actionable, which source state to verify and what fixed instruction to submit. This policy contract must not depend on GitHub so that later source adapters can use the same ownership, trust and delivery rules.

`appendUserMessage` submits a turn to an existing thread, but it does not select or migrate that thread's executor. `PluginThread` has no parent or executor query. An agent's executor is set only at creation. `PluginSystem.executor` reports only `local`, `remote` or `unknown`; it does not identify a runner. The first version therefore does not attach or migrate arbitrary existing threads.

The supervised stable-runner process is the trust boundary. It owns the consumer configuration and local eligibility state. A thread must be created and running in that configured process before it can bind a pull request or register to receive a transfer. The runtime spike described below proved runner reattachment after restart and the one-poller lifecycle for this boundary.

### Runtime gate evidence

On 26 July 2026, a disposable polling fixture ran on macOS 26.5.2 arm64 with Amp `0.0.1785042303-g48bae9`. The stable runner ID was `rfc9-gate-019f9d2f`. Existing thread `T-019f9d92-1856-717e-afbe-941db06377fd` was created on that runner and initially returned `/private/tmp/amp-rfc9-runtime-gate-019f9d2f`.

A supported `load_plugin` reload replaced plugin worker PID 3945, instance `069a67a5-762c-48c3-a983-7fc9d79e782d`, with PID 5582, instance `553e9116-28db-4de5-9bd2-ba539ae0e180`. The runner supervisor stayed at PID 3915. The reload produced no self-overlap events or cross-instance polling interval overlaps.

Pausing only the runner supervisor for 43 seconds made the runner disappear from `list_runners`. The same plugin worker and its single poller continued. Resuming the supervisor made the same runner and attached thread reappear. This proves supervisor suspension and reconnection behavior. It does not prove a network partition or machine-sleep behavior.

A full runner process restart changed the supervisor from PID 3915 to PID 11652. It started plugin worker PID 11675, instance `4613a122-bc82-43b9-831a-81a22e7a2660`. Amp reported `Resuming 1 thread this runner previously served`. The same existing thread replied exactly `RESTARTED RFC9-019F9D2F /private/tmp/amp-rfc9-runtime-gate-019f9d2f`, and the new plugin instance observed its agent start.

Across the initial load, reload and restart, the fixture recorded 706 completed polls, 0 incomplete polls, 0 self-overlap events and 0 cross-instance interval overlaps. The fixture was removed after the test. This evidence passes the runner reattachment and single-poller Draft gates. It does not prove the cloud queue, webhook, conflict policy, `launchd`, network-partition or machine-sleep behavior.

### Merge-conflict gate evidence

On 26 July 2026, a corrected controlled experiment used draft [pull request 128](https://github.com/lelouvincx/agent-skills/pull/128). It started from main commit `28793ddeff82c9d874b577af9e9eff2f2f5a12f5` and used branch prefix `rfc9-conflict-probe-20260726T090300Z-15510`.

The GraphQL query was `repository.pullRequest(number) { mergeable mergeStateStatus }`. Only `mergeable: CONFLICTING` and `mergeable: MERGEABLE` counted as pass states. The conflicting head converged through `UNKNOWN:UNKNOWN → UNKNOWN:UNKNOWN → CONFLICTING:DIRTY` in 2,992 milliseconds. This took 3 GraphQL requests and 2 `UNKNOWN` observations. After the same head was updated to resolve the conflict, it converged through `UNKNOWN:UNKNOWN → MERGEABLE:CLEAN` in 2,412 milliseconds. This took 2 GraphQL requests and one `UNKNOWN` observation.

The corrected fan-out check used explicit REST requests of the form `GET /repos/lelouvincx/agent-skills/pulls?state=open&base=<branch>&per_page=100&page=N`. The temporary base had one open pull request and needed one page. The configured `main` base also had one open pull request and needed one page. Open pull-request count is a conservative upper bound. Production fan-out would query only active local bindings for the repository and base branch.

Cleanup closed pull request 128 without merging it. Both temporary remote refs were absent and the temporary clone was removed. An independent coordinator check confirmed the cleanup. Pull request 126 remained `OPEN` and non-draft at head `1b345e743ab2db0032edaf3fb749f97d3f286306`.

This experiment passes the merge-conflict Draft gate at the repository's observed scale. It proves bounded `UNKNOWN` convergence for one controlled pull request and a one-page fan-out upper bound for the 2 measured bases. It does not establish production latency, larger-repository fan-out or deployed event delivery.

## Decision

Use a Cloudflare Worker and Cloudflare Queue as the durable ingress. Use an Amp plugin running on the local runner as an HTTP pull consumer, owner resolver and policy evaluator.

The production flow is:

```diagram
┌────────┐     ┌───────────────────┐     ┌──────────────────┐
│ GitHub │────▶│ Cloudflare Worker │────▶│ Cloudflare Queue │
└────────┘     │ verify and filter │     │ durable backlog  │
               └───────────────────┘     └────────┬─────────┘
                                                  │ outbound pull
                                                  ▼
                                         ┌──────────────────┐
                                         │ local Amp plugin │
                                         │ owner and policy │
                                         └──────┬──────┬────┘
                                                │      │ no policy
                                                ▼      ▼
                                     ┌──────────────┐  ┌─────────────┐
                                     │ existing PR  │  │ dead-letter │
                                     │ Amp thread   │  │ and notify  │
                                     └──────────────┘  └─────────────┘
```

Do not use `amp.createWebhook` because its durable endpoint belongs to an Orb. Do not use a direct Tunnel as the production endpoint because it cannot accept events while the connector is offline.

A Tunnel may be used for local Worker or webhook testing. It is outside the production contract.

## Contract

### GitHub source adapter

The first source adapter recognizes candidate signals for these policy families:

| Policy ID | GitHub candidate signal | Actionable check |
| --- | --- | --- |
| `github.workflow-run.failure` | `workflow_run` is `completed` with conclusion `failure`, and its associated pull-request list contains exactly one pull request | the failed run still belongs to that bound pull request and relevant head commit |
| `github.pull-request.merged` | `pull_request` is `closed` and `merged` is `true` | the pull request is still merged |
| `github.pull-request.review-feedback` | `pull_request_review` is `submitted`, or `pull_request_review_comment` is `created` or `edited` | current unresolved review state contains feedback covered by policy; the actor is evidence for the policy's trust decision |
| `github.pull-request.merge-conflict` | `pull_request` is `opened`, `synchronize`, `reopened`, `ready_for_review` or `edited`, or a configured base branch receives a `push` | GraphQL reports the current pull request's `mergeable` value as `CONFLICTING` |

GitHub does not publish a dedicated merge-conflict webhook action. The conflict policy therefore treats pull-request changes and configured base-branch pushes as candidate signals. Worker configuration lists the repositories and base branches that can emit this candidate. The local evaluator must query `repository.pullRequest(number) { mergeable mergeStateStatus }` through GitHub's [GraphQL API](https://docs.github.com/en/graphql/reference/objects#pullrequest) before it resumes any thread. Only `mergeable: CONFLICTING` confirms a merge conflict. `UNKNOWN` or a null result gets a bounded retry and then moves to review as `indeterminate-mergeability`. Branch protection, missing approvals, failing checks and other merge blocks are not merge conflicts.

A base-branch push may fan out to every active binding for that repository and branch. The controlled experiment passed the Draft gate with one open pull request and one REST page for each measured base. This is an upper-bound observation at the current repository scale, not a production-volume guarantee. The implemented evaluator must fan out through active local bindings rather than all open pull requests.

The Worker rejects unsupported methods, invalid signatures and oversized bodies. It acknowledges valid source events outside the supported candidate set without enqueuing them. It enqueues a supported candidate even when no policy is configured locally, because policy resolution happens after the local consumer finds the project.

### Source-neutral queue event

The Worker enqueues a small source-neutral envelope instead of the complete GitHub payload:

```json
{
  "schema": "amp-thread-event/v1",
  "policyCandidate": "github.workflow-run.failure",
  "source": {
    "kind": "github",
    "deliveryID": "github-delivery-guid",
    "event": "workflow_run",
    "action": "completed",
    "occurredAt": "2026-07-26T00:00:00Z",
    "receivedAt": "2026-07-26T00:00:01Z",
    "url": "https://github.com/owner/repository/actions/runs/123"
  },
  "target": {
    "kind": "pull-request",
    "repository": "owner/repository",
    "pullRequest": 123,
    "headSHA": "full-commit-sha"
  }
}
```

The source adapter owns the fields inside `source`. The shared envelope owns `schema`, `policyCandidate` and `target`. A target may identify one pull request or a repository branch that the local consumer expands through active bindings. The adapter also owns pre-policy minimization: it keeps only the fields needed to identify, preflight and route that candidate family.

`source.occurredAt` is optional and family-specific. It follows the [GitHub webhook payload fields](https://docs.github.com/en/webhooks/webhook-events-and-payloads): `workflow_run.completed_at` for workflow completion, `pull_request.merged_at` for a merge, `review.submitted_at` for a submitted review, and the review comment's `created_at` or `updated_at` for review-comment creation or editing. A pull-request conflict candidate may use `pull_request.updated_at` only when that field represents the candidate update. A generic push has no reliable top-level occurrence timestamp, so its envelope omits `source.occurredAt`. `source.receivedAt` is always the Worker ingress time. GitHub provides no universal ordering key across these webhook families, so neither timestamp nor the delivery ID establishes total source order.

The schema may add fields compatibly. A breaking change requires a new schema version. The source adapter defines the minimum envelope fields for each policy-candidate family before local policy resolution. Review candidates include actor identity because their policies may need a trust decision. Candidate families that do not need actor identity omit it. Do not include pull-request bodies, comments, commit messages, logs or other free-form text.

The selected local policy defines the smaller set of fields used in the appended message. It omits every envelope field that the policy action does not need.

Do not coalesce separate deliveries. Preserve the source occurrence time when available, ingress time and delivery ID so the receiving thread can reconstruct the timeline. For 2 messages simultaneously ready for one owner, compare occurrence time only when both messages have it. Otherwise compare ingress time. Use delivery ID as the final tie-breaker. Every policy must check current source and commit state before submitting a turn.

Cloudflare retries may make an older delivery visible after a newer batch. The first version provides no strict execution-order guarantee across batches or retries and has no per-target sequencer. The preserved timeline metadata and mandatory current-state preflight make delayed events observable and stop stale events from directing work.

### Event policy

An event policy is a structured rule. The local consumer resolves it without using an LLM. Each policy defines:

- a stable, source-qualified policy ID
- the source candidate it accepts
- the target identity and current-state preflight
- the fixed action submitted to the owner thread
- the minimum source pointers required by that action
- any actor trust rule
- the expiry behavior within the deployment's bounded retention

The consumer first looks for an exact project policy for the bound repository and policy ID. It then uses the global policy with the same ID. Project policy overrides the global fallback. The repository configuration below fixes the file locations. The final capability document must define the schema before implementation.

Policies do not expand the owner thread's existing authority. The trusted actors are `lelouvincx`, `lelouvincx-bot` and `chinh-dm-holistics`. Text from another actor remains untrusted evidence unless the selected policy grants that actor instruction authority. The plugin never turns a comment body into an instruction. It appends a fixed policy action and a canonical URL from which the thread can inspect current evidence.

If neither project nor global policy exists, the consumer does not append to the thread. It copies the event to the dead-letter queue with reason `missing-event-policy` and acknowledges the primary lease only after that copy succeeds. The dead-letter monitor provides one latched operational notification while that queue remains nonempty. The dead-letter record preserves the envelope for review until its documented retention expires.

The first version uses the primary queue's configured retention for all accepted events. Dead-letter records may use a separately configured Queue retention. A future higher-value policy that must survive longer than Cloudflare Queue retention needs a separate durable storage design before it can be enabled.

### Repository configuration and projection

This repository is the source of truth for non-secret GitHub event configuration and policies. `sync-skills.sh` must project the complete `amp/github-thread-events/` directory to `${AMP_CONFIG_DIR}/github-thread-events/` without projecting the local SQLite state back into the repository.

| Purpose | Repository source | Runtime projection |
| --- | --- | --- |
| monitored repositories and base branches | `amp/github-thread-events/config.json` | `${AMP_CONFIG_DIR}/github-thread-events/config.json` |
| global event policies | `amp/github-thread-events/policies/global.json` | `${AMP_CONFIG_DIR}/github-thread-events/policies/global.json` |
| project event policies | `amp/github-thread-events/policies/projects/<owner>/<repository>.json` | `${AMP_CONFIG_DIR}/github-thread-events/policies/projects/<owner>/<repository>.json` |

The monitored targets are `lelouvincx/agent-skills` on `main`, `lelouvincx/second-brain-logseq` on `master` and `lelouvincx/dotfiles` on `main`. The first deployment uses the Cloudflare Free plan. Adaptive polling must remain within that plan's Queue operation budget.

The stale-backlog notification destination is Slack channel `#chinh-amp-experiment`, channel ID `C0BKVJXBH98`. Configuration stores the channel ID, not a Slack credential.

The selected global or project policy decides how to handle a merged pull request. A policy may only report the merge, or report it and ask the owner thread to archive itself after required cleanup. Project policy overrides the global fallback.

These files contain no secrets or runtime ownership state. Credentials stay in the approved 1Password and macOS Keychain path. Recipient and binding state stays in `${AMP_CONFIG_DIR}/state/github-thread-events.sqlite`.

When the exact opt-in is enabled, the plugin reads only the projected runtime paths in this table. It does not use repository-relative paths or Python. Before opening ownership state or registering tools, it validates `config.json` and the global policy file. It also validates every existing exact project file for a configured repository. Missing or invalid files make startup fail closed. So do malformed JSON, unsupported versions, unknown or forbidden fields and duplicate values. Unsafe or mismatched project paths and invalid policy-pointer rules also stop startup. Errors do not include file contents or values.

Runtime validation repeats the closed shapes and semantic rules needed at the trust boundary. Repository validation also checks the schemas, complete source tree, required initial global policies and reviewed content. An invalid project file blocks startup and global fallback. The plugin returns a valid matching project policy whole, without a deep merge. If that file does not contain the requested ID, the plugin uses the validated global policy. If neither file defines the ID, lookup returns `missing-policy` with reason `missing-event-policy`.

### Pull-request thread binding

The accepted local ownership slice uses one opt-in system plugin at `plugins/github-thread-events.ts`. It registers these agent tools only when `AMP_GITHUB_THREAD_EVENTS_ENABLED=1` in the configured stable-runner process:

- [`bind_pr_to_thread`](../tools/bind-pr-to-thread.md)
- [`register_thread_event_recipient`](../tools/register-thread-event-recipient.md)
- [`transfer_pr_thread_owner`](../tools/transfer-pr-thread-owner.md)

Deployment must set the opt-in only for that process. The Plugin API does not expose a runner ID, so the plugin does not query or claim one. A tool invocation supplies the eligible thread ID through `ctx.thread.id` in the opted-in process.

The local ownership state uses one SQLite database at `${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite`. It stores no secret. The ownership slice uses 2 tables:

```text
recipients(thread_id, registered_at)
bindings(repository, pull_request, base_ref, owner_thread_id, updated_at)
```

`recipients.thread_id` is unique. `(bindings.repository, bindings.pull_request)` is the unique pull-request key. `bindings.owner_thread_id` references a registered recipient. Repository identity is stored as lowercase `owner/repository`.

The plugin keeps the database open for the plugin worker-process lifetime. Amp exposes no supported cleanup callback, so process exit closes the runtime database. The store's exported `close()` is for tests and reopen verification only.

`bind_pr_to_thread` accepts:

```json
{
  "repository": "owner/repository",
  "pullRequest": 123,
  "baseRef": "main"
}
```

The plugin takes the owner thread ID only from `ctx.thread.id`. In one transaction, it registers that owner and creates the unique repository and pull-request binding. A call from the same owner is idempotent. The same owner may update `baseRef`. A different invoking thread cannot replace the binding.

Repository must normalize to lowercase `owner/repository`. `pullRequest` must be a positive integer. `baseRef` must be non-empty.

Create or select the responsible thread in the configured stable-runner process before opening and binding a pull request. After that thread opens a pull request, repository guidance should require it to bind before declaring the pull-request workflow complete. The tool is absent from processes without the opt-in. This process boundary replaces command-output parsing and does not add an executor query.

Before receiving a transfer, the destination thread must invoke `register_thread_event_recipient` in the same configured process. Registration takes no input and records only its own `ctx.thread.id`. It is idempotent, creates no binding and grants no ownership.

`transfer_pr_thread_owner` accepts repository, positive integer pull-request number and destination thread ID. In one transaction, it requires the invoker to be the current owner and the destination to be registered. It then replaces the owner. A destination, parent or unrelated thread that is not the current owner cannot transfer or take ownership. A parent may ask the owner to transfer, but cannot execute the transfer in the first version. Parent-authorized transfer is deferred until Amp exposes a supported parent query.

The first version has no attach, assignment or migration path for an arbitrary existing thread. A destination created elsewhere cannot register or receive a transfer. The runtime spike proved reattachment for a thread created on the stable runner after the supervised process restarted. It did not establish an executor query or migration path.

A bound subagent remains the direct event recipient. It follows its existing parent-reporting contract after the turn starts. The delivery system must not notify the parent automatically unless a mandatory escalation rule applies. Those rules include inability to continue, need for authority or input, an ownership-transfer request, or a material risk outside the subagent's scope.

### Local pull consumer

The local plugin uses Cloudflare's [HTTP pull consumer API](https://developers.cloudflare.com/queues/configuration/pull-consumers/). It sends `POST /accounts/{account_id}/queues/{queue_id}/messages/pull` with `batch_size` and `visibility_timeout_ms`. `batch_size` defaults to 5 and must not exceed 100. `visibility_timeout_ms` defaults to 30 seconds and must not exceed 12 hours. Pulls use short polling; an empty queue returns immediately. Each leased message contains `id`, `body`, `timestamp_ms`, `attempts`, `lease_id` and content-type metadata. The Worker publishes the normalized envelope as UTF-8 JSON with Cloudflare's `text` content type. The consumer requires that content type, parses `body` directly as JSON and rejects unsupported messages. It uses `lease_id` only for acknowledgement or retry.

The scheduler polls once immediately. A non-empty response resets the delay to the configured 15-second active interval. The first consecutive empty response waits 30 seconds. The second and later empty responses wait the configured 60-second maximum. This deterministic 2-step backoff needs no jitter. The design permits only one local consumer process.

In a 24-hour half-open window, an always-empty queue causes 1,441 pull operations. It pulls once immediately, again after 30 seconds and then every 60 seconds. This is below the checked-in Free-plan limit of 10,000 daily Queue operations. This slice models pull operations only. Add Queue writes, acknowledgements, retries and metrics checks to the budget before deployment.

The scheduler boundary accepts injected pull and sleep functions. Tests use fakes for both. This slice does not provide Cloudflare transport or start production polling when the plugin loads. It makes no HTTP call and reads no Cloudflare account or queue ID. It acknowledges no message, queries no GitHub state, appends to no thread and changes no delivery state. Production polling remains disabled until those later boundaries are implemented and budgeted.

Amp documents plugins as long-lived processes. The runtime spike proved that a system plugin can keep one timer active across supported plugin reload, supervisor reconnection and full `amp --no-tui` restart.

For each leased message, the plugin:

1. validates the normalized schema;
2. expands a repository-branch target into active pull-request bindings when required;
3. checks the source delivery and target identity against local reconciliation state;
4. resolves the active owner and project or global event policy;
5. groups simultaneously ready target deliveries by owner and sorts each group by preserved timeline metadata;
6. checks the current source, commit and trust state required by that policy immediately before each append;
7. preserves a missing-policy event for review, or records a stale or non-actionable event without resuming a thread;
8. records the owner thread ID and `append-pending` timestamp for an actionable event;
9. appends the fixed policy message with `steer: true`;
10. records the completed target delivery locally; and
11. acknowledges the queue lease after every expanded target has reached a terminal stage and Cloudflare returns a successful acknowledgement response.

`appendUserMessage` submits a turn to the existing thread. The `steer` option only gives that message priority when the thread is busy. It does not wake a runner, choose an executor or migrate the thread.

If no binding exists, the plugin retries with a delay for a binding grace period of no more than 3 minutes from the first lease. When the grace period ends, it copies the event to the dead-letter queue with reason `missing-thread-binding`. It acknowledges the primary lease only after that copy succeeds. A repeated dead-letter copy remains identifiable by the source delivery ID and target identity.

A repository-branch target that expands to no active bindings is not a missing pull-request binding. The plugin records it as `stale-or-non-actionable` and acknowledges it without dead-lettering or notification. This prevents routine base-branch pushes from creating false backlog alerts.

### Existing-thread message

The appended message is a pointer to the source event, not a copy of it. The plugin includes only:

- the delivery ID needed for reconciliation
- the event-policy identifier
- the repository and pull-request identity
- the relevant commit when the policy needs it
- the canonical source URL
- the actor only when the policy needs it for a trust decision

The plugin omits every field that the matching policy does not need. For example:

```text
[verified GitHub event: <delivery ID>]
Policy: github.workflow-run.failure
Target: owner/repository#123@<full SHA>
Source: https://github.com/owner/repository/actions/runs/123

Inspect the failed workflow and repair it if it still applies to the current pull-request head. Check current source and commit state before acting.
```

The delivery marker and target identity let the plugin and thread identify a repeated event. The plugin must not paste the raw webhook payload, event body, review comment or log into the thread. The responsible thread fetches current details from the canonical source only when its policy needs them.

### Delivery completion boundary

The first version completes delivery when Amp accepts the append and submits the new turn to the owner thread. The plugin does not track whether the thread completes the policy action. Action completion, escalation outcomes and end-to-end workflow state are future work.

### Queue acknowledgement and reconciliation

The system provides at-least-once processing, not exactly-once delivery. Cloudflare acknowledgement and Amp thread append cannot share one transaction.

The consumer sends `POST /accounts/{account_id}/queues/{queue_id}/messages/ack` with an `acks` array of `{ lease_id }` objects and a `retries` array of `{ lease_id, delay_seconds? }` objects. `delay_seconds` must not exceed 86,400 seconds. It records the operation only when Cloudflare returns `success: true` and `result.ackCount` or `result.retryCount` matches the expected count. An acknowledgement or retry received after its visibility timeout may apply after another consumer has leased the message, so late acknowledgement creates duplicate-processing risk. The consumer must treat an expired or rejected lease as uncertain and reconcile before another append. The normalized envelope and Cloudflare metadata must stay within Cloudflare's 128 KB message limit.

The local state records these stages for each source delivery and expanded target:

```text
leased
→ evaluated
  ├─→ stale-or-non-actionable
  ├─→ preserved-for-review
  └─→ append-pending → appended
→ acknowledged
```

On restart, an `append-pending` target delivery is uncertain. The plugin checks the target thread for its verified delivery marker and target identity. If the marker exists, it records `appended`. If the marker does not exist, it appends the message. It completes acknowledgement only when every expanded target is appended, intentionally non-actionable or preserved in the dead-letter queue, and Cloudflare returns a successful acknowledgement response.

The reconciliation search must not rely on the default recent-message window. It requests full messages and uses offsets to paginate backwards to the start of the transcript. Only then may it conclude that the marker is absent. The plugin API does not expose message timestamps, so the recorded `append-pending` timestamp is for recovery diagnostics rather than a search boundary.

This closes the normal crash window but does not claim mathematical exactly-once behavior. The event prompt must remain safe when repeated.

Configure the primary queue with `max_retries` set to 100 and a dead-letter queue. The message's `attempts` value counts full delivery attempts. Cloudflare's configured retry-exhaustion routing moves a message to that dead-letter queue after `max_retries`. This differs from an application decision such as `missing-event-policy`: the plugin publishes a dead-letter record directly with `POST /accounts/{account_id}/queues/{dead_letter_queue_id}/messages`, then acknowledges the primary lease only after that publish succeeds. Cloudflare permanently deletes an exhausted message when no dead-letter queue is configured. This deployment must never run the primary queue without its dead-letter queue.

The dead-letter queue holds malformed events, exhausted processing failures, missing-policy events and events that remain unbound after the grace period. It has the same stale-backlog monitoring requirements as the primary queue, but may have a different documented retention. Retry exhaustion must move an event to this queue rather than delete it.

### Offline retention and notification

[Cloudflare Queue retention](https://developers.cloudflare.com/queues/configuration/message-retention/) preserves messages while the runner is offline:

- 24 hours on the Workers free plan
- 4 days by default on a paid plan, configurable from 60 seconds to 14 days

The source-controlled first-deployment configuration selects the Cloudflare Free plan. It records the plan's 24-hour retention assumption for both primary and dead-letter queues. Deployment must verify these assumptions against current Cloudflare limits before creating either queue.

A scheduled Worker checks both queues once per minute. It reads best-effort `backlogCount` and `oldestMessageTimestamp` values through each Queue binding's [`metrics()` API](https://developers.cloudflare.com/queues/configuration/javascript-apis/#queue-metrics). Metrics may be delayed or unavailable. The monitor normalizes an absent, invalid or unknown oldest timestamp to `unknown` and does not infer an age from it. When a known oldest message has waited more than 5 minutes, it sends one notification and records one alert latch per queue in Workers KV. It clears each latch when the best available count reaches zero. It sends another notification if a known oldest event approaches that queue's retention deadline.

An unbound event can contribute to the primary backlog during its 3-minute binding grace period. This is shorter than the 5-minute alert threshold when the runner is polling normally. The notification must still report stale queued work, not claim that the runner is offline. Once the plugin moves the event, the primary latch can clear independently. A later dead-letter notification reports the dead-letter backlog count without exposing event payloads.

Slack through an incoming webhook is the preferred first notification destination. The notification integration remains optional until Chinh supplies and approves that destination.

### Secret boundary

Cloudflare stores the GitHub webhook signing secret as a Worker secret. The repository stores no secret value.

The local consumer needs a Cloudflare API token with the [`Queues Edit` permission](https://developers.cloudflare.com/fundamentals/api/reference/permissions/), which provides Queue read and write access. It also needs read access to current GitHub pull-request, review, workflow and branch state. Public repositories may not need GitHub authentication. Private repositories require a least-privilege GitHub credential. A dedicated 1Password service account resolves these credentials from one dedicated automation vault. The service account has read-only vault access and no vault-creation permission.

The scheduled Worker uses Queue and Workers KV bindings for metrics and alert-latch state. These bindings do not require a Cloudflare API token in the Worker. If Slack notifications are enabled, Cloudflare stores the incoming webhook URL as a Worker secret.

The 1Password service-account token is a bootstrap credential. On macOS, store it in login Keychain. A supervised startup wrapper reads it into `OP_SERVICE_ACCOUNT_TOKEN`, then runs Amp through `op run --env-file`. The env file contains only `op://` references.

[Amp thread T-019f4f39](https://ampcode.com/threads/T-019f4f39-34b7-7169-9005-a5d36a49c642) is resolving the same unattended authentication failure class for separate weekly-report automation. Review its service-account findings before implementation, but keep this runner's bootstrap choice independent unless Chinh explicitly aligns them.

The implementation must not store the service-account token, Cloudflare token, GitHub credential, GitHub signing secret or Slack webhook in the repository or a plaintext local env file.

## Behavior

### Runner online

1. GitHub sends a signed event to the Worker.
2. The Worker validates the signature and event conditions.
3. The Worker normalizes and enqueues the event.
4. The local plugin leases the event within the polling interval.
5. The plugin resolves the owner and project or global policy.
6. The plugin checks current source, commit and trust state.
7. For an actionable event, the plugin appends the fixed policy message to the owner thread.
8. `appendUserMessage` submits a turn in that existing thread.
9. Amp runs the turn in the eligible runner thread recorded by the configured consumer process.
10. The plugin records delivery and acknowledges the lease.

### Runner offline

1. GitHub sends the event while the runner or machine is unavailable.
2. The Worker still validates and queues the event.
3. GitHub receives a successful response and does not need to retry.
4. The message remains in the queue.
5. The stale-backlog check notifies Chinh after 5 minutes.
6. When the runner starts, the plugin immediately polls and processes the backlog.
7. The plugin evaluates the event against current policy and source state.
8. The plugin submits an actionable turn to the owner thread.
9. Amp runs the turn in the eligible runner thread recorded by the configured consumer process.
10. The primary queue alert latch clears after the primary queue drains.

The runtime spike proved that the stable runner reattaches its recorded eligible thread after restart. It did not prove production recovery or add migration from another runner or process.

### Duplicate delivery

Cloudflare may deliver one GitHub delivery more than once. The plugin uses the source kind, source delivery ID, policy ID and expanded target identity as the deduplication key. It does not use Cloudflare's ephemeral message ID.

If local state already records one target as `appended`, the plugin skips that target without appending another message. It acknowledges the source lease only after every expanded target has reached a terminal stage.

This key does not deduplicate a separate GitHub delivery with a new delivery ID. If GitHub assigns a new ID to a manual redelivery, the plugin treats it as a new, safe-to-repeat event message.

### Missing event policy

If neither project nor global policy defines the candidate, the plugin does not resume the owner thread. It preserves the event in the dead-letter queue with reason `missing-event-policy`. The dead-letter monitor sends one latched operational notification if the queue remains nonempty for 5 minutes. No LLM selects or invents an action.

Adding a policy later does not silently replay preserved events. Chinh must approve replay from the dead-letter queue because the source state may have changed.

### Review feedback and actor trust

The review-feedback policy checks current unresolved review state. A project policy can decide which review states are actionable and which actors may give instructions. The global fallback trusts `lelouvincx`, `lelouvincx-bot` and `chinh-dm-holistics` by default.

Feedback from another actor can still resume the owner when the policy treats it as evidence to assess. The appended message contains the fixed policy action, actor identity and canonical review URL. It does not contain the review text or grant that actor more authority.

### Merge conflict candidate

A pull-request change targets one binding. A base-branch push can target several active bindings. The plugin expands the candidate, checks each pull request's current mergeability and resumes only owners whose pull request is currently blocked by a merge conflict.

If GitHub reports `UNKNOWN` or null mergeability, the plugin returns the lease for bounded retry. It does not resume the thread until GitHub reports `CONFLICTING`. The implementation must define the retry limit before this policy ships. Exhaustion preserves the event with reason `indeterminate-mergeability`.

### Ownership transfer

The destination thread first registers as a recipient in the configured consumer process. The current owner then explicitly transfers ownership to that registered destination. Registration alone grants no ownership. Events leased after the atomic transfer go only to the new owner. An event already in `append-pending` completes against the owner recorded for that target delivery, which prevents one event from reaching both threads.

A parent may request a transfer from the current owner, but cannot execute it. Parent-authorized transfer is deferred until Amp exposes a supported parent query.

A subagent owner receives the event directly. It reports to its parent only under its normal escalation contract. Transport delivery alone is not an escalation trigger.

### Missing pull-request identity

For `workflow_run`, the Worker uses the associated pull-request list when it contains one unambiguous pull request. If the payload does not identify exactly one pull request, the first implementation writes the normalized event to the dead-letter queue with reason `missing-pull-request-identity`. It does not guess a thread.

A later implementation may resolve the head SHA through GitHub's API with a least-privilege token. This fallback must be documented and tested before it can route unmatched events.

### Missing thread binding

If the queue event identifies a pull request but local state has no binding, the plugin returns the lease for delayed retry during the binding grace period. Once the responsible thread binds the pull request, the next delivery can proceed.

If no binding appears before the 3-minute grace period ends, the plugin copies the event to the dead-letter queue and then acknowledges the primary lease. This bounds retries for pull requests that no Amp thread opened. The primary alert latch must clear after the event leaves the primary queue. Dead-letter monitoring reports the queue and backlog count without exposing the payload.

### Runner supervision

A `launchd` service keeps the local Amp runner and plugin available after login and restarts the process after failure. It does not prevent delays while the machine is asleep or powered off. Cloudflare Queues covers those delays within its retention period.

## Permissions and side effects

The Cloudflare Worker may:

- receive public HTTPS requests at its webhook route
- read the raw request body and selected GitHub headers
- verify the GitHub HMAC signature
- enqueue normalized events
- read realtime backlog metrics through primary and dead-letter Queue bindings on its schedule
- read and write alert-latch values through a Workers KV binding
- send an approved stale-backlog notification
- write structured logs without request bodies or secrets

The local Amp plugin may:

- register `bind_pr_to_thread`, `register_thread_event_recipient` and `transfer_pr_thread_owner` only when `AMP_GITHUB_THREAD_EVENTS_ENABLED=1`
- read and write `${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite` for local recipient and ownership state
- read Cloudflare account, queue and polling configuration
- make outbound Cloudflare Queue pull, publish and acknowledgement requests
- read structured project and global event policies
- read current GitHub pull-request, review, workflow and branch state
- read and write local thread ownership bindings, delivery stages and deduplication state
- read paginated full messages from a bound Amp thread during uncertain reconciliation
- append a user message to a bound Amp thread with `steer: true`
- log delivery IDs, event types and outcomes without secret values or raw payloads

The supervised startup path may:

- read one service-account token from macOS Keychain
- run `op run` with an env file containing only `op://` references
- start `amp --no-tui` with a stable runner ID
- restart the runner after process failure

Deployment may create or change shared Cloudflare resources and GitHub webhook configuration. It requires Chinh's explicit approval. The implementation must not deploy, register a webhook, create a 1Password service account or modify Keychain without that approval.

## Examples

Bind a pull request to the current thread:

```json
{
  "repository": "lelouvincx/agent-skills",
  "pullRequest": 126,
  "baseRef": "main"
}
```

Register the destination thread from that destination in the same configured consumer process:

```json
{}
```

Call `register_thread_event_recipient`. Registration proves eligibility but grants no ownership.

Transfer ownership from the current owner to the registered destination:

```json
{
  "repository": "lelouvincx/agent-skills",
  "pullRequest": 126,
  "destinationThreadID": "T-..."
}
```

Route a failed workflow:

```text
workflow_run.completed + failure
  → verify GitHub signature
  → queue amp-thread-event/v1
  → resolve lelouvincx/agent-skills#126
  → select project policy or global fallback
  → verify current workflow and head SHA
  → append to T-...
  → submit turn to the eligible thread in the configured consumer process
  → acknowledge queue lease
```

Preserve a candidate without a policy:

```text
verified candidate
  → resolve no project or global policy
  → copy to dead-letter queue as missing-event-policy
  → dead-letter monitor sends one latched notification after 5 minutes
  → do not append or submit a turn
```

Recover after an offline period:

```text
10.00am  runner machine sleeps
10.04am  GitHub reports CI failure; Worker queues it
10.09am  stale-backlog notification is sent
11.15am  machine wakes; launchd restarts runner
11.15am  plugin pulls event and submits a turn to the bound thread
11.15am  plugin acknowledges event; alert latch clears
```

Start the runner without a plaintext env file:

```text
launchd
  → read OP_SERVICE_ACCOUNT_TOKEN from macOS Keychain
  → op run --env-file <op-reference-only file>
  → amp --no-tui --runner-id github-events
```

## Maintenance notes

Implement in this order:

1. Stable-runner reattachment passed on 26 July 2026. The supervised runner restored its existing thread after process restart, and the submitted turn ran there without migration or an executor query.
2. The one-poller lifecycle passed on 26 July 2026 across plugin load, supported reload, supervisor reconnection and full process restart. All transitions resumed polling without overlap, duplicate timers or a manual interactive client.
3. The merge-conflict experiment passed on 26 July 2026. It proved bounded convergence for one controlled pull request and one-page upper bounds for both measured bases.
4. RFC-0009 passed acceptance review on 26 July 2026 after all 3 Draft gates passed. Its status is `Accepted`, not `Implemented`.
5. The documented local ownership slice and its tests are implemented in `plugins/github-thread-events.ts` and `scripts/github-thread-events.test.ts`.
6. The repository configuration and policy contract is implemented under `amp/github-thread-events/`. JSON Schema, repository validation and runtime decoding prove exact project replacement and global fallback. They also prove typed missing policy and invalid-file failure. `sync-skills.sh` projects the complete directory without runtime SQLite state.
7. The injected adaptive scheduler is implemented without production transport or startup. Its deterministic budget model proves 1,441 all-day empty pull operations against the configured 10,000-operation limit.
8. Implement and test the Cloudflare Worker, primary queue, dead-letter queue, metrics check and Workers KV latches on the Cloudflare Free plan.
9. Implement Queue transport, production polling, full-history reconciliation and thread append. Add writes, acknowledgements, retries and metrics to the operation budget before deployment.
10. Create the dedicated 1Password automation vault and read-only service account after reviewing the related findings in [Amp thread T-019f4f39](https://ampcode.com/threads/T-019f4f39-34b7-7169-9005-a5d36a49c642).
11. Store the service-account token in macOS Keychain and add the supervised runner startup path.
12. Deploy Cloudflare resources and register the GitHub webhook after Chinh's explicit approval.
13. Test all 4 initial event policies, online and offline delivery, recipient registration, owner-only transfer, duplicates, ready-batch sorting, current-state preflight, missing policy, retry exhaustion and missing binding.

- Keep [ISSUE-0002](../issues/issue-0002-durable-github-events-for-local-amp-threads.md) as the evidence and resolution record.
- Add the capability documents before implementing the plugin.
- Keep the source-neutral event envelope, GitHub adapter and local parser versioned together.
- Keep project and global policy schemas aligned and test project precedence.
- Keep GitHub event conditions aligned with current webhook payload documentation.
- Keep Queue pull, acknowledgement, metrics and retention behavior aligned with current Cloudflare documentation.
- Keep `@ampcode/plugin` types aligned with the Amp CLI version used to load the plugin.
- Keep non-secret configuration and policies under `amp/github-thread-events/`, project them through `sync-skills.sh` and keep runtime state outside projected repository artifacts.
- Test plugin reload, process restart, machine downtime, duplicate delivery, missing policy, missing binding, retry exhaustion, dead-letter routing and retention expiry.
- Test that reconciliation searches beyond the default message page and across compacted history.
- Test that each event policy appends only its minimum required identifiers and source references.
- Test trusted and untrusted review actors without copying review text into the thread.
- Test direct subagent delivery, recipient registration, owner-only transfer and every mandatory parent-escalation trigger.
- Test stale and out-of-order events against current source and commit state.
- Measure empty-poll operations against the selected Cloudflare plan before deployment.
- Run the Amp document validators, plugin build checks and isolated projection before merging implementation.
- Keep this RFC at `Accepted` until the production plugin and cloud workflow satisfy the full contract. The 3 Draft gates and accepted design do not establish production behavior.

## Open questions

The next implementation phase must add Queue transport and delivery behind the injected scheduler boundary. Before deployment, it must include every added Queue operation in the Free-plan budget. These are implementation tasks, not outstanding product decisions.
