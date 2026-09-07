---
doc_schema: "amp-rfc/v1"
code: "RFC-0011"
title: "Quiet browser sessions and approved authentication"
slug: "quiet-browser-sessions-and-approved-authentication"
file: "rfc-0011-quiet-browser-sessions-and-approved-authentication.md"
status: "Accepted"
summary: "Use isolated headless sessions and a destination-checked agent-browser credential plugin backed by agent-secrets."
created: "2026-09-05"
updated: "2026-09-07"
amp_thread_id:
  T-01a06fe4-8468-755a-911b-48950a722cb9: "defined contracts with Oracle; human typing reproduced the missing dot; approved headless work and fresh headed human sign-in"
  T-01a06f94-14b9-71dd-9d12-c9f538a4a257: "compared local browser automation with TinyFish and examined profile persistence and headed operation"
  T-01a070f6-00d8-72d3-87fe-64a24e0e731e: "tested the actual dashboard with synthetic login data and found input failures"
  T-01a070f6-6bff-7019-ad5a-f7f1c7dea454: "tested live stream control, session isolation, cross-thread handoff and cleanup"
  T-01a0713a-85db-740b-bff2-c7c1ac705307: "implemented packages A to E; hardened the pinned native patch; identified the remaining Demo4 2FA asset blocker"
dependency:
  - type: "rfc"
    code: "RFC-0010"
    title: "Shared local agent and bot secrets"
    path: "./rfc-0010-shared-local-agent-and-bot-secrets.md"
implementation:
  - path: "../../agent-browser-custom/build"
  - path: "../../agent-browser-custom/rfc0011.patch"
  - path: "../../conventions/agent-browser.md"
  - path: "../../agent-secrets/bundles.json"
  - path: "../../agent-secrets/bundles.schema.json"
  - path: "../../scripts/validate-agent-secrets.py"
  - path: "../../scripts/merge-agent-browser-plugin.py"
  - path: "../../../bin/agent-secrets"
  - path: "../../../bin/agent-browser"
  - path: "../../../bin/agent-browser-credential-response"
  - path: "../../../bin/agent-browser-plugin-onepassword"
  - path: "../../../sync-skills.sh"
inputs:
  - name: "browser session request"
    kind: "owner thread and target workflow"
    purpose: "Claim an isolated profile and dedicated loopback CDP port."
  - name: "approved login alias"
    kind: "reviewed authentication policy"
    purpose: "Select one agent-secrets bundle and its permitted login destination."
  - name: "human sign-in"
    kind: "user interaction"
    purpose: "Pause browser workers while the user signs in through headed Chrome."
outputs:
  - name: "owned browser session"
    kind: "local Chrome process and lifecycle history"
    purpose: "Keep routine browsing invisible while retaining exclusive profile and CDP ownership for the session's lifetime."
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

Each session retains a dedicated profile and CDP port, coordinated through `agent-browser-lifecycle`. Routine work uses headless Chrome. Human sign-in uses headed Chrome while browser workers are paused. Dashboard authentication remains deferred because synthetic automation and human typing failed on version 0.36.0.

Packages A to E are implemented. A pinned 0.36.0 native patch enforces destination and identity policy. The `onepassword` plugin resolves approved `work` logins through strict `agent-secrets`; other bundles remain browser-disabled. Synthetic adversarial tests pass. Testing4 login passes with destination and account verification. Package F remains blocked for Demo4 because its 2FA page needs off-origin assets that the required credential guard blocks.

## Context

### Trigger and problem

The [research thread](https://ampcode.com/threads/T-01a06f94-14b9-71dd-9d12-c9f538a4a257) established that local Amp and `agent-browser` cover Chinh's browser tasks. The [proposal and Oracle review](https://ampcode.com/threads/T-01a06fe4-8468-755a-911b-48950a722cb9) identified 2 sources of friction:

- routine automation brings Chrome windows to the foreground
- approved secrets do not have a configured browser login path

The desired outcome is quiet automation with deliberate requests for help, not unattended access to every account.

### Current findings

| Evidence | Current behaviour |
| --- | --- |
| [Browser convention](../../conventions/agent-browser.md) | Defines launch, explicit browser identity, authentication, streaming and shutdown. |
| [Lifecycle helper](../../../bin/agent-browser-lifecycle) and [contract](../../conventions/agent-browser-lifecycle.md) | Coordinate claims and events. They do not launch Chrome or support process replacement within a session. |
| Lifecycle recovery procedure | Removes the profile before recording `observed_dead`. The event lock does not protect the preceding deletion. |
| [Secret resolver](../../../bin/agent-secrets) and [bundle policy](../../agent-secrets/bundles.json) | Give `work` approved browser policy and strict non-interactive resolution. Other bundles remain browser-disabled. |
| Current local installation | The wrapper checks a receipt derived from the pinned commit and patch. The native build derives a separate identity from its source and Cargo inputs. Daemons verify that identity before reuse. Plugin inspection reports `onepassword` with `credential.read`. |
| Version 0.36.0 [plugin execution](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/plugins.rs#L201-L235) and [daemon reuse](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/connection.rs#L792-L824) | Plugins inherit the background browser service's environment. Setting a secret variable on a later CLI command does not update that already-running service. |
| Unpatched upstream 0.36.0 [login handler](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/native/actions.rs#L11195-L11446) | Resolves credentials before navigation and does not verify the receiving page's origin before filling. Returns `loggedIn: true` when the scripted sequence finishes, without checking the account or successful authentication. |
| [Agent-browser plugin documentation](https://agent-browser.dev/plugins) | Defines `credential.read` for external vaults. A local executable exchanges one JSON request and response; browser automation stays in agent-browser. |
| Version 0.36.0 [streaming](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/docs/src/app/streaming/page.mdx) and [dashboard](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/docs/src/app/dashboard/page.mdx) documentation | The dashboard displays a live viewport and sends mouse, keyboard and touch input to an existing headless browser. Each stream has its own port; one local dashboard can proxy several streams. |

The CLI and version 0.36.0 source were rechecked after Chinh's review comments. These findings replace the earlier 0.32.3 assessment. Strict non-interactive vault resolution passes. Hardened Testing4 authentication passes. Hardened Demo4 authentication does not yet pass.

The [5 September live experiments](./rfc-0011/2026-09-05-dashboard-and-isolation-tests.md) confirmed session isolation and control without restarting Chrome, but failed dashboard sign-in. Dashboard credential input remains blocked.

The [implementation baseline and acceptance record](./rfc-0011/2026-09-05-implementation-baseline-and-acceptance.md) documents packages A to F and the final acceptance run. It records historical test resources as evidence only; every future session still requires a fresh claim and ownership checks.

### Constraints and analysis

The CDP port tells agent-browser which running Chrome instance to control. The profile directory stores that instance's cookies, login state and other browser data. These are separate resources.

For example, 2 concurrent sessions use different ports and different profile directories:

| Session | Chrome control address | Profile directory |
| --- | --- | --- |
| A | `127.0.0.1:9222` | `sessions/A/chrome-data/` |
| B | `127.0.0.1:9223` | `sessions/B/chrome-data/` |

Giving B port `9223` but pointing it at A's directory does not work: 2 Chrome instances would still compete for the same saved data.

Chrome must restart to change between headed and headless operation. But human sign-in does not always require a visible Chrome window. Agent-browser's built-in [local dashboard](https://agent-browser.dev/dashboard) can display A's page and send Chinh's input to A while Chrome stays headless. A keeps the same process, directory and CDP port.

The [initial RFC-0011 proposal in this design thread](https://ampcode.com/threads/T-01a06fe4-8468-755a-911b-48950a722cb9) would restart Chrome headed for sign-in, then restart it headless using the same profile and CDP port. That would create a cleanup race: another thread could mistake the intentional process gap for a dead session and delete its profile. A fresh headed session avoids that gap, so this RFC does not need restart states, revision checks or a process supervisor.

The dashboard cannot promise access to native macOS dialogs, Touch ID or every passkey flow. Some sites may also reject headless browsers. Those cases use headed Chrome. Dashboard repair and process-replacement automation remain outside this RFC.

## Decision

Routine sessions are headless. Headed launches are pre-approved, but each session stays in its launch mode. A headed fallback uses a fresh claim and profile. Each session keeps one exclusive ephemeral profile and one claimed loopback CDP port under the existing lifecycle ownership, handoff and cleanup workflow.

Automatic authentication uses the pinned RFC-0011 build, `onepassword` and an approved browser-enabled bundle. Continue only after destination and account checks pass; otherwise use headed human authentication.

Dashboard authentication, persistent profiles, cloud or shared browsers and custom viewers remain deferred.

## Contract

### Session ownership

A session has one session ID, owner thread, user-data directory and claimed `127.0.0.1` CDP port. One Chrome browser instance owns that directory while it runs. Its renderer and other child processes belong to that instance.

Every browser-control invocation follows the [explicit Agent Browser identity](../../conventions/agent-browser.md#explicit-agent-browser-identity). Lifecycle commands use the full lifecycle session ID. Child handoffs follow [Browser session handoff](../../../skills/delegating-subagents/SKILL.md#browser-session-handoff); `agent-browser-lifecycle` remains authoritative for attachment state and cleanup.

Global plugin inspection and dashboard service commands do not select a Chrome session. Dashboard commands must still use the intended namespace. No default daemon or automatic browser discovery may substitute another session.

Port reservations remain cooperative, not operating-system locks. Before publishing `ready`, verify that the launched Chrome process owns the expected listener and uses the recorded directory. A conflicting listener blocks progress; never terminate its process or connect to it.

### Existing lifecycle and cleanup

The lifecycle contract is unchanged. The [Agent Browser convention](../../conventions/agent-browser.md) owns launch, failed-start cleanup, shutdown and dead-session recovery.

### Deferred dashboard human sign-in

Dashboard sign-in remains deferred. Follow the Agent Browser convention's headed-authentication path; the [experiment record](./rfc-0011/2026-09-05-dashboard-and-isolation-tests.md) holds the dashboard evidence.

### Native credential plugin

Use agent-browser's documented plugin protocol, not an Amp plugin, Chrome extension or separate login automation script. The executable is `agent-browser-plugin-onepassword`, registered as `onepassword` with only the `credential.read` capability.

The responsibilities are separate:

| Component | Responsibility |
| --- | --- |
| `agent-browser-lifecycle` | Coordinate session ownership, profile and dedicated CDP port through the existing owner workflow. The credential plugin cannot launch or stop Chrome. |
| agent-browser | Invoke the credential plugin through `auth login`, then navigate, fill and submit through the destination-checked login path. |
| `onepassword` plugin | Validate the protocol envelope, pass the requested login alias and constraints to `agent-secrets`, and return the native credential response. It owns no separate alias registry and does not fill fields. |
| `agent-secrets` | Validate browser-login policy from its registry, authorize the bundle and registered handler, authenticate to 1Password and supply approved values and metadata to that handler. |
| Registered credential handler | Serialize approved runtime values and alias metadata into the plugin response; never inherit the vault bootstrap token. |

No `browser.provider`, `launch.mutate` or `command.run` capability is needed. Launch mutators do not run for externally managed CDP connections. Keep lifecycle management in the existing helper.

All automated credential access goes through `agent-secrets`, using approved references in the `Agent Secrets` vault in Chinh's personal 1Password account. The plugin must not call `op` directly, accept a caller-selected vault, or use `auth save` to duplicate passwords in agent-browser's local vault.

#### Alias and protocol contract

Use the existing [agent-secrets registry](../../agent-secrets/bundles.json) as the single source of truth. A bundle can contain an optional `browserLogins` map keyed by login alias. Aliases must be unique across the registry. Do not create a separate plugin alias list, site configuration or vault mapping.

The existing bundle policy retains its audience, owner, declared variables, compatibility and permitted command classes. Each `browserLogins` entry adds:

- mappings from username and password to declared bundle variables
- an exact HTTPS login URL and permitted credential-receiving origin
- explicit main-frame field and submit selectors
- expected post-login destination and account identity marker

Only an `agent`-audience bundle that permits the registered credential handler can expose browser credentials. A bundle without a matching `browserLogins` entry cannot resolve that alias. Secret-read approval alone does not authorize website filling.

Keep actual `op://Agent Secrets/...` references in the existing private `~/.credentials/agent-secrets/<bundle-name>.env` file. Register the plugin and handler once. Add browser accounts to the bundle that owns their credentials.

Extend both the registry schema and runtime validator; they currently reject unknown fields. Preserve existing bundles without `browserLogins`. Validate alias uniqueness, variable mappings, audience, handler authorization and complete destination metadata before vault access. `agent-secrets` finds the owning bundle from the alias and supplies only that login's credentials and metadata to the handler.

The executable reads exactly one JSON request from stdin and writes exactly one JSON response to stdout. Every envelope uses `protocol: "agent-browser.plugin.v1"`.

| Request | Required behaviour |
| --- | --- |
| `type: "plugin.manifest"`, `capability: "plugin.manifest"` | Return `success: true` and `manifest` naming `onepassword` with capabilities `["credential.read"]`. Do not access 1Password. |
| `type: "credential.resolve"`, `capability: "credential.read"` | Validate request shape, then let `agent-secrets` check `request.profileName`, `request.itemRef` and `request.url` against the registry before vault access. Return `success: true` and a `credential` object, not generic `data`. |
| Any other protocol, type or capability | Reject without resolving secrets. Do not expose a generic secret-read command. |

`profileName` means the registered login alias, not the bundle name or Chrome profile directory. `agent-secrets` uses the alias to find one owning bundle. `itemRef` may be omitted, null or equal to the alias; it is not a 1Password item name or `op://` reference. `url` may be omitted, null or equal to the configured login URL. `agent-secrets` rejects other values before resolving secrets.

The `credential` response contains `username`, `password`, `url`, `usernameSelector`, `passwordSelector` and `submitSelector`. The handler supplies values at runtime and always uses reviewed URL and selector metadata. It must not relay caller overrides or unrelated environment variables. The daemon consumes the response in memory; the plugin and handler must not persist that response.

#### Resolution and failure handling

Add an opt-in, service-account-only mode to `agent-secrets` that never falls back interactively. Preserve RFC-0010's existing behaviour for other callers. The short-lived plugin selects strict mode explicitly when starting `agent-secrets run` with the alias bundle and registered handler. Do not inject passwords or the bootstrap token into the long-lived daemon's environment.

Give strict resolution a 110-second deadline and the native credential invocation a 120-second deadline. Local service-account resolution makes several bounded 1Password calls and has exceeded the upstream 15-second plugin deadline. Include the plugin budget in the CLI read timeout so the client does not retry a live authentication command. Run the resolver and its secret-handling children in one process group. End that group on cancellation or deadline so no detached resolution continues. Do not return raw 1Password errors or credential payloads to Amp.

On rejection or resolution failure, return `success: false` with a fixed secret-free error and no `credential` object. Write no logs to stdout. Native core integrations suppress plugin stderr and error text, so the workflow must treat generic login failure as a request for assistance, not promise detailed resolver diagnostics through `auth login`.

Agent-browser can add a confirmation gate with `--confirm-actions plugin:onepassword:credential.read`. That gate is optional for aliases Chinh has already approved for automatic use; it never replaces `agent-secrets` bundle authorization. Human sign-in remains a separate path and does not invoke the credential plugin.

### Destination checks

Unpatched upstream 0.36.0 lacked this contract. The pinned RFC-0011 custom build implements the acceptance conditions below in its native login path and is required for automatic filling.

An enabled login path must meet these acceptance conditions:

1. Before the first fill, read the committed main-frame document. Require the exact approved login URL and origin, including scheme, host and port.
2. Bind the check and both fills to that document's target and navigation identity. Do not use a separate CLI check followed by unbound fill commands.
3. Ignore previous frame selection. Resolve both fields in the main frame and the same form; require its resolved action origin to be approved.
4. Abort on document replacement, frame changes or execution-context loss. Before submission, revalidate the document, origin and form destination.
5. On failure, perform no further credential writes or submission and discard the provider response. A failure before the first fill must leave all credential fields untouched.
6. Mark the target as tainted before any page function receives credentials. Until verification or confirmed target closure, block every off-origin request from the target and its attached workers, popups and out-of-process frames.
7. After any tainted failure, close the target and confirm closure before removing interception. If closure cannot be confirmed, keep interception active and fail closed.

The wrong destination must receive no credential bytes in adversarial navigation tests. A later failure cannot undo values already filled into the approved document. Post-login identity failure therefore blocks further work; it does not imply that no fields were filled.

Use the pinned RFC-0011 custom build's native login path for automatic filling. Keep an alias enabled only while these acceptance checks pass.

This protects against wrong destinations and automation mistakes, not a compromised approved site. Approved page scripts necessarily receive filled credentials and remain trusted. Version 0.36.0 still [rejects `--allowed-domains` with `--cdp` or `--profile`](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/native/actions.rs#L3192-L3211). Where supported, that filter [matches hostnames rather than complete origins](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/native/network.rs#L92-L125), so it is not a substitute.

## Behavior

Follow the [Agent Browser convention](../../conventions/agent-browser.md) for owner work and [delegating-subagents](../../../skills/delegating-subagents/SKILL.md#browser-session-handoff) for browser handoff. A dashboard or stream failure leaves Chrome running; Chrome death uses lifecycle recovery.

## Permissions and side effects

The implementation may spawn local Chrome, dashboard, credential-handler and 1Password processes. It may contact approved login sites and 1Password, and write private lifecycle metadata and session profiles. Dashboard and stream listeners remain local to this machine.

Keep existing owner-only directory and file permissions. Human sign-in permits transient local live frames displayed in the dashboard. It does not permit persisting those frames as screenshots or recordings. Disable saved authentication captures, HAR capture and verbose credential-bearing diagnostics. Do not inspect or retain human-entered passwords or one-time codes. Do not include passwords, tokens or filled values in command arguments, lifecycle events, fixtures or agent-visible output.

These controls reduce accidental exposure. They do not isolate hostile processes running as the same macOS user, nor make a sensitive page unreadable through CDP.

Neither this draft nor later implementation approval authorizes new vault items, broader service-account access, cross-session auth retention, cloud uploads or website writes. Chinh must approve those actions separately.

## Examples

### Plugin registration and invocation

`amp/scripts/merge-agent-browser-plugin.py` owns the secret-free `onepassword` registration; `sync-skills.sh` projects it. Follow the Agent Browser convention's [explicit identity](../../conventions/agent-browser.md#explicit-agent-browser-identity) and [authentication](../../conventions/agent-browser.md#authentication) instructions.

## Maintenance notes

### Source and compatibility

The existing lifecycle helper and [schema](../../agent-browser-lifecycle/schema.json) remain authoritative. This repository owns the temporary custom build, credential plugin, registration merge and browser policy. `amp/agent-secrets/bundles.json` is the only browser-login policy registry. Project runtime files through `sync-skills.sh`.

`amp/agent-browser-custom` exists only until an official agent-browser release supports this destination-checked login contract. When that release is adopted, remove the custom patch, build wrapper and stale-build receipt check.

### Delivery and validation

Packages A to E are complete. Testing4 has passed live acceptance. Package F remains blocked for Demo4. The [implementation baseline and acceptance record](./rfc-0011/2026-09-05-implementation-baseline-and-acceptance.md) holds the evidence. Use the README validation table for implementation changes.

For RFC-only changes, run `python3 amp/scripts/validate-rfcs.py` and `scripts/check-projection`. Run `./sync-skills.sh` and verify the RFC projection.

If authentication stops meeting this contract, disable the affected bundle and use headed authentication. A plugin rollback removes only the repository-owned registration.

### Oracle review record

Earlier Oracle reviews identified restart and cleanup races, partial launches and resolver fallback risks. Those reviews expanded the original restart proposal into a larger lifecycle redesign.

When Chinh questioned that friction, Oracle recommended avoiding process replacement: dashboard sign-in first, then a separately claimed headed session for native-only authentication. Chinh agreed. This revision removes the restart-specific states, revisions, operation locks and cleanup redesign instead of carrying them into the simpler workflow.

Authentication review remains applicable. The RFC keeps strict resolver behaviour and the stronger destination-check gate; URL pinning alone is insufficient. Dashboard interaction remains cooperative.

The subsequent live tests blocked dashboard sign-in on 0.36.0. Chinh then reproduced the missing dot by physically typing through the dashboard and selected headed Chrome for human sign-in. Successful session isolation and stream shutdown do not override the failed input test.

A later Oracle review found unsafe cleanup, incomplete descendant interception and semantic-version daemon reuse. The implementation now closes and confirms tainted targets, blocks all guarded off-origin requests, and derives daemon identity from native build inputs. The plugin also requires an RFC-specific credential contract before it reads the vault. Hardened live testing then showed that Demo4's same-origin 2FA page depends on scripts and styles from `assets.holistics.io`; blocking those requests leaves no OTP control to fill.

## Open questions

How should an approved multi-stage login load off-origin assets between credential stages without weakening the requirement to block every off-origin request while a target is tainted?

Dashboard repair and custom-viewer experiments remain deferred work outside this RFC.
