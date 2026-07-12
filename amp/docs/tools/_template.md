---
doc_schema: "amp-artifact/v2"
title: "Artifact Name"
slug: "artifact-name"
status: "active"
summary: "One sentence describing the artifact."
artifact:
  id: "registered-name-or-stable-id"
  type: "skill"
  surface: "agent_context"
  invocation: "skill_load"
  api_stability: "stable"
source:
  kind: "skill"
  file: "skills/example/SKILL.md"
  scope: "system"
  install_source: "local"
  registration_api: null
  metadata_comments: []
amp:
  docs_sources: ["skills/example/SKILL.md"]
  last_verified: "YYYY-MM-DD"
contract:
  input_kind: "natural_language"
  output_kind: "instructions"
  trigger: "description_match_or_explicit_load"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
runtime:
  uses: []
  dependencies: []
  env: []
  reads: []
  writes: []
  network: []
  logs: []
safety:
  permission_level: "read-only"
  user_gate: "agent_decision"
  constraints: []
  risks: []
related: []
tags: []
---

# Artifact Name

## Summary

Describe what the artifact does, who should use it, and the smallest mental model needed to operate it correctly.

## Invocation

- Surface: `agent_context`
- Source: `skills/example/SKILL.md`
- Invocation: `skill_load`
- ID: `registered-name-or-stable-id`

For a plugin artifact, replace the skill values with its plugin surface, invocation, source file, and registration API.

## Contract

Document inputs, trigger conditions, defaults, outputs, declared tools, return shape, event payload, command ID, or agent mode definition as applicable.

## Behavior

Describe the runtime flow from invocation to completion. Include validation, defaults, branching behavior, and failure handling.

## Permissions and side effects

List reads, writes, spawned processes, network calls, thread changes, command rewrites, output mutations, logs, and safety gates.

## Examples

Provide one to three realistic examples. Use trigger phrases for skills, JSON for tools, command-palette labels for commands, and trigger examples for event handlers.

## Troubleshooting

List common failure modes, how they appear, and what to check first.

## Maintenance notes

Document source-of-truth locations, known drift risks, and what to update when Amp, the plugin, or the skill changes.
