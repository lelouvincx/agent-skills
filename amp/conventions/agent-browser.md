# Agent Browser conventions

## Session invariants

- Give every owner session a fresh Chrome instance, an exclusive profile and a claimed `127.0.0.1` CDP port. Keep authentication in that profile.
- Run routine work headless. Headed launches are pre-approved. Keep each session in its launch mode.
- Keep profiles private and CDP and stream listeners on loopback. Lifecycle claims coordinate same-user agents; verify live listeners because claims do not reserve operating-system ports.

## Explicit agent-browser identity

Every browser-control command uses the user config, a dedicated namespace, a short namespace-unique daemon name mapped to the lifecycle session, and the claimed CDP port:

```bash
"$HOME/.local/bin/agent-browser" \
  --config "$HOME/.agent-browser/config.json" \
  --namespace "$namespace" \
  --session "$daemon" \
  --cdp "http://127.0.0.1:$port" \
  <command>
```

## Owner launch

1. Inspect `agent-browser-lifecycle show`, live Chrome processes and loopback listeners. Claim an absent port; retain the claimed session, port and profile, and verify `claimed`.
2. Choose a dedicated namespace and an unused short daemon name within it; record its mapping to the lifecycle session.
3. Launch Chrome with loopback debugging, the claimed port and profile. Include `--headless=new` for routine work.
4. Continue only when the launched PID is alive, uses the claimed profile and owns the claimed listener. Through the explicit identity, verify the expected URL, title and claimed endpoint in `session info --json`. On a listener conflict, complete failed-start cleanup and claim a new port.
5. Whenever the daemon starts, disable streaming and verify that its listener is absent.
6. Record `ready` with the owner, session and PID. Continue when `show` matches the session, PID, profile and port.

If launch fails, end the owned partial Chrome process tree, verify its PID and listener are absent, remove only its claimed profile, record `start_failed`, and continue when `show` no longer lists the session.

## Authentication

Use the pinned RFC-0011 build and an approved login alias. Through the explicit identity, run `auth login <alias> --credential-provider onepassword`. Continue when the destination and account match its policy.

If automatic authentication cannot complete, stop the headless session and claim a fresh headed session. Do not reuse its profile. Pause automated input until attached browser workers detach; resume when the destination and account match.

## Timing browser workflows

- Resolve the app's canonical origin and authenticate before timing the operation.
- Await one completion signal for the measured action. Resource Timing entries finalize after responses complete, so prefer the request promise or the UI's completion state over chained polling timeouts.
- Report setup, client processing and backend request time separately.

## Owner shutdown and recovery

1. Wait until `show` reports no attached threads; record `stopping` and verify the state.
2. Ensure streaming is disabled and its listener is absent, then disconnect the daemon.
3. End the owned Chrome process tree; verify its processes and CDP and stream listeners are absent.
4. Remove only the claimed profile, record `stopped` and verify the session is absent from `show`.

For failed starts and dead sessions, follow the [lifecycle contract](agent-browser-lifecycle.md). Recover a confirmed dead session before claiming its replacement; leave an uncertain session intact.
