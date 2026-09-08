# Agent Browser conventions

## Testing policy

Do not use Chrome for testing. Chinh reports repeated CAPTCHA challenges during Chrome-based tests. Use browser-free fixtures and mocks where possible. If validation needs a live browser, ask which alternative browser or test environment to use; do not silently substitute another Chromium browser. Report browser-free results separately from live integration coverage.

## Session invariants

- Give every owner session a fresh Chrome instance, an exclusive profile and a claimed `127.0.0.1` CDP port. Keep authentication in that profile.
- Run routine work headless. Headed launches are pre-approved. Keep each session in its launch mode.
- Keep profiles private and CDP and stream listeners on loopback. Lifecycle claims coordinate same-user agents; verify live listeners because claims do not reserve operating-system ports.
- On macOS, use the managed lifecycle commands for routine browser work. Other runtimes must use the legacy/manual contract explicitly; do not silently fall back from managed start.

## Managed macOS workflow

Start from the repository or app workspace. Use the current Amp thread ID as owner ID:

```bash
agent-browser-lifecycle start --owner-thread-id "$thread" --workspace "$PWD"
```

Use the returned `session_id` for every later command. Start runs `sweep` first, creates the private Chrome profile and daemon runtime, verifies the recorded Chrome root, daemon, profile identity, CDP listener, daemon socket peer and disabled streaming, then records ready. Use `start --headed` only when a headed browser is needed. Managed start is macOS-only.

Run browser commands through lifecycle, not by launching Chrome or calling `agent-browser` directly:

```bash
agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" -- open https://example.com
agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" -- snapshot -i
```

The lifecycle command supplies the saved config, daemon name, CDP endpoint and workspace. Reserved identity/config/browser flags are refused. There is no implicit daemon replacement, browser relaunch, command replay or signal fallback; an execution failure requires `recover`.

## Tabs and page references

- Open your own tab for task work. Treat numeric tab positions as shifting UI state, not identity.
- After `tab new`, read the tab's `tabId` (such as `t2`) or CDP `targetId` from `tab list --json`. Pass `--tab-id "$tab_id"` to every tab-specific lifecycle command:

  ```bash
  agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" -- tab new https://example.com
  agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" -- tab list --json
  agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" --tab-id "$tab_id" -- find role button click --name "Submit"
  ```

- `--tab-id` selection and the command execute under the session lock. Do not split selection and action into separate commands.
- Daemon snapshot references can be invalidated by other tabs or commands. Prefer semantic selectors. When a snapshot ref is necessary, use it in the next uninterrupted command; do not assume refs survive across unrelated commands.

## Child session sharing

The owner may hand a child the managed `session_id` and `owner_thread_id`. The child attaches with its own actual Amp thread ID, opens its own tab, uses stable target IDs with `--tab-id`, then detaches before reporting done:

```bash
agent-browser-lifecycle attach --session-id "$session" --owner-thread-id "$owner" --actor-thread-id "$child"
agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$child" -- tab new https://example.com
agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$child" --tab-id "$tab_id" -- snapshot -i
agent-browser-lifecycle detach --session-id "$session" --actor-thread-id "$child"
```

If the owner starts shutdown while children are attached, `stop` records draining and refuses new owner commands or new attachments. Existing children may finish and detach. The owner repeats `stop` after the last detach.

Use `reconcile --confirm-worker-finished` only after verifying the child finished or was cancelled. Elapsed silence is not verification.

## Authentication

Use the pinned RFC-0011 build and an approved login alias through managed exec:

```bash
agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" -- auth login <alias> --credential-provider onepassword
```

Continue when the destination and account match policy. If automatic authentication cannot complete, stop the headless session and start a fresh headed session. Do not reuse the profile. Pause automated input until attached browser workers detach; resume when the destination and account match.

## Shutdown and recovery

For normal shutdown:

```bash
agent-browser-lifecycle stop --session-id "$session" --owner-thread-id "$thread"
```

If children are attached, `stop` returns draining state. Wait for verified detachments and repeat `stop`. Successful closure means the recorded Chrome root, daemon and session listeners are verified gone and the session no longer appears in `show`. Untracked helper processes may remain until weekly reboot; that does not keep the claim open.

If a managed command fails, run:

```bash
agent-browser-lifecycle recover --session-id "$session" --owner-thread-id "$thread"
```

Concrete blockers leave `cleanup-pending` with `pending_reasons`. Resolve the blocker or leave the uncertain session intact; do not start a replacement by assuming cleanup happened.

Run `agent-browser-lifecycle sweep` explicitly when you want to remove retired profile/runtime artifacts that are safe after reboot. `start` also checks sweep. Same-boot retired sessions return counts without file inspection; older histories without required metadata are blocked. `show` reports active sessions only, and `show --session-id <id>` narrows the active view.

## Legacy/manual support

Use this only for non-macOS runtimes, lifecycle debugging, or explicit legacy work. It is not the everyday macOS recipe.

Every legacy browser-control command uses the user config, a dedicated namespace, a short namespace-unique daemon name mapped to the lifecycle session, and the claimed CDP port:

```bash
"$HOME/.local/bin/agent-browser" \
  --config "$HOME/.agent-browser/config.json" \
  --namespace "$namespace" \
  --session "$daemon" \
  --cdp "http://127.0.0.1:$port" \
  <command>
```

Legacy launch:

1. Inspect `agent-browser-lifecycle show`, live Chrome processes and loopback listeners. Claim an absent port; retain the claimed session, port and profile, and verify `claimed`.
2. Choose a dedicated namespace and an unused short daemon name within it; record its mapping to the lifecycle session.
3. Launch Chrome with loopback debugging, the claimed port and profile. Include `--headless=new` for routine work.
4. Continue only when the launched PID is alive, uses the claimed profile and owns the claimed listener. Through the explicit identity, verify the expected URL, title and claimed endpoint in `session info --json`. On a listener conflict, complete failed-start cleanup and claim a new port.
5. Whenever the daemon starts, disable streaming and verify that its listener is absent.
6. Record `ready` with the owner, session and PID. Continue when `show` matches the session, PID, profile and port.

If launch fails, end the owned partial Chrome process tree, verify its PID and listener are absent, remove only its claimed profile, record `start_failed`, and continue when `show` no longer lists the session.

## Timing browser workflows

- Resolve the app's canonical origin and authenticate before timing the operation.
- Await one completion signal for the measured action. Resource Timing entries finalize after responses complete, so prefer the request promise or the UI's completion state over chained polling timeouts.
- Report setup, client processing and backend request time separately.

## Legacy/manual shutdown and recovery

1. Wait until `show` reports no attached threads; record `stopping` and verify the state.
2. Ensure streaming is disabled and its listener is absent, then disconnect the daemon.
3. End the owned Chrome process tree; verify its processes and CDP and stream listeners are absent.
4. Remove only the claimed profile, record `stopped` and verify the session is absent from `show`.

For failed starts and dead sessions, follow the [lifecycle contract](agent-browser-lifecycle.md). Recover a confirmed dead session before claiming its replacement; leave an uncertain session intact.
