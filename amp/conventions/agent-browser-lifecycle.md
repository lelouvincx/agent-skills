# Agent Browser lifecycle contract

This reference defines the files maintained by `agent-browser-lifecycle`. The [Agent Browser convention](agent-browser.md) owns normal execution order.

## Local files

All files live under `~/.local/state/agent-browser/`:

| Path | Role | Mode |
| --- | --- | --- |
| `lifecycle.jsonl` | Authoritative append-only event history | `0600` |
| `current.json` | Replaceable materialized view of active sessions | `0600` |
| `lifecycle.lock` | Serializes cooperative writers and rebuilds | `0600` |
| `sessions/<session_id>/chrome-data/` | Fresh sensitive Chrome state for one live session | `0700` |

The containing directories use mode `0700`. A JSONL newline is the history commit marker. Under the lifecycle lock, the helper discards only an unterminated final fragment before replay; it never rewrites committed lines.

## Historical events

Each line of `lifecycle.jsonl` is one compact object. The [JSON Schema](../agent-browser-lifecycle/schema.json) accepts legacy v1 and managed v2 events. Validating one line proves only its structure; history replay also enforces transitions and session identity.

Every record repeats the complete session identity. The history contains lifecycle metadata only: no URLs, titles, page content, credentials, cookies, task text, or free-form errors.

### Legacy v1 transitions

These commands remain available for legacy work. Routine macOS work uses managed commands. Process and cleanup verification in this legacy table is the agent's responsibility, not proof supplied by the helper.

| Event | From → to | Actor and guard |
| --- | --- | --- |
| `claimed` | absent → `claimed` | Owner; port has no cooperative claim or live listener |
| `ready` | `claimed` → `ready` | Owner; verified Chrome PID, listener, user-data directory, URL, and title |
| `attached` | `ready` → `ready` | Explicitly handed-off child not already attached |
| `detached` | `ready` → `ready` | The currently attached child |
| `stopping` | `ready` → `stopping` | Owner; no children attached |
| `start_failed` | `claimed` → absent | Owner; partial process ended and session directory removed |
| `stopped` | `stopping` → absent | Owner; PID and listener absent and session directory removed |
| `observed_dead` | `ready` or `stopping` → absent | Any observer; PID and listener absent and session directory removed |

## Current state

New `current.json` files use `agent-browser-current/v2`. Legacy sessions are marked `legacy-unverified`. Managed launches start `managed-unverified`; readiness records mark them `managed-ready`. Cleanup-pending removes that readiness. Old PID assertions never become verified managed identities.

`attached_thread_ids` is the set of children with one accepted `attached` event and no later `detached`. A terminal event removes the session. `agent-browser-lifecycle show` always replays committed history under the lock and atomically replaces `current.json`; `rebuild` performs the same operation explicitly. Repair history from neither the view nor inferred live processes.

## Managed launch foundation

RFC-0012 stage 3 added the durable preparation and gated launch primitives that the public managed macOS commands now use.

`prepare_managed_session` records intent before creating the profile. It retains a fresh session UUID, generation 1, namespace, daemon name, runtime path, launch mode, CDP claim and caller-supplied build/config SHA-256 digests. It then records the profile's device and inode. Retries require a new session, not a new generation of an existing session.

`launch_managed_role` creates a waiting child for either Chrome or the daemon. It saves the child's boot identity, PID and microsecond start time. Before the first release, it also records the runtime directory identity and current boot identity. It then saves release permission and sends the gate byte. Parent-pipe EOF exits without executing the requested process. A release record is not proof of execution, readiness, login or completed cleanup. Public start constructs and validates the launch command and configuration.

| Managed event | Meaning |
| --- | --- |
| `managed_intent` | Reserve session metadata before profile creation |
| `managed_profile_created` | Record the new profile's filesystem identity |
| `managed_role_identity` | Record a waiting child's birth identity once per role |
| `managed_artifacts_recorded` | Record runtime filesystem identity and artifact boot before first release |
| `managed_role_release` | Record permission to execute that role once |
| `managed_ready` | Record successful startup checks and the daemon build identity |
| `managed_attachment` / `managed_detachment` | Add or remove a subagent's recorded attachment |
| `managed_draining` | Refuse new work while attached subagents finish |
| `managed_attachment_reconciled` | Remove an attachment after explicit owner confirmation |
| `cleanup_pending` | Retain claims and refuse further launch work |
| `managed_closed` | End the active claim after recorded roots and session listeners are verified absent; retain disk artifacts |
| `managed_artifacts_removed` | Record that retired profile/runtime artifacts were removed by a safe sweep |

Per-session locks under `operation-locks/` serialize preparation and launches. The global journal lock is not held while creating or waiting for a child. Locks and gate writers do not pass through exec. Replay never starts, stops or inspects processes. Legacy `record` commands cannot report success or release claims for managed sessions.

The macOS helper cannot prove complete descendant cleanup. The revised rule accepts untracked helpers until weekly reboot; that uncertainty alone does not retain an active claim. Closed sessions keep private profile/runtime files, not active claims. Retired disk cleanup is explicit through `sweep`; no process signals are added.

## Managed macOS execution

Stage 5 makes `start`, `exec`, `attach`, `detach`, `stop`, `recover`, `reconcile`, `sweep` and targeted `show --session-id` the routine macOS browser workflow. See the [managed command reference](../agent-browser-lifecycle/README.md#managed-commands) for usage and checks. Existing legacy claims are not migrated.

The lifecycle controller creates a private short runtime path for daemon sockets and a config snapshot. Profile state stays under the claimed session directory. `exec`, `attach`, `detach`, `stop`, `recover` and `reconcile` hold the session operation lock through their effects. `exec --tab-id` selects the tab and runs the command while holding that lock; callers should still prefer semantic selectors because daemon snapshot refs can be invalidated by other tabs and commands outside the uninterrupted snapshot-to-ref use.

Children attach with their own actual thread ID after the owner hands them the session and owner IDs. A child opens and uses its own tab, then detaches. Owner shutdown with active children records draining: new owner commands and new attachments are refused, existing children can finish and detach, and the owner repeats `stop` after the last detach. `reconcile --confirm-worker-finished` is only for an owner who verified the child finished or was cancelled; elapsed silence is not enough.

After a bounded wait, verified absence of recorded roots and session listeners permits `managed_closed`. Concrete blockers retain cleanup-pending and are returned as `pending_reasons`. Repeated owner closure requests are idempotent. Closed means recorded Chrome root, daemon and session listeners are gone; untracked helpers may remain until weekly reboot and do not keep a claim active. Private retired profile/runtime files remain until `sweep` can delete them safely.

`sweep` is explicit and also runs at `start`. It deletes only recorded retired profile/runtime directories whose saved artifact identity and listener checks make deletion safe. Same-boot retired sessions return counts without inspecting files. Older histories that lack required metadata are blocked. While deleting and recording completion, sweep holds the lifecycle lock so a new claim cannot appear between conflict revalidation and filesystem effects. `show` reports active sessions only; use `show --session-id <id>` for a targeted active view.

## Trust boundary

Thread IDs and handoffs are self-reported by processes running as the same Unix user. The helper detects cooperative conflicts and invalid transitions, but it is not hardened authorization: another same-user process can read the files or connect to loopback CDP. Enforcing hostile-process isolation would require an authenticated proxy, separate operating-system identities, or another external capability boundary.
