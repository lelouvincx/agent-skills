---
doc_schema: "amp-artifact/v2"
title: "Claude Opus 5.5"
slug: "claude-opus-5-5"
status: "active"
summary: "Registers an Amp high-mode agent that uses Claude Opus 5.5, GPT-6 Astra for Oracle, and GPT-5.6 Sol for subagents."
artifact:
  id: "claude-opus-5-5"
  type: "agent_mode"
  surface: "mode_picker"
  invocation: "new_thread_mode"
  api_stability: "experimental"
source:
  kind: "plugin"
  file: "plugins/claude-opus-5-5.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.experimental.registerAgentMode"
  metadata_comments:
    - "@amp-plugin — Claude Opus 5.5 agent mode."
    - "@amp-agent-mode {\"key\":\"claude-opus-5-5\",\"label\":\"Claude Opus 5.5\"}"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-09-23"
contract:
  input_kind: "user_prompt"
  output_kind: "agent_thread"
  trigger: "new_thread_mode"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: "claude-opus-5-5"
  model: "anthropic/claude-opus-5-5"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
    - "Amp high-mode prompt and tools"
    - "CreateAgentConfig.oracle model and effort pin"
    - "CreateAgentConfig.subagents model and effort pin"
  dependencies:
    - "experimental plugin API"
    - "anthropic/claude-opus-5-5 model availability"
    - "openai/gpt-6-astra model availability"
    - "openai/gpt-5.6-sol model availability"
  env: []
  reads:
    - "workspace files through selected tools"
  writes:
    - "workspace files when the agent uses its coding tools"
    - "shell side effects when Amp permissions allow them"
  network:
    - "Anthropic Claude Opus 5.5 through Amp"
    - "OpenAI GPT-6 Astra through Amp for Oracle calls"
    - "OpenAI GPT-5.6 Sol through Amp for subagent calls"
    - "web and MCP tools when the agent uses them"
  logs:
    - "plugin logger when the experimental API is unavailable"
safety:
  permission_level: "coding-agent"
  user_gate: "user selects agent mode"
  constraints:
    - "Requires amp.experimental."
    - "Extends Amp high mode and overrides the main model."
    - "Pins Oracle to openai/gpt-6-astra with medium effort."
    - "Pins Task, Finder, Read Thread, and Librarian to openai/gpt-5.6-sol with medium effort."
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

# Claude Opus 5.5

## Summary

`claude-opus-5-5` adds Claude Opus 5.5 to Amp's mode picker. It keeps Amp high mode's prompt, tools, and main-agent reasoning effort. It pins Oracle to GPT-6 Astra with medium effort and the other built-in subagents to GPT-5.6 Sol with medium effort.

## Invocation

- Surface: Amp mode picker
- Registered with: `amp.experimental.registerAgentMode`
- Mode key: `claude-opus-5-5`
- Label: `Claude Opus 5.5`
- Plugin file: `plugins/claude-opus-5-5.ts`

## Contract

The main agent uses `anthropic/claude-opus-5-5` and the `Claude Opus 5.5` display label. It extends Amp high mode, so it inherits that mode's system prompt, tool list, and main-agent reasoning effort. Oracle uses `openai/gpt-6-astra` with medium effort. Task, Finder, Read Thread, and Librarian use `openai/gpt-5.6-sol` with medium effort. The mode accepts a normal user prompt and starts an agent thread.

## Behavior

The plugin creates and registers this mode when `amp.experimental` is available. Otherwise, it logs a message and does not register the mode. If a pinned Oracle or subagent model is unavailable, Amp falls back to automatic routing at runtime.

## Permissions and side effects

This is a full coding agent. It can read and edit files, run shell commands, use web and MCP tools, and spawn Task subagents when Amp permissions allow these actions.

## Examples

Select `Claude Opus 5.5` when starting a thread, then enter a normal coding request.

## Troubleshooting

- If the mode is missing, check that the plugin loaded and `amp.experimental` is available.
- If a model fails, check that `anthropic/claude-opus-5-5`, `openai/gpt-6-astra`, and `openai/gpt-5.6-sol` appear in `amp plugins show-agent-options --json`.

## Maintenance notes

Keep the `@amp-agent-mode` metadata in sync with the registered key and label. Keep the main, Oracle, and subagent routing in `plugins/claude-opus-5-5.ts`. Do not copy a static high-mode prompt into the plugin; the mode should keep extending Amp high mode.
