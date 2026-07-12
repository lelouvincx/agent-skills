---
title: "Amp Plugin Capability Schema v1"
slug: "amp-plugin-capability-schema-v1"
doc_schema: "amp-plugin-doc-schema/v1"
status: "deprecated"
last_reviewed: "2026-07-12"
---

# Amp plugin capability schema v1

This is the frozen historical schema for documents that used `doc_schema: "amp-plugin-capability/v1"`. The active-doc validator now requires [`amp-artifact/v2`](./_schema.md).

## Frontmatter contract

Required top-level fields:

```yaml
doc_schema: "amp-plugin-capability/v1"
title: "Human-readable name"
slug: "stable-url-safe-slug"
status: "active"
summary: "One-sentence description."
```

Required capability metadata:

```yaml
capability:
  id: "registered-name-or-stable-id"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  registration_api: "amp.registerTool"
  api_stability: "stable"
```

Required plugin metadata:

```yaml
plugin:
  file: "plugins/example.ts"
  scope: "system"
  install_source: "local"
  metadata_comments: []
```

Required Amp verification metadata:

```yaml
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-06-24"
```

Required contract metadata:

```yaml
contract:
  input_kind: "json_schema"
  output_kind: "text"
  event: null
  command_id: null
  agent_mode_key: null
```

Required runtime metadata:

```yaml
runtime:
  uses: []
  dependencies: []
  env: []
  reads: []
  writes: []
  network: []
  logs: []
```

Required safety metadata:

```yaml
safety:
  permission_level: "read-only"
  user_gate: "agent_decision"
  constraints: []
  risks: []
```

Required grouping metadata:

```yaml
related: []
tags: []
```

## Enum values

`capability.type` values:

- `agent_tool` for `amp.registerTool(...)`
- `command` for `amp.registerCommand(...)`
- `event_handler` for `amp.on(...)`
- `agent_mode` for `amp.registerAgentMode(...)`
- `status_item` for `amp.experimental.createStatusItem(...)`
- `helper_agent` for internal agents worth documenting as standalone capabilities

`capability.surface` values should describe where the capability appears:

- `agent`
- `command_palette`
- `plugin_event_pipeline`
- `mode_picker`
- `status_bar`
- `internal`

`capability.invocation` values should describe how it runs:

- `tool_call`
- `command_palette`
- `plugin_event`
- `new_thread_mode`
- `status_update`
- `internal_call`

`capability.api_stability` values:

- `stable`
- `experimental`
- `mixed`

## Required Markdown headings

Each capability doc must use this H2 order:

```markdown
## Summary
## Invocation
## Contract
## Behavior
## Permissions and side effects
## Examples
## Troubleshooting
## Maintenance notes
```

Keep the headings identical even when a capability type does not use every concept. For example, an event handler still has an `Invocation` section describing its event trigger, and an agent mode still has a `Contract` section describing the model, prompt, and tools.
