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

Each line of `lifecycle.jsonl` is one compact object that must validate against [`lifecycleEvent` in the JSON Schema](../agent-browser-lifecycle/schema.json#lifecycleEvent). Validating one line proves only its structure; history replay also enforces the transition, actor, and session-identity rules below.

Every record repeats the complete session identity. The history contains lifecycle metadata only: no URLs, titles, page content, credentials, cookies, task text, or free-form errors.

### Transitions

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

`current.json` must validate against [`currentState` in the JSON Schema](../agent-browser-lifecycle/schema.json#currentState). It projects all `claimed`, `ready`, and `stopping` sessions.

`attached_thread_ids` is the set of children with one accepted `attached` event and no later `detached`. A terminal event removes the session. `agent-browser-lifecycle show` always replays committed history under the lock and atomically replaces `current.json`; `rebuild` performs the same operation explicitly. Repair history from neither the view nor inferred live processes.

## Trust boundary

Thread IDs and handoffs are self-reported by processes running as the same Unix user. The helper detects cooperative conflicts and invalid transitions, but it is not hardened authorization: another same-user process can read the files or connect to loopback CDP. Enforcing hostile-process isolation would require an authenticated proxy, separate operating-system identities, or another external capability boundary.
