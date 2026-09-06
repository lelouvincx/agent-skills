# RFC-0011 implementation baseline and acceptance

Supporting evidence for [RFC-0011: Quiet browser sessions and approved authentication](../rfc-0011-quiet-browser-sessions-and-approved-authentication.md).

## Baseline on 5 September 2026

| Component | Observed version or state |
| --- | --- |
| agent-browser | 0.36.0, native Rust executable behind the installed npm launcher |
| System Google Chrome | 152.0.7977.82 |
| agent-secrets policy | Valid; all 5 existing bundles passed the original 31 resolver and policy tests before implementation |
| Browser lifecycle | No RFC test sessions remained active; the original 12 lifecycle tests passed |
| Agent-browser plugins | No plugins were configured before implementation |

The registry inventory was `amp-runtime`, `work`, `lelouvincx-bot`, `amp-runner-r2` and `smartclass-deepseek`. A review found that the private `work` reference file also contained Demo4 username, password and OTP mappings omitted from the source registry. At baseline, no bundle had browser-login metadata.

## Package A result

The native 0.36.0 credential response carries only:

- username and password
- login URL
- username, password and submit selectors

It cannot carry the approved credential-receiving origin, expected post-login URL or account identity marker. The native [login handler](https://github.com/vercel-labs/agent-browser/blob/v0.36.0/cli/src/native/actions.rs#L11195-L11446) resolves credentials before navigation, does not bind the fills to a verified main-frame document and reports success without verifying the final account. The installed command also permits URL and selector overrides.

Chinh approved a maintained custom build pinned to [upstream commit `eb05921`](https://github.com/vercel-labs/agent-browser/commit/eb05921bad874cd2a1b4fa5d1149f1ed26576cae) from version 0.36.0. The repository stores the patch, build script and checksum-verifying wrapper.

The patched response carries the approved origin, selectors, expected final URL, account marker and optional OTP policy. The login path binds checks to the main-frame document, rejects selector overrides, verifies the form destination before writing, intercepts document requests during submission and verifies the final account. Failed post-submit checks close the target.

Synthetic tests passed for OTP, stale frame state, initial cross-origin redirect, changed documents, altered form actions, wrong identity and selector overrides. A real approved-origin POST followed by a cross-origin 307 sent no request to the second origin.

## Package B synthetic session procedure

Use fresh values for every run. Do not reuse the session IDs, profiles, namespaces or ports recorded below.

1. Run `agent-browser-lifecycle show`, inspect live Chrome processes and inspect loopback listeners. Choose an unused port.
2. Claim that port. Confirm the new session is `claimed` before launching Chrome.
3. Derive a short, collision-checked daemon name from the lifecycle UUID. Choose an explicit namespace.
4. Launch system Chrome once with the claimed profile, `--headless=new`, loopback remote debugging and the claimed port.
5. Independently verify the Chrome PID, profile argument and listener ownership. Then run explicit URL, title and `session info --json` checks with the selected config, namespace, short daemon name and CDP endpoint.
6. Inspect stream status. Disable it only when enabled, then verify `enabled: false` and no stream listener.
7. Record `ready` only after every check succeeds.
8. For shutdown, record `stopping`, verify no attached children, disable any enabled stream, disconnect the daemon and send CDP `Browser.close`. Verify the Chrome PID, its children and both listeners are absent before deleting the owned profile and recording `stopped`.

For partial-launch testing, claim a second fresh port, launch or simulate only the owned partial resources, and confirm a duplicate claim fails. End the partial process, verify process and listener absence, remove only its profile and record `start_failed`.

Run checks as separate fail-fast commands. Do not use a pipeline whose final command can hide a failed URL, title, PID or listener check. `stream disable` returns non-zero when streaming is already disabled, so inspect status first rather than treating repeated disable as idempotent.

## Package B observed result

The acceptance run used fresh resources. Historical values below are evidence only and are not reusable claims.

| Check | Result |
| --- | --- |
| Partial launch and duplicate port claim | Passed on port 50647. Lifecycle session `54a66698-2c58-44a6-995e-5b7269e13ca5` ended as `start_failed`; its owned resources were removed. |
| Headless launch | Passed on port 50648 with lifecycle session `9207f816-e511-4c55-a17a-19ae2d5dbb9f`, namespace `r11-impl-0905`, daemon `s-9207f816e511` and Chrome PID 81508. |
| Explicit page checks | Passed. The URL used a local `data:text/html` document and the exact title was `RFC 0011 Headless`. |
| Process and profile identity | Passed before `ready`. The launched PID owned the listener and used the claimed profile. |
| Socket-path limit | Passed at 81 bytes, below the observed 103-byte macOS limit. |
| Streaming | Passed. Status reported `enabled: false` and `port: null` after attachment and shutdown checks. |
| Shutdown | Passed. The daemon disconnected, CDP acknowledged `Browser.close`, and the owned PID, child processes, listener, profile and namespace were absent before `stopped` was recorded. |

An initial listener inspection ran before Chrome had completed startup. A later independent ownership check passed before `ready`; the convention now requires that ordering. Unrelated agent-browser listeners on ports 49666 and 64058 were observed and left untouched. All RFC implementation-test lifecycle sessions were absent after cleanup.

The run did not open a headed window. The prior dashboard evidence remains separate and does not establish a working human-input route.

## Packages C to E result

The implementation added optional browser-login policy to the existing registry, strict service-account-only resolution, the native `onepassword` plugin and its narrow credential handler. Browser requests resolve only login-specific references. Synthetic and fake-1Password tests cover policy rejection before vault access, existing-bundle compatibility, protocol failures, fixed secret-free errors, cancellation and child-process cleanup.

Projection installs the custom wrapper, plugin and credential handler. It merges the plugin registration into user configuration, preserves unrelated settings and rejects conflicts. Projection creates no credential reference file or service-account bootstrap token.

Plugin registration alone does not enable a login. The `work` bundle now enables the approved Demo4 policy. The other 4 bundles remain browser-disabled because their API and service credentials are not browser accounts.

## Package F result

The first real Demo4 attempt used a fresh headless Chrome process, profile, lifecycle claim, namespace, short daemon name and loopback CDP port. Streaming was disabled before authentication. It reached OTP, then failed closed because Demo4 uses a form-less OTP control. Later attempts stopped during a temporary 1Password CLI stall.

After 1Password recovered, a strict doctor check resolved every registered bundle without printing values. The implementation added safe support for form-less OTP controls. It also extended request interception to block off-origin documents and off-origin request URLs or bodies containing any credential value.

An apparent successful retry remained on the sign-in page. Investigation showed that the shell had selected the stock npm launcher, which reused an unpatched daemon with the same semantic version. That daemon ignored the added policy and returned a false `loggedIn: true`. Daemons now record and verify a custom build identity. The plugin also requires credential contract `rfc0011-v1` before vault access.

The first acceptance run used fresh owned resources and build `0.36.0+rfc0011.3`. It reached `https://demo4.holistics.io/home`, but its CLI client did not receive the delayed response. The original target cleanup was best effort, so the surviving target did not prove that account verification passed. A later screenshot run confirmed functional login on that build, but not the stronger cleanup and interception contract added after Oracle review.

The hardened acceptance runs used new headless sessions, profiles, loopback ports, namespaces and short daemon names. They exposed and fixed three issues before filling: slow 1Password resolution exceeded both plugin and client timeouts, wrapper and worker targets received unsupported Fetch commands, and TOTP resolution order was nondeterministic. The tests resolved TOTP last and cleaned every failed session completely.

The final diagnostic reached `https://demo4.holistics.io/2fa/verify`. The required guard blocked `Other`, `Script` and `Stylesheet` requests to `https://assets.holistics.io`. The page rendered no OTP control, so the native path returned no `verified: true`, closed and confirmed the tainted target, and completed lifecycle cleanup. Package F remains blocked; the earlier functional login does not satisfy the hardened contract.

## Final validation

| Check | Result |
| --- | --- |
| RFC validation | Passed for all 10 RFC documents. |
| Agent-secrets and plugin tests | Passed with synthetic credentials and fake 1Password responses, including strict TOTP-reference syntax, browser-only resolution and the required credential contract. |
| Agent-secrets policy | Passed. |
| Browser lifecycle tests | 12 tests passed. |
| Temporary-HOME projection | Passed, including repeat sync, unrelated settings and plugins, conflicting ownership, malformed JSON, duplicate keys, symbolic-link config and absence of credential/bootstrap projection. |
| Pre-commit hooks | Passed for all files. |
| Pre-push hooks | Passed, including isolated projection, rollback-safe remote archive syncing, project resolver checks, Amp plugin builds and SDK dependencies. |
| Required local sync | Passed. The custom wrapper, plugin and credential handler were linked, and plugin registration was merged. |
| Native plugin inspection | `agent-browser plugin show onepassword` reported only `credential.read`. |
| Custom native build | Passed. Fingerprint `fb5322a36a10ff35fd40593187a3a0f2cef412279e0aaed468e15abef1e5ab81` matched the installed receipt. The receipt covers the pinned commit and patch. Daemon identity covers native source, Cargo inputs, target, profile and Rust flags. |
| Native destination tests | Passed: 1,215 unit tests, 6 CLI tests and all 3 ignored provider-login tests. Coverage includes tainted-target closure, guarded descendants and off-origin request blocking. |
| Live registry inspection | All 5 bundles were present. Only `work` contained `browserLogin`. |
| Live reference validation | The replacement service account has read-only access to the `Agent Secrets` vault. The strict doctor check resolved every declared reference without printing values. |
| Live Demo4 acceptance | Blocked. The hardened path reached same-origin `/2fa/verify`, then blocked required scripts and styles from `assets.holistics.io`. It returned no `verified: true` and closed the tainted target. |
| RFC projection comparison | The projected main RFC and this supporting record matched their source files. |

## Deferred viewer alternative

The current [streaming documentation](https://agent-browser.dev/streaming) describes direct WebSocket character input. A minimal local viewer without dashboard Chat might avoid the dashboard's keyboard and focus faults while keeping the same headless browser. This has not been tested and is not an approved replacement. Dashboard repair and custom-viewer work remain deferred unless Chinh requests that experiment.
