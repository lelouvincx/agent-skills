---
doc_schema: "amp-issue/v1"
code: "ISSUE-0002"
title: "Durable GitHub events for local Amp threads"
slug: "durable-github-events-for-local-amp-threads"
file: "issue-0002-durable-github-events-for-local-amp-threads.md"
status: "In progress"
priority: "P1"
summary: "Local pull-request ownership is implemented, but GitHub events cannot yet return reliably to the responsible Amp thread."
created: "2026-07-26"
updated: "2026-07-26"
amp_thread_id:
  T-019f9241-c27f-7395-8fd1-f6284344d869: "investigated Amp webhooks, local runner delivery, offline queuing and unattended secret access"
  T-019f4f39-34b7-7169-9005-a5d36a49c642: "acknowledged the unattended 1Password failure and designed service-account authentication for weekly-report automation"
  T-019f9d2f-33b0-76ce-ad76-9b75ed3944e5: "aligned the issue with the approved v1 eligibility, transfer and ordering boundaries"
artifacts:
  - "bind-pr-to-thread"
  - "register-thread-event-recipient"
  - "transfer-pr-thread-owner"
implementation:
  - path: "../rfcs/rfc-0009-durable-github-events-for-local-amp-threads.md"
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
pull_requests:
  - "https://github.com/lelouvincx/agent-skills/pull/126"
  - "https://github.com/lelouvincx/agent-skills/pull/130"
related: []
tags:
  - "amp-runner"
  - "cloudflare-queues"
  - "github-webhooks"
  - "reliability"
  - "thread-routing"
---

# ISSUE-0002: Durable GitHub events for local Amp threads

## Summary

GitHub events cannot yet return reliably to the local Amp thread that opened a pull request. Amp's durable webhook API wakes an owning Orb. A direct Cloudflare Tunnel stops accepting events when its local connector is offline. GitHub does not automatically retry failed webhook deliveries.

The desired workflow uses an always-on local Amp runner when available. It must queue events while the runner or machine is unavailable. When the runner returns, it must append each event to the existing pull-request thread and submit a new turn without creating an Orb.

[RFC-0009](../rfcs/rfc-0009-durable-github-events-for-local-amp-threads.md) is accepted. Disposable experiments passed its stable-runner reattachment, single-poller and merge-conflict Draft gates. The production-projected local plugin implements the 3 ownership tools and their SQLite state. Source-controlled configuration, policy schemas, precedence validation and isolated projection are also implemented. Runtime policy loading, queue pulling, GitHub preflight, thread delivery, cloud infrastructure and deployment remain unimplemented.

## Trigger

[Amp thread T-019f9241](https://ampcode.com/threads/T-019f9241-c27f-7395-8fd1-f6284344d869) began by updating the local Amp SDK workspace and investigating [Amp's event-driven Orb announcement](https://ampcode.com/news/event-driven-orbs).

The initial question was whether `amp.createWebhook` could spawn a local runner instead of an Orb. The current [Amp Plugin API](https://ampcode.com/manual/plugin-api) permits a webhook handler to create a thread with `executor: { type: "runner", id }`. However, the webhook remains registered to an owning Orb thread, and an event first wakes that Orb.

Chinh (`lelouvincx`) rejected that bridge and described the required workflow:

- receive GitHub events for CI failure, pull-request merge, code review and code conflict
- identify the Amp thread that opened the affected pull request
- append the event to that existing thread
- run the resumed work on an always-on local runner
- queue events when the runner is unavailable
- notify Chinh when queued work remains stale
- resolve runtime secrets without repeated 1Password biometric prompts

Chinh initially preferred a Cloudflare Tunnel because Wrangler is already installed. The offline requirement exposed a delivery gap that a Tunnel alone cannot solve.

## Original intent

An external event related to a pull request should return to the Amp thread responsible for that pull request and automatically submit a new turn there. This preserves the thread's reasoning, context and responsibility.

The responsible thread may be a top-level thread or a subagent. An event resumes the responsible subagent directly. The subagent notifies its parent only when a mandatory escalation trigger applies or it judges the signal important. Mandatory triggers include being unable to continue, needing authority or input, requesting an ownership transfer, or finding a material risk outside its scope.

One thread owns the pull request at a time. The responsible thread or its parent may explicitly transfer ownership to the parent or another thread. Until then, the current owner remains authoritative.

Only policy-supported actionable events resume a thread. GitHub is the first source, starting with failed CI, pull-request merges, review comments and merge conflicts. The first version should define a source-neutral event-policy primitive so later webhook sources can use the same ownership model.

Project policy takes precedence when it defines the event. Global policy provides the fallback. Policies define the expected action and trusted actors without expanding the thread's existing authority. The default trusted actor is `lelouvincx`. Text from other actors remains evidence unless a policy grants that actor instruction authority.

The appended event must be as small as possible. It contains only the policy identifier and source references needed to identify the target, check current state and fetch details. It must not copy the raw webhook payload, free-form bodies, comments or logs into the thread.

An event without a project or global policy must not resume a thread. The system preserves it for review and sends one operational notification instead of asking the agent to guess an action.

Events wait for the responsible local runner. An Orb must not act as a fallback because it cannot reproduce the same environment and execution context. For the initial GitHub use case, an event may be discarded after a documented retention period. A future higher-value event policy may require longer-lived storage and notification before expiry.

Queued events preserve their order and timeline. Before acting, the event policy checks the current source and commit state so stale events do not cause obsolete work or hide other trusted events.

The first version is complete when it reliably delivers the event within the documented retention period, appends it to the responsible thread and submits a turn. Tracking whether the thread completes the policy action is future work.

## Evidence

### Amp webhook ownership

Amp documents `amp.createWebhook` as a durable webhook for a plugin and its owning Orb thread. The handler can append to the owning thread or create another thread. A created thread can target an Orb, the current client or a named live runner.

This supports local execution after the handler starts, but it does not provide direct webhook delivery to a local runner. The Orb remains the durable ingress and first execution hop.

### Direct Tunnel availability

A Cloudflare Tunnel forwards requests only while a connector can reach the local service. If the machine sleeps, loses its network or stops the connector, the local webhook endpoint cannot accept the event.

[GitHub's failed-delivery guidance](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries) states that GitHub does not automatically redeliver failed webhook deliveries. An administrator can redeliver recent failures manually or build separate recovery automation. A direct Tunnel therefore cannot provide the required durability.

### Cloudflare pull queues

[Cloudflare Queues pull consumers](https://developers.cloudflare.com/queues/configuration/pull-consumers/) let infrastructure outside Cloudflare pull messages over HTTP. A consumer leases messages, acknowledges successful work and returns failed work for retry. Unacknowledged leases become visible again after their visibility timeout.

This model lets a Cloudflare Worker accept and queue the GitHub event while the local runner is offline. The runner polls and drains the queue after it starts. The local machine needs no inbound public endpoint.

[Cloudflare Queues limits](https://developers.cloudflare.com/queues/platform/limits/) currently allow up to 14 days of configured retention on a paid Workers plan. The free plan fixes retention at 24 hours. Messages expire after the configured retention period.

Each Queue delivery has an `attempts` count. When that count reaches the configured `max_retries`, Cloudflare permanently deletes the message unless the queue has a dead-letter queue. The current maximum is 100 retries. Retry exhaustion is therefore a separate loss boundary from retention expiry.

### Thread correlation

GitHub identifies the repository and pull request. Amp identifies the responsible conversation by thread ID. Neither system currently stores the relationship between those identities.

The Plugin API can append to a known thread through `amp.threads.get(threadID).appendUserMessage(...)`. The append submits a turn. Its `steer` option only prioritizes a queued message when the thread is busy. It does not choose or migrate the thread's executor.

A local plugin therefore needs a durable binding from `owner/repository#pull-request` to the thread that opened the pull request. The design must also prove that a thread created in another client can execute its submitted turn on the always-on runner. Amp documents plugins as long-lived processes, but the implementation must prove that process-lifetime polling survives plugin reload and runner reconnection.

### Unattended 1Password access

[1Password service accounts](https://www.1password.dev/service-accounts/use-with-1password-cli) can authenticate `op run` through `OP_SERVICE_ACCOUNT_TOKEN` without biometric approval. Service accounts can be limited to selected vaults and permissions.

The service-account token is a bootstrap credential. It cannot be stored only as an `op://` reference that the same service account must resolve. The unattended host needs a separate protected store for that token.

[Amp thread T-019f4f39](https://ampcode.com/threads/T-019f4f39-34b7-7169-9005-a5d36a49c642) has acknowledged this failure class and is resolving it for separate weekly-report automation. That work has selected a dedicated read-only service account, a dedicated vault and an owner-only bootstrap token file. Its implementation has not started. It provides related design evidence rather than an implementation dependency for this webhook runner.

### Stable-runner runtime gates

On 26 July 2026, a disposable polling fixture ran on macOS 26.5.2 arm64 with Amp `0.0.1785042303-g48bae9`. The stable runner ID was `rfc9-gate-019f9d2f`. Existing thread `T-019f9d92-1856-717e-afbe-941db06377fd` was created on that runner and initially returned `/private/tmp/amp-rfc9-runtime-gate-019f9d2f`.

A supported `load_plugin` reload replaced plugin worker PID 3945, instance `069a67a5-762c-48c3-a983-7fc9d79e782d`, with PID 5582, instance `553e9116-28db-4de5-9bd2-ba539ae0e180`. The runner supervisor stayed at PID 3915. The reload produced no self-overlap events or cross-instance polling interval overlaps.

Pausing only the runner supervisor for 43 seconds made the runner disappear from `list_runners`. The same plugin worker and its single poller continued. Resuming the supervisor made the same runner and attached thread reappear. This proves supervisor suspension and reconnection behavior. It does not prove a network partition or machine-sleep behavior.

A full runner process restart changed the supervisor from PID 3915 to PID 11652. It started plugin worker PID 11675, instance `4613a122-bc82-43b9-831a-81a22e7a2660`. Amp reported `Resuming 1 thread this runner previously served`. The same existing thread replied exactly `RESTARTED RFC9-019F9D2F /private/tmp/amp-rfc9-runtime-gate-019f9d2f`, and the new plugin instance observed its agent start.

Across the initial load, reload and restart, the fixture recorded 706 completed polls, 0 incomplete polls, 0 self-overlap events and 0 cross-instance interval overlaps. The fixture was removed after the test. This passes the runner reattachment and single-poller Draft gates. It does not prove the cloud queue, webhook, conflict policy, `launchd`, network-partition or machine-sleep behavior.

### Corrected merge-conflict experiment

On 26 July 2026, a corrected controlled experiment used draft [pull request 128](https://github.com/lelouvincx/agent-skills/pull/128). It started from main commit `28793ddeff82c9d874b577af9e9eff2f2f5a12f5` and used branch prefix `rfc9-conflict-probe-20260726T090300Z-15510`.

The experiment queried `repository.pullRequest(number) { mergeable mergeStateStatus }`. Only `mergeable: CONFLICTING` and `mergeable: MERGEABLE` counted as pass states. The conflicting head converged through `UNKNOWN:UNKNOWN → UNKNOWN:UNKNOWN → CONFLICTING:DIRTY` in 2,992 milliseconds. This took 3 GraphQL requests and 2 `UNKNOWN` observations. After the same head was updated, the resolved sequence was `UNKNOWN:UNKNOWN → MERGEABLE:CLEAN` in 2,412 milliseconds. This took 2 GraphQL requests and one `UNKNOWN` observation.

The corrected fan-out check used explicit REST requests of the form `GET /repos/lelouvincx/agent-skills/pulls?state=open&base=<branch>&per_page=100&page=N`. The temporary base had one open pull request and required one page. The configured `main` base also had one open pull request and required one page. Open pull-request count is a conservative upper bound. The planned evaluator uses active local bindings, so actual fan-out may be lower.

Cleanup closed pull request 128 without merging it. Both temporary remote refs were absent and the temporary clone was removed. An independent coordinator check confirmed the cleanup. Pull request 126 remained `OPEN` and non-draft at head `1b345e743ab2db0032edaf3fb749f97d3f286306`.

This passes the merge-conflict Draft gate for one controlled pull request at the repository's observed scale. It does not prove production latency, larger-repository fan-out or deployed delivery.

### Local ownership implementation

`amp/plugins/github-thread-events.ts` now registers exactly `bind_pr_to_thread`, `register_thread_event_recipient` and `transfer_pr_thread_owner` behind the exact `AMP_GITHUB_THREAD_EVENTS_ENABLED=1` opt-in. It stores recipients and bindings in the documented Bun SQLite database with foreign keys, immediate transactions and owner-only transfer.

`amp/scripts/github-thread-events.test.ts` has 11 passing tests and 72 expectations. The tracked plugin build passed for all 15 plugins, and an independent review found no blocker. These checks cover local ownership only. They do not establish event policy, queue consumption, GitHub preflight, thread append, reconciliation, cloud infrastructure or deployment.

### Configuration and policy implementation

`amp/github-thread-events/` now contains closed, versioned JSON Schemas and checked-in non-secret configuration. It defines all 4 accepted global policy families and a complete `lelouvincx/agent-skills` merged-pull-request override.

`amp/scripts/validate-github-thread-events.py` validates schema and repository invariants. Its focused tests prove complete project replacement, global fallback, `missing-event-policy` and invalid applicable file failure. `sync-skills.sh` projects the complete directory and deletes stale projected files without creating or copying SQLite state.

This slice defines and validates the contract. It does not load policy in the plugin or deliver events.

## Findings

### P1: the Amp webhook path requires an Orb

`amp.createWebhook` can target a named runner only after the owning Orb wakes and executes the handler. This does not meet the local-only execution requirement and consumes Orb runtime for every event.

### P1: a direct Tunnel loses offline deliveries

A Tunnel is a transport, not a durable inbox. GitHub records a failed delivery when the connector is unavailable and does not retry it automatically. The system needs a public component that accepts the event independently of runner availability.

### P1: pull requests are not bound to Amp threads

The receiver cannot route an event to the responsible thread without a durable mapping. Inferring the mapping from `gh pr create` shell output would depend on command shape and output text. A dedicated binding operation is clearer and testable.

### P1: queue acknowledgement and thread append are not one transaction

Cloudflare Queue acknowledgement and Amp thread append happen in different systems. A crash between them can cause a duplicate append or an unacknowledged delivery. The design must accept at-least-once processing, carry a stable GitHub delivery ID and reconcile uncertain local state.

### P1: retry exhaustion can delete an event

A Queue message's `attempts` value counts full delivery attempts. Cloudflare permanently deletes an exhausted message unless the queue has a dead-letter queue. Indefinite delayed retry for a missing binding would therefore lose the event.

### P1: local execution is not established

`appendUserMessage` submits a turn but does not select an executor. The current Plugin API exposes executor choice only when it creates a new thread. It exposes no supported attach or migration operation for an existing arbitrary thread, so v1 excludes that path. V1 accepts only threads created on and running in the configured stable-runner consumer process. The runtime spike proved that an existing eligible thread reattaches after restart and that one process-lifetime poller survives the tested lifecycle transitions.

### P1: parent-authorized transfer is not implementable yet

The Plugin API accepts `parentThreadID` when it creates a thread. However, `PluginThread` exposes no parent query. The accepted v1 therefore permits only the current owner to transfer ownership. Parent-authorized transfer from the broader Original intent is deferred.

### P1: strict per-target ordering is not established

Cloudflare Queues does not guarantee delivery in publication order. Retries can also make an older event visible after a newer event. Strict ordering across batches or retries is explicitly not a v1 guarantee. The approved v1 design uses timeline metadata, sorts simultaneously ready events for each owner and checks current state before acting. It does not use a per-target sequencer.

### P2: some CI events may not identify a pull request

A `workflow_run` payload can identify zero, one or several associated pull requests. The selected first design accepts exactly one. It publishes every ambiguous event to the dead-letter queue with reason `missing-pull-request-identity` instead of guessing a thread.

### P2: merge conflicts need live candidate validation

GitHub has no dedicated merge-conflict webhook action. Candidate pull-request changes and base-branch pushes must converge on a live mergeability query. That query can return `UNKNOWN` or null. The policy needs a live spike for convergence, fan-out volume, cost and bounded handling of indeterminate results.

### P2: offline notification needs a cloud-side signal

An offline local runner cannot report its own outage. Cloudflare exposes queue backlog count and oldest-message age. A scheduled cloud-side check can notify Chinh after a message exceeds a threshold and suppress repeats until the queue drains.

The selected design reads Queue metrics through Worker bindings and stores alert latches in Workers KV. These are verified design paths, not implemented resources. A valid event with no thread binding must also leave the primary queue after a bounded grace period. The plugin can publish it directly to the dead-letter queue before acknowledging its primary lease. Otherwise ordinary pull requests that no Amp thread opened would trigger stale alerts and keep the alert latch set.

### P2: fixed polling can exhaust the free operation budget

The [Cloudflare Queues changelog](https://developers.cloudflare.com/changelog/product/queues/) states that the Workers free plan includes 10,000 Queue operations per day. A fixed 15-second poll uses about 5,760 reads each day before writes, acknowledgements or metrics checks. The consumer needs idle backoff or a paid-plan budget.

### P2: unattended 1Password access has a bootstrap boundary

A dedicated service account removes repeated biometric approval, but its token grants access to every vault assigned to that service account. The account must have read-only access to one dedicated automation vault. The token must live outside files governed by `op://` references.

### P3: local runner availability still needs supervision

The queue prevents event loss but does not keep Amp running. A macOS service such as `launchd` should restart the runner after process failure or login. Machine sleep and power loss still delay work until the machine returns.

## Decisions and scope

The investigation set these boundaries:

- do not use `amp.createWebhook` for this workflow because it requires an owning Orb
- do not use a direct Cloudflare Tunnel as the production webhook endpoint
- use a Cloudflare Worker to verify, filter and normalize GitHub deliveries
- enqueue accepted events in Cloudflare Queues before returning success to GitHub
- use a pull consumer in the local Amp plugin so the machine needs no inbound endpoint
- bind each pull request explicitly to its Amp thread
- register the 3 ownership tools only when `AMP_GITHUB_THREAD_EVENTS_ENABLED=1` in the configured stable-runner process; do not infer a runner ID from the Plugin API
- store recipients and unique repository and pull-request bindings in `${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite`; store no secret there
- accept only threads created on and running in the configured stable-runner consumer process
- let initial binding register its owner, but reject binding outside that process and transfer to an unregistered destination; v1 does not support arbitrary attach or migration
- allow only the current owner to transfer ownership to a destination registered in that process; defer parent-authorized transfer
- preserve timeline metadata, sort simultaneously ready events for each owner and check current source and commit state before acting
- provide no strict ordering guarantee across batches or retries and do not add a per-target sequencer in v1
- use `appendUserMessage` to submit the turn and use `steer: true` only for busy-thread priority
- acknowledge a queue message only after Amp accepts the append or reconciliation proves it already happened
- use the GitHub delivery ID to deduplicate Queue redelivery of the same GitHub delivery
- configure 100 retries and a dead-letter queue so retry exhaustion does not delete events
- move events that remain unbound after a 3-minute grace period to the dead-letter queue
- use adaptive idle polling to stay within the selected Queue operation budget
- read Queue metrics through Worker bindings and store alert latches in Workers KV
- treat webhook fields as untrusted data and append only the minimum fixed event pointer
- use a dedicated read-only 1Password service account and automation vault
- keep the service-account token in macOS Keychain rather than a plaintext file
- keep Cloudflare deployment and GitHub webhook registration behind Chinh's explicit approval

Cloudflare Tunnel remains acceptable for local development and manual testing. It is not part of the production delivery contract.

## Resolution status

| Finding | Priority | Status | Resolution |
| --- | --- | --- | --- |
| Orb required for Amp-managed webhook ingress | P1 | Design selected | RFC-0009 replaces this path with Cloudflare Queues and local pull consumption |
| Direct Tunnel loses offline deliveries | P1 | Design selected | RFC-0009 places a durable queue before the local runner |
| Missing pull-request-to-thread binding | P1 | Implemented locally | the 3 documented ownership tools and SQLite mapping are implemented and tested in the production-projected plugin |
| Missing event policy contract | P1 | Implemented locally | closed versioned schemas, checked-in policy sets and semantic validation define exact project replacement, global fallback, missing policy and fail-closed behavior |
| Cross-system acknowledgement gap | P1 | Open | implement delivery markers, local reconciliation and at-least-once handling |
| Retry exhaustion deletes events | P1 | Design selected | configure 100 retries and a monitored dead-letter queue |
| Runner-created eligibility | P1 | Design selected | accept only threads created on and running in the configured stable-runner consumer process; reject arbitrary attach or migration in v1 |
| Runner reattachment and polling lifecycle | P1 | Runtime gate passed | the 26 July 2026 spike proved restart reattachment and one poller across load, supported reload, supervisor reconnection and full process restart |
| Parent-authorized ownership transfer | P1 | Design selected | v1 permits current-owner-only transfer to a registered destination; parent-authorized transfer is deferred |
| Strict per-target ordering | P1 | Design selected | use timeline metadata, simultaneously-ready owner sorting and current-state preflight; do not guarantee cross-batch or retry order and do not add a sequencer |
| CI event without exactly one pull-request identity | P2 | Design selected | publish the event directly to the dead-letter queue as `missing-pull-request-identity`; do not guess a thread |
| Merge-conflict detection | P2 | Experiment passed | the corrected 26 July 2026 experiment proved bounded convergence for one controlled pull request and one-page upper bounds for the 2 measured bases |
| Offline notification | P2 | Design selected | read Queue binding metrics, store latches in Workers KV and publish application dead letters directly; no resources exist yet |
| Free-plan operation budget | P2 | Design selected | back off polling after consecutive empty responses |
| Service-account bootstrap | P2 | In progress | Amp thread T-019f4f39 is resolving the same failure class for separate automation; RFC-0009 retains the runner-specific design |
| Runner supervision | P3 | Open | add and test a `launchd` service for the local runner |

The local ownership and configuration boundaries are implemented, but no event-delivery or cloud resource exists yet. The issue remains unresolved until the end-to-end workflow passes its implementation and offline recovery tests.

## Follow-up

Load the validated policy contract when implementing queue pulling, ordering, GitHub preflight, thread append and reconciliation. Cloudflare, Slack, `launchd`, 1Password and deployment remain separate later work.

## Validation

The experiments satisfy the eligible-thread reattachment, single-poller and controlled merge-conflict conditions below. The issue is resolved when all remaining conditions also hold:

- GitHub receives a successful response after the event is durably queued
- no Orb starts for webhook receipt, routing or resumed thread work
- only a thread created on and running in the configured stable-runner consumer process can become eligible
- initial binding registers its owner, binding elsewhere fails and transfer rejects an unregistered destination
- an eligible thread reattaches after the configured runner process restarts
- plugin polling remains active across runner lifetime, reload and reconnection
- exactly one poller runs for the configured consumer process
- an online runner adds a matching event to the bound thread
- an offline runner can return within the retention period and drain the event
- registering a recipient grants no pull-request ownership by itself
- only the current owner can transfer ownership, and only to a registered destination
- timeline metadata is preserved, simultaneously ready events are sorted for each owner and every event receives a current-state preflight
- cross-batch and retry ordering remains best-effort without a per-target sequencer
- the queue message remains unacknowledged when thread append fails
- retry exhaustion moves the event to the dead-letter queue instead of deleting it
- a repeated Queue delivery with the same GitHub delivery ID does not start a second meaningful Amp turn
- a separate GitHub delivery with a new ID remains safe when it repeats the same logical event
- a crash after append but before acknowledgement reconciles without losing the event
- reconciliation finds a delivery marker beyond the default message page or compacted history
- a missing pull-request binding leaves the primary queue for a visible dead-letter state after the grace period
- stale queued work sends no more than one notification until the backlog drains
- the alert latch clears after an unbound event leaves the primary queue
- empty polling stays within the selected Cloudflare plan's daily operation budget
- failed CI, merge, review-feedback and merge-conflict events pass their candidate, policy and current-state checks, including actor trust where applicable
- each appended message contains only the minimum identifiers and source references required by its event policy
- the runner starts without biometric approval after its one-time secure setup
- local credential files contain only `op://` references
- revoking the dedicated service account prevents secret resolution without exposing secret values

## Maintenance notes

Maintain this issue as follows:

- preserve Trigger, Original intent and Evidence as historical facts
- update Findings, Resolution status, Follow-up and `updated` as implementation progresses
- keep the current design in RFC-0009
- keep the 3 local ownership capability documents in `artifacts` and `implementation`
- add future policy, consumer and delivery capability documents only after their registration schema and contract are decided
- link implementation pull requests when they exist
- keep Cloudflare and GitHub behavior supported by current official documentation
- keep the frontmatter aligned with the [issue schema](./_schema.md)
