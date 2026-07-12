---
doc_schema: "amp-artifact/v2"
title: "Codex Usage Command"
slug: "codex-usage-command"
status: "active"
summary: "Adds a command-palette action that shows current Codex 5-hour and weekly usage limits as an Amp notification."
artifact:
  id: "codex_usage_command"
  type: "command"
  surface: "command_palette"
  invocation: "command_palette"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/codex-usage.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerCommand"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-07-01"
contract:
  input_kind: "none"
  output_kind: "ui_notification"
  trigger: "command_palette"
  allowed_tools: []
  event: null
  command_id: "codex_usage_command"
  agent_mode_key: null
runtime:
  uses:
    - "amp.registerCommand"
    - "ctx.ui.notify"
    - "local Codex auth.json"
    - "ChatGPT Codex usage endpoint"
    - "OpenAI OAuth token refresh endpoint"
  dependencies: []
  env:
    - "CODEX_HOME"
  reads:
    - "~/.codex/auth.json or $CODEX_HOME/auth.json"
  writes:
    - "~/.codex/auth.json or $CODEX_HOME/auth.json when a token refresh succeeds"
  network:
    - "https://chatgpt.com/backend-api/wham/usage"
    - "https://auth.openai.com/oauth/token when refresh is needed"
  logs: []
safety:
  permission_level: "read-mostly"
  user_gate: "manual command palette invocation"
  constraints:
    - "Never returns, logs, or prints OAuth token values."
    - "Reports only quota percentages, reset times, plan type, and account-safe metadata."
    - "Uses the account currently logged in through the local Codex CLI, not Amp-hosted credentials."
  risks:
    - "Can refresh and rewrite local Codex auth.json when the access token is expired."
    - "Quota data may differ from Amp server-side usage if Amp uses a separate hosted subscription."
related: []
tags:
  - "command"
  - "codex"
  - "usage"
  - "quota"
---

# Codex Usage Command

## Summary

`codex_usage_command` adds a command-palette action named `Codex usage` that shows the live Codex quota state for the account currently logged in through the local Codex CLI. It is intended for manually checking quota as an Amp notification without asking the agent.

The command reads local Codex CLI auth and calls the same usage endpoint used by Codex status surfaces. It does not inspect Amp-hosted credentials and cannot report Amp server-side subscription usage unless that subscription is also the local Codex login.

## Invocation

- Surface: command palette
- Registered with: `amp.registerCommand`
- Command ID: `codex_usage_command`
- Palette label: `codex: Codex usage`
- Plugin file: `plugins/codex-usage.ts`

## Contract

Inputs: none.

Output is a single-line Amp notification containing:

- 5-hour remaining percentage and reset time, when present
- weekly remaining percentage and reset time, when present

The command never shows OAuth access tokens, refresh tokens, ID tokens, user IDs, or full account IDs.

## Behavior

The command resolves `$CODEX_HOME/auth.json`, or `~/.codex/auth.json` when `CODEX_HOME` is unset. It reads the local Codex OAuth token fields, calls `https://chatgpt.com/backend-api/wham/usage`, and classifies returned quota windows by `limit_window_seconds`:

- about `18000` seconds is labeled `5-hour`
- about `604800` seconds is labeled `weekly`

If the backend reports an expired access token and a refresh token is present, the command refreshes through `https://auth.openai.com/oauth/token`, updates only the returned token fields in `auth.json`, and retries the usage request once.

## Permissions and side effects

This is read-mostly. It reads local Codex auth, makes HTTPS requests to ChatGPT/OpenAI, may rewrite `auth.json` with refreshed token values using restrictive file permissions, and may show an Amp notification when invoked from the command palette. It does not log token values.

## Examples

Run from the command palette:

```text
Codex usage
```

Example output:

```text
Codex: 5h 98% (reset 2026-07-01 13:09); weekly 76% (reset 2026-07-07 09:35)
```

## Troubleshooting

- `No Codex auth file found`: run `codex login` locally.
- `No Codex access token found`: run `codex login` again.
- `Codex token refresh failed`: run `codex login` again; the refresh token may be expired or revoked.
- Usage looks like the wrong account: run `codex logout`, then `codex login` with the intended ChatGPT account.
- Command not visible: reload Amp plugins and confirm `plugins/codex-usage.ts` registers `codex_usage_command`.
- Usage differs from Amp billing: this plugin reports the local Codex CLI login, not Amp-hosted subscription credentials.

## Maintenance notes

Keep this document in sync with `plugins/codex-usage.ts`. If OpenAI changes the Codex backend endpoint, OAuth refresh endpoint, `auth.json` shape, quota window field names, or command behavior, update this doc first and then the plugin implementation.
