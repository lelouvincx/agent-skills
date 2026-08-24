---
doc_schema: "amp-artifact/v2"
title: "Amp runner log maintenance"
slug: "amp-runner-logs"
status: "active"
summary: "Rotates large Amp runner logs and uploads verified private gzip archives with rclone."
artifact:
  id: "amp-runner-logs"
  type: "local_cli"
  surface: "shell"
  invocation: "cli"
  api_stability: "stable"
source:
  kind: "script"
  file: "bin/amp-runner-logs"
  scope: "system"
  install_source: "local"
  registration_api: null
  metadata_comments: []
amp:
  docs_sources:
    api_docs: null
    agent_options: null
  last_verified: "2026-08-24"
contract:
  input_kind: "command_line_arguments"
  output_kind: "private_log_archives_and_maintenance_state"
  trigger: "cli"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
  required_inputs:
    - "command"
  optional_inputs:
    - "rclone remote"
    - "rclone command"
    - "archive object"
    - "restore directory"
runtime:
  uses:
    - "launchctl"
    - "gzip"
    - "cmp"
    - "agent-secrets service-account authentication"
    - "rclone copyto --immutable"
    - "rclone size --json"
  dependencies:
    - "macOS user LaunchAgents"
    - "configured agent-secrets amp-runner-r2 bundle"
    - "rclone or an executable rclone wrapper"
  env:
    - "AMP_RUNNER_LOGS_* path, policy, and test overrides"
    - "AMP_RUNNER_LOG_DIR"
    - "AMP_RUNNER_LAUNCH_AGENTS_DIR"
  reads:
    - "installed Amp runner LaunchAgents"
    - "active, pending, and archived runner logs"
  writes:
    - "~/Library/LaunchAgents/com.ampcode.runner-logs.plist"
    - "~/.local/state/amp-runner-logs"
    - "configured private rclone remote"
  network:
    - "rclone upload, verification, and restore"
  logs:
    - "~/.local/state/amp-runner-logs/maintenance.log"
safety:
  permission_level: "local-process-management-and-private-network-write"
  user_gate: "manual installation or explicit invocation"
  constraints:
    - "Rotation starts only when a runner's main log reaches 50 MiB."
    - "Active and state directories use mode 0700; files use mode 0600."
    - "A single-instance lock prevents overlapping maintenance runs."
    - "Archives remain local until rclone reports a matching compressed size."
    - "Restore checks the SHA-256 digest encoded in the immutable object name."
  risks:
    - "Runner logs contain sensitive prompts, paths, and tool activity."
    - "The configured rclone remote must be private and must retain objects indefinitely."
related:
  - "amp-runner"
tags:
  - "background-runner"
  - "backup"
  - "rclone"
  - "logs"
---

# Amp runner log maintenance

## Summary

`amp-runner-logs` rotates large runner logs and backs them up to private object storage. It preserves interrupted rotations and retries failed uploads without deleting local data.

## Invocation

`sync-skills.sh` projects the command from `bin/amp-runner-logs` to `~/.local/bin`.

Use `install`, `uninstall`, `run`, `status`, `verify` or `restore`.

### Prepare private R2 access

Create a private R2 bucket and an Object Read and Write token scoped to that bucket. Keep public development URLs and custom domains disabled. Do not add an R2 lifecycle deletion rule.

Add the `amp-runner-r2` bundle to `amp/agent-secrets/bundles.json`. Map it to an `amp-runner-rclone` command class for the absolute rclone executable.

Store credential references in `~/.credentials/agent-secrets/amp-runner-r2.env`. Values must be 1Password references:

```dotenv
AWS_ACCESS_KEY_ID=op://VAULT/ITEM/access key id
AWS_SECRET_ACCESS_KEY=op://VAULT/ITEM/secret access key
```

Configure an rclone S3 remote with `provider = Cloudflare` and `env_auth = true`. Keep the endpoint and other non-secret settings in its config file.

Create an executable wrapper that runs rclone through the unattended `agent-secrets` lane:

```bash
#!/usr/bin/env bash
set -euo pipefail
exec env AGENT_SECRET_AUTH=service-account \
  /absolute/path/to/agent-secrets run --bundle amp-runner-r2 \
  -- /absolute/path/to/rclone --config /private/rclone.conf "$@"
```

The wrapper must be an absolute regular file, not a symlink. Its file and parent directories must not be writable by group or others. This trusted boundary prevents launchd from receiving or storing plaintext credentials. `agent-secrets` removes its service-account token before it starts rclone.

### Install and verify

Install the LaunchAgent with the trusted wrapper:

```bash
amp-runner-logs install \
  --remote amp-runner-r2:amp-runner-logs \
  --rclone-command /absolute/path/to/private-rclone-wrapper
```

Verify the complete storage path:

```bash
AGENT_SECRET_AUTH=service-account agent-secrets doctor
amp-runner-logs verify
launchctl kickstart -k "gui/$(id -u)/com.ampcode.runner-logs"
amp-runner-logs status
```

Installation is complete when:

- `verify` uploads, size-checks, downloads and restores one validation archive
- `agent-secrets doctor` validates the `amp-runner-r2` references through the service account
- `status` reports `result=ok`, `phase=complete` and a recent UTC timestamp
- launchd reports a 900-second interval and a zero last exit code
- R2 contains the validation object and remains private

The validation object remains in R2 under the `validation.amp-runner-logs` runner ID.

## Contract

The LaunchAgent checks every 15 minutes. It rotates a runner only when its main log reaches 50 MiB. It does not rotate by age.

The command keeps verified local archives for 7 days. It keeps unverified data until an upload succeeds. R2 keeps uploaded objects indefinitely.

The default remote is `amp-runner-r2:amp-runner-logs`.

## Behavior

For each eligible runner, maintenance:

1. Reads each runner's log paths from its LaunchAgent, including a custom `--log-dir`.
2. Writes a private transaction record with the runner's previous loaded state.
3. Stops only that runner when it is loaded.
4. Moves both logs, recreates both active files with mode 0600, and restores the previous loaded state.
5. Marks the transaction ready only after both streams and runner state are safe.
6. Recovers incomplete transactions before starting a new rotation.
7. Compresses ready transactions to temporary files, then publishes digest-named archives atomically.
8. Uploads each archive with `rclone copyto --immutable` and verifies its remote compressed size.

R2 stores each object under this path:

```text
<hostname>/<runner-id>/YYYY/MM/DD/<UTC-timestamp>--<sha256>--<stream>.gz
```

The stream is `amp.jsonl` or `supervisor.log`. The path supports browsing by host, runner and date. The digest makes each name collision-safe and allows restore validation.

Maintenance warns when unuploaded data is older than 24 hours. It fails when pending data exceeds 5 GiB. It preserves an unsafe partial stream in the orphan directory for manual recovery. A process lock blocks overlapping runs and replaces stale locks.

## Permissions and side effects

The command stops and restarts eligible user LaunchAgents. It writes private local state and uploads sensitive logs. It does not need administrator access.

The install config stores only the remote name and trusted wrapper path. The LaunchAgent captures `HOME` and `PATH`. Neither file stores credentials. Uninstall preserves local and remote data.

## Examples

Run a check or inspect the last result, current phase, LaunchAgent and pending byte count:

```bash
amp-runner-logs run
amp-runner-logs status
```

Restore by object path relative to the configured bucket. You can also pass a complete `remote:path`:

```bash
amp-runner-logs restore HOST/RUNNER/YYYY/MM/DD/OBJECT_NAME /private/output/directory
```

Restore downloads without deleting remote content. It validates the compressed SHA-256 digest before decompression. Restored files use mode 0600.

Uninstalling removes only the maintenance LaunchAgent. It preserves pending files, local archives, configuration, and remote objects:

```bash
amp-runner-logs uninstall
```

## Troubleshooting

- if upload fails, inspect `~/.local/state/amp-runner-logs/maintenance.log` and run `amp-runner-logs run` after fixing rclone access
- if pending data exceeds 5 GiB, fix upload and rerun maintenance rather than deleting archives
- if the orphan directory contains files, recover or archive them manually before clearing the health failure
- if a restore digest fails, retain the remote object and investigate object corruption or an incorrect object name
- if `status` reports a failed or stale run, fix the recorded phase and run maintenance again

## Maintenance notes

This guide is the source of truth for the capability contract. `scripts/check-amp-runner-logs` verifies its downstream behavior.
