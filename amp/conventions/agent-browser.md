# Browser conventions

Use `agent-browser`, the policy wrapper, with the `agent-browser` skill for page commands. The wrapper keeps one browser session across shell calls and fixes its launch settings.

## Session identity

Set the identity on every session command:

```bash
AB_THREAD=<actual-Amp-thread-ID> agent-browser open https://example.com
```

Each shell tool call starts a fresh shell. Prefix every command, or `export` the variables within the same shell call. Amp does not provide the thread ID as an environment variable.

Use these optional variables only when needed:

- `AB_AGENT=<short-suffix>` gives a subagent its own ephemeral session.
- `AB_PROFILE=<site-account-env>` selects a named profile, for example `holistics-us-support`.
- `AB_HEADED=1` starts a headed session. Headless is the default.

Keep the session open across turns. Do not close it between page commands or conversational turns. After choosing the intended tab, use `--pin-tab` so a missing tab fails instead of selecting another tab.

One agent owns each session and each logged-in profile. Subagents use their own ephemeral sessions with `AB_AGENT`; they do not drive the parent's session or named profile.

## Manual login

Use a named profile whenever a login must survive session closure:

1. Start headed Chrome with `AB_THREAD`, `AB_PROFILE` and `AB_HEADED=1`.
2. Drive the page yourself. Pause only when Chinh must use a password manager, Touch ID, OTP or passkey.
3. Verify the signed-in account before continuing.
4. Keep driving the page after the human-only step.
5. To return to headless mode, run `close` with the same headed identity. Reopen with the same `AB_THREAD` and `AB_PROFILE`, without `AB_HEADED`.

A login survives `close` only when the site sets a persistent cookie. Tick the site's "Remember me" option before sign-in; session-only cookies are dropped whenever the browser closes or expires.

Never capture, export or log credentials, one-time codes, passkeys or cookies.

## Failures and recovery

A failed selector, stale reference or wait timeout is a normal page failure. Take a new snapshot, inspect the current page and retry the page command. Do not replace the browser session.

After an ambiguous consequential action, such as submit, payment or delete, inspect page and server-visible state before repeating it. The wrapper does not promise exactly-once execution.

Wrapper policy failures use these exit codes:

- exit 3: another thread owns the session or profile. Use a different profile or ask the owner to close it.
- exit 4: the session is not running. Page state is lost; reopen it explicitly with `open`.
- exit 5: the live session uses the other display mode. Run `close`, then reopen with the intended mode.

Run `close` at the end of the task. Closure is complete when it exits 0. Never use `close --all`. Never launch Chrome directly or pass launch flags; the wrapper owns and rejects those flags.

Enable the stream or dashboard only when the task needs a live view. The dashboard requires an explicit port.

## Testing

Keep repository tests browser-free. Use fixtures and mocks without substituting an unreported browser runtime. Live Chrome validation requires Chinh's approval. Report mock coverage and live coverage separately.

## Timing browser workflows

Resolve the canonical origin and authenticate before measurement. Await the request or UI completion, not chained polling timeouts. Resource Timing finalizes after responses complete. Report setup, client processing and backend time separately.
