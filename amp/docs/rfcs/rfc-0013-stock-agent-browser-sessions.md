---
doc_schema: "amp-rfc/v1"
code: "RFC-0013"
title: "Stock agent-browser sessions"
slug: "stock-agent-browser-sessions"
file: "rfc-0013-stock-agent-browser-sessions.md"
status: "Accepted"
summary: "Use pinned stock agent-browser behind a policy wrapper that fixes session identity, ownership, launch options and cleanup."
created: "2026-09-26"
updated: "2026-09-26"
amp_thread_id:
  T-01a0dc15-4c50-75eb-8ad4-f89d2ceaecbb: "researched 29 lifecycle threads, ran stock 0.38.1 E2E suite with Oracle, decided and implemented the replacement"
dependency: []
implementation:
  - path: "../../../bin/agent-browser"
  - path: "../../agent-browser/config.json"
  - path: "../../agent-browser/version"
  - path: "../../../sync-skills.sh"
  - path: "../../conventions/agent-browser.md"
  - path: "../../../scripts/test_agent_browser_wrapper.py"
  - path: "../../scripts/migrate-agent-browser-config.py"
inputs:
  - name: "browser command"
    kind: "agent-browser CLI arguments and explicit Amp identity"
    purpose: "Select an owned session and run one browser operation with fixed launch options."
outputs:
  - name: "owned browser session"
    kind: "stock agent-browser daemon, Chrome process and private profile"
    purpose: "Preserve page state across commands while preventing cross-thread ownership and launch-mode changes."
supersedes:
  - type: "rfc"
    code: "RFC-0011"
    title: "Quiet browser sessions and approved authentication"
    path: "./rfc-0011-quiet-browser-sessions-and-approved-authentication.md"
  - type: "rfc"
    code: "RFC-0012"
    title: "Deterministic browser configuration and lifecycle"
    path: "./rfc-0012-deterministic-browser-configuration-and-lifecycle.md"
superseded_by: null
related: []
tags:
  - "agent-browser"
  - "local-automation"
  - "session-ownership"
---

# RFC-0013: Stock agent-browser sessions

## Summary

Replace the custom agent-browser build and lifecycle controller with stock agent-browser 0.38.1 behind a small policy wrapper. The wrapper gives each Amp thread a stable session, fixed launch options, exclusive ownership and explicit cleanup without changing stock page-command behavior.

Use manual login in headed Chrome with a named persistent profile. Drop automatic browser credential filling and visual annotations.

## Context

The managed execution introduced by RFC-0012 turned every page-command failure into infrastructure recovery and browser teardown. In sampled threads, this produced 6 to 22 sessions and 5 to 24 recovery operations per thread. Chinh had to sign in again after lost sessions. Valid agent-browser flags were rejected by the execution allowlist, failures became generic managed-execution errors, and cleanup-pending records remained after use.

The automatic browser credential path was used once across 29 reviewed threads, and that attempt failed. Meanwhile, repository patches kept agent-browser at 0.36.0 while upstream had reached 0.38.1. The custom lifecycle and authentication machinery imposed more cost than the evidence justified.

The replacement must not restore the problems that prompted the earlier RFCs. Shared profiles caused Chrome lock contention, so concurrent Chrome processes must not use one profile. `close` must not leave the owned Chrome running. Headless operation must remain the default so routine automation does not steal desktop focus.

Live testing of stock 0.38.1 found that ordinary page failures are local: a missing element, stale reference, wait timeout or navigation error exits 1 with a useful message and leaves the same browser usable. It also found an important hazard. A changed launch option or dead daemon causes stock agent-browser to silently launch a new browser at `about:blank` and return 0. The wrapper exists mainly to prevent that false recovery.

## Decision

Pin stock agent-browser 0.38.1 and install it through `sync-skills.sh`. Put `bin/agent-browser` in front of the stock executable as a policy wrapper. Keep one owner per session, an 8-hour idle timeout and fixed launch options. Disable the loopback stream immediately after every successful launch.

Login is manual. Start headed Chrome with a named profile, pause only for human-only authentication steps, and reuse that profile headlessly after a verified close. Named profiles retain login state; ephemeral thread profiles are removed after closure.

Visual annotations are not part of the replacement. Remove the custom 0.36.0 patches, lifecycle controller and records, managed execution, browser-specific automatic credential plugin and merged user config. This does not change the rest of `agent-secrets`.

## Contract

### Installation and config

`amp/agent-browser/version` contains `0.38.1`. `sync-skills.sh` installs `agent-browser@<version>` under `~/.local/libexec/agent-browser-stock`. The stock entry point is `~/.local/libexec/agent-browser-stock/node_modules/.bin/agent-browser`.

The wrapper compares the installed package version with the pin. A missing or mismatched install exits 1 with `agent-browser: stock <version> is not installed; run ./sync-skills.sh`.

The wrapper always passes `amp/agent-browser/config.json`, which contains:

```json
{"autoConnect": false, "contentBoundaries": true, "maxOutput": 50000}
```

It does not load `~/.agent-browser/config.json`. The test-only variables `AB_WRAPPER_STOCK`, `AB_WRAPPER_STATE_DIR`, `AB_WRAPPER_CHROME` and `AB_WRAPPER_PS` replace the stock executable, state root, Chrome executable and process-list command respectively. The wrapper consumes these variables and never passes them to stock.

### Identity and session names

Help and discovery commands need no identity: no arguments, `-h`, `--help`, `help`, `-V`, `--version` and `skills …` execute stock directly with the cleared environment.

Every other command requires `AB_THREAD` matching `^T-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`. Missing or invalid identity exits 2 with usage guidance. `AB_AGENT` is an optional subagent suffix matching `^[a-z0-9][a-z0-9-]{0,15}$`. The owner is `AB_THREAD` or `AB_THREAD/AB_AGENT`.

`AB_PROFILE` optionally selects a named profile and must match `^[a-z0-9][a-z0-9-]{0,47}$`. `AB_HEADED=1` requests headed mode. Named sessions use `p-<profile>`. Ephemeral sessions use `t-<last 12 hexadecimal characters of the thread UUID>`, followed by `-<agent>` when `AB_AGENT` is set. Every session uses namespace `amp`.

Named profiles live at `<state>/profiles/<profile>`. Ephemeral profiles live at `<state>/ephemeral/<session>`. The wrapper creates directories with mode 0700. It stores owner state at `<state>/wrapper/<session>.json`:

```json
{"owner":"<identity>","mode":"headless|headed","profile_dir":"<path>","ephemeral":true,"created":"<timestamp>"}
```

State files use mode 0600. `<state>/wrapper/<session>.lock` is held with `fcntl.flock(LOCK_EX)` for the entire invocation, so commands and cold launches for one session are serialized.

### Child process and reserved arguments

The child environment starts empty and retains only set values of `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_ALL`, `TERM` and `TMPDIR`. It never retains an `AGENT_BROWSER_*` variable.

The wrapper places these canonical flags before user arguments:

```text
--config <repo>/amp/agent-browser/config.json
--namespace amp
--session <session>
--profile <profile-dir>
--executable-path <Chrome>
--idle-timeout 8h
```

It adds `--headed` only when `AB_HEADED=1`. Chrome defaults to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

The wrapper rejects these reserved flags before a literal `--`, in both `--flag value` and `--flag=value` forms, with exit 2 and a message naming the flag:

```text
--config --session --session-name --namespace --profile --executable-path
--headed --idle-timeout --cdp --auto-connect --extension --init-script
--enable --args --user-agent --proxy --proxy-bypass --ignore-https-errors
--ca-cert --no-ca-cert --allow-file-access -p --provider --device --engine
--state --restore --restore-save --restore-check-url --restore-check-text
--restore-check-fn --allowed-domains --action-policy --confirm-actions
--confirm-interactive --webgpu --no-webmcp --hide-scrollbars --download-path
--input-mode --debug
```

It also rejects `connect`, `close --all`, `close -a`, `install` and `upgrade`. `dashboard` requires an explicit `--port`. Output and page flags, including `--json`, `--max-output`, `--pin-tab`, `--no-pin-tab`, `--color-scheme`, `--headers`, `--annotate`, `--screenshot-*`, `-i`, `-c`, `-d` and `-s`, pass through.

### Exit status

The wrapper uses these policy exit codes:

| Code | Meaning |
| --- | --- |
| 0 | The operation completed, including closing an already stopped session. |
| 1 | The pinned install is unavailable, wrapper cleanup fails, or stock returns 1. |
| 2 | Identity, arguments or reserved flags are invalid. |
| 3 | Another identity owns the session, or an unmanaged live session has the same name. |
| 4 | A non-launch command targeted a stopped session; the caller must reopen it and accept that page state was lost. |
| 5 | The requested headed or headless mode differs from the live session; the caller must close it first. |

Other stock exit codes pass through unchanged. The wrapper inherits stock stdout and stderr byte-for-byte for the user command, forwards `SIGINT` and `SIGTERM`, and never retries a command.

## Behavior

For every identity-bearing invocation, the wrapper holds the session lock and calls stock `session info --json` with canonical identity. This probe never launches Chrome. `data.active is true` means the session is alive.

The wrapper then applies the following sequence:

1. If live owner state belongs to another caller, exit 3. If its mode differs, exit 5.
2. If saved state is not alive, remove the stale state. Remove an ephemeral profile only when no Chrome process has its `--user-data-dir` in the process arguments. Remember that page state was lost.
3. If no state exists but a matching session is alive, treat it as unmanaged and exit 3.
4. Before `close` or a launch on a stopped session, stop any Chrome still using the wrapper-owned profile directory. A hard-killed daemon can leave its Chrome running and holding `SingletonLock`, which would block the relaunch; the live acceptance run reproduced this. Send SIGTERM, wait up to 10 seconds, and return 1 with the remaining PIDs if any survive.
5. For `close`, return 0 after state cleanup when the session is already stopped. Otherwise run stock `close`, wait up to 10 seconds for profile Chrome processes to disappear, then remove state and an ephemeral profile. Return 1 and list remaining PIDs instead of killing them. Preserve named profiles.
6. Treat `open`, `goto` and `navigate` as launch commands. When stopped, write owner state, run stock once, then run `stream disable` after success. Warn if stream shutdown fails. If launch fails, run stock `close`, remove state and safely remove the ephemeral profile.
7. Refuse every other command against a stopped session with exit 4. If stale state was found, explain that the session expired, was closed, or its browser exited and that page state is lost.
8. When the session is live and owned by the caller, run the requested stock command once.

This liveness check, fixed launch identity and mode refusal prevent stock's silent relaunch behavior. Agents must explicitly reopen a dead session and cannot change launch options on a live one.

The boundary is still cooperative. Chrome can crash after the probe but before a command reaches the daemon. The interrupted-action E2E case was blocked, so this design makes no exactly-once claim for consequential actions. Agents must inspect page state before repeating an ambiguous submit, payment or deletion. Every launch also creates a transient loopback-only stream listener before the wrapper disables it; stock 0.38.1 has no config key that prevents this interval.

## Permissions and side effects

The wrapper reads the repository pin and config, the installed package version, private owner state, process arguments and stock session status. It writes private lock, owner and profile files under `~/.local/state/agent-browser`. Projection installs the pinned npm package under `~/.local/libexec`.

Commands may start local stock daemons and Chrome processes, open loopback listeners, and access websites authorized by the task. `close` stops only the selected session and removes only its ephemeral profile after checking for profile users. It never kills leftover PIDs and never removes a named profile.

Manual authentication may expose a headed browser to Chinh. Credentials, one-time codes, passkeys and exported cookies must not be captured, logged or placed in command arguments. The wrapper neither resolves nor records credentials.

## Examples

Start and reuse a headless ephemeral session:

```bash
AB_THREAD=T-01a0dc15-4c50-75eb-8ad4-f89d2ceaecbb agent-browser open https://example.com
AB_THREAD=T-01a0dc15-4c50-75eb-8ad4-f89d2ceaecbb agent-browser snapshot -i --pin-tab
AB_THREAD=T-01a0dc15-4c50-75eb-8ad4-f89d2ceaecbb agent-browser close
```

Sign in through a headed named profile, then reuse it headlessly:

```bash
AB_THREAD=T-01a0dc15-4c50-75eb-8ad4-f89d2ceaecbb AB_PROFILE=holistics-us-support AB_HEADED=1 agent-browser open https://example.com/login
# Chinh completes only the human authentication step; the agent verifies the account.
AB_THREAD=T-01a0dc15-4c50-75eb-8ad4-f89d2ceaecbb AB_PROFILE=holistics-us-support AB_HEADED=1 agent-browser close
AB_THREAD=T-01a0dc15-4c50-75eb-8ad4-f89d2ceaecbb AB_PROFILE=holistics-us-support agent-browser open https://example.com
```

Give a subagent its own ephemeral session:

```bash
AB_THREAD=T-01a0dc15-4c50-75eb-8ad4-f89d2ceaecbb AB_AGENT=research agent-browser open https://example.com
```

## Maintenance notes

To bump stock agent-browser, update `amp/agent-browser/version`, project it with `sync-skills.sh`, and rerun the live E2E suite in `.amp/in/abl-spike/e2e`. This is a manual live suite that launches Chrome and therefore needs Chinh's approval under the repository testing policy. Run the browser-free wrapper tests and RFC validator for every implementation change.

The stock 0.38.1 live suite produced these results:

| Case | Result | Finding |
| --- | --- | --- |
| 1. Separate-invocation continuity | Pass | Page state and browser identity survived separate CLI calls. |
| 2. Page and selector failures | Pass with fixed launch options | Failures stayed local; changing launch options would silently relaunch. |
| 3. Interrupted CLI | Blocked | The suite could not establish the interrupted-action guarantee. |
| 4. Daemon death during mutation | Pass for no duplication | One POST was observed; the next command silently relaunched, motivating the wrapper liveness refusal. |
| 5. Parallel sessions | Pass | Distinct profiles and namespaces stayed independent. |
| 6. Shared-profile contention | Mixed | A busy profile failed but left a daemon; simultaneous cold launches were nondeterministic, motivating the session lock. |
| 7. Login and mode changes | Pass | The named profile retained login after close and relaunch. |
| 8. Close cleanup | Pass | Chrome, helpers, daemon and listeners exited; repeated close did not relaunch. |
| 9. Idle timeout | Pass | Headed and headless sessions expired. |
| 10. Idle reset | Pass | Commands and in-flight work reset activity; timeout 0 stayed disabled. |
| 11. `close --all` scope | Pass | Closure was limited to the selected namespace. The wrapper still prohibits this command. |
| 12. Explicit config | Pass | Explicit config ignored hostile project config and failed safely when invalid. |
| 13. Environment precedence | Pass | Clean environment and explicit flags selected the approved browser and profile. |
| 14. Listener exposure | Pass | Listeners were loopback-only and shutdown commands removed them. |
| 15. Pinned tab | Pass | A missing pinned tab failed with `tab_gone` instead of selecting another tab. |

A second live run tested the wrapper itself with 10 cases: continuity after a failed selector, stream shutdown, mode refusal, owner refusal, a simultaneous cold launch on one named profile (one winner, the other exit 3, one Chrome), daemon death, verified close, login persistence across headed and headless, parallel subagent sessions and reserved flags. Nine passed first time. Daemon death failed because Chrome outlived a hard-killed daemon and blocked the relaunch; the orphan handling in step 4 fixed it, and a rerun passed.

## Open questions

Deleting sessions and profiles left by the old `~/.local/state/agent-browser` layout awaits Chinh's approval.
