---
doc_schema: "amp-plugin-capability/v1"
title: "RTK Rewrite"
slug: "rtk-rewrite"
status: "active"
summary: "Intercepts Bash tool calls and rewrites eligible commands through rtk rewrite before execution."
capability:
  id: "rtk-rewrite.tool-call"
  type: "event_handler"
  surface: "plugin_event_pipeline"
  invocation: "plugin_event"
  registration_api: "amp.on"
  api_stability: "stable"
plugin:
  file: "plugins/rtk-rewrite.ts"
  scope: "system"
  install_source: "local"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-06-28"
contract:
  input_kind: "plugin_event"
  output_kind: "tool_call_result"
  event: "tool.call"
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "amp.on('tool.call')"
    - "spawnSync: rtk --version"
    - "spawnSync: rtk rewrite -- <cmd>"
    - "ctx.logger.log"
  dependencies:
    - "rtk >= 0.23.0 on PATH; verified with rtk 0.42.4"
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
    - "Rule source of truth is rtk rewrite, not this plugin."
  risks:
    - "Automatically changes Bash command text before execution."
    - "Incorrect rtk rewrite rules could change command semantics."
related: []
tags:
  - "event-handler"
  - "bash"
  - "rtk"
  - "rewrite"
---

# RTK Rewrite

## Summary

`rtk-rewrite.tool-call` intercepts Bash tool calls before execution and asks `rtk rewrite` for a token-saving equivalent. The plugin modifies the Bash command only when `rtk` reports a rewrite that should proceed.

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
| `rtk rewrite` exit `0` with changed stdout | `{ action: "modify", input: { ...event.input, cmd: rewritten } }` |
| `rtk rewrite` exit `3` with changed stdout | same modify result; `rtk` classified the rewrite as ask/default |
| `rtk rewrite` exit `1`, `2`, or other | `{ action: "allow" }` |

The plugin checks `rtk --version` once and requires `rtk >= 0.23.0`. It is currently verified against `rtk 0.42.4`.

## Behavior

On plugin load, it checks whether `rtk` is available and new enough. If the check succeeds, it writes a best-effort cache marker and registers the `tool.call` handler. If the check fails, it logs a warning and disables itself.

For each Bash command, it runs `rtk rewrite -- <cmd>`. Exit code `0` means `rtk` found an explicitly allowed rewrite. Exit code `3` means `rtk` found an ask/default rewrite. In Amp, both cases modify the Bash input and then continue through Amp's normal tool execution path; exit codes `1` and `2` pass the original command through.

## Permissions and side effects

The handler runs local `rtk` processes and may alter Bash tool input before execution. It does not run the rewritten Bash command itself. It writes a versioned cache marker under `$XDG_CACHE_HOME` or `~/.cache` after a successful version check.

## Examples

Any Bash tool call can trigger the handler:

```json
{
  "tool": "Bash",
  "input": {
    "cmd": "some command that rtk can rewrite"
  }
}
```

If `rtk rewrite` returns a changed command with exit code `0`, Amp receives the modified Bash input.

## Troubleshooting

- Plugin disabled: install or upgrade `rtk` to at least `0.23.0`; Homebrew currently provides `0.42.4` via `brew upgrade rtk`.
- Command was not rewritten: run `rtk rewrite -- <cmd>` manually and inspect the exit code.
- Rewrite looks wrong: fix the `rtk` registry; this plugin intentionally delegates all rewrite logic to `rtk rewrite`.
- Cache looks stale: remove `$XDG_CACHE_HOME/rtk-hook-version-ok-0.23.0` or `~/.cache/rtk-hook-version-ok-0.23.0` and reload plugins.

## Maintenance notes

Do not add rewrite rules here. The source of truth is the `rtk rewrite` registry. Update this doc if the minimum or verified `rtk` version, exit-code protocol, Bash input field, or Amp `tool.call` result contract changes.
