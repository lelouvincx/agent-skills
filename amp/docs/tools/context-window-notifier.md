---
doc_schema: "amp-plugin-capability/v1"
title: "Context Window Notifier"
slug: "context-window-notifier"
status: "active"
summary: "Notifies the user after every agent turn when estimated context-window usage is above 50%."
capability:
  id: "context-window-notifier.agent-end"
  type: "event_handler"
  surface: "plugin_event_pipeline"
  invocation: "plugin_event"
  registration_api: "amp.on"
  api_stability: "stable"
plugin:
  file: "plugins/context-window-notifier.ts"
  scope: "system"
  install_source: "local"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-06-27"
contract:
  input_kind: "plugin_event"
  output_kind: "ui_notification"
  event: "agent.end"
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "amp.on('agent.end')"
    - "ctx.thread.messages"
    - "ctx.ui.notify"
    - "ctx.logger.log"
  dependencies: []
  env:
    - "AMP_CONTEXT_WINDOW_TOKENS"
    - "AMP_CONTEXT_NOTIFY_THRESHOLD"
  reads:
    - "current-thread messages available through paged plugin reads"
    - "agent.end turn messages"
  writes: []
  network: []
  logs:
    - "plugin load log"
    - "notification failures"
safety:
  permission_level: "read-only-observability"
  user_gate: "automatic event handler"
  constraints:
    - "Uses a local heuristic estimate because the plugin API does not expose Amp's exact context-window gauge."
    - "Notifies after every agent turn that ends at or above the configured threshold."
    - "Never mutates thread messages or tool results."
  risks:
    - "Token usage can be under- or over-estimated because the plugin API exposes simplified thread messages, not Amp's exact model input or UI token gauge."
    - "The default 200000-token context window may not match every model."
related: []
tags:
  - "event-handler"
  - "context-window"
  - "notification"
  - "observability"
---

# Context Window Notifier

## Summary

`context-window-notifier.agent-end` observes completed agent turns and notifies after every turn whose estimated context-window usage is at or above 50%. It is a read-only warning system intended to prompt manual compaction or a new thread before context gets too full.

## Invocation

- Surface: plugin event pipeline
- Registered with: `amp.on`
- Event: `agent.end`
- Trigger: every completed, failed, or cancelled agent turn
- Plugin file: `plugins/context-window-notifier.ts`

## Contract

Input is Amp's `AgentEndEvent`. The handler returns `undefined` in all cases.

Runtime defaults:

| Setting | Default | Override |
| --- | --- | --- |
| Context window tokens | `200000` | `AMP_CONTEXT_WINDOW_TOKENS` |
| Notification threshold | `0.5` | `AMP_CONTEXT_NOTIFY_THRESHOLD` |
| Message read page size | 20 messages | plugin API maximum |
| Token estimate | `ceil(chars / 4)` | not configurable |

The notification text includes the estimated percent, estimated tokens, configured context window, and thread ID.

## Behavior

On each `agent.end`, the handler estimates token usage from the current thread messages available through `ctx.thread.messages`. It pages backward from the end of the thread in 20-message chunks, because the plugin API clamps each read to 20 messages, and de-duplicates by message ID while summing the visible text-like content.

The estimate is recomputed per turn instead of using retained per-process totals. This avoids stale counts after plugin reloads and keeps the warning aligned with the current thread messages exposed to plugins.

When estimated usage is at or above the configured threshold, the plugin calls `ctx.ui.notify` at the end of every agent turn. This is intentionally repetitive so long-running threads continue to warn after each response once they are past the threshold.

Because Amp's plugin API does not expose the exact built-in context gauge, this plugin intentionally uses a simple heuristic. It is best treated as an early warning, not an authoritative billing or token counter.

## Permissions and side effects

This handler reads current thread messages through paged plugin reads and includes turn messages from the event. It shows a UI notification and writes plugin logs for load status or notification failures. It does not write files, call network services, modify tool results, or append messages to the thread.

## Examples

Default trigger:

```text
Agent turn ends and the thread estimate is at least 50% of 200000 tokens.
```

Example notification:

```text
Context window estimate is above 50% for T-...
Estimated usage: 51% (~102000 / 200000 tokens).
Consider summarizing, compacting, or starting a fresh thread soon.
```

Configure a smaller window before starting Amp:

```sh
export AMP_CONTEXT_WINDOW_TOKENS=128000
export AMP_CONTEXT_NOTIFY_THRESHOLD=0.5
```

## Troubleshooting

- No notification: reload plugins after installing, then continue the thread until a turn ends at or above the threshold.
- Notification feels late or early: adjust `AMP_CONTEXT_WINDOW_TOKENS` to match the active model, or remember the estimate is heuristic.
- Existing long thread does not notify immediately: the current thread messages exposed to plugins may still differ from Amp's exact model context or UI token gauge.
- UI notification fails: check plugin logs; background or non-UI environments may not support `ctx.ui.notify`.

## Maintenance notes

Replace the heuristic with Amp's exact context-window usage if the plugin API exposes it in the future. Update this doc when the event, per-turn notification behavior, threshold logic, token estimate, default context window, or notification text changes.
