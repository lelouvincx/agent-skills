---
doc_schema: "amp-artifact/v2"
title: "RTK Rewrite"
slug: "rtk-rewrite"
status: "active"
summary: "Intercepts Bash tool calls, rewrites compatible git diff commands to sem diff, then rewrites remaining eligible commands through rtk rewrite."
artifact:
  id: "rtk-rewrite.tool-call"
  type: "event_handler"
  surface: "plugin_event_pipeline"
  invocation: "plugin_event"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/rtk-rewrite.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.on"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-09-17"
contract:
  input_kind: "plugin_event"
  output_kind: "tool_call_result"
  trigger: "plugin_event"
  allowed_tools: []
  event: "tool.call"
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "amp.on('tool.call')"
    - "spawnSync: sem --version"
    - "spawnSync: rtk --version"
    - "spawnSync: rtk rewrite -- <cmd>"
    - "ctx.logger.log"
  dependencies:
    - "optional sem on PATH; verified with sem 0.24.0"
    - "optional rtk >= 0.23.0 on PATH; verified with rtk 0.49.0"
  env:
    - "XDG_CACHE_HOME"
  reads:
    - "Bash tool input cmd"
    - "rtk rewrite registry through rtk binary"
  writes:
    - "$XDG_CACHE_HOME/rtk-hook-version-ok-0.23.0 or ~/.cache/rtk-hook-version-ok-0.23.0"
  network: []
  logs:
    - "plugin warning logs"
    - "rewrite logs"
safety:
  permission_level: "tool-call-modifier"
  user_gate: "automatic event handler"
  constraints:
    - "Only handles Bash tool calls with a non-empty cmd string."
    - "Does not execute the rewritten command; Amp continues tool execution."
    - "Rewrites a git diff segment to sem diff only when every remaining flag is --cached, --staged, or --."
    - "Rule source of truth for other commands is rtk rewrite, not this plugin."
  risks:
    - "Automatically changes Bash command text before execution."
    - "sem diff reports entity-level changes, not a unified patch."
    - "Incorrect rtk rewrite rules could change command semantics."
related: []
tags:
  - "event-handler"
  - "bash"
  - "rtk"
  - "sem"
  - "git"
  - "rewrite"
---

# RTK Rewrite

## Summary

`rtk-rewrite.tool-call` intercepts Bash tool calls before execution. It rewrites compatible `git diff` segments to `sem diff`, then asks `rtk rewrite` for a token-saving equivalent of the remaining command. The plugin modifies the Bash command only when either step produces a changed command.

## Invocation

- Surface: plugin event pipeline
- Registered with: `amp.on`
- Event: `tool.call`
- Target tool: `Bash`
- Plugin file: `plugins/rtk-rewrite.ts`

## Contract

Input is Amp's `ToolCallEvent`. The handler returns a `ToolCallResult`:

| Condition | Return value |
| --- | --- |
| Non-Bash tool | `{ action: "allow" }` |
| Missing or empty `cmd` | `{ action: "allow" }` |
| Compatible `git diff` rewritten to `sem diff` | `{ action: "modify", input: { ...event.input, cmd: rewritten } }` unless `rtk rewrite` later changes it again |
| `rtk rewrite` exit `0` with changed stdout | `{ action: "modify", input: { ...event.input, cmd: rewritten } }` |
| `rtk rewrite` exit `3` with changed stdout | same modify result; `rtk` classified the rewrite as ask/default |
| `rtk rewrite` exit `1`, `2`, or other, and no `sem` rewrite | `{ action: "allow" }` |

The plugin checks `sem --version` and `rtk --version` once. It registers the handler when at least one binary is available. It requires `rtk >= 0.23.0` when `rtk` is present. It is currently verified against `sem 0.24.0` and `rtk 0.49.0`.

## Behavior

On plugin load, it checks `sem` and `rtk`. If `rtk` is present and new enough, it writes a best-effort cache marker. If neither binary is usable, it logs a warning and disables itself.

For each Bash command:

1. If `sem` is available, rewrite each top-level command segment that is a compatible `git diff` or `rtk git diff` into `sem diff`. Keep `&&`, `||`, `|`, and `;` compounds. Drop `command`, a leading `rtk` before `git`, and `git --no-pager`. Map `git -C <dir>` to `sem diff -C <dir>`. Keep `--cached`, `--staged`, `--`, refs, pathspecs, and redirections such as `2>&1`. Leave the segment unchanged when any other flag is present.
2. If `rtk` is available, run `rtk rewrite -- <cmd>` on the result. Exit code `0` means `rtk` found an explicitly allowed rewrite. Exit code `3` means `rtk` found an ask/default rewrite. In Amp, both cases modify the Bash input and then continue through Amp's normal tool execution path; exit codes `1` and `2` pass the current command through.

`sem diff` is not a unified patch. Commands that need line-level git output, such as `git diff --stat` or `git diff -U3`, keep their extra flags and skip the `sem` overlay.

## Permissions and side effects

The handler may run local `sem` and `rtk` version checks and may alter Bash tool input before execution. It does not run the rewritten Bash command itself. It writes a versioned cache marker under `$XDG_CACHE_HOME` or `~/.cache` after a successful `rtk` version check.

## Examples

A compatible git diff becomes `sem diff` before `rtk rewrite` runs:

```json
{
  "tool": "Bash",
  "input": {
    "cmd": "git diff"
  }
}
```

Amp receives `sem diff`.

A git diff with an unsupported flag is left for `rtk rewrite`:

```json
{
  "tool": "Bash",
  "input": {
    "cmd": "git diff --stat"
  }
}
```

If `rtk rewrite` returns `rtk git diff --stat` with exit code `0` or `3`, Amp receives that rewritten command.

## Troubleshooting

- Plugin disabled: install `sem`, or install or upgrade `rtk` to at least `0.23.0`; Homebrew currently provides `rtk 0.49.0` via `brew upgrade rtk`.
- `git diff` stayed on git or became `rtk git diff`: the command has a flag `sem diff` does not accept, or `sem` is not on `PATH`.
- Other command was not rewritten: run `rtk rewrite -- <cmd>` manually and inspect the exit code.
- Rewrite looks wrong for a non-diff command: fix the `rtk` registry; this plugin delegates those rules to `rtk rewrite`.
- Cache looks stale: remove `$XDG_CACHE_HOME/rtk-hook-version-ok-0.23.0` or `~/.cache/rtk-hook-version-ok-0.23.0` and reload plugins.

## Maintenance notes

Keep the `git diff` to `sem diff` overlay in this plugin. `rtk rewrite` maps `git diff` to `rtk git diff`, so the overlay must run first. Do not add other rewrite rules here. Update this doc if the `sem` mapping, minimum or verified `rtk` version, exit-code protocol, Bash input field, or Amp `tool.call` result contract changes.
