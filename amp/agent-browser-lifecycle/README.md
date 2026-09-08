# Agent Browser lifecycle

This directory owns the lifecycle JSON schema. The executable lives in [bin/agent-browser-lifecycle](../../bin/agent-browser-lifecycle). Use the [lifecycle rules](../conventions/agent-browser-lifecycle.md) for routine work; consult the [state contract](reference.md#state-contract) when inspecting event history or current-state files.

The public CLI supports legacy claims and managed sessions on macOS. Stage 3 supplied durable preparation and gated launches; stage 4 added checked `start`, `exec`, `stop` and `recover`; stage 5 adds child attachment, draining shutdown, safe retired-artifact sweep and routine instruction cutover.

Stage 5 switches routine macOS instructions to managed lifecycle commands. Managed launches persist intent, profile identity, process identity and release permission in that order. Replay accepts old history and labels legacy sessions unverified. Managed sessions cannot use legacy `record` commands to claim readiness or completed cleanup. See the [managed launch contract](reference.md#managed-launch-foundation).

Stop and recovery report `closed` once the recorded Chrome process, daemon and session listeners are gone. Untracked helpers may remain until weekly reboot. Closed sessions release their active claims but retain private profile/runtime files until `sweep` can remove safely recorded retired artifacts. No process signals, implicit replacement, command replay or background supervisor are introduced.

Run the lifecycle command in the root [Validation table](../../README.md#debug-a-failed-check) for replay, schema, launch-gate and identity tests. Most process-launch tests use disposable Python payloads and simulated identities; macOS also checks real birth identity across exec. The [Chrome checkpoint](../docs/rfcs/evidence/rfc-0012-stage-3-macos-checkpoint.md) is separate and returns exit code 2 for its inconclusive completeness gate.

## Managed commands

Build the matching native distribution first with `amp/agent-browser-custom/build`. Use the owner thread ID and returned session ID:

```bash
agent-browser-lifecycle start --owner-thread-id "$thread" --workspace "$PWD"
agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" -- open https://example.com
agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" -- tab new https://example.com
agent-browser-lifecycle exec --session-id "$session" --actor-thread-id "$thread" --tab-id "$tab_id" -- snapshot -i
agent-browser-lifecycle stop --session-id "$session" --owner-thread-id "$thread"
agent-browser-lifecycle recover --session-id "$session" --owner-thread-id "$thread"
agent-browser-lifecycle show --session-id "$session"
agent-browser-lifecycle sweep
```

Start defaults to headless; use `start --headed` for a fresh headed session. Commands take their browser identity from the journal, not command-line overrides. The helper snapshots the approved user config into a private runtime directory and bypasses project config discovery. It accepts the stage 2 output preferences and the approved `onepassword` credential plugin; unsupported config keys are refused, not silently discarded.

Owners and attached children can execute commands. A child attaches with the session and owner IDs provided by the owner, using the child's own actual Amp thread ID:

```bash
agent-browser-lifecycle attach --session-id "$session" --owner-thread-id "$owner" --actor-thread-id "$child"
agent-browser-lifecycle detach --session-id "$session" --actor-thread-id "$child"
```

Each child opens its own tab, then reads its `tabId` (such as `t2`) or CDP `targetId` using `tab list --json`. Pass that ID as `--tab-id` to every tab-specific command. Selection and action execute under one session lock. Do not rely on numeric tab positions. Shared daemon snapshot refs can be invalidated by other tabs or commands; prefer semantic selectors and coordinate snapshot-to-ref use.

Supported commands include `open`, `snapshot`, `screenshot`, `click`, `fill`, `eval`, `get`, `wait`, `press`, `scroll`, `tab` and `auth login`. Unsupported flags and command containers such as `batch` are refused before execution. Credential login remains `auth login <alias> --credential-provider onepassword`.

The helper holds a per-session lock while executing a command or requesting shutdown. It verifies saved process births, profile identity, config/build digests and daemon status before execution. Native managed mode cannot replace a missing daemon, reconnect a dead browser or replay a failed send. Streaming is disabled at daemon creation. Readiness also checks the CDP listener owner, Unix socket peer PID and absence of daemon TCP listeners.

An execution failure requires recovery; it is not retried. Stop with attached children records draining, refuses new owner commands and new attachments, lets existing children finish and detach, and returns the attachment set. Repeat `stop` after the last detach. Use `reconcile --confirm-worker-finished` only after verifying a child finished or was cancelled; elapsed silence is not enough.

Stop and recover check actual process and listener absence after requesting shutdown, even if the shutdown response was lost. A concrete blocker leaves `cleanup-pending` with `pending_reasons`. Successful closure appends `managed_closed` and removes the session from `show`. Repeated stop/recover by the owner returns `closed` without repeating effects. Neither command certifies complete descendant cleanup.

`sweep` deletes only recorded retired profile/runtime directories after checking saved artifact identity, current boot and listeners. Same-boot retired sessions return counts without inspecting files. Older histories without required metadata are blocked. `start` also runs sweep and returns `sweep_summary`.

## Responsibilities

The following table is copied from [RFC-0012](../docs/rfcs/rfc-0012-deterministic-browser-configuration-and-lifecycle.md#contract). Keep this copy aligned with the RFC.

| Layer | Owns | Does not own |
| --- | --- | --- |
| Config | Stable defaults, plugin registration, output preferences | Authorization or live process ownership |
| `agent-browser-lifecycle` program | Tracking which browser belongs to each session, checking startup, allowing commands, waiting for workers, stopping and resuming cleanup | Understanding arbitrary page content |
| Agent skill and conventions | Navigation, choosing evidence, interpreting outcomes and authentication escalation | Reconstructing launch and cleanup sequences |
| Human | Approval for consequential external actions and material policy changes | Approval for each routine browser click |

Stage 5 implements routine macOS startup, command admission, child attachment, draining closure and safe retired-artifact sweep. The agent still interprets page content and task results.
