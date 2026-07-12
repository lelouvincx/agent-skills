---
doc_schema: "amp-artifact/v2"
title: "Holistics Markdown Result Renderer"
slug: "holistics-md"
status: "active"
summary: "Rewrites selected Holistics MCP YAML result_data blocks into Markdown tables before the result reaches the model."
artifact:
  id: "holistics-md.tool-result"
  type: "event_handler"
  surface: "plugin_event_pipeline"
  invocation: "plugin_event"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/holistics-md.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.on"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-06-24"
contract:
  input_kind: "plugin_event"
  output_kind: "tool_result_result"
  trigger: "plugin_event"
  allowed_tools: []
  event: "tool.result"
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "amp.on('tool.result')"
    - "PluginToolResultContentBlock[]"
    - "ctx.logger.log"
  dependencies:
    - "Holistics CLI YAML result shape"
  env: []
  reads:
    - "tool result input command"
    - "tool result text output"
  writes:
    - "modified tool result output returned to Amp"
  network: []
  logs:
    - "rendered result_data log"
safety:
  permission_level: "tool-result-modifier"
  user_gate: "automatic event handler"
  constraints:
    - "Only handles successful tool results."
    - "Only matches holistics mcp execute_aql, execute_viz, and execute_viz_block commands."
    - "Only transforms text content blocks containing a parseable result_data block."
  risks:
    - "Malformed or unexpected YAML can be left unmodified."
    - "The model sees transformed table text rather than the original verbose result_data shape."
related:
  - "holistics-mcp-errors"
tags:
  - "event-handler"
  - "holistics"
  - "markdown"
  - "tool-result"
---

# Holistics Markdown Result Renderer

## Summary

`holistics-md.tool-result` transforms selected Holistics MCP command results by replacing verbose YAML `result_data:` blocks with Markdown tables. This makes query and visualization results easier for the model to read while preserving the surrounding YAML structure.

## Invocation

- Surface: plugin event pipeline
- Registered with: `amp.on`
- Event: `tool.result`
- Trigger: successful tool results whose input command matches `holistics mcp execute_aql`, `execute_viz`, or `execute_viz_block`
- Plugin file: `plugins/holistics-md.ts`

## Contract

Input is Amp's `ToolResultEvent`. The handler returns `undefined` when no change is needed, or returns:

```ts
{ status: 'done', output: newOutput }
```

Matching rules:

| Requirement | Value |
| --- | --- |
| `event.status` | `done` |
| command source | `event.input.cmd` or `event.input.command` |
| command regex | `holistics mcp ... (execute_aql|execute_viz|execute_viz_block)` |
| output shape | `PluginToolResultContentBlock[]` with text blocks |
| target block | YAML line `result_data:` with indented children |

## Behavior

The handler scans text output for a YAML `result_data:` block. It parses `fields`, optional `field_labels`, and `data` rows with a lightweight indentation-based parser. It renders headers from `field_labels` when present and length-matched; otherwise it uses `fields`. It then replaces the original block with a YAML literal scalar containing a Markdown table.

If parsing fails, the output is left unchanged. If at least one text block changes, the plugin logs that it rendered `result_data` as a Markdown table and returns the modified output.

## Permissions and side effects

This handler mutates the tool result seen by the model. It does not write files, call the network, or alter the original command execution. The side effect is limited to returning a transformed `tool.result` payload to Amp.

## Examples

Triggering command shape:

```text
holistics mcp execute_aql ...
```

Original result fragment:

```yaml
result_data:
  fields:
    - col_a
  field_labels:
    - A
  data:
    - - v1
```

Transformed result fragment:

```yaml
result_data: |
  | A |
  | --- |
  | v1 |
```

## Troubleshooting

- Output unchanged: confirm the command is one of the three matched Holistics MCP commands.
- Output unchanged despite a match: confirm the tool output is content blocks, not a bare string or object.
- Table headers look wrong: inspect whether `field_labels` length matches `fields`.
- Rows look truncated: inspect the YAML indentation; the parser expects the current Holistics CLI shape.

## Maintenance notes

Update this doc when Holistics CLI changes its YAML shape, command names, or `result_data` format. Keep this paired with `holistics-mcp-errors`, which observes a broader set of Holistics MCP results without mutating them.
