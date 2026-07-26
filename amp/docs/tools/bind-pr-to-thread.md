---
doc_schema: "amp-artifact/v2"
title: "Bind PR to Thread"
slug: "bind-pr-to-thread"
status: "active"
summary: "Creates one durable pull-request ownership binding for the invoking thread in the opted-in local process."
artifact:
  id: "bind_pr_to_thread"
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
  required_inputs:
    - "repository"
    - "pullRequest"
    - "baseRef"
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
    - "recipients and bindings in ${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite"
  writes:
    - "recipients and bindings in ${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite"
  network: []
  logs:
    - "plugin enablement and resolved SQLite state path"
safety:
  permission_level: "local-state-write"
  user_gate: "agent decision in the explicitly opted-in process"
  constraints:
    - "The plugin registers this tool only when AMP_GITHUB_THREAD_EVENTS_ENABLED=1."
    - "Take ownerThreadID only from ctx.thread.id; never accept it as input."
    - "Store repository as lowercase owner/repository and require a positive integer pullRequest plus a non-empty baseRef."
    - "Atomically register the invoking owner and create or update only that owner's unique pull-request binding."
    - "Reject any different invoking thread without changing recipients or bindings."
    - "Do not attach or migrate an arbitrary thread."
    - "Do not store or resolve secrets."
  risks:
    - "Setting the opt-in in the wrong Amp process would make that process eligible to register ownership tools."
    - "Deleting or replacing the local SQLite file would remove durable recipient and ownership state."
related:
  - "register-thread-event-recipient"
  - "transfer-pr-thread-owner"
tags:
  - "agent-tool"
  - "github"
  - "pull-request"
  - "thread-ownership"
  - "sqlite"
---

# Bind PR to Thread

## Summary

`bind_pr_to_thread` binds one repository and pull-request number to the invoking Amp thread. It also registers that thread as an event recipient. The tool never accepts an owner thread ID from its caller.

This is an accepted contract for the local ownership-control slice in [RFC-0009](../rfcs/rfc-0009-durable-github-events-for-local-amp-threads.md). It does not pull events, query GitHub, append to threads or deploy cloud resources.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `bind_pr_to_thread`
- Plugin file: `plugins/github-thread-events.ts`
- Process gate: `AMP_GITHUB_THREAD_EVENTS_ENABLED=1`

The system plugin registers this tool only in a process with the exact opt-in value `1`. It first validates the projected GitHub thread event configuration and applicable policy files. Missing or invalid runtime contracts stop startup before the plugin creates ownership state. The plugin does not register any tool after this failure. Set the opt-in only in the configured stable-runner process. The Plugin API does not expose a runner ID, so the plugin does not query one. Invocation in the opted-in process supplies the owner through `ctx.thread.id`.

## Contract

Required inputs:

| Field | Type | Validation |
| --- | --- | --- |
| `repository` | `string` | Trim whitespace, require exactly 2 non-empty path parts in `owner/repository` form, reject whitespace within either part, then store in lowercase. |
| `pullRequest` | `number` | Require a positive integer. Do not accept a numeric string. |
| `baseRef` | `string` | Trim whitespace and require a non-empty value. Preserve case. |

There are no optional inputs. The schema rejects unknown fields. Owner is not an input. The tool takes `ownerThreadID` only from `ctx.thread.id`.

Success output is JSON text with this exact shape:

```json
{
  "status": "created",
  "repository": "lelouvincx/agent-skills",
  "pullRequest": 126,
  "baseRef": "main",
  "ownerThreadID": "T-..."
}
```

`status` is one of:

- `created` when no binding existed
- `unchanged` when the same owner and base ref were already stored
- `base_ref_updated` when the same owner changed `baseRef`

Validation errors identify the invalid field. If another thread owns the normalized repository and pull-request key, the tool fails with `Pull request <repository>#<pullRequest> is already owned by another thread.` It must not expose a replacement or attach option.

## Behavior

The enabled plugin resolves `${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite`, creates its parent directory when needed and opens the database with foreign keys enabled. One recipient can own many pull-request bindings. Each binding has exactly one owner.

```diagram
┌──────────────────────┐  1       many  ┌──────────────────────────┐
│ recipients           │────────────────│ bindings                 │
├──────────────────────┤                ├──────────────────────────┤
│ PK thread_id         │                │ PK repository            │
│    registered_at     │                │ PK pull_request          │
└──────────────────────┘                │    base_ref              │
                                        │ FK owner_thread_id       │
                                        │    updated_at            │
                                        └──────────────────────────┘
```

```dbml
Table recipients {
  thread_id text [pk, not null]
  registered_at text [not null]
}

Table bindings {
  repository text [not null]
  pull_request integer [not null, note: 'Must be greater than 0']
  base_ref text [not null]
  owner_thread_id text [not null, ref: > recipients.thread_id]
  updated_at text [not null]

  indexes {
    (repository, pull_request) [pk]
  }
}
```

Timestamps are UTC ISO 8601 strings. The plugin keeps the first `registered_at` value. It changes `updated_at` only when it creates a binding or changes its base ref or owner.

After validation, the tool starts one write transaction before it reads ownership state. Within that transaction it:

1. inserts `ctx.thread.id` into `recipients` if absent;
2. reads the binding for the normalized repository and pull-request number;
3. creates the binding when absent;
4. returns `unchanged` without updating timestamps when the same owner and base ref already match;
5. updates `base_ref` and `updated_at` when the same owner supplies a different base ref; or
6. rejects a different owner and rolls back the recipient insert and every other change.

The unique primary key allows one active binding for each normalized repository and pull-request number. The same owner may call the tool repeatedly. A different thread must receive ownership through `transfer_pr_thread_owner` after it registers itself.

The plugin keeps the database open for the worker-process lifetime. Amp exposes no supported cleanup callback, so process exit closes the runtime database. SQLite failures surface to the caller as errors rather than separate plugin log entries.

## Permissions and side effects

At startup, the plugin reads projected non-secret configuration and applicable policy files. This tool reads and writes only the local SQLite `recipients` and `bindings` tables. First use may create the Amp state directory, database file and 2 tables. The tool makes no network request. It starts no process, changes no thread and reads no secret.

The default database path is `${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite`. `AMP_CONFIG_DIR` changes the state root when set to a non-empty value. Neither environment variable contains a credential.

## Examples

Create a binding for the invoking thread:

```json
{
  "repository": "lelouvincx/agent-skills",
  "pullRequest": 126,
  "baseRef": "main"
}
```

The stored repository is `lelouvincx/agent-skills`. Repeating the call from the same owner returns `unchanged`. Changing only `baseRef` from the same owner returns `base_ref_updated`.

Calling from another thread returns an ownership error. It does not register that thread or replace the existing owner.

## Troubleshooting

- Tool not listed: set `AMP_GITHUB_THREAD_EVENTS_ENABLED=1` only in the configured stable-runner process, then restart or reload that plugin. The tool cannot inspect a runner ID.
- `repository` rejected: use one `owner/repository` value with no whitespace in either part.
- `pullRequest` rejected: pass a JSON number greater than 0 with no decimal part.
- `baseRef` rejected: pass a non-empty branch name. The tool trims outer whitespace but preserves case.
- Already owned: invoke `transfer_pr_thread_owner` from the current owner after the destination has registered. Do not try to bind from the destination.
- SQLite open or write failure: check the resolved Amp state directory and its filesystem permissions. No network or GitHub credential is involved.

## Maintenance notes

This document is the source of truth for `bind_pr_to_thread`. Keep it aligned with [`register_thread_event_recipient`](./register-thread-event-recipient.md), [`transfer_pr_thread_owner`](./transfer-pr-thread-owner.md), [RFC-0009](../rfcs/rfc-0009-durable-github-events-for-local-amp-threads.md), [ISSUE-0002](../issues/issue-0002-durable-github-events-for-local-amp-threads.md) and `plugins/github-thread-events.ts`.

Update this contract before changing inputs, outputs, normalization, transaction behavior, database path or ownership rules. Keep event pulling, policy resolution, GitHub preflight, append and reconciliation out of this tool.
