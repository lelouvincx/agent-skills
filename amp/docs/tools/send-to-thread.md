---
doc_schema: "amp-plugin-capability/v1"
title: "Send to Thread"
slug: "send-to-thread"
status: "active"
summary: "Sends a text user message from the current Amp thread to another existing Amp thread."
capability:
  id: "send_to_thread"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  registration_api: "amp.registerTool"
  api_stability: "stable"
plugin:
  file: "plugins/send-to-thread.ts"
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
    - "threadID"
    - "message"
runtime:
  uses:
    - "amp.threads.get"
    - "PluginThread.appendUserMessage"
    - "ctx.thread.id"
  dependencies: []
  env: []
  reads:
    - "current thread id"
    - "target thread id"
  writes:
    - "user message in target Amp thread"
  network:
    - "Amp thread service"
  logs: []
safety:
  permission_level: "thread-write"
  user_gate: "agent_decision"
  constraints:
    - "Requires target threadID and non-empty message."
    - "Prefixes forwarded content with the sender thread ID."
    - "Use steer=true for worker completion reports to busy parent threads."
  risks:
    - "Can interrupt or steer another active thread."
    - "Wrong thread ID sends context to the wrong conversation."
related:
  - "spawn-worker"
tags:
  - "thread"
  - "coordination"
  - "worker"
---

# Send to Thread

## Summary

`send_to_thread` appends a text user message to an existing Amp thread. It is mainly used by worker threads to report completion, blockers, or follow-up results back to a parent coordinator thread.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `send_to_thread`
- Plugin file: `plugins/send-to-thread.ts`

## Contract

Required inputs:

| Field | Type | Notes |
| --- | --- | --- |
| `threadID` | `string` | Target Amp thread ID, such as `T-...`. |
| `message` | `string` | Non-empty text to send. |

Optional inputs:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `steer` | `boolean` | `false` | If true and the target is busy, queue as a steering message preferred for the next turn. |

The message sent to the target thread is prefixed with `From Amp ThreadID <current-thread-id>:`. Output is `Sent message to <threadID>.` or `Sent steering message to <threadID>.`.

## Behavior

The tool trims `threadID` and `message`, rejects empty values, obtains the target handle through `amp.threads.get`, prefixes the message with the current thread ID, and appends it as a user message to the target thread.

## Permissions and side effects

This tool writes to another Amp thread. With `steer=true`, the message can influence the next step of a busy target thread. It does not read target messages and does not validate that the target thread is semantically the intended recipient.

## Examples

Report worker completion:

```json
{
  "threadID": "T-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "steer": true,
  "message": "Worker thread: T-yyyy...\nStatus: done\nTask summary: Checked the docs.\nValidation: heading check passed."
}
```

Send a normal follow-up:

```json
{
  "threadID": "T-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "message": "I found the relevant plugin file: plugins/spawn-worker.ts."
}
```

## Troubleshooting

- `threadID is required`: pass a non-empty thread ID.
- `message is required`: pass a non-empty message.
- Message went to the wrong place: confirm the target thread ID before sending.
- Parent thread did not react immediately: use `steer=true` for worker completion reports when the target thread is busy.

## Maintenance notes

Update this doc when Amp changes `PluginThreads`, `appendUserMessage`, or steering semantics. Keep this paired with `spawn_worker`, which relies on this tool for worker reporting.
