# Browser conventions

Use the `agent-browser` skill for page commands and the rules below for local policy.

- Testing: use browser-free fixtures. No Chrome tests or silent Chromium substitutes. Ask the human for an alternative when live validation is necessary; distinguish mock coverage from live coverage.
- Launch mode: headless by default; headed is pre-approved when needed. Changing mode requires a new session and profile.

## Managed macOS workflow

Before session work, read [lifecycle rules](agent-browser-lifecycle.md). Use the lifecycle controller, not direct browser launches or reconstructed flags.

### Explicit Agent Browser identity

Each owner uses a fresh browser, private exclusive profile and loopback endpoint. Keep authentication in that profile.

## Authentication

Before login or authentication escalation, read the [login procedure](../agent-browser-lifecycle/reference.md#authentication).

## Timing browser workflows

Resolve the canonical origin and authenticate before measurement. Await the request or UI completion, not chained polling timeouts. Resource Timing finalizes after responses complete. Report setup, client processing and backend time separately.
