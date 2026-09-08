# Agent Browser lifecycle reference

Read only the section needed for the current operation. The [browser guide](../conventions/agent-browser.md) owns testing policy, launch mode, authentication and timing.

Read the branch you need: [managed sessions](#managed-session-workflow), [subagent sharing](#subagent-sharing), [recovery](#recovery-and-retired-files), or [legacy/manual sessions](#legacymanual-sessions). For journal or launch-gate maintenance, read [the state contract](#state-contract) and [managed launch foundation](#managed-launch-foundation).

## Managed session workflow

Use managed commands for routine macOS work. Set `$thread` to the current actual Amp thread ID. Keep the same `XDG_STATE_HOME` for every command if the session uses an isolated state directory.

1. **Start from the app workspace.**

   ```bash
   agent-browser-lifecycle start --owner-thread-id "$thread" --workspace "$PWD"
   ```

   Use `--headed` when needed. Continue only after startup reports ready; save its returned `session_id` as `$session`. The lifecycle controller supplies the private profile, saved config, daemon identity and loopback endpoint. Use these saved identities rather than overriding flags or launching a browser directly.

2. **Open your own tab and save its identity.**

   ```bash
   agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" -- tab new https://example.com
   agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" -- tab list --json
   ```

   Save your tab's `tabId` (such as `t2`) or CDP `targetId` as `$tab_id`. Numeric tab positions shift and are not identities.

3. **Select and act in one command.**

   ```bash
   agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" --tab-id "$tab_id" -- snapshot -i
   ```

   Pass `--tab-id` for every tab-specific command so selection and action share one session lock. Prefer semantic selectors: shared daemon snapshot refs can be invalidated by other tabs or commands. If a ref is necessary, coordinate its use in the next uninterrupted command. On execution failure, follow [recovery](#recovery-and-retired-files), not replay or replacement.

4. **Close as the owner.**

   ```bash
   agent-browser-lifecycle stop --session-id "$session" --owner-thread-id "$thread"
   ```

   Done means `closed`: the recorded Chrome root, daemon and session listeners are verified absent, and the active view no longer contains the session. If the result is `draining`, follow [subagent sharing](#subagent-sharing); if `cleanup-pending`, follow [recovery](#recovery-and-retired-files).

For supported commands and startup checks, consult the [CLI reference](README.md#managed-commands). For syntax, use `agent-browser-lifecycle <command> --help`.

## Subagent sharing

The owner retains shutdown responsibility. Before dispatch, pass the child the `session_id`, `owner_thread_id`, and any non-default `XDG_STATE_HOME`.

1. The child sets `$child` to its own actual Amp thread ID and attaches:

   ```bash
   agent-browser-lifecycle attach --session-id "$session" --owner-thread-id "$owner" --actor-thread-id "$child"
   ```

   Continue only after attachment succeeds.
2. The child follows managed workflow steps 2–3 with `$child` as actor. It owns its own tab, not the owner's tab.
3. Before reporting done, the child closes only its tab through `exec --tab-id`, then detaches:

   ```bash
   agent-browser-lifecycle detach --session-id "$session" --actor-thread-id "$child"
   ```

   Completion requires confirmed detachment; report any blocker to the owner.

Owner `stop` with attached children records `draining`: new owner commands and new attachments are refused, while existing children can finish and detach. The owner repeats `stop` after the last detachment. Use `reconcile --confirm-worker-finished` only after verifying the child finished or was cancelled; silence is not evidence.

## Recovery and retired files

After a managed command fails, the owner runs:

```bash
agent-browser-lifecycle recover --session-id "$session" --owner-thread-id "$thread"
```

Inspect `pending_reasons` if the result is `cleanup-pending`. Resolve the concrete blocker or leave the uncertain session intact. Start a replacement only after verified closure. Managed commands have no implicit relaunch, daemon replacement, command replay or signal fallback. Repeated owner stop/recover calls on a closed session are idempotent.

**Closed is not complete descendant cleanup.** Untracked helpers may remain until weekly reboot; that accepted uncertainty does not retain an active claim. Private retired profile/runtime files also remain, separately from active sessions.

Run `agent-browser-lifecycle sweep` to remove eligible retired files after reboot; `start` also runs it. Same-boot sessions return counts without file inspection. Missing safety metadata blocks deletion. Treat `blocked` results as unresolved, not successful cleanup. Use `show` for active sessions, optionally narrowed by `--session-id`; it is not a retired-file inventory.

## Legacy/manual sessions

Use this branch only for non-macOS runtimes, lifecycle debugging or explicit legacy work. The agent must verify processes and cleanup; legacy event recording supplies no such proof. Claims coordinate agents but do not reserve operating-system ports. Keep profiles private and all CDP/stream listeners on loopback.

Every browser-control command uses the same explicit identity:

```bash
"$HOME/.local/bin/agent-browser" \
  --config "$HOME/.agent-browser/config.json" \
  --namespace "$namespace" --session "$daemon" \
  --cdp "http://127.0.0.1:$port" <command>
```

**Launch:** inspect `show`, live processes and listeners; claim an absent port and verify `claimed`. Save the session, port and profile. Record a dedicated namespace and an unused short daemon name within it. Launch with the claimed profile, loopback debugging and port (`--headless=new` for routine work). Verify the PID, profile and listener owner, then the URL, title and endpoint through `session info --json`. Disable streaming whenever the daemon starts and verify its listener is absent. Record `ready`; continue only when `show` matches the session, PID, profile and port.

**Failed launch:** end only the owned partial process tree, verify the PID and listeners are absent, remove only its claimed profile, then record `start_failed`. Continue only when the session disappears from `show`. A listener conflict requires this cleanup before claiming another port.

**Shutdown:** wait for no attached threads in `show`; record and verify `stopping`. Disable streaming, verify its listener is absent and disconnect the daemon. End the owned browser process tree; verify its processes and CDP/stream listeners are absent. Remove only the claimed profile, record `stopped`, and verify the session is absent from `show`.

**Dead session:** record `observed_dead` only for a `ready` or `stopping` session whose PID and listeners are verified absent and session directory removed. Recover a confirmed dead session before claiming its replacement; leave uncertain sessions intact.

## State contract

Consult this section when inspecting or maintaining lifecycle storage, not for routine page work. State lives in `${XDG_STATE_HOME:-$HOME/.local/state}/agent-browser/`; directories are `0700`, journal/view/lock files `0600`.

- `lifecycle.jsonl` is authoritative append-only history. A newline commits a record; replay under the lock discards only an unterminated final fragment. Records contain complete session identity and lifecycle metadata, not URLs, titles, page content, secrets, task text or free-form errors.
- `current.json` is a replaceable active-session view. `show` and `rebuild` replay history under `lifecycle.lock` and replace it atomically. Repair history from neither this cache nor inferred live processes. Replay itself has no process effects.
- `sessions/<session_id>/chrome-data/` stores sensitive profile state. Managed daemon sockets and the config snapshot use a separate private short runtime path. Per-session `operation-locks/` serialize effects; the global journal lock is not held while creating or waiting for a child.
- The [schema](schema.json) defines legacy v1 and managed v2 events; replay additionally enforces transitions and identity. Current v2 views distinguish `legacy-unverified`, `managed-unverified` and `managed-ready`; cleanup-pending removes readiness. A terminal event removes the active session, not necessarily its disk files.
- Sweep checks recorded artifact identities, boot and listeners, holding the journal lock through conflict revalidation, deletion and the completion record. Histories missing required metadata stay blocked.

Thread identities and handoffs are cooperative, self-reported claims by the same Unix user. They are not authorization against hostile same-user processes, which can access these files and loopback CDP.

## Managed launch foundation

For launch-gate maintenance, inspect `prepare_managed_session` and `launch_managed_role` in the lifecycle executable. Preparation records intent before profile creation, fixes session/build/config identity, then records the profile's device and inode. Retry with a new session, not a new generation.

Each gated child waits while its boot identity, PID and microsecond start time are recorded. Runtime identity and artifact boot are saved before the first release; release permission is committed before sending the gate byte. Parent-pipe EOF exits without executing the payload. Locks and gate writers do not pass through exec. A release record proves permission, not execution, readiness, login or cleanup.

Managed readiness comes from startup verification. Legacy `record` commands cannot release managed claims or certify their readiness or cleanup; old PID assertions never become verified managed identities.

## Authentication

Use an approved login alias with the pinned build:

```bash
agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" -- auth login <alias> --credential-provider onepassword
```

Continue only when the destination and account match policy. If automatic login fails, stop the headless session, including attached subagents. After verified closure, start a fresh headed session with a new profile. Pause automated input during human login and until browser subagents detach; resume only when the destination and account match policy.

For missing or stale builds, follow the [build guide](../agent-browser-custom/README.md#install-and-use). For configuration changes, read the [config reference](../agent-browser-custom/README.md#configuration-defaults).
