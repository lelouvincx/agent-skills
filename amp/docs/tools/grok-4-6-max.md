---
doc_schema: "amp-artifact/v2"
title: "Grok 4.6 Max"
slug: "grok-4-6-max"
status: "active"
summary: "Registers an experimental Grok 4.6 mode with max reasoning effort and the latest Fable 5 prompt and tools."
artifact:
  id: "grok-4-6-max"
  type: "agent_mode"
  surface: "mode_picker"
  invocation: "new_thread_mode"
  api_stability: "experimental"
source:
  kind: "plugin"
  file: "plugins/grok-4-6-max-mode.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.experimental.registerAgentMode"
  metadata_comments:
    - "@amp-plugin — Grok 4.6 Max agent mode."
    - "@amp-agent-mode {\"key\":\"grok-4-6-max\",\"label\":\"Grok 4.6 Max\"}"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-09-03"
contract:
  input_kind: "user_prompt"
  output_kind: "agent_thread"
  trigger: "new_thread_mode"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: "grok-4-6-max"
  model: "xai/grok-4.6"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
    - "Fable 5 agent instructions and tools"
  dependencies:
    - "experimental plugin API"
    - "xai/grok-4.6 model availability"
  env: []
  reads:
    - "workspace files through selected tools"
  writes:
    - "workspace files when the agent uses its coding tools"
    - "shell side effects when Amp permissions allow them"
  network:
    - "xAI Grok 4.6 model endpoint"
    - "web and MCP tools when the agent uses them"
  logs:
    - "plugin logger when the experimental API is unavailable"
safety:
  permission_level: "coding-agent"
  user_gate: "user selects agent mode"
  constraints:
    - "Requires amp.experimental."
    - "Uses the Fable 5 prompt and tools."
    - "Sets reasoning effort to max."
  risks:
    - "The experimental agent-mode API may change."
    - "The mode can edit files and run shell commands."
related: []
tags:
  - "agent-mode"
  - "grok"
  - "xai"
  - "experimental"
---

# Grok 4.6 Max

## Summary

`grok-4-6-max` adds Grok 4.6 with `max` reasoning effort to Amp's mode picker. It uses the Fable 5 prompt and tools.

## Invocation

- Surface: Amp mode picker
- Registered with: `amp.experimental.registerAgentMode`
- Mode key: `grok-4-6-max`
- Label: `Grok 4.6 Max`
- Plugin file: `plugins/grok-4-6-max-mode.ts`

## Contract

The mode uses `xai/grok-4.6`, `max` reasoning effort and the `Grok 4.6 Max` display label. It accepts a normal user prompt and starts an agent thread.

## Behavior

The plugin creates and registers this mode when `amp.experimental` is available. Otherwise, it logs a message and does not register the mode.

## Permissions and side effects

This is a full coding agent. It can read and edit files, run shell commands, use web and MCP tools, and spawn Task subagents when Amp permissions allow these actions.

## Examples

Select `Grok 4.6 Max` when starting a thread, then enter a normal coding request.

## Troubleshooting

- If the mode is missing, check that the plugin loaded and `amp.experimental` is available.
- If the model fails, check that `xai/grok-4.6` appears in `amp plugins show-agent-options --json`.

## Maintenance notes

Keep the `@amp-agent-mode` metadata in sync with the registered key and label. Keep the Fable 5 prompt and tool list in `plugins/grok-4-6-max-mode.ts`.
