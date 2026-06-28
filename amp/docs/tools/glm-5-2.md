---
doc_schema: "amp-plugin-capability/v1"
title: "GLM 5.2"
slug: "glm-5-2"
status: "active"
summary: "Registers an experimental GLM 5.2-backed Amp agent mode for implementation work."
capability:
  id: "glm-5.2"
  type: "agent_mode"
  surface: "mode_picker"
  invocation: "new_thread_mode"
  registration_api: "amp.experimental.registerAgentMode"
  api_stability: "experimental"
plugin:
  file: "plugins/glm-52-mode.ts"
  scope: "system"
  install_source: "ampcode.com/@amp/plugins/glm-52-mode.ts"
  metadata_comments:
    - "@amp-plugin updated automatically from https://ampcode.com/@amp/plugins/glm-52-mode.ts"
    - "@amp-agent-mode {\"key\":\"glm-5.2\",\"label\":\"GLM 5.2 (exp)\"}"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-06-24"
contract:
  input_kind: "user_prompt"
  output_kind: "agent_thread"
  event: null
  command_id: null
  agent_mode_key: "glm-5.2"
  model: "baseten/zai-org/GLM-5.2"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
    - "custom agent instructions"
  dependencies:
    - "experimental plugin API"
    - "baseten/zai-org/GLM-5.2 model availability"
  env: []
  reads:
    - "workspace files through selected tools"
  writes:
    - "workspace files through create_file/edit_file when the agent chooses those tools"
    - "shell side effects through Bash when approved by Amp permissions"
  network:
    - "Baseten GLM 5.2 model endpoint"
    - "web tools when invoked by the agent"
  logs:
    - "plugin logger on experimental API unavailability"
safety:
  permission_level: "coding-agent"
  user_gate: "user selects agent mode"
  constraints:
    - "Requires amp.experimental to be available."
    - "Uses a fixed tool list rather than all built-in tools."
    - "Reasoning effort is set to max."
  risks:
    - "Experimental agent-mode API may change."
    - "The mode can edit files and run shell commands through its tool list."
related:
  - "deepseek-v4-pro"
tags:
  - "agent-mode"
  - "glm"
  - "experimental"
---

# GLM 5.2

## Summary

`glm-5.2` registers an experimental Amp agent mode backed by `baseten/zai-org/GLM-5.2`. It is a full coding-agent mode with a custom implementation prompt, `max` reasoning effort, and a curated tool list.

## Invocation

- Surface: Amp mode picker
- Registered with: `amp.experimental.registerAgentMode`
- Agent created with: `amp.experimental.createAgent`
- Mode key: `glm-5.2`
- Label: `GLM 5.2 (exp)`
- Plugin file: `plugins/glm-52-mode.ts`

## Contract

Agent definition:

| Field | Value |
| --- | --- |
| `name` | `glm-5.2` |
| `model` | `baseten/zai-org/GLM-5.2` |
| `reasoningEffort` | `max` |
| `display.label` | `GLM 5.2 (exp)` |
| `display.color` | `#10a37f` |

Available tools:

```text
Read, finder, Bash, create_file, edit_file, web_search, read_web_page,
read_thread, find_thread, skill, oracle, librarian, view_media, painter
```

The static metadata comment includes a matching `@amp-agent-mode` entry, which Amp clients can use for mode discovery.

## Behavior

When the plugin loads, it checks `amp.experimental`. If unavailable, it logs `Experimental plugin API is not available.` and does not register the mode. If available, it creates a custom agent with the GLM 5.2 model, a senior-engineer coding prompt, the curated tool list, and then registers the agent mode.

## Permissions and side effects

This is a full coding agent. It can read files, create files, edit files, run Bash, use web tools, ask Oracle, call Librarian, inspect media, and use Painter if those tools are invoked and permitted by Amp. It can modify the workspace when the task calls for implementation.

## Examples

Use this mode when starting a new thread and you want to try the GLM 5.2 model for coding work. No JSON input is passed to this capability directly; the user prompt becomes the agent turn input.

Example prompt:

```text
Fix the failing test in this repository. Read the relevant code first, make the smallest change, and run the focused test.
```

## Troubleshooting

- Mode does not appear: confirm `amp.experimental` is available and the plugin loaded successfully.
- Model errors: verify `baseten/zai-org/GLM-5.2` appears in `amp plugins show-agent-options --json`.
- Tool unavailable: compare the tool list in `plugins/glm-52-mode.ts` with `amp plugins show-agent-options --json`.

## Maintenance notes

Because this uses `amp.experimental`, refresh this doc after Amp plugin API updates. Keep the `@amp-agent-mode` static metadata synchronized with the runtime `registerAgentMode` key and label.
