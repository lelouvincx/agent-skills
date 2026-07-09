---
doc_schema: "amp-plugin-capability/v1"
title: "DeepSeek V4 Pro"
slug: "deepseek-v4-pro"
status: "active"
summary: "Registers an experimental Amp agent mode that uses DeepSeek V4 Pro and mirrors Amp's deep-classic prompt and tools."
capability:
  id: "deepseek-v4-pro"
  type: "agent_mode"
  surface: "mode_picker"
  invocation: "new_thread_mode"
  registration_api: "amp.experimental.registerAgentMode"
  api_stability: "experimental"
plugin:
  file: "plugins/deepseek-v4-pro-mode.ts"
  scope: "system"
  install_source: "local"
  metadata_comments:
    - "@amp-plugin — DeepSeek V4 Pro agent mode."
    - "@amp-agent-mode {\"key\":\"deepseek-v4-pro\",\"label\":\"DeepSeek V4 Pro\"}"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-07-10"
contract:
  input_kind: "user_prompt"
  output_kind: "agent_thread"
  event: null
  command_id: null
  agent_mode_key: "deepseek-v4-pro"
  model: "baseten/deepseek-ai/DeepSeek-V4-Pro"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
    - "custom agent instructions"
  dependencies:
    - "experimental plugin API"
    - "baseten/deepseek-ai/DeepSeek-V4-Pro model availability"
  env: []
  reads:
    - "workspace files through selected tools"
  writes:
    - "workspace files through apply_patch when the agent chooses that tool"
    - "shell side effects through shell_command when approved by Amp permissions"
  network:
    - "Baseten DeepSeek V4 Pro model endpoint"
    - "web tools when invoked by the agent"
  logs:
    - "plugin logger on experimental API unavailability"
safety:
  permission_level: "coding-agent"
  user_gate: "user selects agent mode"
  constraints:
    - "Requires amp.experimental to be available."
    - "Mirrors Amp's deep-classic prompt and tools."
    - "Reasoning effort is set to xhigh."
  risks:
    - "Experimental agent-mode API may change."
    - "The mode can edit files and run shell commands through its tool list."
related: []
tags:
  - "agent-mode"
  - "deepseek"
  - "experimental"
---

# DeepSeek V4 Pro

## Summary

`deepseek-v4-pro` registers an experimental Amp agent mode. It uses `baseten/deepseek-ai/DeepSeek-V4-Pro`, mirrors Amp's `deep-classic` prompt and tools, and sets reasoning effort to `xhigh`.

## Invocation

- Surface: Amp mode picker
- Registered with: `amp.experimental.registerAgentMode`
- Agent created with: `amp.experimental.createAgent`
- Mode key: `deepseek-v4-pro`
- Label: `DeepSeek V4 Pro`
- Plugin file: `plugins/deepseek-v4-pro-mode.ts`

## Contract

Agent definition:

| Field | Value |
| --- | --- |
| `name` | `deepseek-v4-pro` |
| `model` | `baseten/deepseek-ai/DeepSeek-V4-Pro` |
| `reasoningEffort` | `xhigh` |
| `display.label` | `DeepSeek V4 Pro` |
| `display.color` | `#2563eb` |

Tools:

```text
shell_command
shell_command_status
apply_patch
web_search
read_web_page
Task
skill
load_plugin
read_thread
find_thread
librarian
oracle
finder
view_media
painter
archive_current_thread
manage_automation
send_message_to_agg
mcp__*
```

The static metadata comment includes a matching `@amp-agent-mode` entry. Amp clients can use this to discover the mode.

## Behavior

When the plugin loads, it checks `amp.experimental`. If the API is unavailable, it logs `Experimental plugin API is not available.` and does not register the mode.

If the API is available, the plugin creates a custom agent with the DeepSeek V4 Pro model, the Deep prompt and the Deep tool list. It then registers the agent mode.

## Permissions and side effects

This is a full coding agent. It can read files, edit files, run shell commands, spawn Task subagents, use web tools, ask Oracle, call Librarian, inspect media, use Painter, archive threads, manage automations, send messages to aggregated threads and use MCP tools.

It can modify the workspace when the task needs code changes and Amp permissions allow the tool call.

## Examples

Use this mode when you start a new thread and want DeepSeek V4 Pro with `xhigh` reasoning for coding work. The user prompt becomes the agent turn input. This capability does not take JSON input directly.

Example prompt:

```text
Fix the failing test in this repository. Read the relevant code first, make the smallest change, and run the focused test.
```

## Troubleshooting

- Mode does not appear: check that `amp.experimental` is available and the plugin loaded successfully.
- Model errors: check that `baseten/deepseek-ai/DeepSeek-V4-Pro` appears in `amp plugins show-agent-options --json`.
- Tool unavailable: compare the tool list in `plugins/deepseek-v4-pro-mode.ts` with `amp plugins show-agent-options --json`.

## Maintenance notes

This mode uses `amp.experimental`. Refresh this doc after Amp plugin API updates. Keep the `@amp-agent-mode` static metadata in sync with the runtime `registerAgentMode` key and label.

To refresh the Deep prompt and tools, install or update Amp's Deep Classic plugin:

```bash
amp plugins add --auto-update @amp/deep-classic
```

Then compare this plugin with `~/.config/amp/plugins/deep-classic.ts`. Treat that file as the local source for the latest Deep Classic prompt and tools.

Keep the copied prompt to the static instruction region from Amp's upstream `thread-actors/src/inference/system-prompts/deep.md.njk`. This mode should differ only by model, mode metadata and reasoning effort.
