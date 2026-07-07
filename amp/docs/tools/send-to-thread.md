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
    - "Use steer=true for subagent completion reports to busy parent threads."
  risks:
    - "Can interrupt or steer another active thread."
    - "Wrong thread ID sends context to the wrong conversation."
related:
  - "spawn-subagent"
tags:
  - "thread"
  - "coordination"
  - "subagent"
---

# Send to Thread

## Summary

`send_to_thread` appends a text user message to an existing Amp thread. It is mainly used by subagent threads to report completion, blockers, or follow-up results back to a parent coordinator thread.

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

### Message contract

When `message` is a human-readable report, keep it short and write it in GOV.UK style:

- put the status or answer first
- use short, active sentences
- keep one idea per sentence
- remove repeated context and process narration
- use concrete bullets only when they help the reader act
- end with the smallest next action, or say `No follow-up needed`

Subagent completion reports should use Markdown headings for each section:

```text
## Subagent thread

<thread-id>

## Status

<done | blocked | needs-review>

## Summary

<lead with the outcome or blocker>

## Evidence

- <specific evidence, only if useful>

## Validation

<what was checked, or "not run" with the reason>

## Next

<no follow-up needed, or the smallest next action>
```

Do not apply this style rule to raw logs, code snippets, structured data, or quoted source text.

## Behavior

The tool trims `threadID` and `message`, rejects empty values, obtains the target handle through `amp.threads.get`, prefixes the message with the current thread ID, and appends it as a user message to the target thread.

## Permissions and side effects

This tool writes to another Amp thread. With `steer=true`, the message can influence the next step of a busy target thread. It does not read target messages and does not validate that the target thread is semantically the intended recipient.

## Examples

Report subagent completion:

```json
{
  "threadID": "T-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "steer": true,
  "message": "## Subagent thread\n\nT-yyyy...\n\n## Status\n\ndone\n\n## Summary\n\nChecked the docs. The capability contract matches the plugin behavior.\n\n## Validation\n\nHeading check passed.\n\n## Next\n\nNo follow-up needed."
}
```

Send a normal follow-up:

```json
{
  "threadID": "T-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "message": "I found the relevant plugin file: plugins/spawn-subagent.ts."
}
```

## Troubleshooting

- `threadID is required`: pass a non-empty thread ID.
- `message is required`: pass a non-empty message.
- Message went to the wrong place: confirm the target thread ID before sending.
- Parent thread did not react immediately: use `steer=true` for subagent completion reports when the target thread is busy.

## Maintenance notes

Update this doc when Amp changes `PluginThreads`, `appendUserMessage`, or steering semantics. Keep this paired with `spawn_subagent`, which relies on this tool for subagent reporting.
