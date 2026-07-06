---
doc_schema: "amp-plugin-capability/v1"
title: "Spawn Subagent"
slug: "spawn-subagent"
status: "active"
summary: "Launches a bounded independent Amp subagent thread, instructs it to report back with send_to_thread, then archives itself."
capability:
  id: "spawn_subagent"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  registration_api: "amp.registerTool"
  api_stability: "stable"
plugin:
  file: "plugins/spawn-subagent.ts"
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
    - "send_to_thread tool available to subagent"
    - "archive_current_thread tool available to subagent"
    - "read_thread tool available to subagent when parent intent reconstruction is needed"
  env: []
  reads:
    - "current thread id"
    - "parent Amp thread through spawned subagent for intent reconstruction"
  writes:
    - "new child Amp thread"
    - "initial subagent user message"
    - "subagent thread archive state after final report"
  network:
    - "Amp agent runtime for spawned subagent"
  logs: []
safety:
  permission_level: "thread-create"
  user_gate: "agent_decision"
  constraints:
    - "Subagent must receive bounded instructions with scope, constraints, output, and validation."
    - "Subagent must privately reconstruct parent-thread intent before executing when the bounded task depends on broader context."
    - "Caller must not poll or wait for the subagent."
    - "Subagent is instructed to report completion through send_to_thread with steer=true."
    - "Subagent decides whether follow-up is required, distinguishing optional parent review from required parent input."
    - "Subagent is instructed to archive itself only after sending a terminal final report where required follow-up is none."
  risks:
    - "Unbounded instructions can create noisy or conflicting parallel work."
    - "Subagent can preserve the wrong intent if it relies only on recent or incidental parent-thread context."
    - "Subagent may modify files according to its built-in agent mode permissions."
related:
  - "send-to-thread"
tags:
  - "subagent"
  - "thread"
  - "coordination"
---

# Spawn Subagent

## Summary

`spawn_subagent` starts an independent Amp subagent thread for one bounded implementation or investigation slice. It lets a coordinator thread keep working while the child thread reports back later through `send_to_thread`, then archives itself after a terminal final report when no required follow-up is needed.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `spawn_subagent`
- Plugin file: `plugins/spawn-subagent.ts`
- Trigger keywords: `spawn subagent`, `subagent thread`, `launch a subagent`, `parallel agent`, `background subagent`, `delegate this slice`, `run this in parallel`

## Contract

Required inputs:

| Field | Type | Notes |
| --- | --- | --- |
| `instructions` | `string` | Must be non-empty. Include scope, constraints, success criteria, and validation. |

Optional inputs:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `mode` | `smart \| deep \| rush` | `deep` | Built-in Amp agent mode for the subagent. |
| `reasoningEffort` | `none \| minimal \| low \| medium \| high \| xhigh \| max` | `medium` | Reasoning effort pinned for the subagent. Amp's GPT-5.5 guidance says `medium` is the right default for normal deep work; `high` can cost more and perform worse. |

Output is a short text confirmation: `Started <mode>/<reasoningEffort> subagent in <threadID>. Do not poll or wait for it.`

## Behavior

The tool validates `instructions`, normalizes the built-in mode and reasoning effort, obtains a built-in agent with `amp.getBuiltinAgent`, creates a child thread with the current thread as `parentThreadID`, and appends a structured subagent prompt.

The default `deep/medium` setting intentionally follows Amp's GPT-5.5 model guidance rather than the CLI display label alone: `medium` is the recommended default for normal deep work, while `high` is not treated as a safe default because Amp's internal eval found it more expensive than `medium` and worse-performing on that run.

The prompt tells the subagent that the parent owns the broader design, the subagent owns only the bounded task, and the subagent must preserve parent-thread intent. Before executing, the subagent has an explicit private intent-reconstruction step: use `read_thread` on the parent thread when available, or otherwise inspect the parent thread as fully as available, then infer and keep distinct the original user intent, any later user redirects, the latest coherent requested outcome, and how the bounded subagent task supports that outcome. The subagent must not let incidental recent-message context replace the original task intent; if reconstructed intent and the subagent instructions appear to conflict, it should follow explicit latest redirects and otherwise report the ambiguity as a blocker instead of guessing.

When done or blocked, the subagent must call `send_to_thread` with a concise structured report. The subagent decides whether follow-up is required, but must interpret that narrowly: optional parent review, FYI summaries, or “review the diff if desired” are not required follow-up. Required follow-up means the subagent cannot safely finish without parent input, such as a decision between alternatives, missing context, permission, a blocker, or explicit next instructions. If the report is terminal and `Follow-up needed` is empty or `none`, the subagent then calls `archive_current_thread` to archive itself. If it is blocked or requires parent input, it stays unarchived so the parent can reply; after completing any follow-up, it sends a new terminal report and archives itself.

## Permissions and side effects

This tool creates a new Amp thread, appends a user message to it, and instructs that subagent to archive itself after a terminal report. The subagent inherits the selected built-in mode's tool permissions and may make code changes if its task asks for implementation. The parent thread does not wait for the subagent and should not poll it.

## Examples

Spawn a default deep subagent:

```json
{
  "instructions": "Inspect plugins/holistics-md.ts and report whether the markdown-table transformation has edge cases around empty rows. Do not edit files."
}
```

Spawn a faster subagent:

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
- Subagent does not report back: inspect the child thread ID from the return value and check whether `send_to_thread` is available.
- Subagent reports back but remains visible: check whether `archive_current_thread` is available to the subagent, then archive the child thread manually if needed.

## Maintenance notes

Update this doc when built-in agent modes, reasoning efforts, parent-thread intent reconstruction, subagent report format, self-archive behavior, or the relationship with `send_to_thread` changes. Keep examples bounded; this tool is for parallel slices, not broad delegation.
