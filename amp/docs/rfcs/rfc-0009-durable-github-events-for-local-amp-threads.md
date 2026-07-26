---
doc_schema: "amp-rfc/v1"
code: "RFC-0009"
title: "Durable GitHub events for local Amp threads"
slug: "durable-github-events-for-local-amp-threads"
file: "rfc-0009-durable-github-events-for-local-amp-threads.md"
status: "Draft"
summary: "Queue verified GitHub events in Cloudflare and use source-neutral policies to return actionable events to the thread that owns each pull request."
created: "2026-07-26"
updated: "2026-07-26"
amp_thread_id:
  T-019f9241-c27f-7395-8fd1-f6284344d869: "defined the local runner, offline queue, thread routing and unattended secret requirements"
  T-019f4f39-34b7-7169-9005-a5d36a49c642: "provided related unattended 1Password service-account design evidence"
  T-019f9d13-530a-7613-b1a0-32a2ff10c740: "aligned the RFC contract with ISSUE-0002's policy, ownership, trust and completion intent"
dependency:
  - type: "issue"
    code: "ISSUE-0002"
    title: "Durable GitHub events for local Amp threads"
    path: "../issues/issue-0002-durable-github-events-for-local-amp-threads.md"
implementation: []
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

Receive selected GitHub webhook events through a Cloudflare Worker and store them in Cloudflare Queues. A plugin on a local Amp runner resolves each event against a source-neutral event policy and the pull request's current owner. It appends only policy-supported, currently actionable events to that existing Amp thread.

GitHub is the first source. The initial policy set covers failed CI, pull-request merges, review feedback and merge conflicts. Project policy takes precedence over global fallback policy. An event without either policy does not resume a thread. The system preserves it for review and sends one operational notification.

This design does not use an Orb or expose the local machine through a production Tunnel. The queue accepts events while the runner is offline. A dead-letter queue preserves messages that need review or exhaust their retries. The configured retention period remains the final expiry boundary for both queues.

## Context

Amp's `createWebhook` API provides durable ingress for an owning Orb thread. Its handler can create work on a named local runner, but each event still wakes the Orb first. This adds an unwanted cloud execution hop and Orb cost.

A direct Cloudflare Tunnel avoids the Orb while the local connector is online. It does not preserve events during sleep, power loss, network loss or runner maintenance. GitHub does not automatically retry failed webhook deliveries, so this design can lose the exact CI failure or merge event that should resume the thread.

Cloudflare Queues supports pull consumers outside Cloudflare. This reverses the connection: the local plugin asks Cloudflare for work only when it is ready. The public webhook endpoint stays available independently of the local runner.

The design must also correlate 2 durable identities:

- GitHub identifies work by repository and pull-request number
- Amp identifies the responsible conversation by thread ID

The plugin must record that binding when a thread opens or adopts a pull request. One thread owns the pull request at a time. The owner may be a top-level thread or a subagent, and ownership changes only through an explicit transfer.

Transport routing alone is not enough. A policy must decide whether an event is actionable, which source state to verify and what fixed instruction to submit. This policy contract must not depend on GitHub so that later source adapters can use the same ownership, trust and delivery rules.

The design also depends on the bound thread being executable by the always-on runner. `appendUserMessage` submits a turn to an existing thread, but it does not select or migrate that thread's executor. A spike must prove the executor-assignment path before this RFC can leave `Draft`.

The current Plugin API also exposes the invoking thread ID but not its parent relationship. A second spike must prove how a parent can authorize an ownership transfer without allowing another thread to take ownership. The RFC must remain `Draft` until this authority check has a supported implementation.

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
| `github.workflow-run.failure` | `workflow_run` is `completed` with conclusion `failure` | the failed run still belongs to the bound pull request and relevant head commit |
| `github.pull-request.merged` | `pull_request` is `closed` and `merged` is `true` | the pull request is still merged |
| `github.pull-request.review-feedback` | `pull_request_review` is `submitted`, or `pull_request_review_comment` is `created` or `edited` | current unresolved review state contains feedback covered by policy |
| `github.pull-request.merge-conflict` | `pull_request` is `synchronize`, `reopened`, `ready_for_review` or `edited`, or a configured base branch receives a `push` | the current pull request is not mergeable because of a conflict |

GitHub does not publish a dedicated merge-conflict webhook action. The conflict policy therefore treats pull-request changes and configured base-branch pushes as candidate signals. Worker configuration lists the repositories and base branches that can emit this candidate. The local evaluator must query current pull-request state before it resumes any thread. A base-branch push may fan out to every active binding for that repository and branch. The implementation spike must prove this signal is reliable and affordable before the conflict policy ships.

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

The source adapter owns the fields inside `source`. The shared envelope owns `schema`, `policyCandidate` and `target`. A target may identify one pull request or a repository branch that the local consumer expands through active bindings.

The schema may add fields compatibly. A breaking change requires a new schema version. The source adapter defines the minimum envelope fields for each policy-candidate family before local policy resolution. Review candidates include actor identity because their policies may need a trust decision. Candidate families that do not need actor identity omit it. Do not include pull-request bodies, comments, commit messages, logs or other free-form text.

The selected local policy defines the smaller set of fields used in the appended message. It omits every envelope field that the policy action does not need.

Do not coalesce separate deliveries. Preserve the source occurrence time, ingress time and delivery ID so the receiving thread can reconstruct the timeline. Cloudflare retries may make an older delivery visible after a newer one, so the current Queue-only design does not yet prove strict processing order. The consumer processes ready events for one owner in timeline order when possible, and every policy checks current source and commit state before it submits a turn. This RFC must remain `Draft` until the ordering spike either proves that this meets the original intent or adds a per-target sequencer.

### Event policy

An event policy is a structured rule. The local consumer resolves it without using an LLM. Each policy defines:

- a stable, source-qualified policy ID
- the source candidate it accepts
- the target identity and current-state preflight
- the fixed action submitted to the owner thread
- the minimum source pointers required by that action
- any actor trust rule
- the expiry behavior within the deployment's bounded retention

The consumer first looks for an exact project policy for the bound repository and policy ID. It then uses the global policy with the same ID. Project policy overrides the global fallback. The final capability document must define the structured file locations and schema before implementation.

Policies do not expand the owner thread's existing authority. The default trusted actor is `lelouvincx`. Text from another actor remains untrusted evidence unless the selected policy grants that actor instruction authority. The plugin never turns a comment body into an instruction. It appends a fixed policy action and a canonical URL from which the thread can inspect current evidence.

If neither project nor global policy exists, the consumer does not append to the thread. It copies the event to the dead-letter queue with reason `missing-event-policy` and acknowledges the primary lease only after that copy succeeds. The dead-letter monitor provides one latched operational notification while that queue remains nonempty. The dead-letter record preserves the envelope for review until its documented retention expires.

The first version uses one deployment retention for all accepted events. A future higher-value policy that must survive longer needs a separate durable storage design before it can be enabled.

### Pull-request thread binding

The local plugin exposes a binding operation with these logical inputs:

```json
{
  "repository": "owner/repository",
  "pullRequest": 123,
  "baseRef": "main"
}
```

The plugin takes the owner thread ID from the invocation context. It stores one active binding for each repository and pull-request number, including the base branch needed to evaluate conflict candidates. The first binding assigns ownership to the invoking thread.

The intended agent-facing tool name is `bind_pr_to_thread`. Its capability document must define the final name, schema and output before implementation.

After a thread opens a pull request, repository guidance should require it to bind that pull request before declaring the PR workflow complete. A dedicated tool is preferred over parsing `gh pr create` commands or output.

The plugin must also expose an explicit ownership-transfer operation. Only the current owner or its verified parent may transfer a binding. The transfer names the destination thread and replaces the owner atomically. An invocation from the destination or any unrelated thread must not take ownership. The current Plugin API does not expose parent relationships, so parent-authorized transfer remains a blocking design prerequisite rather than an assumed capability.

The first version may bind only a thread that is attached to, or otherwise executable by, the configured stable runner. An interactive client must use a supported attach or assignment operation before binding. The implementation spike must define that operation. Binding must fail clearly if Amp provides no supported way to satisfy this prerequisite.

A bound subagent remains the direct event recipient. It follows its existing parent-reporting contract after the turn starts. The delivery system must not notify the parent automatically unless a mandatory escalation rule applies. Those rules include inability to continue, need for authority or input, an ownership-transfer request, or a material risk outside the subagent's scope.

### Local pull consumer

The local plugin polls Cloudflare Queues when it loads and while the runner stays alive. It polls every 15 seconds while draining work or after a non-empty response. After consecutive empty responses, it backs off to a configurable maximum of 60 seconds. This avoids spending most of the free plan's 10,000 daily Queue operations on empty pulls. The consumer uses a small batch and a visibility timeout long enough to route and append the batch.

Amp documents plugins as long-lived processes. Before implementation, a spike must still prove that a system plugin can keep this timer active for the lifetime of `amp --no-tui`, including plugin reload and runner reconnection.

For each leased message, the plugin:

1. validates the normalized schema;
2. expands a repository-branch target into active pull-request bindings when required;
3. checks the source delivery and target identity against local reconciliation state;
4. resolves the active owner and project or global event policy;
5. checks the current source, commit and trust state required by that policy;
6. preserves a missing-policy event for review, or records a stale or non-actionable event without resuming a thread;
7. records the owner thread ID and `append-pending` timestamp for an actionable event;
8. appends the fixed policy message with `steer: true`;
9. records the completed target delivery locally; and
10. acknowledges the queue lease after every expanded target has reached a terminal stage.

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

The local state records these stages for each source delivery and expanded target:

```text
leased
→ evaluated
  ├─→ stale-or-non-actionable
  ├─→ preserved-for-review
  └─→ append-pending → appended
→ acknowledged
```

On restart, an `append-pending` target delivery is uncertain. The plugin checks the target thread for its verified delivery marker and target identity. If the marker exists, it records `appended`. If the marker does not exist, it appends the message. It acknowledges the source lease only when every expanded target is appended, intentionally non-actionable or preserved in the dead-letter queue.

The reconciliation search must not rely on the default recent-message window. It requests full messages and uses offsets to paginate backwards to the start of the transcript. Only then may it conclude that the marker is absent. The plugin API does not expose message timestamps, so the recorded `append-pending` timestamp is for recovery diagnostics rather than a search boundary.

This closes the normal crash window but does not claim mathematical exactly-once behavior. The event prompt must remain safe when repeated.

Configure the primary queue with `max_retries` set to 100 and a dead-letter queue. Each redelivery increments the message's `attempts` count. Cloudflare permanently deletes a message that reaches `max_retries` when no dead-letter queue is configured. This deployment must never run the primary queue without its dead-letter queue.

The dead-letter queue holds malformed events, exhausted processing failures, missing-policy events and events that remain unbound after the grace period. It has the same retention and stale-backlog monitoring requirements as the primary queue. Retry exhaustion must move an event to this queue rather than delete it.

### Offline retention and notification

Cloudflare Queues retains messages while the runner is offline:

- 24 hours on the Workers free plan
- up to 14 days when configured on a paid plan

The deployment must choose and document its retention period.

A scheduled Worker checks both queues once per minute. It reads `backlogCount` and `oldestMessageTimestamp` through each Queue binding's `metrics()` API. If the oldest message has waited more than 5 minutes, it sends one notification and records one alert latch per queue in Workers KV. It clears each latch when its queue reaches zero. It sends another notification if the oldest event approaches its retention deadline.

An unbound event can contribute to the primary backlog during its 3-minute binding grace period. This is shorter than the 5-minute alert threshold when the runner is polling normally. The notification must still report stale queued work, not claim that the runner is offline. Once the plugin moves the event, the primary latch can clear independently. A later dead-letter notification reports the dead-letter backlog count without exposing event payloads.

Slack through an incoming webhook is the preferred first notification destination. The notification integration remains optional until Chinh supplies and approves that destination.

### Secret boundary

Cloudflare stores the GitHub webhook signing secret as a Worker secret. The repository stores no secret value.

The local consumer needs a Cloudflare API token with Queue read and write permission. It also needs read access to current GitHub pull-request, review, workflow and branch state. Public repositories may not need GitHub authentication. Private repositories require a least-privilege GitHub credential. A dedicated 1Password service account resolves these credentials from one dedicated automation vault. The service account has read-only vault access and no vault-creation permission.

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
9. Amp runs the turn on the stable runner established by the binding prerequisite.
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
9. Amp runs the turn on the stable runner established by the binding prerequisite.
10. The primary queue alert latch clears after the primary queue drains.

No manual thread resurrection is required after the executor prerequisite has been implemented and verified. The durable thread ID and local binding identify the thread after the runner returns.

### Duplicate delivery

Cloudflare may deliver one GitHub delivery more than once. The plugin uses the source kind, source delivery ID, policy ID and expanded target identity as the deduplication key. It does not use Cloudflare's ephemeral message ID.

If local state already records one target as `appended`, the plugin skips that target without appending another message. It acknowledges the source lease only after every expanded target has reached a terminal stage.

This key does not deduplicate a separate GitHub delivery with a new delivery ID. If GitHub assigns a new ID to a manual redelivery, the plugin treats it as a new, safe-to-repeat event message.

### Missing event policy

If neither project nor global policy defines the candidate, the plugin does not resume the owner thread. It preserves the event in the dead-letter queue with reason `missing-event-policy`. The dead-letter monitor sends one latched operational notification if the queue remains nonempty for 5 minutes. No LLM selects or invents an action.

Adding a policy later does not silently replay preserved events. Chinh must approve replay from the dead-letter queue because the source state may have changed.

### Review feedback and actor trust

The review-feedback policy checks current unresolved review state. A project policy can decide which review states are actionable and which actors may give instructions. The global fallback trusts `lelouvincx` by default.

Feedback from another actor can still resume the owner when the policy treats it as evidence to assess. The appended message contains the fixed policy action, actor identity and canonical review URL. It does not contain the review text or grant that actor more authority.

### Merge conflict candidate

A pull-request change targets one binding. A base-branch push can target several active bindings. The plugin expands the candidate, checks each pull request's current mergeability and resumes only owners whose pull request is currently blocked by a merge conflict.

If GitHub reports an indeterminate mergeability state, the plugin returns the lease for bounded retry. It does not resume the thread until the state is confirmed. The implementation must define the retry limit and dead-letter reason before this policy ships.

### Ownership transfer

The current owner or its verified parent explicitly transfers ownership to a destination thread. Events leased after the atomic transfer go only to the new owner. An event already in `append-pending` completes against the owner recorded for that target delivery, which prevents one event from reaching both threads.

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

- register pull-request binding and ownership-transfer tools
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

Transfer ownership from the current thread to another thread:

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
  → submit turn on the thread's assigned runner
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

1. Spike executor assignment, process-lifetime plugin polling and secure parent-authorized ownership transfer.
2. Spike the merge-conflict candidate, current-state check and event ordering, including base-branch push volume, fan-out cost, indeterminate mergeability and retry reordering.
3. Review and accept RFC-0009 only after these prerequisites pass.
4. Document the event-policy, binding, transfer and delivery capabilities before adding plugin code.
5. Implement and test the Cloudflare Worker, primary queue, dead-letter queue, metrics check and Workers KV latches.
6. Implement and test policy resolution, ownership binding and transfer, adaptive pull consumption, full-history reconciliation and thread append.
7. Create the dedicated 1Password automation vault and read-only service account after reviewing the related findings in [Amp thread T-019f4f39](https://ampcode.com/threads/T-019f4f39-34b7-7169-9005-a5d36a49c642).
8. Store the service-account token in macOS Keychain and add the supervised runner startup path.
9. Deploy Cloudflare resources and register the GitHub webhook after Chinh's explicit approval.
10. Test all 4 initial event policies, online and offline delivery, ownership transfer, duplicates, ordering, missing policy, retry exhaustion and missing binding.

- Keep [ISSUE-0002](../issues/issue-0002-durable-github-events-for-local-amp-threads.md) as the evidence and resolution record.
- Add the capability documents before implementing the plugin.
- Keep the source-neutral event envelope, GitHub adapter and local parser versioned together.
- Keep project and global policy schemas aligned and test project precedence.
- Keep GitHub event conditions aligned with current webhook payload documentation.
- Keep Queue pull, acknowledgement, metrics and retention behavior aligned with current Cloudflare documentation.
- Keep `@ampcode/plugin` types aligned with the Amp CLI version used to load the plugin.
- Store local configuration outside projected repository artifacts.
- Test plugin reload, process restart, machine downtime, duplicate delivery, missing policy, missing binding, retry exhaustion, dead-letter routing and retention expiry.
- Test that reconciliation searches beyond the default message page and across compacted history.
- Test that each event policy appends only its minimum required identifiers and source references.
- Test trusted and untrusted review actors without copying review text into the thread.
- Test direct subagent delivery, owner transfer and every mandatory parent-escalation trigger.
- Test stale and out-of-order events against current source and commit state.
- Measure empty-poll operations against the selected Cloudflare plan before deployment.
- Run the Amp document validators, plugin build checks and isolated projection before merging implementation.
- Keep this RFC in `Draft` until the executor-assignment, process-lifetime polling, parent-authority and merge-conflict spikes pass and Chinh accepts the design.

## Open questions

- Which Slack destination should receive stale-backlog notifications?
- Is the Cloudflare Workers plan free or paid, and what polling latency fits its retention and daily Queue operation budget?
- Where should the local SQLite state live across macOS and other future runner platforms?
- Which structured files hold project and global event policies, and what tool manages them?
- Should CI events without an associated pull request use a GitHub API fallback in the first implementation?
- Should a merge event ask the thread to archive itself after any required cleanup, or only report the merge?
- Which GitHub candidate set detects merge conflicts reliably without excessive base-branch fan-out?
- What ordering guarantee satisfies the original requirement to preserve event order and timeline? Strict execution order needs a per-target sequencer rather than Queue-only best-effort ordering.
- How can the plugin verify a parent thread's transfer authority when the current Plugin API exposes no parent relationship?
- Does a turn submitted by a runner-hosted plugin execute on that runner when another client created the thread, and what supported operation attaches the thread to that runner?
- Does a system plugin's polling timer remain active for the full runner lifetime across reload and reconnection?
