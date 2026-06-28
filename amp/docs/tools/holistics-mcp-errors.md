---
doc_schema: "amp-plugin-capability/v1"
title: "Holistics MCP Error Logger"
slug: "holistics-mcp-errors"
status: "active"
summary: "Logs hard and soft failures from holistics mcp CLI calls to an append-only JSONL file."
capability:
  id: "holistics-mcp-errors.tool-result"
  type: "event_handler"
  surface: "plugin_event_pipeline"
  invocation: "plugin_event"
  registration_api: "amp.on"
  api_stability: "stable"
plugin:
  file: "plugins/holistics-mcp-errors.ts"
  scope: "system"
  install_source: "local"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-06-24"
contract:
  input_kind: "plugin_event"
  output_kind: "void"
  event: "tool.result"
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "amp.on('tool.result')"
    - "node:fs/promises appendFile"
    - "ctx.logger.log"
  dependencies:
    - "Holistics CLI output conventions"
  env: []
  reads:
    - "tool result input command"
    - "tool result status/error/output"
  writes:
    - "~/.config/amp/logs/holistics-mcp-errors.jsonl"
  network: []
  logs:
    - "JSONL failure log"
    - "plugin logger status"
safety:
  permission_level: "observability-logger"
  user_gate: "automatic event handler"
  constraints:
    - "Matches any holistics mcp command."
    - "Logs hard failures and soft errors only."
    - "Never mutates the tool result."
  risks:
    - "The JSONL log can contain command input and output excerpts."
    - "Soft-error YAML detection is intentionally lightweight."
related:
  - "holistics-md"
tags:
  - "event-handler"
  - "holistics"
  - "logging"
  - "tool-result"
---

# Holistics MCP Error Logger

## Summary

`holistics-mcp-errors.tool-result` observes Holistics MCP tool results and appends hard or soft failures to `~/.config/amp/logs/holistics-mcp-errors.jsonl`. It is pure observability and never changes the tool result sent back to the model.

## Invocation

- Surface: plugin event pipeline
- Registered with: `amp.on`
- Event: `tool.result`
- Trigger: any tool result whose input command matches `holistics mcp <tool>`
- Plugin file: `plugins/holistics-mcp-errors.ts`

## Contract

Input is Amp's `ToolResultEvent`. The handler returns `undefined` in all cases.

Matching rules:

| Requirement | Value |
| --- | --- |
| command source | `event.input.cmd` or `event.input.command` |
| command regex | `holistics mcp` with optional flags before the MCP tool name |
| hard failure | `event.status` is `error` or `cancelled`, or output contains a non-zero `<exitCode>` |
| soft failure | `event.status` is `done` but JSON/YAML output has a non-empty `errors` field |

Log entry fields include timestamp, thread ID, tool use ID, Amp tool name, Holistics MCP tool name, command, status, failure kind, optional error, input, optional parsed output errors, and output excerpt.

## Behavior

The handler extracts the CLI command, identifies the Holistics MCP tool name, concatenates text output, checks for hard failures, then checks for soft errors. JSON output is parsed first; if that fails, a lightweight YAML probe looks for a top-level non-empty `errors:` key.

When a failure is found, the plugin creates the log directory if needed and appends one JSON object per line. Write failures are reported through the plugin logger but do not affect the original tool result.

## Permissions and side effects

This handler writes an append-only local log file. It may store command input and output excerpts, so treat the log as potentially sensitive. It does not mutate tool output and does not call external services.

## Examples

Hard failure trigger:

```text
holistics mcp execute_aql ...
```

with a failed tool status, cancelled status, or non-zero `<exitCode>` in output.

Soft failure trigger:

```yaml
errors:
  - message: Validation failed
```

Log file location:

```text
~/.config/amp/logs/holistics-mcp-errors.jsonl
```

## Troubleshooting

- No log entry: confirm the command contains `holistics mcp` and that a hard or soft failure was detected.
- Soft error missed: inspect whether `errors` is top-level JSON/YAML and non-empty.
- Log write failed: check permissions on `~/.config/amp/logs`.
- Duplicate entries: each matching failed tool result appends one line; dedupe downstream if needed.

## Maintenance notes

Update this doc when Holistics CLI changes command format, error envelope shape, or output encoding. Keep the sensitivity warning current because the log includes input and output excerpts.
