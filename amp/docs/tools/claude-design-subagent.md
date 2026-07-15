---
doc_schema: "amp-artifact/v2"
title: "Claude Design Subagent"
slug: "claude-design-subagent"
status: "active"
summary: "Routes explicit Claude Design work through Claude Code's authenticated first-party integration."
artifact:
  id: "claude_design_subagent"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  api_stability: "experimental"
source:
  kind: "plugin"
  file: "plugins/claude-code-subagent.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerTool"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: null
  last_verified: "2026-07-15"
contract:
  input_kind: "json_schema"
  output_kind: "json_text"
  trigger: "tool_call"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
  required_inputs:
    - "prompt"
runtime:
  uses:
    - "spawn: claude"
    - "Claude Code ToolSearch"
    - "Claude Code DesignSync"
    - "Claude Design MCP tools"
    - "ctx.thread.id"
  dependencies:
    - "Claude Code 2.1.181 or newer on PATH"
    - "Claude Code signed in with a Claude subscription"
    - "Claude Design enabled for the account or organization"
    - "Claude Design consent granted with /design consent"
  env:
    - "AMP_CLAUDE_CODE_SUBAGENT_AUDIT_DIR"
    - "AMP_CLAUDE_CODE_SUBAGENT_DEBUG"
  reads:
    - "workingDirectory"
    - "Claude Design projects"
    - "Claude Code session state when sessionId is supplied"
  writes:
    - "Claude Design projects through mcp__claude-design__*"
    - "~/.config/amp/logs/claude-code-subagent/*.json"
  network:
    - "Claude Code model provider via claude CLI"
    - "Claude Design MCP through Claude Code"
  logs:
    - "redacted audit log"
    - "optional raw transcript"
safety:
  permission_level: "design-write"
  user_gate: "explicit user request to use Claude Design"
  constraints:
    - "Uses Claude Code as the authenticated proxy; Amp does not connect to Claude Design MCP directly."
    - "Allows Read, Grep, Glob, ToolSearch, DesignSync, and mcp__claude-design__* only."
    - "Denies Bash, Edit, Write, and NotebookEdit."
    - "Loads only Claude Code user settings; project and local settings cannot add hooks, plugins, skills, or permission rules."
    - "Does not load caller-supplied MCP configuration or arbitrary MCP tools."
    - "The spawned Claude process receives a sanitized environment so ambient API keys do not disable claude.ai connectors."
  risks:
    - "Claude Design MCP calls can create or modify cloud-hosted design projects."
    - "Resuming the wrong Claude Code session can apply feedback to the wrong design conversation."
    - "includeRawTranscript stores sensitive raw stdout and stderr."
related:
  - "claude-code-subagent"
tags:
  - "subagent"
  - "claude"
  - "design"
  - "write"
---

# Claude Design subagent

## Summary

`claude_design_subagent` lets Amp create, inspect and refine Claude Design cloud projects. It uses Claude Code's authenticated first-party integration.

The tool is a narrow proxy. Claude may read selected local context. It cannot run shell commands or write local files.

## Invocation

### When to use the tool

Call the tool only after the user explicitly asks to use Claude Design.

Use it for a named new or existing Claude Design project. Supported work includes:

- cloud creation
- inspection
- bounded refinement
- exact source read-back

Use normal Amp tools instead when:

- the user wants only local implementation
- the task would require a cloud write that the user has not requested
- the user expects the proxy to write or export local files

Direct canvas and comment synchronization is unverified. `DesignSync` is experimental. Do not use these capabilities as reasons to invoke the tool automatically.

### Invocation details

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `claude_design_subagent`
- Plugin file: `plugins/claude-code-subagent.ts`

## Contract

Required input:

| Field | Type | Notes |
| --- | --- | --- |
| `prompt` | `string` | The design task or feedback for Claude Code to execute through Claude Design. |

Optional inputs:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `sessionId` | `string` | none | Resume the Claude Code session returned by an earlier call for iterative work. |
| `model` | `opus \| sonnet` | `opus` | Use Sonnet for a faster or lighter orchestration turn. |
| `timeoutMinutes` | `number` | `10` | Rounded up and capped at `30`. |
| `workingDirectory` | `string` | plugin process cwd | Repository whose design system or local files Claude may read. |
| `includeRawTranscript` | `boolean` | `false` | Stores raw Claude CLI output for debugging. |

Output is JSON containing:

- `ok`
- `result` on success or `error` on failure
- `sessionId`
- model metadata
- `auditLogPath`

A fresh call assigns its Claude Code session ID before the child starts. A resumed call retains the supplied session ID. The known ID is returned on success, timeout, output-limit failure, non-zero exit, and invalid JSON so an ambiguous cloud mutation can be inspected. A pre-start failure can still leave an ID with no persisted session.

A call is complete when Amp has recorded the audit path and session ID. For project work, Amp must also validate the returned project ID or URL against the intended project.

## Behavior

The tool runs `claude -p` with Claude Code user settings only. This keeps its first-party Claude Design integration and account consent available without loading repository-controlled project or local settings.

Fresh calls receive a wrapper-generated UUID through `--session-id`; iterative calls use `--resume`. Claude's final session ID must match the expected ID. The child is terminated and the call fails explicitly if combined stdout and stderr exceed 5 MiB.

It allows only:

- local read tools
- `ToolSearch`
- `DesignSync`
- `mcp__claude-design__*`

It denies `Bash`, `Edit`, `Write` and `NotebookEdit`.

Claude Code discovers deferred Design tools through `ToolSearch`. It returns project IDs, URLs or source in its response when requested.

The child receives a sanitized environment. It does not inherit ambient `ANTHROPIC_API_KEY` or similar secret-looking variables.

API-key authentication disables claude.ai connectors, including Claude Design. Authentication uses the user's existing Claude subscription login.

### Verification status

As of 2026-07-13, the following cloud lifecycle capabilities are verified:

- project and design-system discovery
- one-project creation with a requested design-system ID
- stable ID and URL recovery
- one project-scoped edit and read-back
- continuation with an explicitly passed Claude Code session ID
- fresh-session recovery from a complete handoff packet

Registration, command construction and session validation are also verified. Permission boundaries, environment sanitization, audit behavior and authentication are verified.

Deterministic regression coverage verifies preassigned fresh-session IDs, resumed-session IDs, user-only setting sources, session-ID preservation on timeout and failure, and the shared output limit.

Design-system attachment remains qualified. The ID was requested during creation and reflected in the project-bound design prompt. However, Claude Design exposes no independent project field for reading the attachment back.

Direct canvas-edit synchronization and inline-comment ingestion remain inconclusive. Helium's approval-only automation target was isolated behind a Cloudflare challenge. No UI mutation was attempted.

`DesignSync` remains experimental.

Response-mediated source handoff is verified. A fresh proxy session can reopen a known project and return exact file content.

Amp then materializes that response with normal local tools in a separately authorized step. This was verified for one self-contained HTML deliverable.

Sufficiency for multi-file or design-system-bound projects remains qualified.

### Supervised user-Amp workflow

```text
╭─────────────╮    brief     ╭──────────────╮    narrow proxy    ╭───────────────╮
│    User     │─────────────▶│     Amp      │───────────────────▶│  Claude Code  │
│ reviews UI  │◀─────────────│ coordinates  │◀───────────────────│ authenticated │
╰──────┬──────╯   project URL╰──────┬───────╯  session + audit  ╰───────┬───────╯
       │                            │                                  │
       │ visual feedback            │ read-back                        │ Design MCP
       │                            │                                  ▼
       │                     ╭──────▼───────╮                  ╭───────────────╮
       ╰────────────────────▶│ Local source │                  │ Claude Design │
             approval        │ implementation│◀── exact source ┤ cloud project │
                             ╰──────────────╯    via response   ╰───────────────╯
```

| Stage | User | Amp completion criterion |
| --- | --- | --- |
| Brief | Provides the goal, users, screens or states, constraints, and acceptance criteria; explicitly opts into Claude Design. | Confirms new versus existing project and limits `workingDirectory` and local reads to relevant paths. |
| Identity | Confirms the intended project and design system. | Records exact project name, ID or URL, design-system name and ID, Claude Code session ID, and audit path. Do not rely only on default design-system status. |
| Cloud write | Approves the stated mutation. | Applies one bounded delta. Broad, destructive, shared-project, or multi-project work gets fresh confirmation. |
| Review | Inspects the canvas and reports concrete deltas, including any direct canvas edits or comments. | Reads back the same project ID and reports verified files or markers. A prose success response alone does not verify cloud state. |
| Approval | Accepts a direction and names exceptions. | Records project identity, design-system ID, revision or time, criteria, decisions, and unresolved feedback in the handoff packet. |
| Implementation | Authorizes the local implementation scope. | Requests exact source in the proxy response, writes it with normal Amp tools, and validates the local result. |

For each iteration:

1. Pass the prior `sessionId`, project ID or URL, and a concise decision summary.
2. Tell Claude to reopen the identified project before applying the next delta.
3. Ask the user to summarize direct canvas edits and comments until synchronization is verified.

The plugin stores no Amp-thread-to-Claude-session mapping.

For a new Amp thread or fresh Claude session, provide a handoff packet containing:

- project ID or URL
- design-system ID
- approval state
- revision or time
- key decisions
- unresolved feedback
- expected files or markers
- the prior `sessionId`, only when conversational continuity is required

The project URL recovers canvas identity. Only the session ID resumes the prior Claude Code conversation.

If a mutating call times out or is ambiguous:

1. Preserve its audit path and session ID.
2. Inspect the target project.
3. Apply only the missing delta.

Mutation idempotency is not guaranteed.
If Claude failed before session initialization, the preassigned ID may not have a persisted conversation; project inspection remains authoritative.

## Permissions and side effects

Claude may read the selected working directory. It may create or modify Claude Design cloud projects.

`includeRawTranscript: true` stores sensitive raw stdout and stderr. Use it only for necessary debugging.

`DesignSync` may read local design-system files and sync their representation to Claude Design. It remains experimental.

Setup is a one-time local prerequisite:

```bash
claude update
claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp
claude -p -- '/design consent'
```

Claude Code 2.1.181 or newer is required.

Run the consent command without an ambient `ANTHROPIC_API_KEY`. Claude Code must use the Claude subscription login for organization connectors.

## Examples

Create one identified project and establish the review loop:

```json
{
  "prompt": "Use Claude Design to create exactly one project named <project name> with design-system ID <ID>. Read only <paths> for context. Before writing, summarize the cloud mutation. Return the stable project ID and URL, then read back the project files for review.",
  "workingDirectory": "/path/to/project"
}
```

Apply one delta after visual review:

```json
{
  "prompt": "Reopen project <ID or URL>. The approved direction is <decision>. Apply only this delta: tighten information density and improve keyboard focus states. Read back the changed files or markers.",
  "sessionId": "<session ID returned by the first call>",
  "workingDirectory": "/path/to/project"
}
```

Recover source in a fresh session for an authorized local handoff:

```json
{
  "prompt": "Open project <ID or URL>. Current approval: <state>; decisions: <summary>; unresolved feedback: <items>. Return the exact complete content of <file> in the response. Do not attempt a local export.",
  "workingDirectory": "/path/to/project"
}
```

## Troubleshooting

- `/design` is unavailable: update Claude Code to 2.1.181 or newer.
- Claude Design is disconnected: remove ambient API-key authentication and run `/design consent` using the Claude subscription login.
- Design tool denied in `dontAsk` mode: confirm the wrapper passes `ToolSearch,mcp__claude-design__*` through `--allowedTools`.
- Enterprise account: ask an administrator to enable Claude Design.
- Wrong design context: stop the mutation, omit `sessionId` to start fresh, and provide the complete handoff packet with the intended project ID or URL.
- Timeout or ambiguous mutation: use the audit path and session ID to inspect the project before retrying; request only the missing delta.
- `output exceeded the 5 MiB limit`: inspect the project with the returned session ID before issuing a narrower follow-up.

## Maintenance notes

Keep this capability separate from the read-only `claude_code_subagent`. Do not broaden that tool's permissions.

Run `bun amp/scripts/test-claude-design-subagent.ts` for deterministic boundary and failure-output coverage.

Verify syntax and registration locally. Then use a uniquely named disposable project for supervised live mutation tests.
