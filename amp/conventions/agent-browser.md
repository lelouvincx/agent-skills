# Browser conventions

Choose the workflow for the executor: Amp Desktop Chrome in an orb, or the policy wrapper on the Mac. Load the applicable browser skill before page commands.

## Orbs: Amp-managed Chrome profiles

For website tasks, load `browser-use` and `using-agent-browser`. Use the existing Desktop Chrome so the user can watch or complete sign-in.

1. List profiles with `manage_amp(topic: "profiles", operation: "list")` or `amp profile list`. `agent-browser profiles` inspects local Chrome directories, not Amp's saved profiles.
2. Select the intended profile with `manage_amp` operation `use` or `amp profile use <name>`. Check the current selection with `amp profile status`. Selecting a profile restarts Chrome; select before attaching automation, not during a login flow. Use only profiles the user allows the agent to select. Keep multiplayer disabled unless explicitly authorized.
3. Route through the user's network with `amp net route macbook`, then verify `amp net status`. If unavailable, report the blocker rather than silently switching to direct Internet.
4. Run `amp orb desktop ensure` and use its reported CDP endpoint. `amp sync` synchronizes repository changes, not browser sessions; `amp sync browser` is not a browser setup step.
5. Attach the orb's installed stock `agent-browser` to Desktop Chrome with a thread-specific namespace, named session, and `--pin-tab`. Check `type -a agent-browser` if the Mac policy wrapper shadows it. In that case, use the orb binary at `/usr/local/bin/agent-browser`; do not launch a separate browser or change the wrapper.

Example, replacing the namespace with this thread's identity and the port with the reported endpoint:

```bash
AB="/usr/local/bin/agent-browser --namespace <thread-specific-name> --session site --cdp 9222 --pin-tab"
$AB open https://example.com
$AB set viewport 1280 633 2
$AB snapshot -i
```

Repeat the same `AB` definition in every shell call. `AB_PROFILE`, `AB_HEADED`, and `AB_THREAD` configure the Mac wrapper, not Amp's orb profile selection. Another agent must use its own session and tab; it must not drive the parent's tab or change the attached Chrome profile.

### Sign-in and persistence

Complete sign-in in the selected Desktop Chrome. Pause for the user when a password manager, passkey, CAPTCHA, or other human-only step is required. Keep passwords, OTPs, cookies, and tokens out of snapshots, recordings, logs, and exported files. API credentials do not replace browser passwords.

Verify the intended account and revisit an authenticated page before reporting success. Enable "Remember me" when available. Check `amp profile status` for a saved snapshot; saving a profile is not proof that a site will accept the restored session. Test in a fresh orb when cross-orb persistence is part of the request. Sessions can expire or be revoked.

At each turn's end, stop any recording and run `close` through the same attached session. This disconnects the automation daemon; Desktop Chrome and its login remain. Leave human-only steps open in the Desktop tab and follow `browser-use` for the handoff. Do not export browser state or copy login caches into project snapshots.

## Mac: policy-wrapper session identity

Use `agent-browser`, the policy wrapper, with the `agent-browser` skill for page commands. The wrapper keeps one browser session across shell calls and fixes its launch settings.

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

### Manual login

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

On the Mac, wrapper policy failures use these exit codes:

- exit 3: another thread owns the session or profile. Use a different profile or ask the owner to close it.
- exit 4: the session is not running. Page state is lost; reopen it explicitly with `open`.
- exit 5: the live session uses the other display mode. Run `close`, then reopen with the intended mode.

On the Mac, run `close` at the end of the task. Closure is complete when it exits 0. Never use `close --all`. Never launch Chrome directly or pass launch flags; the wrapper owns and rejects those flags.

Enable the stream or dashboard only when the task needs a live view. The dashboard requires an explicit port.

## Testing

Keep repository tests browser-free. Use fixtures and mocks without substituting an unreported browser runtime. Live Chrome validation requires Chinh's approval. Report mock coverage and live coverage separately.

## Timing browser workflows

Resolve the canonical origin and authenticate before measurement. Await the request or UI completion, not chained polling timeouts. Resource Timing finalizes after responses complete. Report setup, client processing and backend time separately.
