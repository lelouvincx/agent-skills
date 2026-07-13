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
  last_verified: "2026-07-13"
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

# Claude Design Subagent

## Summary

`claude_design_subagent` lets Amp create, inspect, and refine Claude Design projects by running Claude Code as a narrow authenticated proxy. It exists because Amp cannot currently connect directly to Claude Design's Streamable HTTP and Claude-account authorization flow.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `claude_design_subagent`
- Plugin file: `plugins/claude-code-subagent.ts`
- Trigger rule: call only when the user explicitly asks to use Claude Design

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

Success output is JSON containing `ok`, `result`, `sessionId`, model metadata, and the audit path. Pass the returned `sessionId` to a later call to continue the same design conversation.

## Behavior

The tool runs `claude -p` with Claude Code's normal user configuration so its first-party Claude Design integration and account consent remain available. It enables only local read tools, `ToolSearch`, `DesignSync`, and the `mcp__claude-design__*` namespace. Claude Code discovers deferred Design tools through `ToolSearch`, performs the requested operation, and returns a concise result that includes project URLs or IDs when available.

The wrapper intentionally sanitizes the child environment. In particular, ambient `ANTHROPIC_API_KEY` and similar secret-looking variables are not inherited because API-key authentication disables claude.ai connectors, including Claude Design. Claude Code uses the user's existing Claude subscription login instead.

### Verification status

As of 2026-07-13, local registration, command construction, session validation, permission boundaries, environment sanitization, audit behavior, authentication, and read-only project and design-system discovery are verified. A disposable-project test also verified one-project creation with an explicitly requested design-system ID, stable ID and URL recovery, one project-scoped file edit and read-back, continuation with an explicitly passed Claude Code session ID, and fresh-session recovery from a complete handoff packet.

Design-system attachment remains qualified: the ID was requested during creation and reflected in the project-bound design prompt, but Claude Design exposes no independent project field for reading the attachment back. Direct canvas-edit synchronization and inline-comment ingestion remain inconclusive: Helium's approval-only automation target was isolated behind a Cloudflare challenge, so no UI mutation was attempted. `DesignSync` remains experimental.

Read-only source handoff is verified: a fresh proxy session can reopen a known project and return exact file content in its response. The proxy cannot export to the local filesystem because it intentionally has no `Write` or `Bash` tool, and Claude Design write tools target cloud projects. Amp must materialize returned source locally in a separate authorized step. This was verified for a single self-contained HTML deliverable; sufficiency for multi-file or design-system-bound projects remains qualified.

### Supervised workflow

1. The user explicitly opts into Claude Design and names the intended new or existing cloud project.
2. Amp limits `workingDirectory` and local context to the files needed for the design task.
3. Amp resolves and records the exact design-system name and ID instead of relying only on default status.
4. Before the first mutation, Amp summarizes the intended cloud write. Broad, destructive, shared-project, or multi-project changes require fresh confirmation.
5. Amp invokes this tool and records the returned result, Claude Code `sessionId`, audit path, and validated project ID and URL when available.
6. After each mutation, Amp reads back the same project ID and asks the user to confirm the visible canvas. A successful prose response alone is not proof of cloud state.
7. For iteration, Amp explicitly passes the prior `sessionId`, project ID or URL, and a concise decision summary. The plugin stores no Amp-thread-to-Claude-session mapping.
8. Direct canvas edits and comments must be summarized by the user until automatic synchronization and comment ingestion are verified. Amp tells Claude to reopen the current project before applying another delta.
9. Approval records the project ID or URL, design-system ID, current revision or time, acceptance criteria, unresolved exceptions, and relevant decisions.
10. For implementation handoff, Amp asks the proxy to read and return exact project source, then writes that source locally with normal Amp tools in a separately authorized step. Do not ask the proxy to export to a local path.

For a new Amp thread, pass a handoff packet containing the project ID or URL, design-system ID, approval state, current revision or time, key decisions, unresolved feedback, expected files or markers, and the prior Claude Code `sessionId` when conversational continuity is required. A project URL recovers durable canvas identity but does not recover the prior Claude Code conversation.

If a mutating call times out or returns an ambiguous result, preserve the audit path and session ID, inspect the target project before retrying, and apply only the missing delta. Mutation idempotency is not guaranteed.

## Permissions and side effects

Claude may read the selected working directory and create or modify Claude Design cloud projects. It cannot run shell commands or edit local files. `DesignSync` may read local design-system files and sync their representation to Claude Design.

Setup is a one-time local prerequisite:

```bash
claude update
claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp
claude -p -- '/design consent'
```

Claude Code 2.1.181 or newer is required. Run the consent command without an ambient `ANTHROPIC_API_KEY`; Claude Code must use the Claude subscription login for organization connectors.

## Examples

Create a project:

```json
{
  "prompt": "Create three responsive dashboard directions using this repository's design system. Return the project URL and summarize each direction.",
  "workingDirectory": "/path/to/project"
}
```

Continue after visual review:

```json
{
  "prompt": "Continue the second direction. Tighten the information density and improve keyboard focus states.",
  "sessionId": "<session ID returned by the first call>",
  "workingDirectory": "/path/to/project"
}
```

## Troubleshooting

- `/design` is unavailable: update Claude Code to 2.1.181 or newer.
- Claude Design is disconnected: remove ambient API-key authentication and run `/design consent` using the Claude subscription login.
- Design tool denied in `dontAsk` mode: confirm the wrapper passes `ToolSearch,mcp__claude-design__*` through `--allowedTools`.
- Enterprise account: ask an administrator to enable Claude Design.
- Wrong design context: omit `sessionId` to start a fresh Claude Code session.

## Maintenance notes

Keep this capability separate from the read-only `claude_code_subagent`; do not broaden that tool's permissions. Run `bun amp/scripts/test-claude-design-subagent.ts` for deterministic boundary and failure-output coverage. Verify syntax and registration locally, then use a uniquely named disposable project for supervised live mutation tests.
