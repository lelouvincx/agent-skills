---
doc_schema: "amp-plugin-capability/v1"
title: "Smart Classic Agent Mode"
slug: "smart-classic-agent-mode"
status: "active"
summary: "Restores Amp's deprecated Smart mode as a selectable Claude Opus 4.8 agent mode."
capability:
  id: "smart-classic"
  type: "agent_mode"
  surface: "mode_picker"
  invocation: "new_thread_mode"
  registration_api: "amp.experimental.registerAgentMode"
  api_stability: "experimental"
plugin:
  file: "plugins/smart-classic.ts"
  scope: "system"
  install_source: "local"
  metadata_comments:
    - "@amp-agent-mode {\"key\":\"smart-classic\",\"label\":\"Smart (classic)\"}"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-07-12"
contract:
  input_kind: "thread_prompt"
  output_kind: "agent_thread"
  event: null
  command_id: null
  agent_mode_key: "smart-classic"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
  dependencies: []
  env: []
  reads: []
  writes: []
  network:
    - "Anthropic Claude Opus 4.8 through Amp"
  logs:
    - "Logs when the experimental plugin API is unavailable."
safety:
  permission_level: "workspace-write"
  user_gate: "manual mode selection"
  constraints:
    - "Uses the tools explicitly listed in the plugin."
    - "Uses high reasoning effort."
  risks:
    - "The experimental agent-mode API may change."
    - "The copied prompt and tool list can drift from Amp's former built-in mode."
related:
  - "deep-classic-agent-mode"
tags:
  - "agent-mode"
  - "anthropic"
  - "classic"
---

# Smart Classic Agent Mode

## Summary

`smart-classic` restores Amp's deprecated built-in Smart mode as `Smart (classic)`. It uses Claude Opus 4.8 with high reasoning effort and a static copy of the former Smart system instructions and tool list.

## Invocation

Select `Smart (classic)` from the mode picker when starting a thread. The plugin registers the mode through `amp.experimental.registerAgentMode`.

## Contract

The mode accepts normal thread prompts and runs `anthropic/claude-opus-4-8` with high reasoning effort. Its prompt and enabled tools are defined in `plugins/smart-classic.ts`; Amp appends the current workspace and environment context.

## Behavior

The plugin creates the `smart-classic` agent and exposes it under the same mode key. If Amp does not expose its experimental plugin API, the plugin logs a message and does not register the mode.

## Permissions and side effects

The agent can inspect and modify the workspace, execute commands, use configured MCP tools, access the network through enabled tools, and invoke other listed tools. These effects occur only after the user selects the mode and gives it a task.

## Examples

Start a new thread and select:

```text
Smart (classic)
```

## Troubleshooting

- Mode missing: reload plugins or restart Amp, then confirm the experimental plugin API is available.
- Model unavailable: confirm Amp currently supports `anthropic/claude-opus-4-8` for plugin agents.
- Behavior differs from old Smart: compare the copied prompt and tool list with the retired built-in mode.

## Maintenance notes

Keep this document in sync with `plugins/smart-classic.ts`. Update this document first before changing the model, reasoning effort, mode metadata, prompt, or tool access.

To refresh the plugin's system prompt, tool list, and model from Amp's maintained copy, run:

```bash
amp plugins add --auto-update @amp/smart-classic
```

After the update, review the runtime diff, document any contract changes here first, copy the resulting plugin into `amp/plugins/smart-classic.ts`, and run `./sync-skills.sh` so the repository remains the source of truth.
