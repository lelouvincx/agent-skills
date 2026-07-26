---
doc_schema: "amp-issue/v1"
code: "ISSUE-0002"
title: "Durable GitHub events for local Amp threads"
slug: "durable-github-events-for-local-amp-threads"
file: "issue-0002-durable-github-events-for-local-amp-threads.md"
status: "Open"
priority: "P1"
summary: "GitHub events cannot reliably return to the local Amp thread that opened a pull request when its runner is offline."
created: "2026-07-26"
updated: "2026-07-26"
amp_thread_id:
  T-019f9241-c27f-7395-8fd1-f6284344d869: "investigated Amp webhooks, local runner delivery, offline queuing and unattended secret access"
artifacts: []
implementation:
  - path: "../rfcs/rfc-0009-durable-github-events-for-local-amp-threads.md"
pull_requests: []
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

[RFC-0009](../rfcs/rfc-0009-durable-github-events-for-local-amp-threads.md) defines a proposed Cloudflare Worker, Cloudflare Queue and local pull-consumer design. No runtime capability or Cloudflare infrastructure has been implemented yet.

## Trigger

[Amp thread T-019f9241](https://ampcode.com/threads/T-019f9241-c27f-7395-8fd1-f6284344d869) began by updating the local Amp SDK workspace and investigating [Amp's event-driven Orb announcement](https://ampcode.com/news/event-driven-orbs).

The initial question was whether `amp.createWebhook` could spawn a local runner instead of an Orb. The current [Amp Plugin API](https://ampcode.com/manual/plugin-api) permits a webhook handler to create a thread with `executor: { type: "runner", id }`. However, the webhook remains registered to an owning Orb thread, and an event first wakes that Orb.

The user rejected that bridge and described the required workflow:

- receive GitHub events such as CI failure and pull-request merge
- identify the Amp thread that opened the affected pull request
- append the event to that existing thread
- run the resumed work on an always-on local runner
- queue events when the runner is unavailable
- notify the user when queued work remains stale
- resolve runtime secrets without repeated 1Password biometric prompts

The user initially preferred a Cloudflare Tunnel because Wrangler is already installed. The offline requirement exposed a delivery gap that a Tunnel alone cannot solve.

## Original intent

An Amp thread that opens a pull request should remain responsible for relevant GitHub lifecycle events.

The workflow should:

- bind a repository and pull-request number to the Amp thread that opened it
- receive verified CI failure and merge events from GitHub
- add a fixed, trusted event message to the bound thread
- submit a new turn to the existing thread on the local runner
- avoid an Orb when handling and acting on the event
- preserve events while the local runner, machine or network is unavailable
- prevent duplicate GitHub deliveries from starting duplicate Amp turns
- notify the user when events wait beyond an agreed threshold
- run unattended with narrowly scoped secrets

The workflow should not require the thread to remain visible in an Amp client. It should address the thread by its durable thread ID.

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

The service-account token is a bootstrap credential. It cannot be stored only as an `op://` reference that the same service account must resolve. The unattended host needs a separate protected store for that token. On macOS, the login Keychain can provide this store without adding plaintext credentials to repository or environment files.

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

Each redelivery increments a Queue message's attempts. Cloudflare permanently deletes a message at `max_retries` unless the queue has a dead-letter queue. Indefinite delayed retry for a missing binding would therefore lose the event.

### P1: local execution is not established

`appendUserMessage` submits a turn but does not select an executor. The design has not yet proved that a plugin on the named runner can submit work to a thread created in another client and have that turn execute on the same runner. It has also not proved that the polling timer survives for the runner process lifetime.

### P2: some CI events may not identify a pull request

A `workflow_run` payload can contain associated pull requests, but that list can be empty. The workflow needs a documented fallback from head commit to pull request or a clear unmatched-event outcome.

### P2: offline notification needs a cloud-side signal

An offline local runner cannot report its own outage. Cloudflare exposes queue backlog count and oldest-message age. A scheduled cloud-side check can notify the user after a message exceeds a threshold and suppress repeats until the queue drains.

The monitor needs a defined metrics source and cloud-side latch store. A valid event with no thread binding must also leave the primary queue after a bounded grace period. Otherwise ordinary pull requests that no Amp thread opened would trigger stale alerts and keep the alert latch set.

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
- require the bound thread to be executable by the stable runner before accepting the binding
- use `appendUserMessage` to submit the turn and use `steer: true` only for busy-thread priority
- acknowledge a queue message only after Amp accepts the append or reconciliation proves it already happened
- use the GitHub delivery ID to deduplicate Queue redelivery of the same GitHub delivery
- configure 100 retries and a dead-letter queue so retry exhaustion does not delete events
- move events that remain unbound after a 3-minute grace period to the dead-letter queue
- use adaptive idle polling to stay within the selected Queue operation budget
- read Queue metrics through Worker bindings and store alert latches in Workers KV
- treat webhook fields as untrusted data and construct a fixed agent message
- use a dedicated read-only 1Password service account and automation vault
- keep the service-account token in macOS Keychain rather than a plaintext file
- keep Cloudflare deployment and GitHub webhook registration behind explicit user approval

Cloudflare Tunnel remains acceptable for local development and manual testing. It is not part of the production delivery contract.

## Resolution status

| Finding | Priority | Status | Resolution |
| --- | --- | --- | --- |
| Orb required for Amp-managed webhook ingress | P1 | Design selected | RFC-0009 replaces this path with Cloudflare Queues and local pull consumption |
| Direct Tunnel loses offline deliveries | P1 | Design selected | RFC-0009 places a durable queue before the local runner |
| Missing pull-request-to-thread binding | P1 | Open | implement a dedicated local plugin tool and durable mapping |
| Cross-system acknowledgement gap | P1 | Open | implement delivery markers, local reconciliation and at-least-once handling |
| Retry exhaustion deletes events | P1 | Design selected | configure 100 retries and a monitored dead-letter queue |
| Local runner execution and polling lifecycle | P1 | Open | prove executor assignment and process-lifetime polling before accepting RFC-0009 |
| CI event without pull-request identity | P2 | Open | define and test head-commit fallback or unmatched-event handling |
| Offline notification | P2 | Open | read Queue binding metrics, store the latch in Workers KV and bound unmatched-event retries |
| Free-plan operation budget | P2 | Design selected | back off polling after consecutive empty responses |
| Service-account bootstrap | P2 | Design selected | store the limited bootstrap token in macOS Keychain |
| Runner supervision | P3 | Open | add and test a `launchd` service for the local runner |

No runtime implementation or cloud resource exists yet. The issue remains open until the end-to-end workflow passes offline recovery tests.

## Follow-up

1. Spike executor assignment for a thread created in another client and process-lifetime plugin polling.
2. Review and accept RFC-0009 only after both spikes pass.
3. Document the plugin capability before adding plugin code.
4. Implement and test the Cloudflare Worker, primary queue, dead-letter queue, metrics check and Workers KV latch.
5. Implement and test the local binding tool, adaptive pull consumer, full-history reconciliation and thread append.
6. Create the dedicated 1Password automation vault and read-only service account.
7. Store the service-account token in macOS Keychain and add the supervised runner startup path.
8. Deploy Cloudflare resources and register the GitHub webhook after explicit approval.
9. Test online delivery, runner downtime, restart recovery, duplicate delivery, retry exhaustion and missing binding.

## Validation

The issue is resolved when all of these conditions hold:

- GitHub receives a successful response after the event is durably queued
- no Orb starts for webhook receipt, routing or resumed thread work
- a turn submitted to a bound thread created in another client executes on the configured stable runner
- plugin polling remains active across runner lifetime, reload and reconnection
- an online runner adds a matching event to the bound thread
- an offline runner can return within the retention period and drain the event
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
- a merge event and a failed CI event use fixed, verified message templates
- the runner starts without biometric approval after its one-time secure setup
- local credential files contain only `op://` references
- revoking the dedicated service account prevents secret resolution without exposing secret values

## Maintenance notes

Maintain this issue as follows:

- preserve Trigger, Original intent and Evidence as historical facts
- update Findings, Resolution status, Follow-up and `updated` as implementation progresses
- keep the current design in RFC-0009
- add the future capability document to `artifacts` and `implementation`
- link implementation pull requests when they exist
- keep Cloudflare and GitHub behavior supported by current official documentation
- keep the frontmatter aligned with the [issue schema](./_schema.md)
