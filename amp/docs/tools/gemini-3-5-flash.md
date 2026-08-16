---
doc_schema: "amp-artifact/v2"
title: "Gemini 3.5 Flash"
slug: "gemini-3-5-flash"
status: "active"
summary: "Registers an experimental Amp agent mode that uses Gemini 3.5 Flash and mirrors Amp's Fable prompt and tools."
artifact:
  id: "gemini-3-5-flash"
  type: "agent_mode"
  surface: "mode_picker"
  invocation: "new_thread_mode"
  api_stability: "experimental"
source:
  kind: "plugin"
  file: "plugins/gemini-3-5-flash-mode.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.experimental.registerAgentMode"
  metadata_comments:
    - "@amp-plugin — Gemini 3.5 Flash agent mode."
    - "@amp-agent-mode {\"key\":\"gemini-3-5-flash\",\"label\":\"Gemini 3.5 Flash\"}"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-08-16"
contract:
  input_kind: "user_prompt"
  output_kind: "agent_thread"
  trigger: "new_thread_mode"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: "gemini-3-5-flash"
  model: "google-vertex/gemini-3.5-flash"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
    - "custom agent instructions"
  dependencies:
    - "experimental plugin API"
    - "google-vertex/gemini-3.5-flash model availability"
  env: []
  reads:
    - "workspace files through selected tools"
  writes:
    - "workspace files through create_file and edit_file when the agent chooses those tools"
    - "shell side effects through shell_command when approved by Amp permissions"
  network:
    - "Google Vertex Gemini 3.5 Flash model endpoint"
    - "web tools when invoked by the agent"
  logs:
    - "plugin logger on experimental API unavailability"
safety:
  permission_level: "coding-agent"
  user_gate: "user selects agent mode"
  constraints:
    - "Requires amp.experimental to be available."
    - "Mirrors Amp's Fable prompt and tools."
    - "Reasoning effort is set to xhigh."
  risks:
    - "Experimental agent-mode API may change."
    - "The mode can edit files and run shell commands through its tool list."
related: []
tags:
  - "agent-mode"
  - "gemini"
  - "experimental"
---

# Gemini 3.5 Flash

## Summary

`gemini-3-5-flash` registers an experimental Amp agent mode. It uses `google-vertex/gemini-3.5-flash`, mirrors Amp's Fable prompt and tools, and sets reasoning effort to `xhigh`.

## Invocation

- Surface: Amp mode picker
- Registered with: `amp.experimental.registerAgentMode`
- Agent created with: `amp.experimental.createAgent`
- Mode key: `gemini-3-5-flash`
- Label: `Gemini 3.5 Flash`
- Plugin file: `plugins/gemini-3-5-flash-mode.ts`

## Contract

Agent definition:

| Field | Value |
| --- | --- |
| `name` | `gemini-3-5-flash` |
| `model` | `google-vertex/gemini-3.5-flash` |
| `reasoningEffort` | `xhigh` |
| `display.label` | `Gemini 3.5 Flash` |
| `display.color` | `#4285f4` |

Tools:

```text
finder
shell_command
shell_command_status
create_file
edit_file
web_search
read_web_page
read_thread
find_thread
skill
oracle
librarian
Task
view_media
painter
read_mcp_resource
archive_current_thread
send_message_to_agg
mcp__*
```

The static metadata comment includes a matching `@amp-agent-mode` entry. Amp clients can use this to discover the mode.

## Behavior

When the plugin loads, it checks `amp.experimental`. If the API is unavailable, it logs `Experimental plugin API is not available.` and does not register the mode.

If the API is available, the plugin creates a custom agent with the Gemini 3.5 Flash model, the Fable prompt and the Fable tool list. It then registers the agent mode.

The Fable prompt calibrates action to user intent. It answers pure questions without editing files and treats clear requests to build or change something as instructions. It requires a design pass before substantial features or architecture changes unless the user asks for immediate implementation.

For implementation work, the prompt requires source-backed investigation, repository-first conventions, simple designs, explicit side effects and proportional verification. It also requires the agent to state assumptions, protect shared or destructive actions and report results honestly.

## Permissions and side effects

This is a full coding agent. It can read and edit files, run shell commands, spawn Task subagents, use web tools, ask Oracle, call Librarian, inspect media, use Painter, read MCP resources, archive threads, send messages to aggregated threads and use MCP tools.

It can modify the workspace when the task needs code changes and Amp permissions allow the tool call.

## Examples

Use this mode when you start a new thread and want Gemini 3.5 Flash with `xhigh` reasoning for coding work. The user prompt becomes the agent turn input. This capability does not take JSON input directly.

Example prompt:

```text
Fix the failing test in this repository. Read the relevant code first, make the smallest change, and run the focused test.
```

## Troubleshooting

- Mode does not appear: check that `amp.experimental` is available and the plugin loaded successfully.
- Plugin load errors: run `amp plugins list`; syntax or runtime errors appear next to `gemini-3-5-flash-mode.ts`.
- Model errors: check that `google-vertex/gemini-3.5-flash` appears in `amp plugins show-agent-options --json`.
- Tool unavailable: compare the tool list in `plugins/gemini-3-5-flash-mode.ts` with `amp plugins show-agent-options --json`.

## Maintenance notes

This mode uses `amp.experimental`. Refresh this document after Amp plugin API updates. Keep the `@amp-agent-mode` static metadata in sync with the runtime `registerAgentMode` key and label.

To refresh the Fable prompt and tools, install or update Amp's Fable plugin:

```bash
amp plugins add --auto-update @amp/fable-mode
```

Then compare this plugin with `~/.config/amp/plugins/fable-mode.ts`. Treat `FABLE_AGENT_PROMPT` and `SMART_TOOL_NAMES` in that file as the local source for the latest Fable prompt and tools.

Copy the complete `FABLE_AGENT_PROMPT` and `SMART_TOOL_NAMES` values. This mode should differ only by model, mode metadata and reasoning effort.

When copying prompt text into the plugin's TypeScript template literal, escape any literal backtick as `\`` and keep the closing template delimiter visible before the tool list. A malformed prompt string prevents the plugin from loading.
