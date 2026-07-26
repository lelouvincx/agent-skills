---
doc_schema: "amp-artifact/v2"
title: "Transfer PR Thread Owner"
slug: "transfer-pr-thread-owner"
status: "active"
summary: "Lets the current owner atomically transfer one pull-request binding to a registered destination thread."
artifact:
  id: "transfer_pr_thread_owner"
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
    - "destinationThreadID"
runtime:
  uses:
    - "amp.registerTool"
    - "ctx.thread.id"
    - "Bun SQLite"
  dependencies:
    - "opted-in system plugin process"
    - "existing pull-request binding"
    - "destination registered through register_thread_event_recipient"
  env:
    - "AMP_GITHUB_THREAD_EVENTS_ENABLED"
    - "AMP_CONFIG_DIR"
  reads:
    - "recipients and bindings in ${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite"
  writes:
    - "owner_thread_id and updated_at for one binding in ${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite"
  network: []
  logs:
    - "plugin enablement and resolved SQLite state path"
safety:
  permission_level: "local-state-write"
  user_gate: "current owner tool call in the explicitly opted-in process"
  constraints:
    - "The plugin registers this tool only when AMP_GITHUB_THREAD_EVENTS_ENABLED=1."
    - "Take the invoking owner only from ctx.thread.id."
    - "Require the invoker to own the binding and the destination to exist in recipients in the same transaction."
    - "Registration alone grants no ownership."
    - "A parent, destination or unrelated thread that is not the current owner cannot transfer the binding."
    - "Do not attach or migrate an arbitrary thread."
    - "Do not store or resolve secrets."
  risks:
    - "Transferring to the wrong registered thread changes which thread can make later ownership decisions."
    - "Deleting or replacing the local SQLite file would remove durable recipient and ownership state."
related:
  - "bind-pr-to-thread"
  - "register-thread-event-recipient"
tags:
  - "agent-tool"
  - "github"
  - "pull-request"
  - "thread-ownership"
  - "sqlite"
---

# Transfer PR Thread Owner

## Summary

`transfer_pr_thread_owner` lets the current owner transfer one pull-request binding to a destination that registered itself in the opted-in process. The transfer is atomic. Registration alone does not let the destination take ownership.

Parent-authorized transfer is deferred. A parent may ask the owner to transfer, but a parent that does not own the binding cannot invoke this tool successfully.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `transfer_pr_thread_owner`
- Plugin file: `plugins/github-thread-events.ts`
- Process gate: `AMP_GITHUB_THREAD_EVENTS_ENABLED=1`

The system plugin registers this tool only in a process with the exact opt-in value `1`. Deployment must set the opt-in only in the configured stable-runner process. The Plugin API does not expose a runner ID or parent query. The tool takes the invoking thread from `ctx.thread.id` and does not infer either relationship.

## Contract

Required inputs:

| Field | Type | Validation |
| --- | --- | --- |
| `repository` | `string` | Trim whitespace, require exactly 2 non-empty path parts in `owner/repository` form, reject whitespace within either part, then store and compare in lowercase. |
| `pullRequest` | `number` | Require a positive integer. Do not accept a numeric string. |
| `destinationThreadID` | `string` | Trim whitespace and require a non-empty value. Preserve case. |

There are no optional inputs. The schema rejects unknown fields. The current owner is not an input. The tool takes it only from `ctx.thread.id`.

Successful transfer output is JSON text with this exact shape:

```json
{
  "status": "transferred",
  "repository": "lelouvincx/agent-skills",
  "pullRequest": 126,
  "previousOwnerThreadID": "T-old",
  "ownerThreadID": "T-new"
}
```

`status` is `transferred` when the owner changes. If the current owner names itself as the registered destination, the tool returns the same shape with `status: unchanged` and does not change `updated_at`.

The tool uses these ownership errors:

- no binding: `No binding exists for <repository>#<pullRequest>.`
- invoker is not owner: `Only the current owner can transfer <repository>#<pullRequest>.`
- destination is not registered: `Destination thread <destinationThreadID> is not a registered event recipient.`

Every failure leaves the binding and recipient tables unchanged.

Transfer is not idempotent for the old owner: repeating a successful call from that thread fails because it no longer owns the binding. A call from the new owner that names itself returns `unchanged`.

## Behavior

The enabled plugin uses `${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite` and the 2-table schema defined by [`bind_pr_to_thread`](./bind-pr-to-thread.md). After input validation, this tool starts one write transaction before reading ownership state. Within that transaction it:

1. reads the binding for the normalized repository and pull-request number;
2. rejects the call if no binding exists;
3. compares `owner_thread_id` with `ctx.thread.id` and rejects any non-owner;
4. reads `recipients` for `destinationThreadID` and rejects an unregistered destination;
5. returns `unchanged` without a write when the registered destination is already the current owner; or
6. replaces `owner_thread_id`, sets `updated_at` to a UTC ISO 8601 value and commits.

Before transfer, a registered destination cannot invoke the operation because it is not the current owner. A parent or unrelated thread also fails that check. After a successful transfer, the old owner loses transfer authority and the destination becomes the current owner. It may later transfer to another registered recipient.

The transfer changes no repository, pull-request number or base ref. It creates no recipient. The destination must register itself first through `register_thread_event_recipient`.

## Permissions and side effects

This tool reads one binding and one recipient row. On success, it writes only `owner_thread_id` and `updated_at` for that binding. It makes no network request, starts no process, changes no thread and reads no secret.

The default database path is `${AMP_CONFIG_DIR:-~/.config/amp}/state/github-thread-events.sqlite`. `AMP_CONFIG_DIR` changes the state root when set to a non-empty value. Neither environment variable contains a credential.

## Examples

From the destination thread, register first:

```json
{}
```

Then call the transfer tool from the current owner:

```json
{
  "repository": "lelouvincx/agent-skills",
  "pullRequest": 126,
  "destinationThreadID": "T-destination"
}
```

The destination cannot call the transfer on its own behalf before it owns the binding. A parent cannot call it on behalf of a child owner. Either may send a request to the current owner, which remains responsible for invoking the tool.

## Troubleshooting

- Tool not listed: set `AMP_GITHUB_THREAD_EVENTS_ENABLED=1` only in the configured stable-runner process, then restart or reload that plugin. The tool cannot inspect a runner ID.
- No binding: call `bind_pr_to_thread` from the responsible owner thread first.
- Only current owner can transfer: send the transfer request to the thread that currently owns the binding. Do not retry from the destination, parent or an unrelated thread.
- Destination not registered: call `register_thread_event_recipient` from the destination thread in the same opted-in process.
- Transfer succeeded but no events arrive: this tool changes ownership state only. Event pulling, policy checks and append are deferred.
- SQLite open or write failure: check the resolved Amp state directory and its filesystem permissions. No network or credential is involved.

## Maintenance notes

This document is the source of truth for `transfer_pr_thread_owner`. Keep it aligned with [RFC-0009](../rfcs/rfc-0009-durable-github-events-for-local-amp-threads.md), [ISSUE-0002](../issues/issue-0002-durable-github-events-for-local-amp-threads.md) and `plugins/github-thread-events.ts`.

Update this contract before changing inputs, outputs, validation, owner checks, destination registration or transaction behavior. Keep parent-authorized transfer deferred until Amp exposes a supported parent query and RFC-0009 accepts a new contract.
