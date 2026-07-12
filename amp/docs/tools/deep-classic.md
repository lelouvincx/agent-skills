---
doc_schema: "amp-plugin-capability/v1"
title: "Deep Classic Agent Mode"
slug: "deep-classic-agent-mode"
status: "active"
summary: "Restores Amp's deprecated Deep mode as a selectable GPT-5.5 agent mode."
capability:
  id: "deep-classic"
  type: "agent_mode"
  surface: "mode_picker"
  invocation: "new_thread_mode"
  registration_api: "amp.experimental.registerAgentMode"
  api_stability: "experimental"
plugin:
  file: "plugins/deep-classic.ts"
  scope: "system"
  install_source: "local"
  metadata_comments:
    - "@amp-agent-mode {\"key\":\"deep-classic\",\"label\":\"Deep (classic)\"}"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-07-12"
contract:
  input_kind: "thread_prompt"
  output_kind: "agent_thread"
  event: null
  command_id: null
  agent_mode_key: "deep-classic"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
  dependencies: []
  env: []
  reads: []
  writes: []
  network:
    - "OpenAI GPT-5.5 through Amp"
  logs:
    - "Logs when the experimental plugin API is unavailable."
safety:
  permission_level: "workspace-write"
  user_gate: "manual mode selection"
  constraints:
    - "Uses the tools explicitly listed in the plugin."
    - "Uses medium reasoning effort."
  risks:
    - "The experimental agent-mode API may change."
    - "The copied prompt and tool list can drift from Amp's former built-in mode."
related:
  - "smart-classic-agent-mode"
tags:
  - "agent-mode"
  - "openai"
  - "classic"
---

# Deep Classic Agent Mode

## Summary

`deep-classic` restores Amp's deprecated built-in Deep mode as `Deep (classic)`. It uses GPT-5.5 with medium reasoning effort and a static copy of the former Deep system instructions and tool list.

## Invocation

Select `Deep (classic)` from the mode picker when starting a thread. The plugin registers the mode through `amp.experimental.registerAgentMode`.

## Contract

The mode accepts normal thread prompts and runs `openai/gpt-5.5` with medium reasoning effort. Its prompt and enabled tools are defined in `plugins/deep-classic.ts`; Amp appends the current workspace and environment context.

## Behavior

The plugin creates the `deep-classic` agent and exposes it under the same mode key. If Amp does not expose its experimental plugin API, the plugin logs a message and does not register the mode.

## Permissions and side effects

The agent can inspect and modify the workspace, execute commands, use configured MCP tools, access the network through enabled tools, and invoke other listed tools. These effects occur only after the user selects the mode and gives it a task.

## Examples

Start a new thread and select:

```text
Deep (classic)
```

## Troubleshooting

- Mode missing: reload plugins or restart Amp, then confirm the experimental plugin API is available.
- Model unavailable: confirm Amp currently supports `openai/gpt-5.5` for plugin agents.
- Behavior differs from old Deep: compare the copied prompt and tool list with the retired built-in mode.

## Maintenance notes

Keep this document in sync with `plugins/deep-classic.ts`. Update this document first before changing the model, reasoning effort, mode metadata, prompt, or tool access.
