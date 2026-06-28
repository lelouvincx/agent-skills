---
doc_schema: "amp-plugin-capability/v1"
title: "Capability Name"
slug: "capability-name"
status: "active"
summary: "One sentence describing the capability."
capability:
  id: "registered-name-or-stable-id"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  registration_api: "amp.registerTool"
  api_stability: "stable"
plugin:
  file: "plugins/example.ts"
  scope: "system"
  install_source: "local"
  metadata_comments: []
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "YYYY-MM-DD"
contract:
  input_kind: "json_schema"
  output_kind: "text"
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

# Capability Name

## Summary

Describe what the capability does, who should use it, and the smallest mental model needed to operate it correctly.

## Invocation

- Surface: `agent`
- Registered with: `amp.registerTool`
- Invocation: `tool_call`
- ID: `registered-name-or-stable-id`

## Contract

Document inputs, defaults, outputs, return shape, event payload, command ID, or agent mode definition as applicable.

## Behavior

Describe the runtime flow from invocation to completion. Include validation, defaults, branching behavior, and failure handling.

## Permissions and side effects

List reads, writes, spawned processes, network calls, thread changes, command rewrites, output mutations, logs, and safety gates.

## Examples

Provide one to three realistic examples. Use JSON for tools, command-palette labels for commands, and trigger examples for event handlers.

## Troubleshooting

List common failure modes, how they appear, and what to check first.

## Maintenance notes

Document source-of-truth locations, known drift risks, and what to update when Amp or the plugin changes.
