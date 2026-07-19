---
doc_schema: "amp-artifact/v2"
title: "Claude Code Subagent"
slug: "claude-code-subagent"
status: "active"
summary: "Runs Claude Code CLI as a manual, read-only second-opinion subagent that returns structured JSON advice."
artifact:
  id: "claude_code_subagent"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  api_stability: "stable"
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
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-07-18"
contract:
  input_kind: "json_schema"
  output_kind: "json_text"
  trigger: "tool_call"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
  required_inputs:
    - "mode"
    - "brief"
runtime:
  uses:
    - "spawn: claude"
    - "spawn: git through the built-in read-only MCP server"
    - "ctx.thread.id"
    - "filesystem audit logs"
    - "token usage ledger"
  dependencies:
    - "Claude Code CLI on PATH"
    - "Node.js on PATH when useGitDiff is enabled"
    - "Git on PATH when useGitDiff is enabled"
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
    - "Allows only Read, Grep, and Glob by default."
    - "Adds ToolSearch only when explicit MCP access is enabled so Claude can discover allowlisted tools after asynchronous MCP startup."
    - "Denies Bash, Edit, Write, and NotebookEdit."
    - "MCP is explicit-only; allowedMcpTools requires mcpConfigPath."
    - "Review mode requires change-set evidence from non-empty context, the built-in read-only Git review MCP tools, or explicitly enabled mcp__sem__sem_diff access."
    - "User, project, and local Claude Code setting sources are disabled so ambient hooks, plugins, skills, and permission rules cannot change the read-only child."
    - "Strict MCP isolation is always enabled; only an explicitly supplied read-only MCP configuration can add MCP servers."
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
| `context` | `string` | none | Pre-processed excerpts, diffs, or decisions. For review mode, provide the relevant textual diff here unless the built-in Git tools or `mcp__sem__sem_diff` supply the change set. |
| `useGitDiff` | `boolean` | `false` | In review mode, expose the isolated built-in Git review tools without exposing Bash. Cannot be combined with caller MCP configuration. |
| `githubProfile` | `work \| personal \| bot` | default profile | Sets `AMP_GITHUB_PROFILE` when valid. |
| `model` | `fable \| opus \| sonnet` | `opus` | Use `fable` for the most ambitious work or `sonnet` for speed/lightweight requests. |
| `timeoutMinutes` | `number` | `10` | Rounded up and capped at `30`. |
| `workingDirectory` | `string` | plugin process cwd | Must exist. `~` is expanded. |
| `safeRoots` | `string[]` | `[]` | Extra read roots passed as `--add-dir`. |
| `mcpConfigPath` | `string` | none | Enables strict read-only MCP config when explicit. |
| `allowedMcpTools` | `string[]` | `[]` | Requires `mcpConfigPath`. |
| `includeRawTranscript` | `boolean` | `false` | Also enabled by `AMP_CLAUDE_CODE_SUBAGENT_DEBUG=1`. |

Output is a JSON string with `ok`, mode/model metadata, the parsed structured result, audit path, token usage log path, and optional raw transcript path. Failure output is also JSON and includes `ok: false` plus an error message.

## Behavior

Review mode does not start without a change set. Amp must provide one through:

- non-empty `context` containing the relevant textual diff
- `useGitDiff: true` for the built-in Git tools
- explicit `mcp__sem__sem_diff` access through `mcpConfigPath` and `allowedMcpTools`

Claude must get the selected diff before it reads surrounding files. For large working-tree changes, Claude first calls `git_changed_files`. It then requests path-scoped `git_diff` results.

If a diff tool fails, Claude does not start a general repository audit. It returns `needs_amp_judgment` with low confidence and no findings.

The built-in Git server gives Claude 4 read-only tools:

- `mcp__amp_git__git_diff` returns working-tree changes against `HEAD` and lists untracked paths
- `mcp__amp_git__git_diff_refs` returns committed changes from the merge base of 2 verified refs
- `mcp__amp_git__git_changed_files` returns separate staged, unstaged and untracked path summaries
- `mcp__amp_git__git_file_at_ref` returns one repository-relative file at a verified commit

`git_diff` and `git_diff_refs` accept up to 100 repository-relative paths. This lets Claude split a large review without using free-form Git arguments.

The Git server runs fixed commands directly, without a shell. It:

- resolves refs to commit object IDs before using them
- confines every path to the selected repository
- disables external diff and text-conversion drivers
- does not expose Git configuration, remotes, reflogs, stashes, network operations or write commands
- limits each call by time and output size

Git refs must not be empty. They cannot start with `-` or use reflog syntax. The model cannot choose the repository.

Semantic diff remains lower fidelity because it only reports entity-level changes.

The wrapper validates inputs and paths before it starts `claude -p`. It uses a strict output schema, `dontAsk` permissions and strict MCP isolation. It also denies shell and file-edit tools.

When MCP is enabled, the wrapper adds `ToolSearch` for asynchronous tool discovery. It loads only the configured MCP tools. Without MCP, it does not load tool discovery or MCP configuration.

Claude returns structured advice only. Amp remains the executor. The plugin validates Claude's response, records token use and writes redacted audit logs. It stops the child if combined output exceeds 5 MiB.

## Permissions and side effects

Claude Code gets only local read tools by default: `Read`, `Grep`, and `Glob`. The plugin explicitly denies shell and current file-edit tools. It writes redacted audit logs under `~/.config/amp/logs/claude-code-subagent/` and appends token usage to `~/.config/amp/logs/agent-token-usage.jsonl` unless overridden by environment variables.

Do not pass raw thread transcripts unless needed. Prefer curated `brief` and `context` to avoid leaking irrelevant sensitive context into audit logs or model input.

Secrets must come from 1Password at execution time. Do not put plaintext provider keys in local `.env` files or rely on Amp's ambient process environment. If Claude Code needs `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`, set `AMP_CLAUDE_CODE_SUBAGENT_ENV_FILE` to an env file containing only `op://...` references; the wrapper validates that file and rejects plaintext before running Claude through `op run --env-file`.

## Examples

Review current changes:

```json
{
  "mode": "review",
  "brief": "Review the current diff for behavior regressions. Focus on changed defaults and error handling.",
  "context": "diff --git a/src/settings.ts b/src/settings.ts\n...",
  "workingDirectory": "/path/to/project"
}
```

Review current working-tree changes through the built-in Git review MCP tools:

```json
{
  "mode": "review",
  "brief": "Review the working-tree changes for behavior regressions.",
  "useGitDiff": true,
  "workingDirectory": "/path/to/project"
}
```

Review committed branch changes through the built-in ref diff:

```json
{
  "mode": "review",
  "brief": "Review the committed changes from the merge base of main to HEAD. Use mcp__amp_git__git_diff_refs with baseRef main and targetRef HEAD.",
  "useGitDiff": true,
  "workingDirectory": "/path/to/project"
}
```

Review through an explicitly configured semantic diff MCP fallback:

```json
{
  "mode": "review",
  "brief": "Review the working-tree changes for behavior regressions.",
  "mcpConfigPath": "/path/to/read-only-mcp.json",
  "allowedMcpTools": ["mcp__sem__sem_diff"],
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

- `review mode requires change-set evidence`: pass a non-empty `context` containing the relevant diff, set `useGitDiff: true`, or pass an MCP config that exposes `mcp__sem__sem_diff` and explicitly include that tool in `allowedMcpTools`.
- `useGitDiff cannot be combined with mcpConfigPath or allowedMcpTools`: use the isolated built-in Git diff server, or configure semantic diff and other read-only MCP tools explicitly.
- `Git diff MCP server does not exist`: run `./sync-skills.sh` so the source-controlled MCP server is projected beside the plugin.
- `workingDirectory does not exist`: pass an existing absolute path or a path relative to the plugin process cwd.
- `allowedMcpTools requires mcpConfigPath`: MCP access is explicit-only; pass both fields or neither.
- `Claude auth missing`: either use Claude Code keychain auth or set `AMP_CLAUDE_CODE_SUBAGENT_ENV_FILE` to a 1Password-backed env file. Do not export plaintext provider keys into Amp's environment.
- `Claude Code exited with code ...`: inspect the returned `stderr` and audit log path.
- `returned invalid JSON`: Claude did not satisfy the schema; retry with a narrower brief and less noisy context.
- `output exceeded the 5 MiB limit`: narrow the task or reduce the context; partial output is not treated as valid JSON.
- Timeout: raise `timeoutMinutes` up to `30` or shrink the task.

## Maintenance notes

Update this doc when `plugins/claude-code-subagent.ts` changes its input schema, mode schemas, allowed/denied tools, audit paths, or MCP defaults. Re-run `amp plugins show-docs` after Amp updates because plugin tool result content and agent APIs may change.
