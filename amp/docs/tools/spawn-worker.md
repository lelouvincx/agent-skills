---
doc_schema: "amp-plugin-capability/v1"
title: "Spawn Worker"
slug: "spawn-worker"
status: "active"
summary: "Launches a bounded independent Amp worker thread and instructs it to report back with send_to_thread."
capability:
  id: "spawn_worker"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  registration_api: "amp.registerTool"
  api_stability: "stable"
plugin:
  file: "plugins/spawn-worker.ts"
  scope: "system"
  install_source: "local"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-06-24"
contract:
  input_kind: "json_schema"
  output_kind: "text"
  event: null
  command_id: null
  agent_mode_key: null
  required_inputs:
    - "instructions"
runtime:
  uses:
    - "amp.getBuiltinAgent"
    - "Agent.createThread"
    - "PluginThread.appendUserMessage"
    - "ctx.thread.id"
  dependencies:
    - "send_to_thread tool available to worker"
    - "read_thread tool available to worker when parent intent reconstruction is needed"
  env: []
  reads:
    - "current thread id"
    - "parent Amp thread through spawned worker for intent reconstruction"
  writes:
    - "new child Amp thread"
    - "initial worker user message"
  network:
    - "Amp agent runtime for spawned worker"
  logs: []
safety:
  permission_level: "thread-create"
  user_gate: "agent_decision"
  constraints:
    - "Worker must receive bounded instructions with scope, constraints, output, and validation."
    - "Worker must privately reconstruct parent-thread intent before executing when the bounded task depends on broader context."
    - "Caller must not poll or wait for the worker."
    - "Worker is instructed to report completion through send_to_thread with steer=true."
  risks:
    - "Unbounded instructions can create noisy or conflicting parallel work."
    - "Worker can preserve the wrong intent if it relies only on recent or incidental parent-thread context."
    - "Worker may modify files according to its built-in agent mode permissions."
related:
  - "send-to-thread"
tags:
  - "worker"
  - "thread"
  - "coordination"
---

# Spawn Worker

## Summary

`spawn_worker` starts an independent Amp worker thread for one bounded implementation or investigation slice. It lets a coordinator thread keep working while the child thread reports back later through `send_to_thread`.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `spawn_worker`
- Plugin file: `plugins/spawn-worker.ts`
- Trigger keywords: `spawn worker`, `worker thread`, `launch a worker`, `parallel agent`, `background worker`, `delegate this slice`, `run this in parallel`

## Contract

Required inputs:

| Field | Type | Notes |
| --- | --- | --- |
| `instructions` | `string` | Must be non-empty. Include scope, constraints, success criteria, and validation. |

Optional inputs:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `mode` | `smart \| deep \| rush` | `deep` | Built-in Amp agent mode for the worker. |
| `reasoningEffort` | `none \| minimal \| low \| medium \| high \| xhigh \| max` | `high` | Reasoning effort pinned for the worker; equivalent to Amp's deep 2. |

Output is a short text confirmation: `Started <mode>/<reasoningEffort> worker in <threadID>. Do not poll or wait for it.`

## Behavior

The tool validates `instructions`, normalizes the built-in mode and reasoning effort, obtains a built-in agent with `amp.getBuiltinAgent`, creates a child thread with the current thread as `parentThreadID`, and appends a structured worker prompt.

The prompt tells the worker that the parent owns the broader design, the worker owns only the bounded task, and the worker must preserve parent-thread intent. Before executing, the worker has an explicit private intent-reconstruction step: use `read_thread` on the parent thread when available, or otherwise inspect the parent thread as fully as available, then infer and keep distinct the original user intent, any later user redirects, the latest coherent requested outcome, and how the bounded worker task supports that outcome. The worker must not let incidental recent-message context replace the original task intent; if reconstructed intent and the worker instructions appear to conflict, it should follow explicit latest redirects and otherwise report the ambiguity as a blocker instead of guessing.

When done or blocked, the worker must call `send_to_thread` with a concise structured report.

## Permissions and side effects

This tool creates a new Amp thread and appends a user message to it. The worker inherits the selected built-in mode's tool permissions and may make code changes if its task asks for implementation. The parent thread does not wait for the worker and should not poll it.

## Examples

Spawn a default deep worker:

```json
{
  "instructions": "Inspect plugins/holistics-md.ts and report whether the markdown-table transformation has edge cases around empty rows. Do not edit files."
}
```

Spawn a faster worker:

```json
{
  "mode": "rush",
  "reasoningEffort": "medium",
  "instructions": "Run the focused docs heading consistency check and report failures only."
}
```

## Troubleshooting

- `instructions are required`: pass a non-empty task brief.
- `mode must be one of...`: use only `smart`, `deep`, or `rush`.
- `reasoningEffort must be one of...`: use the supported reasoning enum.
- Worker does not report back: inspect the child thread ID from the return value and check whether `send_to_thread` is available.

## Maintenance notes

Update this doc when built-in agent modes, reasoning efforts, parent-thread intent reconstruction, worker report format, or the relationship with `send_to_thread` changes. Keep examples bounded; this tool is for parallel slices, not broad delegation.
