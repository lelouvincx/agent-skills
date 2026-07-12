---
doc_schema: "amp-artifact/v2"
title: "macOS Turn End Notifier"
slug: "macos-turn-end-notifier"
status: "active"
summary: "Sends a native macOS notification whenever an agent turn ends."
artifact:
  id: "macos-turn-end-notifier.agent-end"
  type: "event_handler"
  surface: "plugin_event_pipeline"
  invocation: "plugin_event"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/macos-turn-end-notifier.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.on"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-06-27"
contract:
  input_kind: "plugin_event"
  output_kind: "system_notification"
  trigger: "plugin_event"
  allowed_tools: []
  event: "agent.end"
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "amp.on('agent.end')"
    - "ctx.$"
    - "terminal-notifier"
    - "osascript display notification"
    - "ctx.thread.title.get"
    - "ctx.logger.log"
  dependencies:
    - "terminal-notifier (optional, enables click-to-focus)"
    - "/usr/bin/osascript"
    - "herdr (optional, enables pane focus command)"
  env:
    - "HERDR_PANE_ID"
  reads:
    - "current thread title"
    - "agent.end user prompt"
  writes: []
  network: []
  logs:
    - "plugin load log"
    - "unsupported-platform notice"
    - "notification failures"
safety:
  permission_level: "local-system-notification"
  user_gate: "automatic event handler"
  constraints:
    - "Runs only on macOS (`process.platform === 'darwin'`)."
    - "Sends one native notification for every `agent.end` event, including done, error, and cancelled turns."
    - "Uses `terminal-notifier` click actions only when both `terminal-notifier` and `HERDR_PANE_ID` are available."
    - "Does not mutate thread messages, tool results, files, or Amp state."
  risks:
    - "macOS notification permissions for the hosting terminal or Amp client can suppress notifications."
    - "Click-to-focus depends on Herdr pane metadata matching the Amp process that emitted the notification."
    - "High-turn-volume workflows can produce many notifications."
related: []
tags:
  - "event-handler"
  - "macos"
  - "notification"
  - "observability"
---

# macOS Turn End Notifier

## Summary

`macos-turn-end-notifier.agent-end` observes completed agent turns and sends a native macOS Notification Center notification after every turn. It is intended for cases where the user is away from the Amp window and wants to know when an agent is done, errored, or cancelled.

## Invocation

- Surface: plugin event pipeline
- Registered with: `amp.on`
- Event: `agent.end`
- Trigger: every completed, failed, or cancelled agent turn
- Plugin file: `plugins/macos-turn-end-notifier.ts`

## Contract

Input is Amp's `AgentEndEvent`. The handler returns `undefined` in all cases.

The notification uses:

| Field | Value |
| --- | --- |
| Title | current thread title when available, otherwise `Amp turn finished` |
| Subtitle | turn status plus short thread ID |
| Body | one-line summary of the user request that started the turn |

## Behavior

On each `agent.end`, the handler checks that the plugin process is running on macOS. If it is not, the handler logs a message once and does nothing.

On macOS, the handler reads the current thread title and derives a single-line body from the `agent.end` request message.

If `terminal-notifier` is installed and `HERDR_PANE_ID` is present, the handler sends a clickable notification. Clicking it opens Alacritty and runs `herdr agent focus <HERDR_PANE_ID>` so Herdr focuses the pane that emitted the notification.

If clickable notification prerequisites are missing, the handler falls back to `/usr/bin/osascript -e 'display notification ...'`. Notification failures are logged and do not affect the finished agent turn.

## Permissions and side effects

This handler reads the current thread title and `agent.end` request message, then executes either `terminal-notifier` or the local macOS `osascript` binary to create a user-facing system notification. When clickable prerequisites are available, notification clicks run a local Herdr focus command. It does not write files, call network services, modify tool results, or append messages to the thread.

macOS may require Notification Center permissions for the terminal or app hosting Amp before notifications are visible.

## Examples

Default trigger:

```text
Agent turn ends with status done, error, or cancelled.
```

Example notification:

```text
Title: macOS notification on agent turn end
Subtitle: Done · T-019f08d9…
Body: create an amp plugin to send to macos's notification whenever agent turn end
```

Enable click-to-focus:

```sh
brew install terminal-notifier
```

Then run Amp inside a Herdr pane so `HERDR_PANE_ID` is available in the Amp process environment.

## Troubleshooting

- No notification: reload plugins after installing, then wait for the next agent turn to end.
- Still no notification: check macOS System Settings → Notifications for the terminal or Amp host app.
- Click does not focus the pane: install `terminal-notifier`, confirm Amp was launched inside Herdr, and check that `HERDR_PANE_ID` is present in the Amp process environment.
- Click opens Alacritty but not the correct pane: the plugin process likely inherited a different `HERDR_PANE_ID` than the thread's visible pane.
- Running outside macOS: the plugin logs an unsupported-platform notice and intentionally skips notifications.
- Notification fails: check plugin logs for the `terminal-notifier` or `osascript` error.

## Maintenance notes

Update this doc when the event, notification title/subtitle/body, click-to-focus behavior, platform guard, or notification mechanism changes. Keep the `osascript` fallback unless a built-in Amp system-notification API becomes available.
