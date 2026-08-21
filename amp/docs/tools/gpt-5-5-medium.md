---
doc_schema: "amp-artifact/v2"
title: "GPT-5.5 Medium"
slug: "gpt-5-5-medium"
status: "active"
summary: "Registers an experimental GPT-5.5 mode with medium reasoning effort and the latest Fable 5 prompt and tools."
artifact:
  id: "gpt-5-5-medium"
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
    - "@amp-agent-mode {\"key\":\"gpt-5-5-medium\",\"label\":\"GPT-5.5 Medium\"}"
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
  agent_mode_key: "gpt-5-5-medium"
  model: "openai/gpt-5.5"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
    - "Fable 5 agent instructions and tools"
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
    - "Uses the Fable 5 prompt and tools."
    - "Sets reasoning effort to medium."
  risks:
    - "The experimental agent-mode API may change."
    - "The mode can edit files and run shell commands."
related:
  - "gpt-5-5-xhigh"
tags:
  - "agent-mode"
  - "openai"
  - "experimental"
---

# GPT-5.5 Medium

## Summary

`gpt-5-5-medium` adds GPT-5.5 with `medium` reasoning effort to Amp's mode picker. It uses the latest prompt and tools from `@amp/fable-mode`.

## Invocation

- Surface: Amp mode picker
- Registered with: `amp.experimental.registerAgentMode`
- Mode key: `gpt-5-5-medium`
- Label: `GPT-5.5 Medium`
- Plugin file: `plugins/gpt-5-5-modes.ts`

## Contract

The mode uses `openai/gpt-5.5`, `medium` reasoning effort and the `GPT-5.5 Medium` display label. It accepts a normal user prompt and starts an agent thread.

## Behavior

The plugin creates and registers this mode when `amp.experimental` is available. Otherwise, it logs a message and does not register either GPT-5.5 mode.

## Permissions and side effects

This is a full coding agent. It can read and edit files, run shell commands, use web and MCP tools, and spawn Task subagents when Amp permissions allow these actions.

## Examples

Select `GPT-5.5 Medium` when starting a thread, then enter a normal coding request.

## Troubleshooting

- If the mode is missing, check that the plugin loaded and `amp.experimental` is available.
- If the model fails, check that `openai/gpt-5.5` appears in `amp plugins show-agent-options --json`.

## Maintenance notes

`plugins/gpt-5-5-modes.ts` registers both modes. Keep `model`, `instructions`, and `tools` shared. Only mode metadata and `reasoningEffort` may differ. `FABLE_AGENT_PROMPT` and `FABLE_TOOL_NAMES` in that file own the shared implementation.

Update both capability documents before changing shared behavior. Update only the affected document for mode-specific metadata or reasoning effort. Finish by running the repository validation checks, `./sync-skills.sh`, and confirming that `amp plugins list` reports both modes active.

To refresh the prompt and tools, run `amp plugins add --auto-update @amp/fable-mode`. Compare `FABLE_AGENT_PROMPT` and `SMART_TOOL_NAMES` in `~/.config/amp/plugins/fable-mode.ts`, then update the repository-owned values. Do not depend on the installed plugin at runtime.
