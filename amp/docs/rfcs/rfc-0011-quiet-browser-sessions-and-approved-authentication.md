---
doc_schema: "amp-rfc/v1"
code: "RFC-0011"
title: "Quiet browser sessions and approved authentication"
slug: "quiet-browser-sessions-and-approved-authentication"
file: "rfc-0011-quiet-browser-sessions-and-approved-authentication.md"
status: "Draft"
summary: "Keep isolated browser sessions headless by default, support controlled human sign-in, and resolve approved browser credentials through agent-secrets."
created: "2026-09-05"
updated: "2026-09-05"
amp_thread_id:
  T-01a06fe4-8468-755a-911b-48950a722cb9: "defined browser constraints, reviewed restart and authentication risks with Oracle, and drafted this proposal for Chinh's review"
  T-01a06f94-14b9-71dd-9d12-c9f538a4a257: "compared local browser automation with TinyFish and examined profile persistence and headed operation"
dependency:
  - type: "rfc"
    code: "RFC-0010"
    title: "Shared local agent and bot secrets"
    path: "./rfc-0010-shared-local-agent-and-bot-secrets.md"
implementation: []
inputs:
  - name: "browser session request"
    kind: "owner thread and target workflow"
    purpose: "Claim an isolated profile and dedicated loopback CDP port."
  - name: "approved login alias"
    kind: "reviewed authentication policy"
    purpose: "Select one agent-secrets bundle and its permitted login destination."
  - name: "human sign-in approval"
    kind: "explicit user interaction"
    purpose: "Allow Chinh to authenticate within the owner's existing logical session."
outputs:
  - name: "owned browser session"
    kind: "local Chrome process and lifecycle history"
    purpose: "Keep routine browsing invisible and preserve ownership through process replacement."
  - name: "authentication result"
    kind: "verified identity or request for assistance"
    purpose: "Continue only after verifying the intended account and destination."
supersedes: []
superseded_by: null
related: []
tags:
  - "agent-browser"
  - "1password"
  - "lifecycle"
  - "local-automation"
---

# RFC-0011: Quiet browser sessions and approved authentication

## Summary

Local browser automation interrupts Chinh's desktop and lacks an automatic path for approved 1Password logins. This proposal keeps Amp and local Chrome, with headless operation as the default.

Each session retains a dedicated profile and CDP port. `agent-browser-lifecycle` controls ownership, restart and cleanup. Automated authentication uses `agent-secrets`; human sign-in remains an explicit alternative. This is a draft, not permission to change runtime behaviour or provision credentials.

## Context

### Trigger and problem

The [research thread](https://ampcode.com/threads/T-01a06f94-14b9-71dd-9d12-c9f538a4a257) established that local Amp and `agent-browser` cover Chinh's browser tasks. The [proposal and Oracle review](https://ampcode.com/threads/T-01a06fe4-8468-755a-911b-48950a722cb9) identified 2 sources of friction:

- routine automation brings Chrome windows to the foreground
- approved secrets do not have a configured browser login path

The desired outcome is quiet automation with deliberate requests for help, not unattended access to every account.

### Current findings

| Evidence | Current behaviour |
| --- | --- |
| [Browser convention](../../conventions/agent-browser.md) | Requires fresh headed system Chrome, foreground activation and manual sign-in for every owner session. |
| [Lifecycle helper](../../../bin/agent-browser-lifecycle) and [contract](../../conventions/agent-browser-lifecycle.md) | Coordinate claims and events. They do not launch Chrome or support process replacement within a session. |
| Lifecycle recovery procedure | Removes the profile before recording `observed_dead`. The event lock does not protect the preceding deletion. |
| [Secret resolver](../../../bin/agent-secrets) and [bundle policy](../../agent-secrets/bundles.json) | Support approved command classes, but no browser login bundle. Interactive authentication is the default; service-account errors can trigger interactive fallback. |
| Installed `agent-browser` 0.32.3 | No configured credential provider. A provider runs under the long-lived daemon, so later CLI environment injection does not reliably reach it. |
| Upstream [credential provider](https://github.com/vercel-labs/agent-browser/blob/v0.32.3/cli/src/plugins.rs) and [login handler](https://github.com/vercel-labs/agent-browser/blob/v0.32.3/cli/src/native/actions.rs) | Resolve credentials before navigation. Native login lacks a final-origin guard, and completion does not prove successful authentication. |

These findings came from source inspection and CLI metadata, not live login tests. The local service-account bootstrap file exists with owner-only permissions; token validity and vault access were not tested.

### Constraints and analysis

Every active browser session needs a separate CDP port and an exclusively owned Chrome user-data directory. Changing ports does not make sharing one directory safe.

Chrome cannot switch between headed and headless operation without restarting. Authentication may survive a restart using the same directory, but that must be verified per site.

Two race conditions affect restarts. An observer can mistake the intentional process gap for an abandoned session. An observer can also delete a profile using stale state before its cleanup event is rejected. A state transition checked after deletion cannot prevent either loss.

## Decision

Adopt the following direction, subject to Chinh's review:

- use headless system Chrome for routine work, without foreground activation
- retain one logical session across an approved headed or headless restart
- make `agent-browser-lifecycle` the only authority for lifecycle changes and destructive profile cleanup
- add a strict, non-interactive browser authentication path to `agent-secrets`, without changing existing callers' fallback behaviour
- enable automated filling only when the login path enforces the approved destination; otherwise request human sign-in
- keep profiles ephemeral in the first release, but preserve them across restarts within that session

Defer cross-session persistent profiles, dashboard-assisted sign-in, cloud browsers and shared browsers for unrelated owner threads. Persistent profiles would require exclusive leases and a separate retention decision. Dashboard use would require a vetted version containing the [security hardening introduced in 0.35.2](https://github.com/vercel-labs/agent-browser/releases/tag/v0.35.2).

## Contract

### Session ownership

A logical session has one session ID, owner thread, user-data directory and reserved `127.0.0.1` CDP port. These remain unchanged during restart. Only one Chrome browser instance may own the directory at a time; its renderer and other child processes belong to that instance.

Every `agent-browser` invocation uses an explicit session name tied to that session ID and its recorded CDP endpoint. No default daemon or automatic browser discovery may substitute another session.

Port reservations remain cooperative, not operating-system locks. Before publishing `ready`, verify that the launched Chrome process owns the expected listener and uses the recorded directory. A conflicting listener blocks progress; never terminate its process or connect to it.

A session revision increases on every accepted event. Replay derives revisions for historical sessions; wall-clock timestamps are not revision tokens. Mutating requests after `claimed` supply the revision they observed. The helper rejects stale revisions under its existing event lock. Resuming `reclaiming` is the exception because no competing transition can make that session usable again.

Revision checks serialize events, not the process launch between events. Add a per-session operation lock around the complete start, restart, shutdown or cleanup operation. Only one-shot `agent-browser-lifecycle` operations may spawn or end managed Chrome processes; callers must not launch Chrome separately. This extends the existing helper, not a new background supervisor.

Acquire the session operation lock before the event lock. Release the event lock between state updates while Chrome starts; retain the operation lock until the operation completes or fails. Another session can continue independently.

Record each launch PID and process-start identity as soon as available. Recovery must also inspect running Chrome command lines for the exact user-data directory. This covers a helper crash after spawn but before recording the PID, including Chrome that has not opened a profile file or bound its port. An empty port or an empty open-file list alone never proves absence. Incomplete process visibility blocks cleanup.

### Restart and cleanup states

The proposed additions are `restarting` and `reclaiming`. Both retain the session's directory and port reservation.

| Transition | Actor and required condition |
| --- | --- |
| `claimed → ready` | Owner; new Chrome identity and listener verified. |
| `ready → restarting` | Owner; matching revision, no attached children, no browser actions in flight. Record before disconnecting or ending Chrome. |
| `restarting → ready` | Owner; replacement Chrome verified. Update the PID and revision. |
| `ready → stopping` | Owner; no attached children or browser actions in flight. No return to `ready`. |
| `ready` or `stopping → reclaiming` | Any thread through the helper; matching revision. Under both locks, verify recorded and directory-matching processes and the listener are absent. A dead browser invalidates remaining child attachments. |
| `claimed` or `restarting → reclaiming` | Owner abort or Chinh-authorized recovery; matching revision. Under both locks, verify that no complete or partial launch still uses the directory or port. |
| `reclaiming → terminal` | Helper; repeat the absence checks, then record the outcome fixed at entry to `reclaiming`. |

The helper-owned cleanup operation must:

1. Acquire the operation and event locks, then re-read the current session.
2. Reject a stale revision. Perform process and listener checks itself; do not accept caller-supplied claims of absence.
3. Derive the terminal outcome from the table below. Record `reclaiming` and that outcome before deleting anything.
4. Keep both locks and the reservation while deleting the ephemeral directory, subject to a fixed operation deadline.
5. Repeat absence checks, verify the directory is gone, then record the fixed terminal outcome.

| Source state | Cleanup initiator | Fixed outcome |
| --- | --- | --- |
| `claimed` | Owner or Chinh-authorized recovery | `start_failed` |
| `restarting` | Owner | `stopped` |
| `restarting` | Chinh-authorized recovery | `observed_dead` |
| `ready` | Any thread | `observed_dead` |
| `stopping` | Owner | `stopped` |
| `stopping` | Another thread | `observed_dead` |

No agent deletes a session directory directly. `reclaiming` cannot return to a launchable state. It rejects attachment, restart and other browser work.

If cleanup crashes or exceeds its deadline, the durable `reclaiming` record retains the reservation. Stop all deletion work before releasing locks. Any thread may request continuation; the helper reacquires both locks and repeats its absence checks. It preserves the recorded outcome and records the completing actor. No credentials, URLs or page data belong in lifecycle history.

An abandoned `claimed` or `restarting` session is not reclaimed merely because time passes. Automatic expiry could race a slow launch. The owner must abort, or Chinh must authorize recovery after confirming the owner cannot resume. A named actor requests the helper's explicit authorized-recovery operation; the history records that approval claim. It remains cooperative authorization, not an authenticated user signature. Apply the same locks and absence checks; nobody edits history by hand.

### Automated authentication

All automated browser credential access goes through `agent-secrets`, using approved references in the `Agent Secrets` vault in Chinh's personal 1Password account. Do not introduce direct `op read` calls or a second browser credential store.

Add an opt-in, service-account-only mode that never falls back interactively. Preserve RFC-0010's existing behaviour for other callers. A failure returns a bounded, secret-free result such as `needs-human` or `configuration-error`.

A reviewed login alias binds:

- one approved `agent`-audience bundle and registered credential-handler command
- reference-only local assignments for username and password
- an exact HTTPS login URL and permitted credential-receiving origin
- explicit main-frame field and submit selectors
- expected post-login destination and account identity marker

The short-lived credential provider selects strict mode explicitly when invoking `agent-secrets`; it must not rely on the daemon's inherited environment. A registered handler receives only the alias's approved values and emits the credential response through the private provider protocol. Browser processes receive no service-account bootstrap token, and no broad browser command class receives unrelated bundles.

Give resolution a deadline of at most 10 seconds, below the installed provider's 15-second output wait. Run the resolver and its secret-handling children in one process group. End that group on cancellation or deadline so no detached resolution continues. Do not return raw 1Password errors or credential payloads to Amp.

### Destination checks are an implementation gate

The native 0.32.3 provider interface is not enough to enforce this contract. Login resolves credentials before navigation and can honour a previously selected frame. Pinning the requested URL prevents caller overrides, but does not check the document that receives credentials.

An enabled login path must meet these acceptance conditions:

1. Before the first fill, read the committed main-frame document. Require the exact approved login URL and origin, including scheme, host and port.
2. Bind the check and both fills to that document's target and navigation identity. Do not use a separate CLI check followed by unbound fill commands.
3. Ignore previous frame selection. Resolve both fields in the main frame and the same form; require its resolved action origin to be approved.
4. Abort on document replacement, frame changes or execution-context loss. Before submission, revalidate the document, origin and form destination.
5. On failure, perform no further credential writes or submission and discard the provider response. A failure before the first fill must leave all credential fields untouched.

The wrong destination must receive no credential bytes in adversarial navigation tests. A later failure cannot undo values already filled into the approved document. Post-login identity failure therefore blocks further work; it does not imply that no fields were filled.

Prefer a small extension to the upstream login path over a second, general-purpose CDP framework. The agent must identify and test the mechanism before enabling an alias. If this requires maintaining a patched browser build, present that cost for review rather than assuming approval. Until the gate passes, the alias remains human-assisted; provider installation alone must not enable it.

This protects against wrong destinations and automation mistakes, not a compromised approved site. Approved page scripts necessarily receive filled credentials and remain trusted. `--allowed-domains` is hostname-based, not origin-based, and 0.32.3 rejects it with the external-CDP and profile workflows considered here.

## Behavior

### Routine work and automatic sign-in

Start the claimed session headless. If the intended account is already authenticated, continue without resolving credentials again.

When login is needed, the owner pauses work and requires attached children to detach. Use automated login only for an enabled alias whose destination checks pass. Verify the destination and account marker afterwards; a successful submit command is not proof of authentication.

If the alias is missing, resolution fails, identity is wrong or a challenge needs a human, stop that authentication attempt. Ask Chinh for help without changing accounts, trying broader bundles or opening a window automatically.

### Human-assisted restart

1. Ask Chinh to approve opening the session headed for sign-in.
2. Pause browser work and wait for attached children to detach.
3. Request the helper's restart operation with the observed revision. The helper acquires the operation lock and records `restarting`.
4. The helper disconnects that session's daemon from CDP and stops the recorded Chrome process.
5. The helper verifies absence before relaunching with the same directory and port.
6. The helper verifies Chrome and CDP readiness, records `ready` with the replacement identity, then releases the operation lock.
7. Wait for Chinh to finish sign-in. Do not run browser actions concurrently with human input.
8. Reconnect the owner, verify the destination and intended account, then request a headless restart if the workflow supports it.

Closing the agent-browser connection does not prove externally launched Chrome has stopped. After replacement, discard old tab IDs and element references; obtain fresh ones before acting.

Manual sign-in grants access within this logical session. It does not authorize copying credentials into the vault, saving auth for other sessions or publishing changes on the site. If the headless restart loses authentication, report that result rather than repeatedly interrupting the desktop.

### Failures and shutdown

A failed restart retains its reservation until the owner retries or completes helper-controlled cleanup. Unrelated sessions continue using their own profiles and ports.

The helper's final shutdown enters `stopping`, disconnects the owner and ends Chrome. Cleanup verifies process absence before deleting the ephemeral profile. Cleanup failure leaves a reserved, recoverable session, not a free port paired with unfinished deletion.

## Permissions and side effects

The implementation may spawn local Chrome, credential-handler and 1Password processes. It may contact approved login sites and 1Password, and write private lifecycle metadata and session profiles.

Keep existing owner-only directory and file permissions. Disable authentication screenshots, recordings, HAR capture and verbose credential-bearing diagnostics. Do not include passwords, tokens or filled values in command arguments, lifecycle events, fixtures or agent-visible output.

These controls reduce accidental exposure. They do not isolate hostile processes running as the same macOS user, nor make a sensitive page unreadable through CDP.

Neither this draft nor later implementation approval authorizes new vault items, broader service-account access, cross-session auth retention, cloud uploads or website writes. Chinh must approve those actions separately.

## Examples

| Situation | Result |
| --- | --- |
| Sessions A and B browse concurrently | Each uses a different profile, daemon session name and dedicated CDP port. |
| Session A needs manual sign-in | A restarts headed on its reserved port; B remains headless and uninterrupted. |
| Observer sees A's old PID disappear during restart | Cleanup is rejected because A is `restarting`; no directory is removed. |
| Observer saw `ready`, but A has completed another restart | The observer's revision is stale, so cleanup is rejected before deletion. |
| Owner aborts while replacement Chrome is starting | The operation lock prevents a concurrent abort. Recovery detects a surviving launch even before its port is bound. |
| Cleaner crashes midway through deletion | A remains `reclaiming`; its port cannot be claimed until cleanup completes. |
| An approved login redirects to another origin | Automatic filling fails closed; Amp requests human assistance. |
| 1Password service-account resolution fails | No interactive 1Password fallback and no surprise Chrome window. |
| Two tasks request the same retained profile in a later phase | One waits or receives a conflict; they never launch against the directory concurrently. |

## Maintenance notes

### Source and compatibility

Implementation would change the lifecycle helper, its [schema](../../agent-browser-lifecycle/schema.json), the 2 browser conventions and their tests. Authentication would change `agent-secrets`, approved bundle policy and the provider integration. Do not edit projected runtime files directly.

Version new lifecycle records and the derived view when their contract changes. Continue replaying existing v1 history without rewriting committed lines. Derive revisions deterministically, and validate new cleanup transitions without retroactively requiring them in old history. New records must support candidate process identities, fixed cleanup outcomes and completion by a different actor; do not reuse v1's null-PID and owner-only terminal rules blindly.

Before activating the new lifecycle writer, drain existing browser work and update cooperative callers together. An old helper or old convention must not delete profiles while new sessions can restart. Document rollback compatibility before writing the first new-version event.

### Delivery and validation

| Phase | Agent work | Acceptance evidence |
| --- | --- | --- |
| 1. Lifecycle | Add serialized operations, restart, revisions and helper-owned cleanup. | Tests cover stale observers, completed restart before reclaim, child guards, live-process rejection, spawn-before-PID-record crashes, pre-listener Chrome, cleanup crashes, fixed outcomes, concurrent cleaners and historical replay. |
| 2. Quiet browsing | Make headless default and document human-assisted restarts. | On macOS, 2 sessions remain isolated. Restart one on the same port and profile; the other stays usable. Chinh confirms no routine foreground interruption. |
| 3. Secret resolution | Add strict mode and the scoped provider path. | Fake-op tests prove no interactive fallback, correct account and vault scope, bundle rejection, bounded cancellation and no bootstrap inheritance or secret output. |
| 4. First login | Implement destination checks and enable one approved alias. | Synthetic tests cover cross-origin redirects, navigation during fill, stale frame selection, iframes and altered form actions: the wrong destination receives no credentials. Separate tests verify identity-failure handling, provider timeout and no credential leakage to arguments, logs or output. Then verify the approved real login with Chinh. |

Chinh reviews the RFC, selects the first site/account and approves any required provisioning. The agent implements only after Chinh explicitly approves implementation. Optional profile persistence and dashboard assistance follow separate decisions, not implicit rollout steps.

For this documentation change, run `python3 amp/scripts/validate-rfcs.py` and `scripts/check-projection`. Run `./sync-skills.sh` for projection and verify the RFC matches its source. These checks validate documentation, not browser or authentication behaviour.

### Oracle review record

Oracle identified the missing restart transition and the resolver's interactive fallback. A focused follow-up confirmed that cleanup authorization must precede deletion. This draft also rejects stale revisions after a completed restart; it does not accept false-positive cleanup of a live profile.

Review of this draft identified partial launches before a listener exists, ambiguous cleanup outcomes and underspecified destination tests. The revised contract serializes complete operations, detects partial processes, fixes outcomes before deletion and separates pre-fill rejection from failures after valid filling.

Oracle initially suggested URL pinning for simple logins. The RFC keeps the stronger destination-check gate and makes the unresolved implementation mechanism explicit.

## Open questions

1. Does Chinh approve the first-release scope: ephemeral profiles retained across same-session restarts, but no cross-session persistence or dashboard assistance?
2. Which site/account should be the first automated login alias, and which visible marker proves the intended identity?
3. Agent-owned implementation gate: identify and test a login-path change that meets the destination contract. Present any patched-build maintenance decision to Chinh. This blocks automated filling, not headless browsing or human-assisted authentication.
