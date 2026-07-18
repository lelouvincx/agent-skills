---
doc_schema: "amp-artifact/v2"
title: "Inkling Agent Mode"
slug: "inkling-agent-mode"
status: "active"
summary: "Registers an experimental Amp agent mode backed by Thinking Machines Inkling."
artifact:
  id: "inkling"
  type: "agent_mode"
  surface: "mode_picker"
  invocation: "new_thread_mode"
  api_stability: "experimental"
source:
  kind: "plugin"
  file: "plugins/inkling-mode.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.experimental.registerAgentMode"
  metadata_comments:
    - "@amp-plugin — Inkling agent mode."
    - "@amp-agent-mode {\"key\":\"inkling\",\"label\":\"Inkling\"}"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-07-16"
contract:
  input_kind: "thread_prompt"
  output_kind: "agent_thread"
  trigger: "new_thread_mode"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: "inkling"
  model: "baseten/thinkingmachines/inkling"
runtime:
  uses:
    - "amp.experimental.createAgent"
    - "amp.experimental.registerAgentMode"
    - "custom agent instructions"
  dependencies:
    - "experimental plugin API"
    - "baseten/thinkingmachines/inkling model availability"
  env: []
  reads:
    - "workspace files through selected tools"
  writes:
    - "workspace files through create_file and edit_file when the agent chooses those tools"
    - "shell side effects through shell_command when approved by Amp permissions"
  network:
    - "Baseten Inkling model endpoint"
    - "web tools when invoked by the agent"
  logs:
    - "plugin logger on experimental API unavailability"
safety:
  permission_level: "coding-agent"
  user_gate: "user selects agent mode"
  constraints:
    - "Requires amp.experimental to be available."
    - "Uses the tools explicitly listed in the plugin."
    - "Reasoning effort is set to high."
  risks:
    - "Experimental agent-mode API may change."
    - "The mode can edit files and run shell commands through its tool list."
related: []
tags:
  - "agent-mode"
  - "inkling"
  - "experimental"
---

# Inkling Agent Mode

## Summary

`inkling` registers an experimental Amp agent mode backed by `baseten/thinkingmachines/inkling`. It uses high reasoning effort and custom coding-agent instructions with frontend design guidance.

## Invocation

Select `Inkling` from the mode picker when starting a thread. The plugin registers the mode through `amp.experimental.registerAgentMode`.

## Contract

Agent definition:

| Field | Value |
| --- | --- |
| `name` | `inkling` |
| `model` | `baseten/thinkingmachines/inkling` |
| `reasoningEffort` | `high` |
| `display.label` | `Inkling` |
| `display.color` | `#8b5cf6` |

Tools:

```text
Read
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
view_media
painter
```

The static metadata comment includes a matching `@amp-agent-mode` entry so Amp clients can discover the mode.

## Behavior

When the plugin loads, it checks `amp.experimental`. If the API is unavailable, it logs `Experimental plugin API is not available.` and does not register the mode.

If the API is available, the plugin creates an Inkling agent with the documented instructions and tools, then registers it in the mode picker.

## Permissions and side effects

This is a coding agent. It can read and modify workspace files, run shell commands, search the web, inspect Amp threads, load skills, consult Oracle and Librarian, inspect media and generate images.

Effects occur only after the user selects the mode and gives it a task. Amp permissions continue to govern tool calls.

## Examples

Start a new thread, select `Inkling`, and enter a normal coding prompt:

```text
Fix the failing test in this repository. Read the relevant code first, make the smallest change, and run the focused test.
```

## Troubleshooting

- Mode missing: reload plugins or restart Amp, then confirm the experimental plugin API is available.
- Model unavailable: confirm `baseten/thinkingmachines/inkling` appears in `amp plugins show-agent-options --json`.
- Tool unavailable: compare the plugin tool list with `amp plugins show-agent-options --json`.
- Plugin load errors: run `amp plugins list` and inspect the error reported for `inkling-mode.ts`.

## Maintenance notes

Keep this document in sync with `plugins/inkling-mode.ts`. Update this document first before changing the model, reasoning effort, mode metadata, prompt or tool access.

Refresh the API and model verification metadata after Amp plugin API updates. Keep the `@amp-agent-mode` static metadata aligned with the runtime key and label.
