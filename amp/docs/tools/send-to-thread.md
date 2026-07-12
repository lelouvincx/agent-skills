---
doc_schema: "amp-artifact/v2"
title: "Send to Thread"
slug: "send-to-thread"
status: "active"
summary: "Sends a text user message from the current Amp thread to another existing Amp thread."
artifact:
  id: "send_to_thread"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/send-to-thread.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerTool"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-06-24"
contract:
  input_kind: "json_schema"
  output_kind: "text"
  trigger: "tool_call"
  allowed_tools: []
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

<done | blocked>

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

Use `steer=true` for subagent completion reports because the parent thread usually runs Amp's deep mode, which uses GPT-5.5. The [GPT-5.5 model card](https://ampcode.com/models/gpt-5.5) says the model is easy to steer in the agent loop: it is more interactive, easier to correct, better at continuing from a concrete target, and strongest when the task has a clear outcome and a way to verify success. A compact completion report gives the busy parent thread that concrete target.

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

### Scenario stress test

| Scenario | Expected behavior |
| --- | --- |
| A subagent completes while the parent may be busy | Send the structured `done` report with `steer=true`. Use `No follow-up needed` when only normal parent integration remains. |
| A subagent cannot continue without parent input | Send a structured `blocked` report with `steer=true`. Put one smallest required action or question in `## Next`. |
| The parent answers an open child thread | Target the child thread ID with the missing decision or context. `steer=false` is sufficient when the child is idle and waiting. |
| A non-urgent FYI is sent to another thread | Use `steer=false`. The full subagent report template is optional when the message is not a completion report. |
| The payload is a raw log, code snippet, structured data, or source quote | Preserve the useful source format instead of forcing the human-readable report style. |
| The target is active but the message should not redirect its next step | Use `steer=false`; do not mark routine updates as steering messages. |

`steer=true` controls queue priority. Use it for completion reports and blockers that should influence a busy parent's next turn, not for routine updates.

## Troubleshooting

- `threadID is required`: pass a non-empty thread ID.
- `message is required`: pass a non-empty message.
- Message went to the wrong place: confirm the target thread ID before sending.
- Send to an archived or inaccessible thread fails: confirm the thread still exists and is writable, then send to the correct active thread.
- Parent thread did not react immediately: use `steer=true` for subagent completion reports when the target thread is busy.

## Maintenance notes

Update this doc when Amp changes `PluginThreads`, `appendUserMessage`, or steering semantics. Keep this paired with `spawn_subagent`, which relies on this tool for subagent reporting.
