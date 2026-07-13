---
doc_schema: "amp-artifact/v2"
title: "Spawn Subagent"
slug: "spawn-subagent"
status: "active"
summary: "Launches a bounded independent Amp subagent thread, with companion skill guidance for choosing it over built-in Task."
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
  last_verified: "2026-07-12"
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
    - "Oracle tool calls from spawned subagent threads are rejected; unresolved judgment calls must be reported to the parent coordinator, which alone owns expert escalation."
    - "Caller must not poll or wait for the subagent."
    - "Subagent is instructed to report completion through send_to_thread with steer=true."
    - "Subagent decides whether follow-up is required, distinguishing optional parent review from required parent input."
    - "Subagent is instructed to archive itself only after sending a terminal final report where required follow-up is none."
  risks:
    - "Unbounded instructions can create noisy or conflicting parallel work."
    - "Subagent can preserve the wrong intent if it relies only on recent or incidental parent-thread context."
    - "Subagent may modify files according to its built-in agent mode permissions."
related:
  - "delegating-subagents"
  - "send-to-thread"
tags:
  - "subagent"
  - "thread"
  - "coordination"
---

# Spawn Subagent

## Summary

`spawn_subagent` starts an independent Amp subagent thread for one bounded implementation or investigation slice. It lets a coordinator thread keep working while the child thread reports back later through `send_to_thread`, then archives itself after a terminal final report when no required follow-up is needed.

It complements Amp's built-in `Task` tool rather than replacing it. Use `Task` when the parent needs a bounded subagent's final result within its current turn. Use `spawn_subagent` when the work should continue in an addressable child thread while the parent keeps working.

### Relationship with built-in Task

Both tools delegate work to an Amp subagent with a separate context window and tool access. Their lifecycle and coordination models differ:

| Use | Built-in `Task` | `spawn_subagent` |
| --- | --- | --- |
| Parent flow | Receives the subagent's final summary through the current tool call | Returns a child thread ID immediately; the parent must not wait or poll |
| Context | Starts fresh with the task brief supplied by the parent | Starts fresh, then uses `read_thread` to reconstruct parent intent |
| Follow-up | The user and parent cannot guide it mid-task | The child can remain open for required parent input |
| Reporting | Returns one final summary | Reports through `send_to_thread`, then archives itself when no follow-up is required |
| Best fit | Ordinary bounded delegation whose result is needed in the current turn | Work needing durable asynchronous execution, visible child-thread history, or possible parent follow-up |

Before delegating, use a direct or specialist tool when it already covers the job; for example, prefer exact reads, direct searches, `finder`, `librarian`, or `oracle` over a generic subagent. Otherwise, prefer built-in `Task` for ordinary in-turn delegation because it has less coordination overhead. Prefer `spawn_subagent` when the work needs durable asynchronous execution, visible child-thread history, or possible parent follow-up.

### Decision-guidance artifact

The capability contract produces [`skills/delegating-subagents/SKILL.md`](../../../skills/delegating-subagents/SKILL.md) as its reusable decision-guidance artifact. The skill operationalizes this comparison whenever an agent considers delegation: use a direct or specialist tool when sufficient, built-in `Task` for ordinary in-turn work, or `spawn_subagent` for durable asynchronous child-thread work.

`amp/AGENTS.md` requires the agent to load this skill before delegating so the documented choice is applied consistently.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `spawn_subagent`
- Plugin file: `plugins/spawn-subagent.ts`
- Trigger keywords: `/subagent`, `|subagent`, `spawn subagent`, `parallel subagent`, `run this in parallel`

When invoking from the start of a prompt, prefer `|subagent` because Amp reserves `/` for the command palette.

## Contract

Required inputs:

| Field          | Type     | Notes                                                                                                                         |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `instructions` | `string` | Must be non-empty. Include exact scope, non-goals, expected report shape, and the validation the subagent should run or skip. |

Optional inputs:

| Field  | Type                       | Default             | Notes                                                                                                       |
| ------ | -------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `mode` | `low \| medium \| high` | `medium`            | Built-in Amp agent mode for the subagent.                                                                   |
| `cwd`  | `string`                   | Parent thread's cwd | Working directory the subagent should use. The caller may choose a more appropriate directory for the task. |

`ultra` is intentionally unsupported because its Fable 5 usage can consume disproportionate credits in spawned subagents.

Output is a short text confirmation: `Started <mode> subagent in <threadID>. Do not poll or wait for it.`

## Behavior

The tool validates `instructions`, normalizes the built-in mode and `cwd`, obtains a built-in agent with `amp.getBuiltinAgent`, creates a child thread with the current thread as `parentThreadID`, and appends a structured subagent prompt. The caller should choose the directory that owns the bounded task when it differs from the parent thread's working directory. When omitted, `cwd` defaults to the plugin process working directory, which is the parent thread's workspace working directory. The child is instructed to use the selected directory for file and shell operations. If the initial append fails after thread creation, the error includes the child thread ID so the orphaned thread can be inspected or archived manually.

The prompt treats `read_thread` as the required source of truth for parent context. It does not fall back to static prompt reconstruction or whatever partial parent context is otherwise visible. If `read_thread` is unavailable or fails, the subagent must report that it is blocked rather than execute the bounded task from incomplete context.

The plugin also registers a `tool.call` guard that rejects Oracle calls from threads created by `spawn_subagent`. It tracks newly created child thread IDs in memory and recognizes earlier spawned threads from their generated initial message after a plugin restart. The rejection instructs the child to report the unresolved judgment call to its parent coordinator instead.

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

## Permissions and side effects

- Creates a new Amp thread.
- Appends a user message to the new thread.
- Instructs the subagent to archive itself after a terminal report.
- The subagent inherits the selected built-in mode's tool permissions.
- The subagent may make code changes if its task asks for implementation.
- The parent thread does not wait for the subagent and should not poll it.

## Examples

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

### Scenario stress test

| Scenario | Expected behavior |
| --- | --- |
| The task completes and validation passes | Send one `done` report with `steer=true`, set `## Next` to `No follow-up needed`, then archive only after the report succeeds. |
| Validation initially fails but the failure is within the bounded task | Keep working on the bounded task. A fixable test failure is not parent follow-up. |
| `read_thread` is unavailable or fails | Do not execute or inspect partial parent context. Send a `blocked` report, ask the parent to restore access or re-scope the task, and remain unarchived. |
| The reconstructed parent intent conflicts with the bounded instructions and no explicit redirect resolves it | Do not guess. Send a `blocked` report naming the conflict and remain unarchived. |
| The parent redirected the work before the child's initial `read_thread` call | Follow the latest coherent redirect and explain how the bounded task still supports it. |
| The parent redirects only in the parent thread after the child's initial intent reconstruction | The child may finish the bounded task it already understood. As with any asynchronous work, the parent integrates the result only if it still supports the current direction. |
| The child needs a product decision, missing permission, or required context | Send a `blocked` report with one smallest question in `## Next`, then remain open for the parent's reply. |
| The child finishes follow-up requested by the parent | Send a new terminal `done` report, then archive after that report succeeds. |
| Optional review would be useful but no decision is required | Report `done` and `No follow-up needed`. Optional review is part of the parent's normal integration responsibility. |
| Another worker changed the same files while the child was running | Do not revert or overwrite unrelated work. Report the overlap and validation state so the parent can integrate safely. |
| The child discovers unrelated cleanup or a nearby non-blocking issue | Do not broaden scope. Mention it briefly as evidence only if it materially affects integration. |
| `send_to_thread` fails | Do not archive. Retry only after diagnosing the failure; preserve the report for a later successful send. |

This point-in-time understanding is an inherent part of asynchronous delegation, not a condition the child should try to eliminate by polling. The parent owns integration against the current direction.

## Troubleshooting

- `instructions are required`: pass a non-empty task brief.
- `mode must be one of...`: use only `low`, `medium`, or `high`.
- `cwd does not exist` or `cwd is not a directory`: pass an existing directory accessible to the parent Amp process.
- Initial message append failed: use the child thread ID included in the error to inspect or archive the empty thread manually.
- Subagent does not report back: inspect the child thread ID from the return value and check whether `send_to_thread` is available.
- Subagent reports back but remains visible: check whether `archive_current_thread` is available to the subagent, then archive the child thread manually if needed.

## Maintenance notes

- Update this doc when built-in agent modes or reasoning efforts change.
- Update this doc when parent-thread intent reconstruction changes.
- Update this doc when the subagent report format changes.
- Update this doc when self-archive behavior changes.
- Update this doc when the relationship with `send_to_thread` changes.
- Re-check the comparison with built-in `Task` when Amp changes its documented subagent lifecycle.
- Keep examples bounded; this tool is for parallel slices, not broad delegation.
