---
doc_schema: "amp-rfc/v1"
code: "RFC-0011"
title: "Quiet browser sessions and approved authentication"
slug: "quiet-browser-sessions-and-approved-authentication"
file: "rfc-0011-quiet-browser-sessions-and-approved-authentication.md"
status: "Accepted"
summary: "Use headless sessions and an agent-browser credential plugin backed by agent-secrets; dashboard sign-in is blocked by 0.36.0 input failures."
created: "2026-09-05"
updated: "2026-09-05"
amp_thread_id:
  T-01a06fe4-8468-755a-911b-48950a722cb9: "defined contracts with Oracle; human typing reproduced the missing dot; approved headless work and fresh headed human sign-in"
  T-01a06f94-14b9-71dd-9d12-c9f538a4a257: "compared local browser automation with TinyFish and examined profile persistence and headed operation"
  T-01a070f6-00d8-72d3-87fe-64a24e0e731e: "tested the actual dashboard with synthetic login data and found input failures"
  T-01a070f6-6bff-7019-ad5a-f7f1c7dea454: "tested live stream control, session isolation, cross-thread handoff and cleanup"
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
    purpose: "Allow dashboard sign-in only after input validation passes, or a separately approved fresh headed session."
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

Each session retains a dedicated profile and CDP port, coordinated through `agent-browser-lifecycle`. A native `credential.read` plugin would resolve approved 1Password credentials through `agent-secrets`. The approved direction is headless routine work and explicitly approved fresh headed sessions for human sign-in, not same-session restarts. Dashboard authentication is deferred: both synthetic automation and human typing failed on installed version 0.36.0. This RFC records the decision; runtime implementation and credential provisioning are not complete.

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
| Local CLI checks on 5 September 2026 | `agent-browser --version` reports `0.36.0`; `agent-browser plugin list` reports no configured plugins. |
| Version 0.36.0 [plugin execution](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/plugins.rs#L201-L235) and [daemon reuse](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/connection.rs#L792-L824) | Plugins inherit the background browser service's environment. Setting a secret variable on a later CLI command does not update that already-running service. |
| Version 0.36.0 [login handler](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/native/actions.rs#L11195-L11446) | Resolves credentials before navigation and does not verify the receiving page's origin before filling. Returns `loggedIn: true` when the scripted sequence finishes, without checking the account or successful authentication. |
| [Agent-browser plugin documentation](https://agent-browser.dev/plugins) | Defines `credential.read` for external vaults. A local executable exchanges one JSON request and response; browser automation stays in agent-browser. |
| Version 0.36.0 [streaming](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/docs/src/app/streaming/page.mdx) and [dashboard](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/docs/src/app/dashboard/page.mdx) documentation | The dashboard displays a live viewport and sends mouse, keyboard and touch input to an existing headless browser. Each stream has its own port; one local dashboard can proxy several streams. |

The CLI and version 0.36.0 source were rechecked after Chinh's review comments. These findings replace the earlier 0.32.3 assessment. Earlier file-metadata inspection found an owner-only service-account bootstrap file. Token validity, vault access and real-account sign-in remain untested.

The [5 September live experiments](./rfc-0011/2026-09-05-dashboard-and-isolation-tests.md) confirmed session isolation and control without restarting Chrome, but failed dashboard sign-in. Dashboard credential input remains blocked.

### Constraints and analysis

The CDP port tells agent-browser which running Chrome instance to control. The profile directory stores that instance's cookies, login state and other browser data. These are separate resources.

For example, 2 concurrent sessions use different ports and different profile directories:

| Session | Chrome control address | Profile directory |
| --- | --- | --- |
| A | `127.0.0.1:9222` | `sessions/A/chrome-data/` |
| B | `127.0.0.1:9223` | `sessions/B/chrome-data/` |

Giving B port `9223` but pointing it at A's directory does not work: 2 Chrome instances would still compete for the same saved data.

Chrome must restart to change between headed and headless operation. But human sign-in does not always require a visible Chrome window. Agent-browser's built-in [local dashboard](https://agent-browser.dev/dashboard) can display A's page and send Chinh's input to A while Chrome stays headless. A keeps the same process, directory and CDP port.

The [initial RFC-0011 proposal in this design thread](https://ampcode.com/threads/T-01a06fe4-8468-755a-911b-48950a722cb9) would restart Chrome headed for sign-in, then restart it headless using the same profile and CDP port. That would create a cleanup race: another thread could mistake the intentional process gap for a dead session and delete its profile. Dashboard sign-in avoids that gap, so this RFC no longer needs restart states, revision checks or a process supervisor.

The dashboard cannot promise access to native macOS dialogs, Touch ID or every passkey flow. Some sites may also reject headless browsers. Those cases use a separately approved headed session with a fresh profile and CDP port. The tradeoff is repeating sign-in and any browser-local work, rather than adding process replacement and authentication-state migration.

## Decision

Use headless routine work and explicitly approved fresh headed sessions for human sign-in. Dashboard authentication is a deferred option, not a rollout dependency:

- use headless system Chrome for routine work, without foreground activation
- keep dashboard authentication blocked unless input fixes pass synthetic and human retesting
- pause automated input while Chinh controls the session
- ask before starting a fresh headed session for human sign-in or native UI, then finish that task headed
- keep lifecycle claims, handoffs and cleanup under the existing `agent-browser-lifecycle` workflow
- integrate 1Password through a first-party agent-browser plugin named `onepassword`, declaring only `credential.read`
- add a strict, non-interactive browser authentication path to `agent-secrets`, without changing existing callers' fallback behaviour
- enable automated filling only when the login path enforces the approved destination; otherwise request human sign-in
- keep profiles ephemeral and exclusive to one session, with no cross-session authentication copying

Do not add same-session headed/headless restarts. Defer persistent profiles, cloud browsers and shared Chrome instances for unrelated owner threads. Version 0.36.0 includes the [dashboard hardening introduced in 0.35.2](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/CHANGELOG.md#L29-L33), but failed the documented sign-in experiments. A successful stream connection is not proof of usable authentication.

## Contract

### Session ownership

A session has one session ID, owner thread, user-data directory and reserved `127.0.0.1` CDP port. One Chrome browser instance owns that directory for the session's lifetime. Its renderer and other child processes belong to that instance. The owner chooses headless or approved headed operation at launch; that choice does not change during the session.

Every browser-control invocation uses an explicit namespace, daemon session name and recorded CDP endpoint. Map a short, collision-checked daemon name to the full lifecycle session ID; include both and the namespace in handoffs. Keep the full UUID for lifecycle commands. Validate the resolved socket-path length before publishing `ready`, rather than assuming the UUID fits.

Global plugin inspection and dashboard service commands do not select a Chrome session. Dashboard commands must still use the intended namespace. No default daemon or automatic browser discovery may substitute another session.

Port reservations remain cooperative, not operating-system locks. Before publishing `ready`, verify that the launched Chrome process owns the expected listener and uses the recorded directory. A conflicting listener blocks progress; never terminate its process or connect to it.

### Existing lifecycle and cleanup

Keep the current `claimed`, `ready` and `stopping` states, child attachment events and terminal outcomes. The owner launches and ends Chrome under the existing convention, recording lifecycle changes through the helper. Dashboard sign-in leaves the session `ready`; it does not replace Chrome or introduce a new lifecycle event.

Retain the current failed-launch and dead-session checks. End partial launches before recording `start_failed`. Verify process and listener absence before removing a profile or recording a terminal outcome. A missing listener alone is insufficient. If process ownership or absence is uncertain, stop cleanup and investigate.

Never relaunch Chrome in a dead `ready` session or reuse its directory. Recover the old session through the lifecycle workflow and claim a new session if work must continue. Without intentional restart gaps, a dead browser is a failure, not a planned transition back to `ready`.

This does not harden existing cleanup against hostile same-user processes or incomplete liveness checks. The event lock still does not protect external file deletion. Broader cleanup hardening can be reviewed separately; no lifecycle schema migration or custom supervisor is required for dashboard handoff.

### Local dashboard and human input

The dashboard is a local viewing and control service, not the owner of Chrome lifecycle. Its ports serve different purposes:

| Endpoint | Scope and purpose |
| --- | --- |
| Dedicated loopback CDP port | One lifecycle session; agent-browser controls that session's Chrome instance. |
| OS-assigned loopback stream port | One agent-browser session; carries live frames and human input. It is not the CDP port. |
| Dashboard at `http://localhost:4848` by default | Local service shared within a namespace. It proxies streams without combining profiles or CDP reservations. |

Version 0.36.0 enables the stream listener when its daemon starts; clients trigger frame delivery. After attachment, disable and verify the stream unless approved assistance is underway. This reduces exposure but is not opt-in listener startup. Recheck after daemon replacement. Re-enabling may allocate a new stream port; obtain the current value rather than reusing a saved link.

Use a dedicated namespace for related work. Dashboard discovery includes all enabled streams in that namespace; a session-selection URL alone does not hide other sessions. Reuse an approved dashboard only when its namespace and listener match. Otherwise choose an unused loopback port without opening or focusing a browser window automatically. Never stop another task's service. Namespaces separate discovery, not hostile same-user access.

Link to the dashboard root and identify the session to select in its UI. Do not rely on a `?port=` link until its content-type failure is fixed. Select only the lifecycle-managed session named in the handoff. Do not use dashboard New Session controls or adopt sessions created outside the lifecycle workflow. Dashboard AI Chat, external gateways, public listeners, tunnels and remote exposure are out of scope.

Only Chinh supplies browser input during human sign-in. The owner pauses its commands, waits for in-flight actions to finish and requires attached children to detach. The owner also withdraws outstanding attachment permissions and grants no new handoffs until Chinh finishes. This is cooperative policy: the dashboard and lifecycle helper do not enforce an exclusive human-input lock. If the owner cannot establish that pause, do not begin the handoff.

### Dashboard input is an implementation gate

Do not enter real credentials through the 0.36.0 dashboard. Before enabling this route, a candidate version must pass the unchanged synthetic login through its actual UI. Test punctuation, shifted keys, Tab, Enter, paste and focus changes. Verify exact received values and successful authentication, not just visible frames or command success.

Credentials must reach only the intended form, never Chat or another editable surface. Verify that Chat cannot receive or persist sign-in input; leaving its gateway key unset is insufficient. Do not substitute direct target fills, change fixture credentials or count `keyboard type` as physical keyboard evidence. After synthetic checks pass, validate the intended human interaction with Chinh before using a real account. Present any upstream patch or custom-build requirement for review.

### Native credential plugin

Use agent-browser's documented plugin protocol, not an Amp plugin, Chrome extension or separate login automation script. The proposed executable is `agent-browser-plugin-onepassword`, registered as `onepassword` with only the `credential.read` capability.

The responsibilities are separate:

| Component | Responsibility |
| --- | --- |
| `agent-browser-lifecycle` | Coordinate session ownership, profile and dedicated CDP port through the existing owner workflow. The credential plugin cannot launch or stop Chrome. |
| agent-browser | Invoke the credential plugin through `auth login`, then navigate, fill and submit through the destination-checked login path. |
| `onepassword` plugin | Validate the protocol envelope, pass the requested bundle name and constraints to `agent-secrets`, and return the native credential response. It owns no separate alias registry and does not fill fields. |
| `agent-secrets` | Validate browser-login policy from its registry, authorize the bundle and registered handler, authenticate to 1Password and supply approved values and metadata to that handler. |
| Registered credential handler | Serialize approved runtime values and alias metadata into the plugin response; never inherit the vault bootstrap token. |

No `browser.provider`, `launch.mutate` or `command.run` capability is needed. Launch mutators do not run for externally managed CDP connections. Keep lifecycle management in the existing helper.

All automated credential access goes through `agent-secrets`, using approved references in the `Agent Secrets` vault in Chinh's personal 1Password account. The plugin must not call `op` directly, accept a caller-selected vault, or use `auth save` to duplicate passwords in agent-browser's local vault.

#### Alias and protocol contract

Use the existing [agent-secrets registry](../../agent-secrets/bundles.json) as the single source of truth. Add an optional `browserLogin` section to a bundle; its bundle name is also its login alias. Do not create a separate plugin alias list, site configuration or vault mapping.

The existing bundle policy retains its audience, owner, declared variables, compatibility and permitted command classes. `browserLogin` adds:

- mappings from username and password to declared bundle variables
- an exact HTTPS login URL and permitted credential-receiving origin
- explicit main-frame field and submit selectors
- expected post-login destination and account identity marker

Only an `agent`-audience bundle that permits the registered credential handler can expose browser credentials. A bundle without `browserLogin` cannot be used for browser login. Secret-read approval alone does not authorize website filling.

Keep actual `op://Agent Secrets/...` references in the existing private `~/.credentials/agent-secrets/<bundle-name>.env` file. Register the plugin and handler once. Adding an account then requires one reviewed browser-enabled bundle and its reference file, not another plugin configuration.

Extend both the registry schema and runtime validator; they currently reject unknown fields. Preserve existing bundles without `browserLogin`. Validate variable mappings, audience, handler authorization and complete destination metadata before vault access. `agent-secrets` supplies credentials and metadata from the same validated bundle to the handler; the plugin must not maintain a second policy copy.

The executable reads exactly one JSON request from stdin and writes exactly one JSON response to stdout. Every envelope uses `protocol: "agent-browser.plugin.v1"`.

| Request | Required behaviour |
| --- | --- |
| `type: "plugin.manifest"`, `capability: "plugin.manifest"` | Return `success: true` and `manifest` naming `onepassword` with capabilities `["credential.read"]`. Do not access 1Password. |
| `type: "credential.resolve"`, `capability: "credential.read"` | Validate request shape, then let `agent-secrets` check `request.profileName`, `request.itemRef` and `request.url` against the registry before vault access. Return `success: true` and a `credential` object, not generic `data`. |
| Any other protocol, type or capability | Reject without resolving secrets. Do not expose a generic secret-read command. |

`profileName` means the bundle name used as the authentication alias, not the Chrome profile directory. Require it to identify an enabled browser-login bundle. `itemRef` may be omitted, null or equal to that name; it is not an arbitrary 1Password item name or `op://` reference. `url` may be omitted, null or equal to the configured login URL. `agent-secrets` rejects other values before resolving secrets.

The `credential` response contains `username`, `password`, `url`, `usernameSelector`, `passwordSelector` and `submitSelector`. The handler supplies values at runtime and always uses reviewed URL and selector metadata. It must not relay caller overrides or unrelated environment variables. The daemon consumes the response in memory; the plugin and handler must not persist that response.

#### Resolution and failure handling

Add an opt-in, service-account-only mode to `agent-secrets` that never falls back interactively. Preserve RFC-0010's existing behaviour for other callers. The short-lived plugin selects strict mode explicitly when starting `agent-secrets run` with the alias bundle and registered handler. Do not inject passwords or the bootstrap token into the long-lived daemon's environment.

Give resolution a deadline of at most 10 seconds. Version 0.36.0 [waits up to 15 seconds for plugin output](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/plugins.rs#L271-L290); that timeout starts after process creation and stdin writing. Run the resolver and its secret-handling children in one process group. End that group on cancellation or deadline so no detached resolution continues. Do not return raw 1Password errors or credential payloads to Amp.

On rejection or resolution failure, return `success: false` with a fixed secret-free error and no `credential` object. Write no logs to stdout. Native core integrations suppress plugin stderr and error text, so the workflow must treat generic login failure as a request for assistance, not promise detailed resolver diagnostics through `auth login`.

Agent-browser can add a confirmation gate with `--confirm-actions plugin:onepassword:credential.read`. That gate is optional for aliases Chinh has already approved for automatic use; it never replaces `agent-secrets` bundle authorization. Human sign-in remains a separate path and does not invoke the credential plugin.

### Destination checks are an implementation gate

The native 0.36.0 login path still does not enforce this contract. It resolves credentials before navigation and can honour a previously selected frame. It does not bind filling to a verified page origin and document, or validate the form destination. Pinning the requested URL prevents caller overrides, but does not check the document that receives credentials.

Native credential requests do not include command-line selector overrides. The login path must reject unapproved overrides and use the alias's selectors; the plugin alone cannot enforce that restriction.

An enabled login path must meet these acceptance conditions:

1. Before the first fill, read the committed main-frame document. Require the exact approved login URL and origin, including scheme, host and port.
2. Bind the check and both fills to that document's target and navigation identity. Do not use a separate CLI check followed by unbound fill commands.
3. Ignore previous frame selection. Resolve both fields in the main frame and the same form; require its resolved action origin to be approved.
4. Abort on document replacement, frame changes or execution-context loss. Before submission, revalidate the document, origin and form destination.
5. On failure, perform no further credential writes or submission and discard the provider response. A failure before the first fill must leave all credential fields untouched.

The wrong destination must receive no credential bytes in adversarial navigation tests. A later failure cannot undo values already filled into the approved document. Post-login identity failure therefore blocks further work; it does not imply that no fields were filled.

Prefer a small extension to the upstream login path over a second, general-purpose CDP framework. The agent must identify and test the mechanism before enabling an alias. If this requires maintaining a patched browser build, present that cost for review rather than assuming approval. Until the gate passes, the alias remains human-assisted; provider installation alone must not enable it.

This protects against wrong destinations and automation mistakes, not a compromised approved site. Approved page scripts necessarily receive filled credentials and remain trusted. Version 0.36.0 still [rejects `--allowed-domains` with `--cdp` or `--profile`](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/native/actions.rs#L3192-L3211). Where supported, that filter [matches hostnames rather than complete origins](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/native/network.rs#L92-L125), so it is not a substitute.

## Behavior

### Routine work and automatic sign-in

Start the claimed session headless. If the intended account is already authenticated, continue without resolving credentials again.

When login is needed, pause other browser work using the same child-detachment and handoff restrictions as human sign-in. For an enabled alias, use `auth login --credential-provider onepassword` in the existing explicit session and CDP endpoint. Do not use `plugin run` for `credential.read`. Verify the destination and account marker afterwards; a successful submit command is not proof of authentication.

If the alias is missing, resolution fails, identity is wrong or a challenge needs a human, stop that authentication attempt. Ask Chinh for help without changing accounts, trying broader bundles or opening a window automatically.

### Deferred: human sign-in through the dashboard

This future workflow is blocked on 0.36.0 until the dashboard input gate passes. It is not the current human-sign-in route.

1. Ask Chinh to sign in through the local dashboard and identify the intended site, account and session.
2. Establish the input pause defined above. Verify the recorded Chrome process, profile and CDP listener still match.
3. Enable that session's stream. Provide the matching namespace's dashboard link and the current session name and stream port.
4. Let Chinh open the dashboard when ready. Do not open or focus a browser window without approval.
5. Wait for Chinh to explicitly confirm completion. A closed dashboard tab is not confirmation of successful sign-in.
6. Disable the stream and verify it is disabled before resuming automated input. Do not stop the shared dashboard service.
7. Recheck the lifecycle identity, URL and intended account. Discard pre-handoff element references and obtain fresh ones.
8. Resume the task only after those checks pass. Issue new child handoffs if needed.

Chrome remains headless throughout. The session's PID, profile and CDP port do not change. If the dashboard disconnects or Chinh has not finished, keep automation paused and ask how to continue.

Manual sign-in grants access within this session. It does not authorize copying credentials into the vault, saving authentication for other sessions or publishing changes on the site.

### Human sign-in in a fresh headed session

While the dashboard input gate is blocked, or for a known native-only site, ask before launch and start headed once. If authentication becomes necessary during headless work, explain why dashboard sign-in is unavailable. Tell Chinh which sign-in steps and browser-local work must be repeated, then ask to open a fresh headed session.

After approval, claim a new session with a different directory and dedicated CDP port. Do not copy the old profile, cookies or authentication state. Keep the old session paused until its outstanding work is accounted for and cleanup is safe. End it through the existing lifecycle workflow; do not silently discard unfinished work.

Chinh signs in directly in the new Chrome window while automated input remains paused. Verify the new session and intended account, then finish the task headed. Do not switch back to headless or repeatedly reopen windows. If Chinh declines, leave the blocked work paused or stop it as directed.

### Failures and shutdown

A dashboard or stream failure does not end the underlying Chrome session. Keep human input and automation from overlapping while recovering the connection. If Chrome itself dies, use dead-session recovery rather than relaunching it under the same session ID.

For shutdown, wait for human assistance to end and children to detach. Disable the session's stream, record `stopping`, disconnect the owner and end Chrome. Closing agent-browser's CDP connection alone does not prove externally launched Chrome has stopped. Follow existing process checks, profile removal and terminal recording in that order. A cleanup failure must not be reported as completed shutdown. Other sessions and shared dashboard services remain untouched.

## Permissions and side effects

The implementation may spawn local Chrome, dashboard, credential-handler and 1Password processes. It may contact approved login sites and 1Password, and write private lifecycle metadata and session profiles. Dashboard and stream listeners remain local to this machine.

Keep existing owner-only directory and file permissions. Human sign-in permits transient local live frames displayed in the dashboard. It does not permit persisting those frames as screenshots or recordings. Disable saved authentication captures, HAR capture and verbose credential-bearing diagnostics. Do not inspect or retain human-entered passwords or one-time codes. Do not include passwords, tokens or filled values in command arguments, lifecycle events, fixtures or agent-visible output.

These controls reduce accidental exposure. They do not isolate hostile processes running as the same macOS user, nor make a sensitive page unreadable through CDP.

Neither this draft nor later implementation approval authorizes new vault items, broader service-account access, cross-session auth retention, cloud uploads or website writes. Chinh must approve those actions separately.

## Examples

### Plugin registration and invocation

Proposed entry in agent-browser's `plugins` array, after implementation approval:

```json
{
  "name": "onepassword",
  "command": "/Users/lelouvincx/.local/bin/agent-browser-plugin-onepassword",
  "args": [],
  "capabilities": ["credential.read"]
}
```

Keep this entry under repository control and project it into agent-browser configuration. No package download is needed for this first-party local executable. Do not put vault references, passwords or tokens in plugin arguments or `AGENT_BROWSER_PLUGINS`.

After the destination-check gate passes for the alias, the owner uses:

```bash
agent-browser --namespace "$BROWSER_NAMESPACE" \
  --session "$BROWSER_SESSION" --cdp "$CDP_PORT" \
  auth login "$LOGIN_ALIAS" \
  --credential-provider onepassword --item "$LOGIN_ALIAS"
```

`BROWSER_SESSION` is the short daemon name mapped to the full lifecycle UUID. The native command invokes the plugin, which calls `agent-secrets`; only approved runtime credentials return through the plugin protocol. The command does not select another Chrome profile or allocate another CDP port. `agent-browser plugin list` and `plugin show onepassword` inspect registration without resolving a login.

### Session outcomes

| Situation | Result |
| --- | --- |
| Sessions A and B browse concurrently | Each uses a different profile, daemon session name and dedicated CDP port. |
| Session A needs manual sign-in after the dashboard input gate passes | Chinh uses A's dashboard stream. A's PID, profile and CDP port stay unchanged; B continues independently. |
| Session A needs manual sign-in while the dashboard gate is blocked | Ask to create a fresh headed session. Do not enter real credentials through the unvalidated dashboard. |
| A child has unused permission to attach to A | The owner withdraws that permission before human input, even if no child is currently attached. |
| Chinh closes the dashboard without confirming completion | A stays paused; the owner asks whether sign-in is complete. |
| A needs a native macOS authentication dialog | With approval, create headed session C with a fresh profile and different CDP port. Explain what must be repeated. |
| A's Chrome process dies | Use ordinary dead-session recovery. Do not relaunch against A's directory. |
| Session A ends while B uses the dashboard | Disable A's stream and clean up A through lifecycle. Leave the dashboard service and B running. |
| An approved login redirects to another origin | Automatic filling fails closed; Amp requests human assistance. |
| 1Password service-account resolution fails | No interactive 1Password fallback and no surprise Chrome window. |

## Maintenance notes

### Source and compatibility

Quiet browsing changes the browser convention and adds dashboard handoff guidance and workflow tests. The existing lifecycle helper and [schema](../../agent-browser-lifecycle/schema.json) remain the lifecycle contract; this direction requires no new states or history migration. Authentication adds the first-party credential plugin and changes `agent-secrets`, approved bundle policy and the registered handler. Do not edit projected runtime files directly.

Store plugin code and its registration fragment in this repository. Keep browser-login policy only in `amp/agent-secrets/bundles.json`, with matching schema and runtime validation. Extend projection to merge the owned `onepassword` entry into `~/.agent-browser/config.json`, preserving unrelated options and plugins. Refuse a conflicting entry rather than overwriting it. Reference-only bundle files remain under the existing local credentials contract; they are not projected from this repository.

Verify the [native plugin contract](https://agent-browser.dev/plugins) against the installed version before implementation. Test manifest discovery without vault access, request validation, response shape and plugin registration separately from live authentication.

Verify dashboard and streaming behaviour against that same version. Preserve loopback restrictions and keep human-input coordination in the owner workflow, rather than claiming native input locking. Apply the new launch policy to fresh sessions; do not restart existing sessions during rollout or rewrite their history.

### Delivery and validation

| Phase | Agent work | Acceptance evidence |
| --- | --- | --- |
| 1. Quiet browsing | Make headless default under the existing lifecycle workflow. | On macOS, 2 concurrent sessions use distinct profiles, CDP ports and daemon names. Verify ready, failed-launch and shutdown paths. Chinh confirms no routine foreground interruption. |
| 2. Human assistance | Ask before launching a fresh headed session; finish the task headed. | Verify explicit approval, a fresh profile and CDP port, paused agents, withdrawn handoffs, post-login identity and lifecycle cleanup. Verify no authentication copying, process replacement or saved auth captures. Repeat strict readiness checks without pipelines hiding failures. Dashboard input fixes and human retesting are deferred, not required for this phase. |
| 3. Secret resolution | Transfer all current bundles into the extended registry with optional `browserLogin`; add strict mode, the native plugin, its one-time registration and the registered handler. | Migration tests cover every existing bundle and preserve its permissions, references and callers. Schema and runtime tests reject invalid variable mappings, audience, handler or destination metadata before vault access. Protocol tests prove bundle-name lookup without a second alias registry, secret-free manifests, exact responses and safe failure output. Fake-op tests cover vault scope, no fallback, cancellation and token isolation. Projection tests preserve unrelated plugin configuration. |
| 4. First login | Implement destination checks and enable one approved alias. | Synthetic tests cover cross-origin redirects, navigation during fill, stale frame selection, iframes and altered form actions: the wrong destination receives no credentials. Separate tests verify identity-failure handling, provider timeout and no credential leakage to arguments, logs or output. Then verify the approved real login with Chinh. |

Chinh selected all current `agent-secrets` bundles as the migration scope: `amp-runtime`, `work`, `lelouvincx-bot`, `amp-runner-r2` and `smartclass-deepseek`. Preserve each bundle's name, audience, owner, variables, compatibility, allowed command classes and private reference file. Reconcile this inventory against the registry at implementation time so no current bundle is omitted. This extends the existing registry; it does not copy secrets into a second store.

These bundles currently declare API tokens or service credentials, not username/password browser login pairs. Transfer them without inventing browser metadata or granting new browser access. Publisher bundles remain publisher-only. Add `browserLogin` only where an approved browser account, destination and identity marker are available; otherwise retain the existing command-based use. Browser-account details and any new provisioning remain prerequisites for real browser login, not blockers for transferring all bundles.

Chinh approved the headless/fresh-headed direction after the manual synthetic test. Expected outcome: routine work stays headless; human sign-in opens a dedicated Chrome window only with explicit approval; approved secrets resolve without interactive 1Password fallback once the destination gate passes. Dashboard fixes are not required to deliver that direction. Cross-session persistence remains a separate decision.

For this documentation change, run `python3 amp/scripts/validate-rfcs.py` and `scripts/check-projection`. Run `./sync-skills.sh` for projection and verify the RFC matches its source. These checks validate documentation, not browser or authentication behaviour.

### Implementation work packages

All packages below are planned, not implemented. Use the current worktree and keep unrelated changes intact. The delivery table above defines acceptance; these packages define execution order and file ownership.

#### A. Establish the baseline and destination mechanism

Agent work:

1. Recheck installed agent-browser, system Chrome, native plugin requests and the login implementation. Record versions and source references in the RFC's supporting directory.
2. Inventory all registry bundles and registered callers without resolving credentials. Run existing secret-policy and resolver tests before changing behaviour.
3. Use synthetic credentials to identify the smallest login-path change that can enforce the destination contract. Account for main-frame selection, document identity and command-line selector overrides.
4. Record how the browser receives approved origin and identity metadata. The current native credential response does not carry the complete registry policy; do not silently discard that policy or extend the protocol without checking compatibility.

Exit: a reproducible baseline and a concrete destination-check mechanism, or a documented blocker. Present any maintained upstream patch or custom-build requirement to Chinh before adopting it. This blocker stops real automatic filling, not packages B to E.

#### B. Deliver quiet browsing and headed assistance

Agent work:

1. Update `amp/conventions/agent-browser.md` with headless launch, explicit namespace/session/CDP selection, short daemon-name mapping and stream disable after attachment.
2. Document the input pause and approved fresh-headed route there. Keep `amp/conventions/agent-browser-lifecycle.md`, `bin/agent-browser-lifecycle` and its schema unchanged unless a demonstrated contract mismatch requires review.
3. Add a reproducible synthetic session procedure under this RFC's supporting directory. Exercise the phase 1 and 2 acceptance cases, including partial launch, duplicate port claims and explicit shutdown of externally launched Chrome.
4. Use fail-fast command checks before recording `ready`. Verify PID, profile, listener, URL and title independently; do not hide command failures behind pipelines.

Chinh's action: approve the headed test window and confirm routine headless work does not interrupt the desktop. Agent outcome: verified quiet browsing with a working manual route, independent of the credential plugin and dashboard fixes.

#### C. Extend the registry and transfer every bundle

Agent work:

1. Specify the exact optional `browserLogin` fields in `amp/agent-secrets/bundles.schema.json`. Match runtime validation in `bin/agent-secrets` and semantic checks in `amp/scripts/validate-agent-secrets.py`.
2. Preserve the full current inventory in `amp/agent-secrets/bundles.json`. Existing non-browser bundles need no fabricated metadata or rewritten private reference files.
3. Extend `amp/scripts/test_validate_agent_secrets.py` and `amp/scripts/test_agent_secrets.py` with migration and rejection cases from phase 3. Use temporary reference files and fake 1Password responses, never live credentials.
4. Ensure one validated bundle supplies both secret mappings and browser metadata. Keep request validation in `agent-secrets`; expose no general-purpose plaintext secret-read command.

Exit: every existing bundle and caller remains compatible, including publisher restrictions. Invalid or absent browser policy blocks browser resolution before any vault call. No additional Chinh action is needed for preserving existing bundles.

#### D. Add strict resolution and the native plugin

Depends on C. Agent work:

1. Add an explicit strict service-account-only option to `agent-secrets run`. Preserve existing interactive and fallback semantics when callers do not select it.
2. Add `bin/agent-browser-plugin-onepassword` and a narrowly registered credential handler. Select implementation language and handler placement from existing resolver conventions; avoid a second policy parser or registry.
3. Validate plugin envelopes without vault access. Pass the requested bundle and constraints to strict resolution, then serialize the native response from approved values and metadata.
4. Test protocol discovery, unknown aliases, URL and item rejection, malformed input, provider errors, cancellation and the 10-second deadline. Verify child processes end and the handler never inherits the bootstrap token.
5. Test browser-service reuse: resolution must work without injecting new secret variables into an already-running daemon. Test manifests and synthetic responses against the installed native plugin consumer.

Exit: the plugin works with synthetic data and fixed secret-free failures. Provider registration or successful JSON exchange must not enable real filling before package F.

#### E. Project and validate the integration

Depends on D. Agent work:

1. Extend `sync-skills.sh` to install the owned executable and merge its registration into agent-browser configuration. Preserve unrelated settings and plugins, and refuse conflicting ownership or invalid configuration.
2. Extend `scripts/check-projection` with temporary-home cases for first install, repeat sync, unrelated entries and conflicts. Verify projection creates no credential files or bootstrap tokens.
3. Run the applicable README checks: RFC validation, secret-policy validation, resolver and validator tests, and projection validation. Run the new plugin tests as part of the repository's normal validation entry point.
4. Inspect the temporary projection before running `./sync-skills.sh` against the local runtime. Confirm registration through plugin inspection without resolving credentials or attaching to unrelated sessions.

Exit: repeatable installation with preserved configuration and no enabled real browser alias. Record changed files and test evidence; do not publish or open a pull request without approval.

#### F. Prove destination safety and enable browser login

Depends on A's mechanism and B to E. Agent work:

1. Implement the reviewed destination mechanism. Run all adversarial cases in phase 4 against the actual native login path, not a substitute direct-fill script.
2. Verify the plugin response, registry policy and destination checks stay consistent through navigation and submission. Confirm wrong-origin pages receive no credential bytes.
3. Verify the final destination and account marker independently of `loggedIn: true`. Test identity mismatch and human challenges without retries against broader bundles or accounts.
4. Enable a real browser-login bundle only after its policy and references are approved. Validate that login with Chinh, without retaining filled screenshots, passwords or authentication state across sessions.

Chinh's actions: provide or approve the browser account, its identity marker and any missing vault references; approve provisioning or a patched build if required. Existing API-token bundles remain usable without this step.

Exit: record the tested version, approved bundle and verification outcome without secret values. Mark the RFC implemented only when the applicable delivery acceptance cases pass; document any remaining disabled browser aliases.

#### Rollout and recovery

Apply launch-policy changes only to new sessions. Do not restart existing Chrome processes or rewrite lifecycle history. Packages B and C can proceed independently after baseline checks; D and E are sequential. Dashboard repair remains deferred.

If browser authentication fails validation, leave it disabled and retain approved headed assistance. If plugin installation must be withdrawn, remove only its owned registration after checking configuration ownership. Preserve registry bundles, references and ordinary `agent-secrets` callers. Clean up only owned test sessions through lifecycle events, with process and listener checks before profile deletion.

### Oracle review record

Earlier Oracle reviews identified restart and cleanup races, partial launches and resolver fallback risks. Those reviews expanded the original restart proposal into a larger lifecycle redesign.

When Chinh questioned that friction, Oracle recommended avoiding process replacement: dashboard sign-in first, then a separately claimed headed session for native-only authentication. Chinh agreed. This revision removes the restart-specific states, revisions, operation locks and cleanup redesign instead of carrying them into the simpler workflow.

Authentication review remains applicable. The RFC keeps strict resolver behaviour and the stronger destination-check gate; URL pinning alone is insufficient. Dashboard interaction remains cooperative, and real login tests are still required.

The subsequent live tests preserved the no-restart direction but blocked dashboard sign-in on 0.36.0. Chinh then reproduced the missing dot by physically typing through the dashboard and approved fresh headed human sign-in instead. Successful session isolation and stream shutdown do not override the failed input test.

## Open questions

1. Agent-owned dashboard gate: identify a version or reviewed fix that passes exact synthetic input and focus-safety tests, then validate human interaction. Until then, use only the approved fresh-headed fallback for manual sign-in.
2. Agent-owned implementation gate: identify and test a login-path change that meets the destination contract. Present any patched-build maintenance decision to Chinh. This blocks automated filling, not headless browsing or human-assisted authentication.
