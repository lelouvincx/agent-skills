---
doc_schema: "amp-artifact/v2"
title: "Amp ChatGPT subscription selector"
slug: "amp-chatgpt-subscription-selector"
status: "active"
summary: "Keeps a preferred ChatGPT subscription active in Amp until an available Codex quota window is at or below a configured remaining threshold."
artifact:
  id: "amp-chatgpt-subscription-selector"
  type: "local_cli"
  surface: "shell"
  invocation: "cli"
  api_stability: "stable"
source:
  kind: "script"
  file: "bin/amp-chatgpt-subscription-selector"
  scope: "system"
  install_source: "local"
  registration_api: null
  metadata_comments: []
amp:
  docs_sources:
    api_docs: null
    agent_options: null
  last_verified: "2026-09-03"
contract:
  input_kind: "command_line_arguments"
  output_kind: "active_amp_model_provider_and_local_status"
  trigger: "cli"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
  required_inputs:
    - "command"
  optional_inputs:
    - "preferred connection ID"
    - "fallback connection ID"
    - "remaining quota threshold"
runtime:
  uses:
    - "amp config model-providers test"
    - "amp config model-providers show"
    - "amp config model-providers activate"
    - "launchctl"
  dependencies:
    - "Amp CLI"
    - "macOS user LaunchAgents"
    - "2 linked ChatGPT subscriptions"
  env:
    - "AMP_CHATGPT_SELECTOR_* path and test overrides"
  reads:
    - "configured Amp model-provider connections"
    - "Codex quota headers returned by Amp's provider test"
  writes:
    - "~/Library/LaunchAgents/com.ampcode.chatgpt-subscription-selector.plist"
    - "~/.local/state/amp-chatgpt-subscription-selector"
    - "active user-level Amp ChatGPT model-provider connection"
  network:
    - "Amp model-provider test and activation requests"
  logs:
    - "~/.local/state/amp-chatgpt-subscription-selector/selector.log"
safety:
  permission_level: "local-process-management-and-remote-account-write"
  user_gate: "manual installation or explicit invocation"
  constraints:
    - "Selects the fallback when any available preferred quota window is at or below the configured remaining threshold."
    - "Selects the preferred subscription only when every available quota window is above the configured remaining threshold."
    - "Ignores a quota window that the provider explicitly disables with a duration of 0 minutes."
    - "Uses complete quota headers from a usage-limit response even when Amp exits with an error."
    - "Preserves the active subscription when the response omits either window header pair or provides no supported active window."
    - "Activates a subscription only when the selected connection is not already active."
  risks:
    - "Each check sends a small test inference request through the preferred subscription."
    - "Activation changes the ChatGPT subscription used by new Amp inference requests for the user."
related: []
tags:
  - "background-task"
  - "chatgpt"
  - "quota"
  - "model-provider"
---

# Amp ChatGPT subscription selector

## Summary

`amp-chatgpt-subscription-selector` keeps the primary ChatGPT subscription active in Amp while every available Codex quota window is above your configured remaining threshold. It activates the secondary subscription when any available window is at or below that threshold.

## Invocation

`sync-skills.sh` projects the command from `bin/amp-chatgpt-subscription-selector` to `~/.local/bin`.

Use `install`, `uninstall`, `run` or `status`. Run `amp config model-providers list` to find the primary and secondary connection IDs before installation.

As of 27 August 2026, Amp supports at most 2 linked ChatGPT subscriptions. The install command therefore accepts exactly one primary and one secondary subscription.

## Contract

The LaunchAgent checks every 5 minutes. Each check tests the preferred connection and reads these Codex response headers:

- `x-codex-primary-window-minutes` and `x-codex-primary-used-percent`
- `x-codex-secondary-window-minutes` and `x-codex-secondary-used-percent`

The selector identifies the 5-hour window as 300 minutes and the weekly window as 10,080 minutes. Header order does not affect the result. Some plans explicitly disable one window by reporting a duration of 0 minutes; the selector ignores that window and evaluates the remaining supported window.

The selector activates the fallback when any available preferred window is at or below the configured remaining threshold. It switches back when every available window is above that threshold. You set the threshold during installation.

The selector does not read local Codex CLI authentication and does not require a Codex CLI sign-in. `amp config model-providers test CONNECTION_ID` tests the ChatGPT subscription already linked to Amp and returns its Codex quota headers.

## Behavior

The command runs `amp config model-providers test` for the preferred connection. This sends a small inference request and returns current quota headers. Amp can exit with an error when the subscription has reached its limit. The selector still uses the response when it contains both header pairs and at least one supported active window.

The command calculates remaining quota as `100 - used_percent`. It checks the selected connection with `amp config model-providers show`. It runs `amp config model-providers activate` only when a change is needed.

A kernel-managed file lock prevents checks, installation and removal from overlapping. A response with a missing window header pair, no supported active window, invalid percentage or invalid provider state leaves the current subscription active and records a failed result.

## Permissions and side effects

The command makes authenticated Amp requests. It can change the active user-level ChatGPT model-provider connection. New Amp inference requests use the active subscription. Existing requests continue unchanged.

The LaunchAgent and local state use mode 0600 or 0700. Stored configuration contains connection IDs, command paths and the threshold. It contains no credentials.

## Examples

Install and start the 5-minute check:

```bash
amp-chatgpt-subscription-selector install \
  --preferred 00000000-0000-4000-8000-000000000001 \
  --fallback 00000000-0000-4000-8000-000000000002 \
  --threshold PERCENT
```

Run a check or inspect the latest result:

```bash
amp-chatgpt-subscription-selector run
amp-chatgpt-subscription-selector status
```

Remove the background task without changing the active subscription:

```bash
amp-chatgpt-subscription-selector uninstall
```

## Troubleshooting

- if `run` reports a provider test failure, run `amp config model-providers test CONNECTION_ID`
- if no usable quota window is found, inspect the test response headers for a missing header pair or changed window duration or name
- if activation fails, confirm both subscriptions still appear in `amp config model-providers list`
- if the background task does not run, inspect `status` and the private selector log

## Maintenance notes

Keep this document aligned with `bin/amp-chatgpt-subscription-selector`. Update the duration mapping if OpenAI changes its 5-hour or weekly quota windows. Update response parsing if Amp changes the output of `model-providers test` or `show`.
