---
doc_schema: "amp-rfc/v1"
code: "RFC-0012"
title: "Deterministic browser configuration and lifecycle"
slug: "deterministic-browser-configuration-and-lifecycle"
file: "rfc-0012-deterministic-browser-configuration-and-lifecycle.md"
status: "Implemented"
summary: "Use validated defaults and a lifecycle controller for browser mechanics while keeping task interpretation with the agent."
created: "2026-09-07"
updated: "2026-09-08"
amp_thread_id:
  T-01a070b7-4cf5-76f3-a833-96c78deacde7: "researched current configuration, consulted Oracle and converted the implementation plan into an RFC"
  T-01a07c05-b8b1-763d-a505-dca738e97aac: "validated session closure, browser-free tests and actual post-reboot cleanup"
dependency:
  - type: "rfc"
    code: "RFC-0011"
    title: "Quiet browser sessions and approved authentication"
    path: "./rfc-0011-quiet-browser-sessions-and-approved-authentication.md"
implementation:
  - path: "../../agent-browser-custom/build"
  - path: "../../agent-browser-custom/rfc0012.patch"
  - path: "../../agent-browser-custom/fingerprint"
  - path: "../../agent-browser-custom/lib.sh"
  - path: "../../agent-browser-custom/skill-data.sha256"
  - path: "../../../bin/agent-browser"
  - path: "../../../scripts/check-agent-browser-custom"
  - path: "../../../scripts/check-projection"
  - path: "../../scripts/merge-agent-browser-plugin.py"
  - path: "../../scripts/test_merge_agent_browser_config.py"
  - path: "../../../scripts/check-agent-browser-config"
  - path: "../../../bin/agent-browser-lifecycle"
  - path: "../../agent-browser-lifecycle/schema.json"
  - path: "../../agent-browser-lifecycle/process_identity.py"
  - path: "../../../scripts/test_agent_browser_lifecycle_managed.py"
  - path: "../../../scripts/test_agent_browser_process_identity.py"
  - path: "../../agent-browser-lifecycle/retired_cleanup.py"
  - path: "../../../scripts/test_agent_browser_lifecycle_sharing.py"
  - path: "../../../scripts/test_agent_browser_lifecycle_sweep.py"
  - path: "../../../scripts/test_agent_browser_retired_cleanup.py"
inputs:
  - name: "managed browser request"
    kind: "owner or attached worker command"
    purpose: "Select a lifecycle session and request a permitted browser operation."
  - name: "browser defaults"
    kind: "repository-owned configuration"
    purpose: "Supply validated preferences without overriding lifecycle identity."
outputs:
  - name: "verified browser session"
    kind: "owned Chrome and daemon processes"
    purpose: "Execute browser commands through a checked session identity."
  - name: "lifecycle result"
    kind: "durable events and structured status"
    purpose: "Report readiness, completed cleanup or explicit recovery uncertainty."
supersedes: []
superseded_by: null
related: []
tags:
  - "agent-browser"
  - "configuration"
  - "lifecycle"
  - "local-automation"
---

# RFC-0012: Deterministic browser configuration and lifecycle

## Summary

Use config for stable defaults, a lifecycle controller for session mechanics, and agent instructions for task judgment. Extend the existing helper rather than introduce a resident supervisor. Preserve RFC-0011's fresh profiles, quiet operation and approved authentication.

All 5 stages are implemented and accepted locally. Stage 5 adds subagent sharing, draining shutdown and post-reboot disk cleanup. Actual post-reboot cleanup passed on 8 September 2026. Cleanup runs on demand or at the next browser start, never through a resident service.

## Context

Source: [research and planning thread](https://ampcode.com/threads/T-01a070b7-4cf5-76f3-a833-96c78deacde7)

### Trigger and problem

Chinh requested a review of browser setup against the [configuration documentation](https://agent-browser.dev/configuration), an Oracle consultation and a persisted RFC.

Routine session mechanics should not depend on the agent remembering a long sequence. Config can supply defaults, but cannot enforce process ownership or prove cleanup. We need to separate preferences, enforced invariants and task judgment without building a general browser supervisor.

### Current evidence

Research before stage 1 established:

- the installed custom binary at `~/.local/libexec/agent-browser-rfc0011/agent-browser` reports version `0.36.0`
- the command at `~/.local/bin/agent-browser` is a symlink to this repository's `bin/agent-browser` wrapper; it checks `~/.local/libexec/agent-browser-rfc0011/build-input.sha256` against the repository's build inputs before running the binary
- user config at `~/.agent-browser/config.json` contains only the `onepassword` plugin registration; this repository has no project `agent-browser.json`
- the browser convention always passes explicit `--config`, bypassing normal user/project discovery
- `agent-browser skills get core` fails with `Skills directory not found`; the custom build installs a binary and receipt, not the skill bundle
- lifecycle claims coordinate ports and create private profiles, but release the port probe before Chrome binds
- `ready` validates the recorded actor, state and PID presence, not live process identity; terminal events trust the caller about cleanup
- the installed CLI rejects `allowedDomains` with CDP attachment and profiles

Source files:

- [global instruction entry point](../../AGENTS.md)
- [browser convention](../../conventions/agent-browser.md) and [lifecycle contract](../../conventions/agent-browser-lifecycle.md)
- [lifecycle helper](../../../bin/agent-browser-lifecycle) and [schema](../../agent-browser-lifecycle/schema.json)
- [binary wrapper](../../../bin/agent-browser) and [custom build](../../agent-browser-custom/build)
- [config merger](../../scripts/merge-agent-browser-plugin.py) and [projection](../../../sync-skills.sh)
- [browser skill](../../../skills/agent-browser/SKILL.md) and [worker handoff](../../../skills/delegating-subagents/SKILL.md)

## Decision

Extend `agent-browser-lifecycle` into the lifecycle controller and keep `bin/agent-browser` as a thin dispatcher. Oracle recommended this approach over an always-running background service when delayed recovery is acceptable. Chinh confirmed that no always-running service is needed and accepted the local implementation.

Delayed cleanup after a crash is an accepted trade-off for this local setup. Leftover processes, occupied ports, stale session records and private profile directories may remain until recovery. Chinh normally restarts the machine weekly. A restart ends leftover processes and their listeners, but does not remove profile directories, saved cookies or session records.

Recovery must still check and remove verified leftovers, including after a restart. Keep old profiles private and do not reuse them for new sessions. If ownership is unclear, report the blocker and leave the resources untouched. Wrong-process termination, deletion of an active profile, silent command retries and false reports of completed cleanup are not acceptable failures. The tests below must verify these limits before rollout.

Oracle identified 2 pinned-runtime behaviors that wrapper checks alone cannot fix: implicit daemon restart/respawn and stream startup before readiness. Implementation must reproduce these findings at the pinned revision before patching them. See the [connection implementation](https://github.com/vercel-labs/agent-browser/blob/eb05921bad874cd2a1b4fa5d1149f1ed26576cae/cli/src/connection.rs) and [daemon implementation](https://github.com/vercel-labs/agent-browser/blob/eb05921bad874cd2a1b4fa5d1149f1ed26576cae/cli/src/native/daemon.rs).

Oracle's recommendations address 4 concrete failure cases. Here, the lifecycle controller means the proposed `agent-browser-lifecycle` code. The daemon is agent-browser's background service, separate from Chrome.

1. Record ownership before Chrome can start. If the lifecycle controller starts Chrome and then crashes before recording ownership, recovery has no reliable record of that process. Instead, create a child process that waits. Save its process ID (PID), process start identity and session mapping to disk, then allow it to run Chrome. Apply the same sequence to the daemon. If the lifecycle controller dies before giving permission, the waiting child exits without starting Chrome or the daemon.
2. Do not silently replace a lost daemon. Suppose the daemon dies during a click. Automatically starting another daemon and retrying could repeat an action that already happened. Managed commands must report that recovery is needed instead. Also start the daemon with its live-view stream disabled. Starting the stream and disabling it afterward leaves a period when the stream is available; a lifecycle controller crash could leave it running.
3. Check the browser before recording success. Today, an agent can record `ready` by supplying a PID, without the helper checking Chrome. The proposed start operation must check the actual processes and connection before recording `ready`. Cleanup must likewise finish before recording `stopped`. Rebuilding the current-state file from saved events is different: it reads what was recorded, without starting, stopping or inspecting today's processes. Managed sessions must not retain a separate command that lets callers record these success events without the checks.
4. Prove cleanup can target only this session's processes. Chrome starts helper processes, so stopping its main process does not prove that all its processes have stopped. macOS can also reuse a PID after a process exits. First test how the lifecycle controller can identify this session's Chrome and helper processes, and safely request their shutdown. If ownership cannot be verified, report the remaining resources instead of force-stopping a possibly unrelated process.

A process start identity, called its birth identity below, distinguishes an original process from a later process that reuses its PID. Checking that identity and then calling `kill(pid)` still leaves a race: the original process could exit between those actions. Use a shutdown mechanism tied to the verified process, such as an already-open verified control connection, where available. Otherwise retain the claim and report that intervention is required. Never kill a process just because it occupies the claimed port.

This remains cooperative same-user isolation, not protection against hostile local processes. No lifecycle controller command running means no recovery progress.

## Contract

| Layer | Owns | Does not own |
| --- | --- | --- |
| Config | Stable defaults, plugin registration, output preferences | Authorization or live process ownership |
| `agent-browser-lifecycle` program | Tracking which browser belongs to each session, checking startup, allowing commands, waiting for workers, stopping and resuming cleanup | Understanding arbitrary page content |
| Agent skill and conventions | Navigation, choosing evidence, interpreting outcomes and authentication escalation | Reconstructing launch and cleanup sequences |
| Human | Approval for consequential external actions and material policy changes | Approval for each routine browser click |

## Behavior

Consider an Amp thread that needs Chrome to inspect a page. Under this proposal, `agent-browser-lifecycle` handles the following steps.

### Start a browser

Keep RFC-0011's headless default, loopback-only connections and approved authentication.

The lifecycle controller saves a record of the requested session and creates a fresh Chrome profile directory. It then creates a waiting process. The lifecycle controller records which session owns that process before permitting it to start Chrome. It uses the same approach to start agent-browser's background service, the daemon.

The lifecycle controller then checks that Chrome and the daemon are running. It checks that Chrome uses the assigned profile and connection address, and that the daemon uses the expected build. It also checks that live-view streaming is disabled. Only then does it record `ready` and let the Amp thread use the session.

### Use the browser

The thread that created the session can send browser commands. Another subagent thread can use the session only after its attachment has been recorded.

Each request identifies the session and Amp thread. `agent-browser-lifecycle` looks up the saved process, profile and connection address. Config, environment variables and command flags may change preferences, but cannot select another browser or bypass session checks.

If the daemon disappears or no longer matches the recorded session, the command fails and says recovery is needed. The lifecycle controller does not quietly start a replacement or repeat the command. For example, a click might already have submitted a form before the connection failed.

### Stop the browser

The lifecycle controller first refuses new workers and new unrelated work. It waits for commands already running to finish and for attached workers to finish using the session and detach.

Next, it requests Chrome shutdown and daemon exit. Disconnecting agent-browser from Chrome does not stop Chrome. It records `managed_closed` only after the recorded Chrome process, daemon and session listeners are verified absent. Closed sessions disappear from the active view and release their claims.

Closure does not certify that every Chrome helper has exited. Untracked helpers may remain until the weekly reboot; that accepted uncertainty alone does not keep a session pending. Profile and runtime files remain private, retired disk artifacts. A post-reboot `sweep` removes them after identity checks, without presenting each retired profile as an active session.

### Resume cleanup after a failure

Saved events are the source of truth; the current-state file is rebuilt from them. Schema changes must keep older events readable, but old records without verified process start identity cannot authorize automatic cleanup.

Suppose cleanup stops the daemon, but the lifecycle controller crashes before stopping Chrome. A later recovery request reads the saved session record, checks what is still running and continues cleanup only for verified session resources.

If the lifecycle controller cannot prove a process belongs to the session, it leaves that process untouched and reports the blocker. It does not assume a silent worker has detached or stop an unrelated process that now uses the session's old port.

The agent still decides whether the page shows the expected account and whether the task succeeded. A `ready` session means the browser infrastructure passed its checks, not that login or the user's task has completed.

## Permissions and side effects

Implementation will read pinned build resources, approved config and local process/listener metadata. It will write private lifecycle records, profiles and workspace artifacts, and spawn owned Chrome and daemon processes.

Browser commands may access task-authorized websites. Authentication continues through RFC-0011's approved credential path. Lifecycle records must contain no credentials, page content, browser history or arbitrary environment dumps.

Only verified owned resources may be shut down or removed. An uncertain identity or unsafe signaling path retains the claim and requests intervention. No background service, shared profile, global domain allowlist or idle-timeout cleanup substitute is proposed.

This RFC does not authorize implementation, publication, service installation or consequential external browser actions. Those actions retain their existing approval requirements.

## Examples

For a routine screenshot task, the agent requests a session and navigates to the approved page. The lifecycle controller supplies the profile, namespace and endpoint. The agent chooses the completion signal and inspects the capture; the lifecycle controller handles verified cleanup.

If the daemon disappears after command preflight, the command returns recovery-required. It does not create another daemon or replay a possibly completed click.

If another process occupies the claimed port during recovery, the lifecycle controller leaves it untouched. The session remains nonterminal with an explicit blocker rather than reporting successful cleanup.

## Maintenance notes

### Implementation stages

#### 1. Repair version-matched skill delivery

Status: implemented, validated by the parent agent and installed locally on 7 September 2026. Human review accepted; stage 2 was authorized.

Agent actions:

1. Locate the skill bundle in the pinned source and confirm its lookup contract.
2. Install that bundle alongside the binary. Set its path in the wrapper if required by the pinned CLI.
3. Include installed skill inputs in the distribution receipt or equivalent integrity check.
4. Keep the remote discovery stub separate from version-matched executable guidance. Do not substitute current upstream content for the pinned bundle.

Acceptance: `skills list`, `skills get core` and `skills get core --full` work from an isolated installation without npm-global resources. Missing or mismatched resources produce actionable errors. No browser launch or credentials are needed.

The build now installs pinned `skill-data/` with its checksums. The wrapper verifies the bundle and selects its path explicitly. The repository's remote discovery stub is unchanged. See the [custom-build README](../../agent-browser-custom/README.md) for installation and repair.

Subagent implementation was reviewed and corrected before installation: runtime checks no longer depend on the temporary upstream checkout. Offline tests cover missing, changed, extra and symlinked resources, conflicting skill paths, and failed reinstall recovery.

Parent verification passed:

- all 9 skills listed from an isolated HOME and repository copy with no upstream checkout
- core guide and all 13 supplementary files matched the pinned upstream content exactly
- offline packaging checks, pre-commit checks and applicable pre-push checks
- 1,215 native unit tests, 6 CLI integration tests and 3 explicitly enabled synthetic login tests; other ignored upstream tests remained skipped
- all three skill commands through the installed `~/.local/bin/agent-browser` wrapper

#### 2. Project explicit, validated defaults

Status: implemented, validated by the parent agent and projected locally on 7 September 2026. Human review accepted; stage 3 was authorized.

Agent actions:

1. Add repository-owned defaults through the existing config merge/projection path. Preserve unrelated settings and the approved plugin registration.
2. Propose `contentBoundaries: true`, `maxOutput: 50000` and `autoConnect: false`. Add the schema reference for editor support, but validate against the pinned version in tests.
3. Treat conflicting existing values explicitly: preserve user preferences or report a conflict, rather than silently taking ownership of every key.
4. Retain explicit config selection. Do not automatically load arbitrary project plugins or extensions. Defer project preference merging until a concrete use case requires it.

Acceptance: isolated projection is idempotent; plugin registration survives; malformed config fails clearly; unknown repository-owned keys fail validation. Test effective values with environment and CLI overrides, not just serialized JSON.

Boundary markers are hints to the agent, not prompt-injection prevention. Output limits remain overridable for complete evidence collection. Do not set global session, profile, CDP endpoint, persistent restore state or `allowedDomains`. Resolve artifact paths from the workspace in the lifecycle controller. Config `headed` cannot control externally launched Chrome.

The [config merger](../../scripts/merge-agent-browser-plugin.py) now fills missing defaults and preserves valid user preferences. It rejects invalid types for these defaults and conflicting plugin ownership without rewriting the config. The [configuration guide](../../agent-browser-custom/README.md#configuration-defaults) records the defaults and pinned-version override rules.

Subagents implemented the merge tests and installed CLI smoke test. Parent review removed source-string assertions and a redundant Cargo dependency from the smoke test. It now checks observable CLI behavior without needing the upstream checkout or launching Chrome.

Verification scope:

- 9 merger tests cover defaults, preserved preferences and file modes, idempotence, malformed JSON, invalid types, duplicate keys, symlinks and plugin conflicts
- 21 installed CLI assertions use `autoConnect` to test user/project discovery, explicit config selection, environment overrides and CLI overrides; no daemon socket is created
- isolated projection checks defaults, preserved plugin registration and user preferences, and byte-stable repeated sync
- 2 pinned Rust output tests passed for boundary markers and truncation; the installed CLI smoke test does not exercise page output or numeric output-limit overrides
- applicable pre-commit checks, including credential/plugin regression tests, passed; RFC validation and diff whitespace checks passed
- `./sync-skills.sh` applied the defaults locally; all 4 default values and the single `onepassword` registration were confirmed

The pinned CLI cannot disable a config boolean with an environment value of `false`; an explicit CLI `false` can. Config remains a preference layer, not an enforced session-ownership boundary.

#### 3. Establish recoverable launch ownership

Status: internal schema and gated-launch foundation implemented under the human-approved exception on 7 September 2026. The macOS completeness checkpoint remains inconclusive. Routine instruction cutover was completed in stage 5.

The lifecycle log records Chrome startup, subagent attachment and cleanup. It does not record website login sessions or authentication tokens.

Agent actions:

1. Prototype macOS birth-identity inspection, verified graceful shutdown and descendant accounting using disposable processes. Complete the subagent checkpoint below before proceeding to step 2.
2. Version the lifecycle schema and retain old-history replay. Mark legacy live records without sufficient identity unverified; never adopt them automatically as kill targets.
3. Persist session generation, namespace, daemon name, runtime path, launch mode, profile identity, build/config identity, and separate Chrome/daemon process birth identities. Store no secrets, page content or arbitrary environment dumps.
4. Introduce a gated child launch: commit intent, prepare the profile, create a blocked child, commit its identity, then release it to execute. Parent-pipe EOF must prevent execution when the lifecycle controller dies before release.
5. Keep replay pure. Use short global journal locks and per-session operation serialization; never hold the global lock while awaiting Chrome or a worker.

##### Subagent checkpoint: safe cleanup on macOS

The implementing agent delegates a focused test of the prototype to a subagent running on macOS. Pass the prototype paths, test commands and expected results. Use fresh disposable Chrome profiles and local fixture pages, never personal Chrome or real account credentials.

The subagent must test:

- normal cleanup stops the target Chrome and its helper processes, while a separate disposable Chrome session remains usable
- if the main Chrome process exits first, cleanup still accounts for any remaining helper processes
- stale or mismatched process identity and a port occupied by an unrelated test process cause refusal, not termination of the unrelated process
- when ownership cannot be verified, cleanup reports what remains instead of claiming success

Use controlled test fixtures for PID reuse; do not rely on macOS reassigning a particular PID during the test. Report separately what was tested with real Chrome and what was simulated.

The subagent returns the commands run, observed process identities, pass/fail results, limitations and cleanup status of its test resources. Persist that report with the RFC's supporting evidence. The implementing agent reviews the evidence before proceeding. A failure blocks automatic cleanup for that case until fixed or explicitly assigned to human cleanup; an inconclusive result is not a pass.

Acceptance: fault injection at every launch barrier proves that no executed process lacks durable launch identity. Journal failures prevent release. Replaying history rebuilds a missing view. Operation locks and gate writers do not leak into long-lived children.

Gate: if safe ownership or shutdown cannot be established on macOS, document the conservative manual-recovery path before continuing. Do not replace uncertainty with broad process-name matching or process-group killing.

##### Checkpoint outcome and approved exception

The [subagent evidence](evidence/rfc-0012-stage-3-macos-checkpoint.md) records successful closure of 2 disposable Chrome instances through inherited control pipes. Closing the first left the second usable. Direct birth-identity checks found all 16 previously observed helpers absent after closure. The main-first failure test used controlled Python processes, not a real Chrome crash.

This does not prove every helper was observed. Parent review rejected the initial test's empty descendant list after the main process exited: helpers could have been reparented. The corrected test checks saved helper identities directly and returns exit code 2 for the inconclusive completeness gate. Private test profiles remain under `.amp/in/artifacts/`; the evidence records their locations.

Oracle advised against treating process groups, snapshots or an extra inherited pipe as complete descendant ownership. Chrome subprocesses can leave process groups or close inherited descriptors. No bounded supported macOS mechanism was established that also survives lifecycle controller failure.

Initial fallback, now superseded: even normal closes remained cleanup-pending until a verified reboot and recovery. This retained too many routine sessions in the agent's working view.

Revised accepted rule: close a session once its recorded Chrome process, daemon and session listeners are verified absent. Do not require complete descendant accounting. Retain cleanup-pending only for concrete blockers such as live recorded processes, foreign listeners, reused PIDs, replaced profiles or unavailable inspection. Retain private profile/runtime files separately from active claims until a post-reboot sweep. No always-running supervisor or process signals are added.

Agent action: use this narrower closure test and show only active or genuinely blocked sessions. Human action: continue the usual weekly reboot, accepting possible helper RAM/CPU usage in the meantime. The original checkpoint remains inconclusive, not retroactively passed; `closed` is not a claim of complete descendant cleanup.

Stage 3 adds internal launch primitives, not a public managed `start` command. New managed records retain intent, profile identity and each gated process identity. Legacy records remain readable and explicitly unverified. A release record means execution was permitted, not that the process is ready or cleanup is complete. Stage 4 will own verified readiness and public managed commands; stage 5 will own final cleanup and reboot reconciliation.

##### Implementation and parent verification

The subagent wrote the initial implementation but reached its usage limit before returning a report. Parent review corrected cleanup-pending retry guards, profile replacement checks, managed/legacy event separation, digest validation, launch-mode metadata and schema compatibility.

The internal APIs are `prepare_managed_session` and `launch_managed_role` in the existing helper. Managed history uses v2; legacy history stays v1. Current views use v2 and label legacy sessions unverified. Public legacy CLI commands still work, but cannot report managed readiness or completed cleanup. The [lifecycle contract](../../conventions/agent-browser-lifecycle.md#managed-launch-foundation) documents these boundaries.

Parent verification passed 39 lifecycle and process-identity tests on macOS, including:

- mixed history replay and schema checks, with no live process effects during replay
- intent/profile and identity/release failure barriers, journal and fsync failures, and parent exit before release
- concurrent launch refusal, cleanup-pending refusal and changed-profile refusal
- real macOS birth identity preserved across exec, closed gate descriptors and no inherited locks

Most launch failure tests use disposable Python payloads with simulated birth identities. Real Chrome results remain in the separate checkpoint evidence. Neither this suite nor the approved exception proves complete helper cleanup. Test wiring is included in pre-commit, CI and the README Validation table.

#### 4. Add bounded managed execution

Agent actions:

1. Reproduce Oracle's restart and stream-start findings against the pinned build.
2. Add a narrow managed mode to that build: existing-daemon-only commands, no implicit restart/respawn/replay, and streaming off from birth.
3. Extend the lifecycle helper with start, exec, stop and recover operations. Keep the wrapper a dispatcher rather than duplicating policy.
4. Resolve identity from the lifecycle session. Reject conflicting CLI, environment and effective configuration before effects. Parse command structure rather than relying on substring filtering.
5. Restrict lifecycle-changing commands, including nested/batch commands, to lifecycle controller operations. Preserve ordinary browser commands and RFC-0011 credential propagation.
6. Record ready only after process, profile, endpoint, daemon/build and stream checks succeed. Keep semantic destination/account checks with authentication policy and agent interpretation.

Acceptance: a daemon disappearing between preflight and send returns recovery-required without replacement or replay. A build mismatch does not restart it. Stream enable and identity-changing commands cannot bypass managed mode. Approved authentication still passes existing tests without printing credentials.

##### Implementation boundaries

Stage 4 adds owner-only public managed commands on macOS. The [command reference](../../agent-browser-lifecycle/README.md#managed-commands) describes their configuration checks, supported commands and retained claims. It does not switch the normal browser instructions or migrate legacy sessions.

The native patch supplies an internal socket protocol, not another agent-facing command interface. Managed execution refuses daemon replacement, browser relaunch and failed-send replay. Streaming is off from daemon creation. The lifecycle controller checks process births, profile identity, CDP listener ownership, socket peer PID, config/build digests and daemon status before reporting readiness.

Parent review corrected a second liveness check that could reach automatic launch after the first check passed. It also corrected daemon-only environment propagation, shutdown completion, build identity discovery, per-session lock scope and short-form provider overrides. Tests cover these failure paths without treating a successful close as complete descendant cleanup.

Stop and recover now record `managed_closed` after the narrower closure checks pass, including recovery of existing pending sessions. Repeated owner requests return `closed` without further shutdown effects. Profiles remain on disk but no longer retain active claims. Session attachment, post-reboot disk cleanup and instruction cutover remain stage 5 work. Unsupported command containers are refused rather than partly executed.

Initial validation passed the full native suite, existing synthetic login tests and a live disposable browser run under the older pending-until-reboot rule. After the closure-rule revision, 59 lifecycle tests and a new live run passed: stop returned `closed`, the active view was empty, repeated recovery was idempotent and the private profile remained. See the [stage 4 evidence and limits](./evidence/rfc-0012-stage-4-managed-execution.md).

#### 5. Drain, clean up and simplify instructions

Status: implemented and accepted locally. The live subagent handoff and actual post-reboot cleanup passed. Verification details are in the [stage 5 evidence](evidence/rfc-0012-stage-5-sharing-and-retirement.md).

Agent actions:

1. Durably drain a session before cleanup: refuse new attachments and new unrelated work, while allowing admitted workers to finish and detach.
2. Shut down the verified daemon separately from Chrome. CDP disconnect is not Chrome termination.
3. Keep session closure separate from disk cleanup. Commit `managed_closed` after recorded roots and session listeners are absent; do not wait for complete helper accounting.
4. Add repeatable post-reboot cleanup of retired profiles and runtime artifacts using saved filesystem and boot identities. Report totals and actionable exceptions, not every retired session. Preserve active blockers for foreign listeners, replaced profiles or unavailable inspection; untracked-helper uncertainty alone is not a blocker.
5. Replace manual start/stop recipes with lifecycle controller usage only after tests pass. Retain navigation, timing, evidence selection, escalation and worker responsibilities in skills/conventions.

Acceptance: active workers prevent destructive shutdown. A crashed worker attachment requires explicit reconciliation, not expiry alone. Repeated recovery converges or reports precise uncertainty without damaging unrelated sessions.

Human action: use the managed command guide and normal weekly reboot. No service installation or additional scheduled work is needed.

##### Implemented boundaries

`attach` checks the saved owner and live session before recording the subagent's thread ID. `stop` records draining while subagents remain attached. It refuses new attachments and owner commands, while attached subagents can finish and detach. The owner repeats `stop` after the last detachment. Removing an abandoned attachment requires explicit owner confirmation that the subagent finished or was cancelled; silence never expires an attachment.

Each participant uses its own stable tab ID. `exec --tab-id` selects that tab and executes the command under one session lock. This protects selection and action, not a sequence of separate commands. Shared snapshot references still require coordination; prefer semantic selectors.

Before releasing the first waiting process, the lifecycle controller records the runtime directory identity and current boot identity. `sweep` reads closed sessions from history and skips same-boot artifacts without inspecting their files. After a later verified boot, it checks path identities, symlinks, active claims and listeners before deletion. It holds the journal lock through deletion and the completion record, preventing concurrent claims. Large profiles can briefly delay other lifecycle commands during that step.

The sweep reports counts and at most 10 blocked details. It never adds retired files back to the active view. It runs explicitly or before `start`, without a background service. Interrupted deletion is repeatable. Older records and failures before artifact metadata was recorded require manual disk cleanup; the lifecycle controller does not invent missing identities. Empty unrecorded parent directories and audit history remain.

### Validation and rollout

Use disposable profiles and local fixture pages. Do not inspect real browser history or use real account credentials for lifecycle tests.

The live Chrome checks below describe completed rollout evidence. Chinh subsequently directed that Chrome must not be used for testing. Future checks use browser-free fixtures and mocks; ask for an alternative environment if live validation is needed. Actual post-reboot cleanup was verified without launching a browser.

Required failure cases:

- port stolen after claim but before bind
- lifecycle controller crash before and after child release, and before ready
- Chrome dead with daemon alive, and the reverse
- PID reuse, reboot, replaced profile or symlink, and foreign listener
- daemon loss during a command or batch; no automatic replay
- concurrent attachment or command admission during drain
- journal write failure, torn tail, missing materialized view and interrupted cleanup
- config/env/flag attempts to redirect identity, start streaming or replace the daemon

Deliver stages as separate reviewable changes. Before runtime cutover, complete a local start, navigate, screenshot, inspect, worker attach/detach and stop smoke test. Confirm recorded roots and session listeners are absent and the session is excluded from the active view. Confirm its private profile remains retired until the post-reboot sweep. Also demonstrate conservative refusal on a concrete shutdown blocker.

Run the README Validation commands covering each changed path. Include custom-build tests for stage 4, credential/plugin tests for config or authentication changes, lifecycle tests and `scripts/check-projection`. Add any new lifecycle checks to the repository validation entry points. Use isolated HOME projection before `./sync-skills.sh`; inspect generated changes after syncing. Reload skills when skill delivery changes.

Do not migrate active legacy sessions automatically. Keep a tested manual path during staged rollout. Stop verified new sessions before rollback; do not downgrade history by rewriting committed events. Revert source changes through normal version control and re-project compatible artifacts.

## Open questions

Complete Chrome helper accounting remains unproven, as recorded in the [stage 3 checkpoint](#subagent-checkpoint-safe-cleanup-on-macos). The accepted rule leaves untracked helpers until reboot. It does not require a pending session or an always-running supervisor.

Actual post-reboot cleanup passed after Chinh's normal restart on 8 September 2026. Sweep deleted the retained test profile and recorded completion once. The runtime directory was already absent, so the check proves safe handling of a missing runtime, not its deletion by sweep. Repeated sweep made no changes. No rollout validation remains pending.
