---
doc_schema: "amp-artifact/v2"
title: "Register Thread Event Recipient"
slug: "register-thread-event-recipient"
status: "active"
summary: "Registers the invoking thread as an eligible transfer destination without granting pull-request ownership."
artifact:
  id: "register_thread_event_recipient"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/github-thread-events.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerTool"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: null
  last_verified: "2026-07-26"
contract:
  input_kind: "json_schema"
  output_kind: "json_text"
  trigger: "tool_call"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "amp.registerTool"
    - "ctx.thread.id"
    - "Bun SQLite"
  dependencies:
    - "opted-in system plugin process"
    - "local filesystem access to the Amp state directory"
  env:
    - "AMP_GITHUB_THREAD_EVENTS_ENABLED"
    - "AMP_CONFIG_DIR"
  reads:
    - "projected GitHub thread event configuration and applicable policy files under ${AMP_CONFIG_DIR:-~/.config/amp}/github-thread-events"
    - "recipients in ${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite"
  writes:
    - "recipients in ${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite"
  network: []
  logs:
    - "plugin enablement and resolved SQLite state path"
safety:
  permission_level: "local-state-write"
  user_gate: "agent decision in the explicitly opted-in process"
  constraints:
    - "The plugin registers this tool only when AMP_GITHUB_THREAD_EVENTS_ENABLED=1."
    - "Accept no input and record only ctx.thread.id plus its first registration time."
    - "Create no pull-request binding and grant no ownership."
    - "Keep repeated calls idempotent."
    - "Do not attach or migrate an arbitrary thread."
    - "Do not store or resolve secrets."
  risks:
    - "Setting the opt-in in the wrong Amp process would let threads in that process register as transfer destinations."
    - "Treating recipient registration as ownership would bypass the required owner-only transfer."
related:
  - "bind-pr-to-thread"
  - "transfer-pr-thread-owner"
tags:
  - "agent-tool"
  - "github"
  - "thread-recipient"
  - "thread-ownership"
  - "sqlite"
---

# Register Thread Event Recipient

## Summary

`register_thread_event_recipient` registers only the invoking thread as an eligible destination for a later ownership transfer. Registration creates no pull-request binding and grants no ownership.

This separation is mandatory. The current owner must still invoke `transfer_pr_thread_owner` before the registered thread owns any pull request.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `register_thread_event_recipient`
- Plugin file: `plugins/github-thread-events.ts`
- Process gate: `AMP_GITHUB_THREAD_EVENTS_ENABLED=1`

The tool is registered only in a process with the exact opt-in value `1`. Before registration, the plugin loads and validates the projected GitHub thread event configuration and applicable policy files. Invalid or missing required runtime contracts stop startup before the plugin creates ownership state or registers any tool. Deployment must set this only in the configured stable-runner process. The Plugin API does not expose a runner ID. The tool therefore proves process eligibility through invocation and records `ctx.thread.id` without making a runner-ID query.

## Contract

The tool accepts an empty JSON object and no fields:

```json
{}
```

It takes the recipient thread ID only from `ctx.thread.id`.

Success output is JSON text with this exact shape:

```json
{
  "status": "registered",
  "threadID": "T-..."
}
```

`status` is `registered` on the first call and `already_registered` on later calls. Registration never grants ownership.

The input schema rejects every field. The tool returns a SQLite error if it cannot read or write the local state. It does not accept a repository, pull-request number, owner or destination thread ID.

## Behavior

The enabled plugin uses `${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite` and the 2-table schema defined by [`bind_pr_to_thread`](./bind-pr-to-thread.md). After validating the empty input, this tool starts one write transaction and reads `recipients` for `ctx.thread.id`.

If the thread is absent, the tool inserts `thread_id` and a UTC ISO 8601 `registered_at` value. If the thread already exists, it returns `already_registered` without changing `registered_at`.

The tool never reads or writes `bindings`. Registration does not assign an owner, change an owner or reserve any repository and pull-request key.

## Permissions and side effects

At startup, the plugin reads the projected non-secret configuration and applicable policy files. This tool reads and may insert one row in the local `recipients` table. The enabled plugin may create the Amp state directory, database file and 2 ownership tables before it registers tools. The tool makes no network request, starts no process, changes no thread and reads no secret.

The default database path is `${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite`. `AMP_CONFIG_DIR` changes the state root when set to a non-empty value. Neither environment variable contains a credential.

## Examples

Register the current thread:

```json
{}
```

Example first result:

```json
{"status":"registered","threadID":"T-..."}
```

Example repeated result:

```json
{"status":"already_registered","threadID":"T-..."}
```

Neither result means the thread owns a pull request. The existing owner must name this registered thread in a successful `transfer_pr_thread_owner` call.

## Troubleshooting

- Tool not listed: set `AMP_GITHUB_THREAD_EVENTS_ENABLED=1` only in the configured stable-runner process, then restart or reload that plugin. The tool cannot inspect a runner ID.
- Input rejected: pass `{}` with no fields.
- Registered but no events arrive: registration grants no ownership. Check that the current owner transferred the relevant binding. Event delivery itself is not part of this tool.
- Transfer says destination is not registered: call this tool from the destination thread in the same opted-in process, not from the owner on its behalf.
- SQLite open or write failure: check the resolved Amp state directory and its filesystem permissions. No network or credential is involved.

## Maintenance notes

This document is the source of truth for `register_thread_event_recipient`. Keep it aligned with [`bind_pr_to_thread`](./bind-pr-to-thread.md), [`transfer_pr_thread_owner`](./transfer-pr-thread-owner.md), [RFC-0009](../rfcs/rfc-0009-durable-github-events-for-local-amp-threads.md), [ISSUE-0002](../issues/issue-0002-durable-github-events-for-local-amp-threads.md) and `plugins/github-thread-events.ts`.

Do not add repository or ownership inputs. Update this contract before changing output, idempotence, process gating or the recipient table. Keep registration separate from binding and transfer.
