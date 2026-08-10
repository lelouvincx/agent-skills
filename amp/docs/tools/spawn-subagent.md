---
doc_schema: "amp-artifact/v2"
title: "Spawn Subagent"
slug: "spawn-subagent"
status: "active"
summary: "Starts a managed child thread with local workspace access, parent-intent reconstruction, Oracle rejection, structured reporting, self-archiving, and optional cwd control."
artifact:
  id: "spawn_subagent"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/spawn-subagent.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerTool"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-08-10"
contract:
  input_kind: "json_schema"
  output_kind: "text"
  trigger: "tool_call"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
  required_inputs:
    - "instructions"
  optional_inputs:
    - "mode"
    - "cwd"
    - "executor"
runtime:
  uses:
    - "amp.getBuiltinAgent"
    - "amp.on"
    - "amp.threads.get"
    - "Agent.createThread"
    - "PluginThread.appendUserMessage"
    - "ctx.thread.id"
  dependencies:
    - "send_to_thread tool available to subagent"
    - "archive_current_thread tool available to subagent"
    - "read_thread tool available to subagent for parent intent reconstruction"
  env: []
  reads:
    - "current thread id"
    - "plugin process working directory as the parent thread default"
    - "explicit execution target and stable runner ID when supplied"
    - "parent Amp thread through spawned subagent for intent reconstruction"
  writes:
    - "new child Amp thread"
    - "initial subagent user message"
    - "subagent thread archive state after final report"
  network:
    - "Amp agent runtime for spawned subagent"
  logs: []
safety:
  permission_level: "thread-create"
  user_gate: "agent_decision"
  constraints:
    - "Subagent must receive bounded instructions with scope, constraints, output, and validation."
    - "Subagent must use read_thread to privately reconstruct parent-thread intent before executing."
    - "cwd is accepted only for local execution; Orb children use the Orb workspace and runner children use the selected runner's workspace."
    - "Runner execution requires a non-empty stable runner ID supplied by the caller; the plugin does not discover runners."
    - "Oracle tool calls from spawned subagent threads are rejected; unresolved judgment calls must be reported to the parent coordinator, which alone owns expert escalation."
    - "Ultra mode is reserved for genuinely hard independent reviews of completed parent work."
    - "Ultra mode does not by itself select spawn_subagent over built-in create_thread."
    - "The generated prompt prohibits edits in Ultra mode; Ultra review briefs must state intended behavior and include exact change-set evidence when line-level fidelity matters."
    - "Caller must not poll or wait for the subagent."
    - "Subagent is instructed to report completion through send_to_thread with steer=true."
    - "Subagent decides whether follow-up is required, distinguishing optional parent review from required parent input."
    - "Subagent is instructed to archive itself only after sending a terminal final report where required follow-up is none."
  risks:
    - "Unbounded instructions can create noisy or conflicting parallel work."
    - "Subagent can preserve the wrong intent if it relies only on recent or incidental parent-thread context."
    - "Subagent may modify files according to its built-in agent mode permissions."
    - "Ultra review is read-only through the generated prompt, not through tool-level permissions, and intentionally consumes Amp credits."
related:
  - "delegating-subagents"
  - "send-to-thread"
  - "subagent-control"
tags:
  - "subagent"
  - "thread"
  - "coordination"
---

# Spawn Subagent

## Summary

`spawn_subagent` returns an exposed child thread ID immediately for one bounded task. Use it when the task needs local workspace state or another managed control: an arbitrary local `cwd`, mandatory parent-intent reconstruction, Oracle rejection, active cancellation, structured reporting or self-archiving.

Use built-in `create_thread` for normal addressable cross-turn work. Ultra mode does not select this wrapper.

Choose where the subagent runs with the `executor` field:

- use local execution by default
- use an Amp Orb when the task needs a cloud sandbox
- use a live runner when you know its stable runner ID

Only local execution accepts `cwd`. Orb and runner execution reject `cwd` and use their remote workspace.

The parent can keep working while the child reports back through `send_to_thread`. The parent can inspect, control or message the exposed thread later. The child archives itself after a terminal report when it needs no follow-up.

### Choose Task, create_thread or spawn_subagent

Use built-in `Task` for ordinary bounded one-shot delegation. This includes independent concurrent calls. The parent turn waits for each final tool result.

Use built-in `create_thread` for normal addressable cross-turn work when it is available and its executor can see the required state. This includes later messaging, required follow-up, Orb or runner execution, another project and Ultra-mode review.

Use `spawn_subagent` when its managed controls are required, the user explicitly requests it, or `create_thread` is unavailable and this wrapper's executor can see the required state. It can run locally, in an Orb or on a stable runner.

All 3 mechanisms give the child a separate context. Their lifecycle and controls differ:

| Use | Built-in `Task` | Built-in `create_thread` | `spawn_subagent` |
| --- | --- | --- | --- |
| Parent flow | Waits for one final tool result | Returns a thread ID; use either an asynchronous reply or `wait_for_threads` | Returns a thread ID immediately; do not wait or poll |
| Context | Uses the supplied task brief | Uses the supplied prompt and attachments | Must reconstruct parent intent with `read_thread` |
| Follow-up | No mid-task guidance | Supports later messaging through `thread_interact` | Supports later messaging and required parent input |
| Reporting | Returns one final summary | Replies asynchronously or is inspected with `read_thread` after a blocking join | Reports through `send_to_thread` and self-archives when complete |
| Control | No exposed thread control | Messaging, metadata, archive and unarchive | Adds active-turn cancellation through `subagent_control` |
| Execution | Built-in Task path | Orb, runner or another project | Local, Orb or runner; local execution accepts an arbitrary `cwd` |
| Best fit | Bounded one-turn work | Normal addressable cross-turn work whose state is available to the executor, including Ultra reviews | Work that needs local state, managed controls or an explicit spawn request |

Use a direct or specialist tool when it already covers the job. For example, prefer exact reads, direct searches, `finder`, `librarian`, or `oracle` over a generic subagent.

Ultra review complements rather than replaces default Oracle. Use Oracle for a focused expert opinion. Use an Ultra child for a full review of completed work when its current routing adds an independent perspective. Choose `create_thread` or `spawn_subagent` from the controls the task needs. Do not choose this wrapper only because the child uses Ultra mode.

### Decision-guidance artifact

The capability contract produces the [`delegating-subagents` skill](../../../skills/delegating-subagents/SKILL.md). The skill applies this comparison whenever an agent considers delegation.

`amp/AGENTS.md` requires agents to load the skill before delegating.

The related `subagent_control` tool can list, inspect or cancel children created by the current parent. Use it only when the user asks for intervention or diagnosis. Do not poll or wait for a child during its normal lifecycle.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `spawn_subagent`
- Plugin file: `plugins/spawn-subagent.ts`
- Explicit trigger phrases: `/subagent`, `|subagent`, `spawn a subagent`

When invoking from the start of a prompt, prefer `|subagent` because Amp reserves `/` for the command palette.

## Contract

### Required input

| Field          | Type     | Notes                                                                                                                         |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `instructions` | `string` | Must be non-empty. Include exact scope, non-goals, expected report shape, and the validation the subagent should run or skip. |

### Optional inputs

| Field      | Type                                                   | Default             | Notes                                                                             |
| ---------- | ------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------- |
| `mode`     | `low \| medium \| high \| ultra`                  | `medium`            | Built-in Amp agent mode. `ultra` adds a read-only review instruction and is reserved for genuinely hard reviews of completed parent work. |
| `cwd`      | `string`                                               | Parent thread's cwd | Working directory for local execution. Orb and runner execution reject this field. |
| `executor` | `local \| orb \| { type: "runner", id: string }` | `local`             | Execution target passed to Amp's `Agent.createThread` API.                        |

`ultra` intentionally consumes Amp credits. Use it only for a genuinely hard independent review. The generated prompt prohibits edits. The brief must state intended behavior, identify relevant files, include exact change-set evidence when line-level fidelity matters, and request high-confidence findings only.

### Choose where the subagent runs

| Target | `executor` value | `cwd` behavior | Workspace |
| --- | --- | --- | --- |
| Local execution | omit the field or use `"local"` | accepts `cwd`; defaults to the parent thread's working directory | the local path selected by `cwd` |
| Orb execution | `"orb"` | rejects `cwd` | the Orb's current workspace |
| Runner execution | `{ "type": "runner", "id": "<stable-id>" }` | rejects `cwd` | the selected runner's current workspace |

Keep the public field name `executor`. It matches Amp's `AgentThreadExecutor` union for local, Orb and runner targets.

Runner execution needs a non-empty stable ID for a live runner. The Plugin API cannot list runners, so `spawn_subagent` does not discover or resolve them.

### Output

Output is a short text confirmation: `Started <mode> subagent in <threadID>. Do not poll or wait for it.`

## Behavior

### Create the child thread

The tool validates `instructions`, `mode`, `executor` and `cwd`. It gets a built-in agent with `amp.getBuiltinAgent`.

The tool then calls `Agent.createThread`. It passes the current thread as `parentThreadID` and passes the execution target through `executor`.

The tool appends a structured prompt to the child. If this fails after thread creation, the error includes the child thread ID. Use that ID to inspect or archive the empty thread.

### Reconstruct parent intent

The prompt requires the child to use `read_thread` as the source of truth for parent context. The child cannot fall back to static prompt reconstruction or partial context.

If `read_thread` is unavailable or fails, the child reports that it is blocked. It does not run the task from incomplete context.

### Restrict Oracle calls

The plugin registers a `tool.call` guard that rejects Oracle calls from children created by `spawn_subagent`. It tracks new child thread IDs in memory.

After a plugin restart, it recognizes earlier children from their generated initial message. The rejection tells the child to report the unresolved judgment call to its parent coordinator.

This guard keeps expert escalation with the parent. It does not remove or deprecate the parent's default Oracle. The parent chooses between Oracle and an Ultra review before creating a child or after receiving its result.

### Follow the child lifecycle

The prompt gives the subagent two phases:

- Before work:
  - Preserve parent-thread intent.
  - Use `read_thread` on the parent thread; if it is unavailable or fails, report blocked without inspecting or relying on partial parent context.
  - Keep distinct the original user intent, later user redirects, the latest coherent requested outcome, and how the bounded subagent task supports that outcome.
  - Do not let incidental recent-message context replace the original task intent.
  - If reconstructed intent and subagent instructions appear to conflict, follow explicit latest redirects and otherwise report the ambiguity as a blocker instead of guessing.
  - Treat intent reconstruction, reporting with `steer=true`, and terminal self-archiving as mandatory lifecycle rules that bounded task instructions cannot override. Report a conflict as blocked.
- After work:
  - Do not invoke Oracle. Report unresolved judgment calls to the parent coordinator; the parent alone owns expert escalation.
  - Call `send_to_thread` with a concise structured report that follows the canonical `send_to_thread` shape: each Markdown heading is on its own line, followed by its value or content on subsequent lines.
  - Keep lifecycle decision and archive instructions outside the report template so they are executed rather than included in the message sent to the parent.
  - Interpret required follow-up narrowly: optional parent review, FYI summaries, or “review the diff if desired” are not required follow-up.
  - Required follow-up means the subagent cannot safely finish without parent input, such as a decision between alternatives, missing context, permission, a blocker, or explicit next instructions.
  - If the report is terminal and `## Next` says `No follow-up needed`, call `archive_current_thread` to archive itself.
  - If blocked or requiring parent input, stay unarchived so the parent can reply.
  - After completing follow-up, send a new terminal report and archive itself.

In Ultra mode, the generated prompt makes the child a read-only reviewer and prohibits file changes. Other modes may edit files when the bounded task requires implementation. Built-in Ultra still has its normal tools, so the read-only boundary is prompt-enforced rather than a tool-level permission boundary.

## Permissions and side effects

- creates a new Amp thread
- appends a user message to the new thread
- tells the subagent to archive itself after a terminal report
- gives the subagent the selected built-in mode's tool permissions
- lets non-Ultra subagents change code when their task asks for implementation
- lets the parent continue without waiting or polling

## Examples

Use built-in `Task` when a bounded task only needs to return one result in the current turn. Use built-in `create_thread` for normal addressable cross-turn work. The examples below use this wrapper because they need its managed controls or the user explicitly requested it.

Use Ultra through the managed wrapper when its controls are required:

```json
{
  "mode": "ultra",
  "instructions": "Review the completed changes only; do not edit files. Intent: retry timing changes must not alter cancellation behavior. Start from the exact working-tree diff and inspect only the surrounding code needed to verify it. Return high-confidence correctness or regression findings with evidence, plus the smallest fix for each. Report no finding when the change is sound."
}
```

### Local examples

Spawn a default medium subagent:

```json
{
  "instructions": "Inspect plugins/holistics-md.ts and report whether the markdown-table transformation has edge cases around empty rows. Do not edit files."
}
```

Spawn a faster subagent:

```json
{
  "mode": "low",
  "instructions": "Run the focused docs heading consistency check and report failures only."
}
```

Spawn a subagent in another project directory:

```json
{
  "cwd": "/path/to/project",
  "instructions": "Inspect the authentication flow in this project and report the relevant files. Do not edit files."
}
```

### Orb example

Use the Orb workspace rather than a local `cwd`:

```json
{
  "executor": "orb",
  "instructions": "Inspect the checked-out project and run its focused validation."
}
```

### Runner example

Use a known live runner by stable ID:

```json
{
  "executor": { "type": "runner", "id": "runner-stable-id" },
  "instructions": "Run the bounded task in the runner's current workspace."
}
```

### Lifecycle scenarios

| Scenario | Expected behavior |
| --- | --- |
| The task completes and validation passes | Send one `done` report with `steer=true`, set `## Next` to `No follow-up needed`, then archive only after the report succeeds. |
| Validation initially fails but the failure is within the bounded task | Keep working on the bounded task. A fixable test failure is not parent follow-up. |
| `read_thread` is unavailable or fails | Do not execute or inspect partial parent context. Send a `blocked` report, ask the parent to restore access or re-scope the task, and remain unarchived. |
| The reconstructed parent intent conflicts with the bounded instructions and no explicit redirect resolves it | Do not guess. Send a `blocked` report naming the conflict and remain unarchived. |
| The parent redirected the work before the child's initial `read_thread` call | Follow the latest coherent redirect and explain how the bounded task still supports it. |
| The parent redirects only in the parent thread after the child's initial intent reconstruction | The child may finish the bounded task it already understood. Because the child runs independently across turns, the parent integrates the result only if it still supports the current direction. |
| The child needs a product decision, missing permission, or required context | Send a `blocked` report with one smallest question in `## Next`, then remain open for the parent's reply. |
| The child finishes follow-up requested by the parent | Send a new terminal `done` report, then archive after that report succeeds. |
| Optional review would be useful but no decision is required | Report `done` and `No follow-up needed`. Optional review is part of the parent's normal integration responsibility. |
| Another worker changed the same files while the child was running | Do not revert or overwrite unrelated work. Report the overlap and validation state so the parent can integrate safely. |
| The child discovers unrelated cleanup or a nearby non-blocking issue | Do not broaden scope. Mention it briefly as evidence only if it materially affects integration. |
| `send_to_thread` fails | Do not archive. Retry only after diagnosing the failure; preserve the report for a later successful send. |

Cross-turn delegation gives the child a point-in-time understanding of the parent task. The child must not poll to remove this limit. The parent owns integration with the current direction.

## Troubleshooting

- `instructions are required`: pass a non-empty task brief.
- `mode must be one of...`: use `low`, `medium`, `high`, or `ultra`. Reserve `ultra` for genuinely hard reviews.
- `executor must be...`: use `local`, `orb`, or `{ "type": "runner", "id": "..." }` with a non-empty stable runner ID.
- `cwd is only supported for local execution`: omit `cwd` for Orb and runner execution; the Orb or selected runner supplies the workspace.
- `cwd does not exist` or `cwd is not a directory`: pass an existing directory accessible to the parent Amp process.
- Initial message append failed: use the child thread ID included in the error to inspect or archive the empty thread manually.
- No exposed child thread is needed: use built-in `Task`, including for independent concurrent calls. The parent turn waits for each final result.
- Normal addressable child work does not need managed controls: use built-in `create_thread`.
- Subagent does not report back: inspect the child thread ID from the return value and check whether `send_to_thread` is available.
- Subagent reports back but remains visible: check whether `archive_current_thread` is available to the subagent, then archive the child thread manually if needed.

## Maintenance notes

- Update this doc when built-in agent modes or reasoning efforts change.
- Re-check `AgentThreadExecutor` with `amp plugins show-docs` when Amp updates its Plugin API.
- Update this doc when parent-thread intent reconstruction changes.
- Update this doc when the subagent report format changes.
- Update this doc when self-archive behavior changes.
- Update this doc when the relationship with `send_to_thread` changes.
- Re-check the comparison with built-in `Task` and `create_thread` when Amp changes its documented child-thread lifecycle.
- Re-check `subagent_control` transcript discovery when the spawn result format changes.
- Keep examples bounded and specific to managed controls. Use built-in `Task` for one-turn delegation and `create_thread` for normal addressable work.
