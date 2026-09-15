---
doc_schema: "amp-artifact/v2"
title: "Claude Opus 4.6"
slug: "claude-opus-4-6"
status: "active"
summary: "Registers an experimental Amp high-mode agent that uses Claude Opus 4.6."
artifact:
  id: "claude-opus-4-6"
  type: "agent_mode"
  surface: "mode_picker"
  invocation: "new_thread_mode"
  api_stability: "experimental"
source:
  kind: "plugin"
  file: "plugins/claude-opus-4-6.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.experimental.registerAgentMode"
  metadata_comments:
    - "@amp-plugin — Claude Opus 4.6 agent mode."
    - "@amp-agent-mode {\"key\":\"claude-opus-4-6\",\"label\":\"Claude Opus 4.6\"}"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-09-15"
contract:
  input_kind: "user_prompt"
  output_kind: "agent_thread"
  trigger: "new_thread_mode"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: "claude-opus-4-6"
  model: "anthropic/claude-opus-4-6"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
    - "Amp high-mode prompt and tools"
  dependencies:
    - "experimental plugin API"
    - "anthropic/claude-opus-4-6 model availability"
  env: []
  reads:
    - "workspace files through selected tools"
  writes:
    - "workspace files when the agent uses its coding tools"
    - "shell side effects when Amp permissions allow them"
  network:
    - "Anthropic Claude Opus 4.6 through Amp"
    - "web and MCP tools when the agent uses them"
  logs:
    - "plugin logger when the experimental API is unavailable"
safety:
  permission_level: "coding-agent"
  user_gate: "user selects agent mode"
  constraints:
    - "Requires amp.experimental."
    - "Extends Amp high mode and overrides only the model."
  risks:
    - "The experimental agent-mode API may change."
    - "The mode can edit files and run shell commands."
related: []
tags:
  - "agent-mode"
  - "anthropic"
  - "claude"
  - "experimental"
---

# Claude Opus 4.6

## Summary

`claude-opus-4-6` adds Claude Opus 4.6 to Amp's mode picker. It keeps Amp high mode's prompt, tools, and reasoning effort, and changes only the model.

## Invocation

- Surface: Amp mode picker
- Registered with: `amp.experimental.registerAgentMode`
- Mode key: `claude-opus-4-6`
- Label: `Claude Opus 4.6`
- Plugin file: `plugins/claude-opus-4-6.ts`

## Contract

The mode uses `anthropic/claude-opus-4-6` and the `Claude Opus 4.6` display label. It extends Amp high mode, so it inherits that mode's system prompt, tool list, and reasoning effort. It accepts a normal user prompt and starts an agent thread.

## Behavior

The plugin creates and registers this mode when `amp.experimental` is available. Otherwise, it logs a message and does not register the mode.

## Permissions and side effects

This is a full coding agent. It can read and edit files, run shell commands, use web and MCP tools, and spawn Task subagents when Amp permissions allow these actions.

## Examples

Select `Claude Opus 4.6` when starting a thread, then enter a normal coding request.

## Troubleshooting

- If the mode is missing, check that the plugin loaded and `amp.experimental` is available.
- If the model fails, check that `anthropic/claude-opus-4-6` appears in `amp plugins show-agent-options --json`.

## Maintenance notes

Keep the `@amp-agent-mode` metadata in sync with the registered key and label. Keep the model override in `plugins/claude-opus-4-6.ts`. Do not copy a static high-mode prompt into the plugin; the mode should keep extending Amp high mode.
