# Agent Browser lifecycle schemas

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

Each line of `lifecycle.jsonl` is one compact `agent-browser-lifecycle/v1` object:

```json
{"schema":"agent-browser-lifecycle/v1","timestamp":"2026-08-24T10:15:30Z","event":"ready","session_id":"3f9272f1-771d-4ce4-bca2-a365a335de51","owner_thread_id":"T-00000000-0000-0000-0000-000000000000","actor_thread_id":"T-00000000-0000-0000-0000-000000000000","cdp_host":"127.0.0.1","cdp_port":9222,"user_data_dir":"/Users/name/.local/state/agent-browser/sessions/3f9272f1-771d-4ce4-bca2-a365a335de51/chrome-data","browser_pid":12345,"workspace":"/Users/name/Developer/project"}
```

| Field | Contract |
| --- | --- |
| `schema` | Literal `agent-browser-lifecycle/v1` |
| `timestamp` | UTC ISO 8601 to whole seconds |
| `event` | One transition from the table below |
| `session_id` | Lowercase UUID generated once by `claim` |
| `owner_thread_id` | Canonical lowercase `T-<UUID>` for the launching Amp thread |
| `actor_thread_id` | Canonical lowercase `T-<UUID>` for the thread recording this event |
| `cdp_host` | Literal `127.0.0.1` |
| `cdp_port` | Integer from 1 through 65535 |
| `user_data_dir` | Absolute unique directory for this Chrome process |
| `browser_pid` | `null` before `ready`; otherwise the positive Chrome PID |
| `workspace` | Absolute owning-thread workspace path |

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

`current.json` is an `agent-browser-current/v1` projection of all `claimed`, `ready`, and `stopping` sessions:

```json
{
  "schema": "agent-browser-current/v1",
  "generated_at": "2026-08-24T10:20:12Z",
  "sessions": [
    {
      "session_id": "3f9272f1-771d-4ce4-bca2-a365a335de51",
      "state": "ready",
      "owner_thread_id": "T-00000000-0000-0000-0000-000000000000",
      "cdp_host": "127.0.0.1",
      "cdp_port": 9222,
      "user_data_dir": "/Users/name/.local/state/agent-browser/sessions/3f9272f1-771d-4ce4-bca2-a365a335de51/chrome-data",
      "browser_pid": 12345,
      "workspace": "/Users/name/Developer/project",
      "attached_thread_ids": ["T-11111111-1111-1111-1111-111111111111"],
      "last_event_at": "2026-08-24T10:20:12Z"
    }
  ]
}
```

`attached_thread_ids` is the set of children with one accepted `attached` event and no later `detached`. A terminal event removes the session. `agent-browser-lifecycle show` always replays committed history under the lock and atomically replaces `current.json`; `rebuild` performs the same operation explicitly. Repair history from neither the view nor inferred live processes.

## Trust boundary

Thread IDs and handoffs are self-reported by processes running as the same Unix user. The helper detects cooperative conflicts and invalid transitions, but it is not hardened authorization: another same-user process can read the files or connect to loopback CDP. Enforcing hostile-process isolation would require an authenticated proxy, separate operating-system identities, or another external capability boundary.
