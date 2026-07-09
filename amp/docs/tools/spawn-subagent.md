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
  last_verified: "2026-07-09"
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
    - "read_thread tool available to subagent for parent intent reconstruction"
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
    - "Subagent must use read_thread to privately reconstruct parent-thread intent before executing when the bounded task depends on broader context."
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
- Trigger keywords: `/subagent`, `|subagent`, `spawn subagent`, `parallel subagent`, `run this in parallel`

When invoking from the start of a prompt, prefer `|subagent` because Amp reserves `/` for the command palette.

## Contract

Required inputs:

| Field          | Type     | Notes                                                                                                                         |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `instructions` | `string` | Must be non-empty. Include exact scope, non-goals, expected report shape, and the validation the subagent should run or skip. |

Optional inputs:

| Field             | Type                                                       | Default  | Notes                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`            | `low \| medium \| high \| ultra` | `medium` | Built-in Amp agent mode for the subagent. |

Output is a short text confirmation: `Started <mode> subagent in <threadID>. Do not poll or wait for it.`

## Behavior

The tool validates `instructions`, normalizes the built-in mode, obtains a built-in agent with `amp.getBuiltinAgent`, creates a child thread with the current thread as `parentThreadID`, and appends a structured subagent prompt.

The prompt treats `read_thread` as the source of truth for parent context. It does not fall back to static prompt reconstruction because `read_thread` is more reliable and avoids redundant context load for subagents.

The prompt gives the subagent two phases:

- Before work:
  - Preserve parent-thread intent.
  - Use `read_thread` on the parent thread.
  - Keep distinct the original user intent, later user redirects, the latest coherent requested outcome, and how the bounded subagent task supports that outcome.
  - Do not let incidental recent-message context replace the original task intent.
  - If reconstructed intent and subagent instructions appear to conflict, follow explicit latest redirects and otherwise report the ambiguity as a blocker instead of guessing.
- After work:
  - Call `send_to_thread` with a concise structured report that uses Markdown headings for each section.
  - Interpret required follow-up narrowly: optional parent review, FYI summaries, or “review the diff if desired” are not required follow-up.
  - Required follow-up means the subagent cannot safely finish without parent input, such as a decision between alternatives, missing context, permission, a blocker, or explicit next instructions.
  - If the report is terminal and `## Next` says `No follow-up needed`, call `archive_current_thread` to archive itself.
  - If blocked or requiring parent input, stay unarchived so the parent can reply.
  - After completing follow-up, send a new terminal report and archive itself.

## Permissions and side effects

- Creates a new Amp thread.
- Appends a user message to the new thread.
- Instructs the subagent to archive itself after a terminal report.
- The subagent inherits the selected built-in mode's tool permissions.
- The subagent may make code changes if its task asks for implementation.
- The parent thread does not wait for the subagent and should not poll it.

## Examples

Spawn a default medium subagent:

```json
{
  "instructions": "Inspect plugins/holistics-md.ts and report whether the markdown-table transformation has edge cases around empty rows. Do not edit files."
}
```

Spawn a faster subagent:

```json
{
  "mode": "low",
  "instructions": "Run the focused docs heading consistency check and report failures only."
}
```

## Troubleshooting

- `instructions are required`: pass a non-empty task brief.
- `mode must be one of...`: use only `low`, `medium`, `high`, or `ultra`.
- Subagent does not report back: inspect the child thread ID from the return value and check whether `send_to_thread` is available.
- Subagent reports back but remains visible: check whether `archive_current_thread` is available to the subagent, then archive the child thread manually if needed.

## Maintenance notes

- Update this doc when built-in agent modes or reasoning efforts change.
- Update this doc when parent-thread intent reconstruction changes.
- Update this doc when the subagent report format changes.
- Update this doc when self-archive behavior changes.
- Update this doc when the relationship with `send_to_thread` changes.
- Keep examples bounded; this tool is for parallel slices, not broad delegation.
