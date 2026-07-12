---
title: "Amp Artifact Schema"
slug: "amp-artifact-schema"
doc_schema: "amp-artifact-doc-schema/v2"
status: "active"
last_reviewed: "2026-07-12"
---

# Amp artifact schema

Use `doc_schema: "amp-artifact/v2"` for one document per Amp artifact. An artifact can be exposed by a plugin or loaded as a skill. All active artifact documents must use v2; v1 is historical only.

The contract is closed by default: undocumented fields are invalid. The currently documented optional extension fields are `contract.required_inputs`, `contract.optional_inputs`, and `contract.model`. Add future extensions to this schema and the validator before using them.

## Frontmatter contract

Required top-level fields:

```yaml
doc_schema: "amp-artifact/v2"
title: "Human-readable name"
slug: "stable-url-safe-slug"
status: "active"
summary: "One-sentence description."
```

Required artifact metadata:

```yaml
artifact:
  id: "registered-name-or-stable-id"
  type: "skill"
  surface: "agent_context"
  invocation: "skill_load"
  api_stability: "stable"
```

Required source metadata:

```yaml
source:
  kind: "skill"
  file: "skills/example/SKILL.md"
  scope: "system"
  install_source: "local"
  registration_api: null
  metadata_comments: []
```

`source.kind` determines how the artifact is provided:

- `plugin`: `source.registration_api` must name the Amp API that registers the artifact.
- `skill`: `source.registration_api` must be `null`; the skill frontmatter is its registration contract.

Required Amp verification metadata:

```yaml
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-07-12"
```

`docs_sources` preserves the role of each provenance source. Use `null` when a role does not apply.

Required contract metadata:

```yaml
contract:
  input_kind: "natural_language"
  output_kind: "instructions"
  trigger: "description_match_or_explicit_load"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
```

For skills, copy any declared `allowed-tools` entries into `contract.allowed_tools`. An empty list means the skill does not declare an allowlist; it does not mean the skill can use no tools.

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

`artifact.type` values:

- `skill` for a `SKILL.md` loaded into agent context
- `agent_tool` for `amp.registerTool(...)`
- `command` for `amp.registerCommand(...)`
- `event_handler` for `amp.on(...)`
- `agent_mode` for `amp.registerAgentMode(...)`
- `status_item` for `amp.experimental.createStatusItem(...)`
- `helper_agent` for internal agents worth documenting as standalone artifacts

`artifact.surface` values should describe where the artifact appears:

- `agent_context`
- `agent`
- `command_palette`
- `plugin_event_pipeline`
- `mode_picker`
- `status_bar`
- `internal`

`artifact.invocation` values should describe how it runs:

- `skill_load`
- `tool_call`
- `command_palette`
- `plugin_event`
- `new_thread_mode`
- `status_update`
- `internal_call`

`artifact.api_stability` values:

- `stable`
- `experimental`
- `mixed`

## Artifact invariants

Skill documents must use this combination:

```yaml
artifact:
  type: "skill"
  surface: "agent_context"
  invocation: "skill_load"
source:
  kind: "skill"
  registration_api: null
```

All other artifact types must use `source.kind: "plugin"` and a non-empty `source.registration_api`.

Plugin artifacts currently have these exact invariants:

| Type | Surface | Invocation | Registration API | Required discriminator |
| --- | --- | --- | --- | --- |
| `agent_tool` | `agent` | `tool_call` | `amp.registerTool` | none; all discriminator fields are `null` |
| `command` | `command_palette` | `command_palette` | `amp.registerCommand` | non-empty `command_id`; `event` and `agent_mode_key` are `null` |
| `event_handler` | `plugin_event_pipeline` | `plugin_event` | `amp.on` | non-empty `event`; `command_id` and `agent_mode_key` are `null` |
| `agent_mode` | `mode_picker` | `new_thread_mode` | `amp.experimental.registerAgentMode` | non-empty `agent_mode_key`; `event` and `command_id` are `null` |

`status_item` and `helper_agent` remain reserved type names, but active documents using them require explicit validator support once their exact invariants are documented.

## Required Markdown headings

Each artifact doc must use this H2 order:

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

Keep the headings identical for every artifact type. For example, a skill's `Invocation` section describes its description match and explicit loading behavior, while its `Contract` section describes the instructions, declared tools, and expected result.

## Version compatibility

[`amp-plugin-capability/v1`](./_schema-v1.md) is retained as a historical reference and is not accepted for active documents. Migrate v1 by renaming `capability` to `artifact`; moving `capability.registration_api` to `source.registration_api`; replacing `plugin` with `source` and adding `source.kind`; replacing the two Amp source scalars with role-preserving `amp.docs_sources.api_docs` and `amp.docs_sources.agent_options`; and adding canonical `contract.trigger` plus `contract.allowed_tools`.
