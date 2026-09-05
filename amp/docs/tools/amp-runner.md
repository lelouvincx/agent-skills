---
doc_schema: "amp-artifact/v2"
title: "Amp Runner"
slug: "amp-runner"
status: "active"
summary: "Runs named Amp background runners as user LaunchAgents with crash recovery, private logs, and AC-only sleep prevention."
artifact:
  id: "amp-runner"
  type: "local_cli"
  surface: "shell"
  invocation: "cli"
  api_stability: "stable"
source:
  kind: "script"
  file: "bin/amp-runner"
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
  output_kind: "launchagent_state_and_logs"
  trigger: "cli"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
  required_inputs:
    - "command"
  optional_inputs:
    - "runner ID"
    - "working directory"
    - "log level"
    - "log directory"
    - "extra Amp arguments"
runtime:
  uses:
    - "launchctl"
    - "caffeinate -s"
    - "Amp --no-tui --runner-id"
  dependencies:
    - "macOS user LaunchAgents"
    - "Amp CLI"
  env:
    - "AMP_NO_TUI"
    - "AMP_LOG_LEVEL"
    - "AMP_LOG_FILE"
    - "AMP_RUNNER_* test and path overrides"
  reads:
    - "current PATH and HOME during installation"
    - "installed runner LaunchAgent state"
  writes:
    - "~/Library/LaunchAgents/com.ampcode.runner.<runner-id>.plist"
    - "~/.cache/amp/logs/runners/<runner-id>.log"
    - "~/.cache/amp/logs/runners/<runner-id>.supervisor.log"
  network: []
  logs:
    - "Amp structured log"
    - "LaunchAgent supervisor log"
safety:
  permission_level: "local-process-management"
  user_gate: "manual shell invocation or explicit agent instruction"
  constraints:
    - "Runner IDs may contain only letters, numbers, dots, underscores, and hyphens."
    - "The launcher owns Amp's runner ID, log level, log file, and no-TUI arguments."
    - "Installation captures PATH and HOME but does not copy secret environment variables."
    - "Log directories use mode 0700; log files and LaunchAgent plists use mode 0600."
    - "caffeinate -s prevents system sleep only while the Mac uses AC power."
  risks:
    - "Structured and supervisor logs can contain sensitive local execution details."
    - "KeepAlive restarts a runner after failure until the LaunchAgent is stopped or uninstalled."
related: []
tags:
  - "background-runner"
  - "launchd"
  - "macos"
  - "observability"
---

# Amp Runner

## Summary

`amp-runner` manages named Amp background runners as macOS user LaunchAgents. Each runner starts at login and restarts after failure.

The launcher wraps Amp with `caffeinate -s`. AC power keeps the Mac awake while the runner is active. Battery power keeps normal macOS sleep behaviour.

## Invocation

- Surface: shell
- Command: `amp-runner`
- Source: `bin/amp-runner`
- Projection: `~/.local/bin/amp-runner`

Use these commands:

- `install` writes the LaunchAgent and starts it
- `list` shows every installed runner with its LaunchAgent state, process ID, CPU usage, and resident memory usage
- `start`, `stop`, and `restart` control an installed runner
- `restart all` restarts every installed runner
- `status` prints the LaunchAgent state
- `logs` follows the Amp and supervisor logs
- `uninstall` stops the runner and removes its LaunchAgent while preserving logs

## Contract

Pass a runner ID to every command except `list`. Use `all` with `restart` to restart every installed runner.

`install` also accepts a working directory and extra Amp arguments.

```bash
amp-runner install --workdir /path/to/project macbook.project-name
```

Runner IDs may contain letters, numbers, dots, underscores, and hyphens. The default log level is `info`. The default log directory is `~/.cache/amp/logs/runners/`.

Use `--debug` or `--log-level debug` during an incident. Reinstall without that option when the incident window ends.

## Behavior

`install` creates `com.ampcode.runner.<runner-id>.plist` under `~/Library/LaunchAgents/`. It records the working directory, current `PATH`, current `HOME`, Amp executable, log settings, and approved extra Amp arguments.

The LaunchAgent runs Amp with `--no-tui` and the supplied runner ID. `KeepAlive` restarts the process after failure. A 10-second throttle limits restart loops.

`list` sums CPU and resident memory across the LaunchAgent process and all of its descendants, including `caffeinate`, Amp, and child processes. Resource values are unavailable for runners that are not loaded or have no live process.

Amp writes structured records to `<runner-id>.log`. The LaunchAgent writes startup and supervisor output to `<runner-id>.supervisor.log`.

## Permissions and side effects

The launcher creates, loads, restarts, and removes user LaunchAgents. It starts local Amp and `caffeinate` processes. It does not need administrator access.

Installation captures `PATH` so plugins and MCP servers can find commands such as `npx`. It captures `HOME` for normal user-path resolution. It does not copy secret environment variables into the plist.

Treat both log files as sensitive. They can contain local paths, prompts, tool activity, and failure details.

## Examples

Install and inspect a runner:

```bash
amp-runner install --workdir /Users/lelouvincx/Developer/agent-skills macbook.agent-skills
amp-runner list
amp-runner status macbook.agent-skills
amp-runner restart all
amp-runner logs macbook.agent-skills
```

Collect temporary debug logs:

```bash
amp-runner install --debug --workdir /Users/lelouvincx/Developer/agent-skills macbook.agent-skills
amp-runner install --workdir /Users/lelouvincx/Developer/agent-skills macbook.agent-skills
```

Pass an extra Amp option after `--`:

```bash
amp-runner install macbook.agent-skills -- --no-ide
```

## Troubleshooting

- Runner is missing: run `amp-runner install` with its working directory and runner ID.
- Runner is not loaded: run `amp-runner start <runner-id>`.
- Runner exits repeatedly: inspect both log files, then reinstall with `--debug` for a bounded incident window.
- Plugins or MCP servers cannot find commands: reinstall from a shell whose `PATH` contains those commands.
- Mac sleeps while plugged in: confirm the runner process includes `caffeinate -s` and the LaunchAgent is running.
- `logs` cannot find files after a custom `--log-dir`: follow the files in that custom directory directly.

## Maintenance notes

Keep this document aligned with `bin/amp-runner`, `scripts/check-amp-runner`, the root README, and the projected command contract in `sync-skills.sh`. Update the `local_cli` schema invariant if the invocation surface changes.
