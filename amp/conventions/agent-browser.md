# Agent Browser conventions

## Session invariants

- Start a fresh, separate instance of installed system Google Chrome in headed mode for every owner thread. Use the new user-data directory returned by `agent-browser-lifecycle claim`; never reuse another session's profile, directory, or authentication state.
- Bind CDP to `127.0.0.1` on a port reserved by the current owner thread. The helper serializes reservations among cooperative agents; it does not hold an operating-system port lock after `claim` returns.
- Treat the user-data directory as sensitive. Ask the user to sign in for every new Chrome session. Authentication persists only while that process remains alive, including authorized child-thread work.
- Use `agent-browser-lifecycle` for every lifecycle write. `lifecycle.jsonl` is authoritative; `current.json` is a derived active-session view that `show` rebuilds before returning. Edit neither file directly.
- Ownership and handoff are cooperative same-user policy, not access control. Threads attach only after the owner explicitly gives them the session details.

## Owner launch

1. Run `agent-browser-lifecycle show`, inspect live Chrome processes, and choose an unused CDP port. Continue when the port is absent from both the current view and live listeners.
2. Run `agent-browser-lifecycle claim --owner-thread-id <current-thread-id> --cdp-port <port>`. Preserve the returned `session_id`, `cdp_port`, and `user_data_dir`. Continue when `show` lists that session as `claimed`.
3. Launch Chrome with `--remote-debugging-address=127.0.0.1`, the claimed `--remote-debugging-port`, and returned `--user-data-dir`. Bring it to the foreground. Verify that the launched PID owns the loopback listener, its command uses the returned directory, and `agent-browser` reports the expected URL and title.
4. Run `agent-browser-lifecycle record ready --session-id <session-id> --actor-thread-id <current-thread-id> --browser-pid <pid>`. Continue when `show` lists the same PID and session as `ready`.
5. When authentication is required, ask the user to sign in and tell you when finished. Continue only after rechecking the URL and title in that same session.

If launch fails before `ready`, end any partial Chrome process, verify that the PID and listener are absent, remove the session directory, then run `agent-browser-lifecycle record start_failed --session-id <session-id> --actor-thread-id <current-thread-id>`. Recovery is complete when `show` no longer lists the session.

## Child handoff

The owner includes the `session_id`, owner thread ID, CDP host and port, user-data directory, and active Chrome PID in the delegation brief. The child:

1. Runs `agent-browser-lifecycle show` and verifies the handed-off session is `ready`, the PID owns the listener, and the owner ID matches.
2. Runs `agent-browser-lifecycle record attached --session-id <session-id> --actor-thread-id <child-thread-id>`. Continue when `show` includes the child in `attached_thread_ids`.
3. Uses a dedicated tab without disturbing unrelated tabs.
4. Runs the same command with event `detached` when finished. Handoff is complete when `show` no longer lists the child as attached.

A child does not stop the owner's Chrome process. Threads outside the explicit handoff do not attach.

## Owner shutdown and recovery

1. Run `show` and wait until `attached_thread_ids` is empty.
2. Run `agent-browser-lifecycle record stopping --session-id <session-id> --actor-thread-id <owner-thread-id>`. Continue when `show` reports `stopping`; new attachments are now rejected.
3. End Chrome, verify that both its PID and CDP listener are absent, then remove the session directory.
4. Run the same command with event `stopped`. Shutdown is complete when `show` no longer lists the session.

Only the owner resolves an abandoned `claimed` session with `start_failed`. For a `ready` or `stopping` session whose PID and listener are both absent, any observing thread removes the abandoned session directory and records `observed_dead`; recovery is complete when `show` no longer lists it.

For lifecycle schema interpretation, auditing, or manual recovery, read [the lifecycle schema reference](agent-browser-lifecycle.md).
