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

Keep this capability separate from the read-only `claude_code_subagent`; do not broaden that tool's permissions. Verify syntax and registration locally, then run a read-only live smoke test that lists Claude Design projects before testing write operations.
