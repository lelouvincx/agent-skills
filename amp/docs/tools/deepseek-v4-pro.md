---
doc_schema: "amp-plugin-capability/v1"
title: "DeepSeek V4 Pro"
slug: "deepseek-v4-pro"
status: "active"
summary: "Registers an experimental DeepSeek V4 Pro-backed Amp agent mode for implementation work."
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
  last_verified: "2026-06-28"
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
    - "workspace files through create_file/edit_file when the agent chooses those tools"
    - "shell side effects through Bash when approved by Amp permissions"
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
    - "Uses the same fixed tool list as GLM 5.2."
    - "Uses the same custom agent instructions as GLM 5.2."
    - "Reasoning effort is set to xhigh."
  risks:
    - "Experimental agent-mode API may change."
    - "The mode can edit files and run shell commands through its tool list."
related:
  - "glm-5-2"
tags:
  - "agent-mode"
  - "deepseek"
  - "experimental"
---

# DeepSeek V4 Pro

## Summary

`deepseek-v4-pro` registers an experimental Amp agent mode backed by `baseten/deepseek-ai/DeepSeek-V4-Pro`. It uses the same senior-engineer implementation prompt and curated tool list as `glm-5.2`, with `xhigh` reasoning effort.

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

Available tools:

```text
Read, finder, Bash, create_file, edit_file, web_search, read_web_page,
read_thread, find_thread, skill, oracle, librarian, view_media, painter
```

The static metadata comment includes a matching `@amp-agent-mode` entry, which Amp clients can use for mode discovery.

## Behavior

When the plugin loads, it checks `amp.experimental`. If unavailable, it logs `Experimental plugin API is not available.` and does not register the mode. If available, it creates a custom agent with the DeepSeek V4 Pro model, the same senior-engineer coding prompt as GLM 5.2, the same curated tool list, and then registers the agent mode.

## Permissions and side effects

This is a full coding agent. It can read files, create files, edit files, run Bash, use web tools, ask Oracle, call Librarian, inspect media, and use Painter if those tools are invoked and permitted by Amp. It can modify the workspace when the task calls for implementation.

## Examples

Use this mode when starting a new thread and you want DeepSeek V4 Pro with xhigh reasoning for coding work. No JSON input is passed to this capability directly; the user prompt becomes the agent turn input.

Example prompt:

```text
Fix the failing test in this repository. Read the relevant code first, make the smallest change, and run the focused test.
```

## Troubleshooting

- Mode does not appear: confirm `amp.experimental` is available and the plugin loaded successfully.
- Model errors: verify `baseten/deepseek-ai/DeepSeek-V4-Pro` appears in `amp plugins show-agent-options --json`.
- Tool unavailable: compare the tool list in `plugins/deepseek-v4-pro-mode.ts` with `plugins/glm-52-mode.ts` and `amp plugins show-agent-options --json`.

## Maintenance notes

Because this uses `amp.experimental`, refresh this doc after Amp plugin API updates. Keep the `@amp-agent-mode` static metadata synchronized with the runtime `registerAgentMode` key and label. Keep the prompt and tool list synchronized with `plugins/glm-52-mode.ts`; this mode is intended to differ only by model identity, mode metadata, and reasoning effort.
