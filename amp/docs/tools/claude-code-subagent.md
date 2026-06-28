---
doc_schema: "amp-plugin-capability/v1"
title: "Claude Code Subagent"
slug: "claude-code-subagent"
status: "active"
summary: "Runs Claude Code CLI as a manual, read-only second-opinion subagent that returns structured JSON advice."
capability:
  id: "claude_code_subagent"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  registration_api: "amp.registerTool"
  api_stability: "stable"
plugin:
  file: "plugins/claude-code-subagent.ts"
  scope: "system"
  install_source: "local"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-06-24"
contract:
  input_kind: "json_schema"
  output_kind: "json_text"
  event: null
  command_id: null
  agent_mode_key: null
  required_inputs:
    - "mode"
    - "brief"
runtime:
  uses:
    - "spawn: claude"
    - "ctx.thread.id"
    - "filesystem audit logs"
    - "token usage ledger"
  dependencies:
    - "Claude Code CLI on PATH"
    - "optional ~/.config/amp/github-profiles.json"
    - "optional ~/.config/amp/claude-code-readonly-mcp.json"
  env:
    - "AMP_CLAUDE_CODE_SUBAGENT_AUDIT_DIR"
    - "AMP_AGENT_TOKEN_USAGE_LOG"
    - "AMP_CLAUDE_CODE_SUBAGENT_DEBUG"
    - "AMP_CLAUDE_CODE_SUBAGENT_ENV_FILE"
    - "AMP_GITHUB_PROFILE"
  reads:
    - "workingDirectory"
    - "safeRoots"
    - "optional read-only MCP config"
  writes:
    - "~/.config/amp/logs/claude-code-subagent/*.json"
    - "~/.config/amp/logs/agent-token-usage.jsonl"
  network:
    - "Claude Code model provider via claude CLI"
  logs:
    - "redacted audit log"
    - "optional raw transcript"
    - "token usage ledger"
safety:
  permission_level: "read-only-subagent"
  user_gate: "explicit user mention of Claude or Claude Code"
  constraints:
    - "Allows only Read, Grep, Glob, and LS by default."
    - "Denies Bash, Edit, Write, MultiEdit, and NotebookEdit."
    - "MCP is explicit-only; allowedMcpTools requires mcpConfigPath."
    - "The spawned Claude process receives a sanitized environment; secret-looking ambient variables are not inherited. If Claude needs API/OAuth credentials, provide a 1Password-backed env file via AMP_CLAUDE_CODE_SUBAGENT_ENV_FILE."
    - "Amp remains responsible for applying patches and verification."
  risks:
    - "includeRawTranscript stores sensitive raw stdout/stderr."
    - "Incorrect GitHub profile routing can expose the wrong repository context."
related:
  - "pi-code-subagent"
tags:
  - "subagent"
  - "claude"
  - "review"
  - "research"
  - "read-only"
---

# Claude Code Subagent

## Summary

`claude_code_subagent` invokes Claude Code CLI as a read-only advisor. It is for explicit user requests to use Claude or Claude Code, and it returns structured JSON for review, patch proposal, or research. It never applies edits itself.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `claude_code_subagent`
- Plugin file: `plugins/claude-code-subagent.ts`
- Trigger rule: only call when the user explicitly mentions Claude or Claude Code

## Contract

Required inputs:

| Field | Type | Notes |
| --- | --- | --- |
| `mode` | `patch \| review \| research` | Selects the required output schema. |
| `brief` | `string` | Curated task brief. Must be non-empty. |

Optional inputs:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `context` | `string` | none | Pre-processed excerpts, diffs, or decisions. |
| `githubProfile` | `work \| personal \| bot` | default profile | Sets `AMP_GITHUB_PROFILE` when valid. |
| `model` | `opus \| sonnet` | `opus` | Use `sonnet` only for speed/lightweight requests. |
| `timeoutMinutes` | `number` | `10` | Rounded up and capped at `30`. |
| `workingDirectory` | `string` | plugin process cwd | Must exist. `~` is expanded. |
| `safeRoots` | `string[]` | `[]` | Extra read roots passed as `--add-dir`. |
| `mcpConfigPath` | `string` | none | Enables strict read-only MCP config when explicit. |
| `allowedMcpTools` | `string[]` | `[]` | Requires `mcpConfigPath`. |
| `includeRawTranscript` | `boolean` | `false` | Also enabled by `AMP_CLAUDE_CODE_SUBAGENT_DEBUG=1`. |

Output is a JSON string with `ok`, mode/model metadata, the parsed structured result, audit path, token usage log path, and optional raw transcript path. Failure output is also JSON and includes `ok: false` plus an error message.

## Behavior

The tool normalizes inputs, validates filesystem paths, builds a strict JSON schema for the selected mode, then runs `claude -p` with JSON output, `dontAsk` permissions, an allowed read-only tool list, and explicit disallowed write/shell tools. If MCP is configured, it adds `--strict-mcp-config` and merges default read-only MCP tools with caller-specified `allowedMcpTools`.

Claude receives a prompt that says Amp is the executor and Claude must provide structured advice only. The plugin parses Claude CLI JSON, validates the mode-specific payload, extracts token usage where possible, writes redacted audit logs, and returns a compact JSON envelope to Amp.

## Permissions and side effects

Claude Code gets only local read tools by default: `Read`, `Grep`, `Glob`, and `LS`. The plugin explicitly denies shell and file-edit tools. It writes redacted audit logs under `~/.config/amp/logs/claude-code-subagent/` and appends token usage to `~/.config/amp/logs/agent-token-usage.jsonl` unless overridden by environment variables.

Do not pass raw thread transcripts unless needed. Prefer curated `brief` and `context` to avoid leaking irrelevant sensitive context into audit logs or model input.

Secrets must come from 1Password at execution time. Do not put plaintext provider keys in local `.env` files or rely on Amp's ambient process environment. If Claude Code needs `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`, set `AMP_CLAUDE_CODE_SUBAGENT_ENV_FILE` to an env file containing only `op://...` references; the wrapper validates that file and rejects plaintext before running Claude through `op run --env-file`.

## Examples

Review current changes:

```json
{
  "mode": "review",
  "brief": "Review the current diff for behavior regressions. Focus on changed defaults and error handling.",
  "workingDirectory": "/path/to/project"
}
```

Ask for a patch proposal without allowing edits:

```json
{
  "mode": "patch",
  "brief": "Propose the smallest unified diff to add validation for empty titles.",
  "context": "Relevant excerpts and failing test output go here."
}
```

Use explicit read-only external context:

```json
{
  "mode": "research",
  "brief": "Find the current Linear issue details and summarize blockers.",
  "mcpConfigPath": "~/.config/amp/claude-code-readonly-mcp.json",
  "allowedMcpTools": ["mcp__amp_context__linear_issue_view"]
}
```

## Troubleshooting

- `workingDirectory does not exist`: pass an existing absolute path or a path relative to the plugin process cwd.
- `allowedMcpTools requires mcpConfigPath`: MCP access is explicit-only; pass both fields or neither.
- `Claude auth missing`: either use Claude Code keychain auth or set `AMP_CLAUDE_CODE_SUBAGENT_ENV_FILE` to a 1Password-backed env file. Do not export plaintext provider keys into Amp's environment.
- `Claude Code exited with code ...`: inspect the returned `stderr` and audit log path.
- `returned invalid JSON`: Claude did not satisfy the schema; retry with a narrower brief and less noisy context.
- Timeout: raise `timeoutMinutes` up to `30` or shrink the task.

## Maintenance notes

Update this doc when `plugins/claude-code-subagent.ts` changes its input schema, mode schemas, allowed/denied tools, audit paths, or MCP defaults. Re-run `amp plugins show-docs` after Amp updates because plugin tool result content and agent APIs may change.
