---
doc_schema: "amp-artifact/v2"
title: "Subagent Control"
slug: "subagent-control"
status: "active"
summary: "Lists, inspects, and cancels subagents spawned by the current parent Amp thread."
artifact:
  id: "subagent_control"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/spawn-subagent.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerTool"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: null
  last_verified: "2026-07-15"
contract:
  input_kind: "json_schema"
  output_kind: "text"
  trigger: "tool_call"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
  required_inputs:
    - "action"
  optional_inputs:
    - "threadID"
runtime:
  uses:
    - "ctx.thread.messages"
    - "amp.threads.get"
    - "PluginThread.state.get"
    - "PluginThread.title.get"
    - "PluginThread.cancel"
  dependencies:
    - "successful spawn_subagent tool results in the current parent thread transcript"
  env: []
  reads:
    - "full current parent thread transcript"
    - "state and title of owned spawned subagent threads"
  writes: []
  network:
    - "Amp thread runtime for child state lookup and cancellation"
  logs: []
safety:
  permission_level: "thread-control"
  user_gate: "agent_decision"
  constraints:
    - "List, status, and cancel are scoped to subagents successfully spawned by the current parent thread."
    - "Status is point-in-time and must not wait for child completion."
    - "Cancel stops only the current child turn and does not archive or delete its thread."
    - "Routine subagent operation remains asynchronous; callers must not poll status while waiting for completion."
  risks:
    - "Thread state can change immediately after it is read."
    - "A child thread created before its initial message fails cannot be rediscovered from a successful spawn result."
    - "Amp does not expose archive state through PluginThread, so report status is not proof that a child archived successfully."
related:
  - "spawn-subagent"
  - "send-to-thread"
tags:
  - "subagent"
  - "thread"
  - "coordination"
  - "cancellation"
---

# Subagent Control

## Summary

`subagent_control` lists, inspects, or cancels subagents successfully spawned by the current parent Amp thread. It provides on-demand intervention without changing the normal asynchronous lifecycle: the parent should continue useful work and let children report through `send_to_thread`, not poll them for completion.

The tool reconstructs ownership from durable `spawn_subagent` calls and results in the full parent transcript. It does not maintain a second registry or allow arbitrary Amp thread control.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `subagent_control`
- Plugin file: `plugins/spawn-subagent.ts`

Use it when the user asks which spawned subagents exist, when a child needs diagnosis, or when an in-flight child turn must stop.

## Contract

Required inputs:

| Field | Type | Notes |
| --- | --- | --- |
| `action` | `list \| status \| cancel` | Operation to perform. |

Optional inputs:

| Field | Type | Notes |
| --- | --- | --- |
| `threadID` | `string` | Required at runtime for `status` and `cancel`; rejected unless the current parent spawned it successfully. |

Actions:

- `list` returns each owned child's thread ID, Amp state, latest report status, title, mode, and abbreviated task.
- `status` returns one owned child's title, state, mode, requested working directory, abbreviated task, and latest structured report when available.
- `cancel` calls `PluginThread.cancel()` only when the owned child is `running` or `awaiting-approval`. For `idle` or `error`, it returns an idempotent no-active-turn result.

Outputs are concise text. The tool does not wait for a child turn to complete.

## Behavior

For every action, the tool reads the current parent transcript with `full: true`, paging from the start in batches of 20. It pairs assistant `spawn_subagent` tool-use blocks with successful user tool-result blocks by tool-use ID, then extracts the child thread ID and mode from the stable spawn result. The original tool input supplies the requested working directory and task.

The tool also correlates the latest `send_to_thread` completion report by its `From Amp ThreadID <child-id>:` prefix and parses the report's status, summary, validation, and next sections. Missing or malformed reports remain `not reported`; they do not fail list or status.

`list` obtains each discovered child's current state and title concurrently. A child that is no longer accessible remains in the output with an unavailable state rather than causing the whole list to fail.

`status` and `cancel` first verify that the supplied ID appears in the current parent's discovered children. They reject any other thread ID. `cancel` reads the state immediately before acting. When active, it requests cancellation and reports that request honestly because the state may change concurrently; it does not claim that cancellation has settled or that the thread remains unarchived.

Amp's current `PluginThread` API does not expose archive state. A terminal `done` report with no follow-up strongly indicates the child should have archived itself, but the control tool does not present that as verified archive state.

## Permissions and side effects

- Reads the full current parent transcript on explicit invocation.
- Reads child state and title for parent-owned spawned subagents.
- `cancel` can stop the current turn in one parent-owned child thread.
- Does not append messages, wait for completion, archive threads, delete threads, or write a registry file.
- Does not manage children spawned from another parent thread.

## Examples

List subagents spawned by the current parent:

```json
{"action":"list"}
```

Inspect one child:

```json
{"action":"status","threadID":"T-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
```

Stop one active child turn:

```json
{"action":"cancel","threadID":"T-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
```

Scenario expectations:

| Scenario | Expected behavior |
| --- | --- |
| No successful spawns exist in the parent transcript | `list` returns that no subagents were found. |
| A child is running and has not reported | Show `running` and `not reported`. |
| A child sent a terminal report | `list` shows the parsed report status only. `status` shows the parsed report status and summary. Neither action claims verified archive state. |
| A discovered child is inaccessible | Keep it in `list` as unavailable; make direct `status` or `cancel` return the access error. |
| `status` or `cancel` targets another thread | Reject it as not spawned by the current parent. |
| `cancel` targets an active child | Request cancellation without requesting archive or deletion. |
| `cancel` targets an idle or errored child | Return a no-active-turn result without calling cancel. |

## Troubleshooting

- `action must be one of...`: use `list`, `status`, or `cancel`.
- `threadID is required`: supply a child ID for `status` or `cancel`.
- `thread was not spawned by this parent`: run `list` in the parent thread and use one of its returned IDs.
- A known child is absent: confirm its `spawn_subagent` call completed successfully. A create-then-initial-message failure has no successful result to discover.
- Report says `not reported`: the child may still be working, may have failed before reporting, or may have sent an unparseable message. Inspect the child thread directly when needed.

## Maintenance notes

Keep this document aligned with `plugins/spawn-subagent.ts`, the stable spawn-result text, and the `send_to_thread` report format. Re-check transcript message schemas, paging limits, thread state values, and cancellation semantics with `amp plugins show-docs` after Amp updates.

Do not add persistent registry state unless Amp transcript discovery becomes insufficient. If Amp exposes parent-child listing or archive state later, prefer that native API and update this contract first.
