---
doc_schema: "amp-artifact/v2"
title: "GPT-5.5 XHigh"
slug: "gpt-5-5-xhigh"
status: "active"
summary: "Registers an experimental Amp agent mode that uses GPT-5.5 with xhigh reasoning effort."
artifact:
  id: "gpt-5-5-xhigh"
  type: "agent_mode"
  surface: "mode_picker"
  invocation: "new_thread_mode"
  api_stability: "experimental"
source:
  kind: "plugin"
  file: "plugins/gpt-5-5-modes.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.experimental.registerAgentMode"
  metadata_comments:
    - "@amp-agent-mode {\"key\":\"gpt-5-5-xhigh\",\"label\":\"GPT-5.5 XHigh\"}"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-08-21"
contract:
  input_kind: "user_prompt"
  output_kind: "agent_thread"
  trigger: "new_thread_mode"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: "gpt-5-5-xhigh"
  model: "openai/gpt-5.5"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
    - "Deep Classic agent instructions and tools"
  dependencies:
    - "experimental plugin API"
    - "openai/gpt-5.5 model availability"
  env: []
  reads:
    - "workspace files through selected tools"
  writes:
    - "workspace files when the agent uses its coding tools"
    - "shell side effects when Amp permissions allow them"
  network:
    - "OpenAI GPT-5.5 model endpoint"
    - "web and MCP tools when the agent uses them"
  logs:
    - "plugin logger when the experimental API is unavailable"
safety:
  permission_level: "coding-agent"
  user_gate: "user selects agent mode"
  constraints:
    - "Requires amp.experimental."
    - "Uses the Deep Classic prompt and tools."
    - "Sets reasoning effort to xhigh."
  risks:
    - "The experimental agent-mode API may change."
    - "The mode can edit files and run shell commands."
related:
  - "gpt-5-5-medium"
tags:
  - "agent-mode"
  - "openai"
  - "experimental"
---

# GPT-5.5 XHigh

## Summary

`gpt-5-5-xhigh` adds GPT-5.5 with `xhigh` reasoning effort to Amp's mode picker. It uses the Deep Classic prompt and tools.

## Invocation

- Surface: Amp mode picker
- Registered with: `amp.experimental.registerAgentMode`
- Mode key: `gpt-5-5-xhigh`
- Label: `GPT-5.5 XHigh`
- Plugin file: `plugins/gpt-5-5-modes.ts`

## Contract

The mode uses `openai/gpt-5.5`, `xhigh` reasoning effort and the `GPT-5.5 XHigh` display label. It accepts a normal user prompt and starts an agent thread.

## Behavior

The plugin creates and registers this mode when `amp.experimental` is available. Otherwise, it logs a message and does not register either GPT-5.5 mode.

## Permissions and side effects

This is a full coding agent. It can read and edit files, run shell commands, use web and MCP tools, and spawn Task subagents when Amp permissions allow these actions.

## Examples

Select `GPT-5.5 XHigh` when starting a thread, then enter a normal coding request.

## Troubleshooting

- If the mode is missing, check that the plugin loaded and `amp.experimental` is available.
- If the model fails, check that `openai/gpt-5.5` appears in `amp plugins show-agent-options --json`.

## Maintenance notes

Follow the shared maintenance contract in [GPT-5.5 Medium](./gpt-5-5-medium.md). Update this document first for xhigh-specific metadata or reasoning-effort changes.
