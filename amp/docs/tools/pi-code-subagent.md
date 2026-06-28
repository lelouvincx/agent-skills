---
doc_schema: "amp-plugin-capability/v1"
title: "Pi Code Subagent"
slug: "pi-code-subagent"
status: "active"
summary: "Runs Pi Coding Agent as a manual, read-only advisor that returns structured JSON advice."
capability:
  id: "pi_code_subagent"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  registration_api: "amp.registerTool"
  api_stability: "stable"
plugin:
  file: "plugins/pi-code-subagent.ts"
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
    - "spawn: pi"
    - "ctx.thread.id"
    - "filesystem audit logs"
    - "token usage ledger"
  dependencies:
    - "Pi Coding Agent CLI on PATH"
  env:
    - "AMP_PI_CODE_SUBAGENT_AUDIT_DIR"
    - "AMP_AGENT_TOKEN_USAGE_LOG"
    - "AMP_PI_CODE_SUBAGENT_DEBUG"
    - "AMP_PI_CODE_SUBAGENT_ENV_FILE"
  reads:
    - "workingDirectory"
  writes:
    - "~/.config/amp/logs/pi-code-subagent/*.json"
    - "~/.config/amp/logs/agent-token-usage.jsonl"
  network:
    - "Pi provider/model endpoint via pi CLI"
  logs:
    - "redacted audit log"
    - "optional raw transcript"
    - "token usage ledger"
safety:
  permission_level: "read-only-subagent"
  user_gate: "explicit user mention of Pi, pi.dev, or Pi Coding Agent"
  constraints:
    - "Allows only read, grep, find, and ls."
    - "Disables extensions, skills, prompt templates, themes, context files, and session persistence."
    - "The spawned Pi process receives a sanitized environment; secret-looking ambient variables are not inherited. If Pi needs provider credentials, provide a 1Password-backed env file via AMP_PI_CODE_SUBAGENT_ENV_FILE."
    - "Caps prompt size at 500000 bytes."
    - "Amp remains responsible for applying patches and verification."
  risks:
    - "includeRawTranscript stores sensitive raw stdout/stderr."
    - "Provider/model overrides may route data to a different backend."
related:
  - "claude-code-subagent"
tags:
  - "subagent"
  - "pi"
  - "review"
  - "research"
  - "read-only"
---

# Pi Code Subagent

## Summary

`pi_code_subagent` invokes Pi Coding Agent as a read-only advisor. It is for explicit user requests to use Pi, pi.dev, or Pi Coding Agent, and it returns structured JSON for review, patch proposal, or research. It never applies edits itself.

## Invocation

- Surface: agent-callable tool
- Registered with: `amp.registerTool`
- Tool name: `pi_code_subagent`
- Plugin file: `plugins/pi-code-subagent.ts`
- Trigger rule: only call when the user explicitly mentions Pi, pi.dev, or Pi Coding Agent

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
| `provider` | `string` | `deepseek` | Pi provider. |
| `model` | `string` | `deepseek-v4-pro` | Pi model. |
| `thinking` | `off \| minimal \| low \| medium \| high \| xhigh` | `high` | Invalid values fall back to `high`. |
| `timeoutMinutes` | `number` | `10` | Rounded up and capped at `30`. |
| `workingDirectory` | `string` | plugin process cwd | Must exist. `~` is expanded. |
| `includeRawTranscript` | `boolean` | `false` | Also enabled by `AMP_PI_CODE_SUBAGENT_DEBUG=1`. |

Output is a JSON string with `ok`, mode/provider/model/thinking metadata, parsed structured result, audit path, token usage log path, and optional raw transcript path. Failure output is also JSON and includes `ok: false` plus an error message.

## Behavior

The tool normalizes inputs, validates `workingDirectory`, builds a mode-specific JSON schema, checks the constructed prompt is at most 500000 bytes, and runs `pi` with a read-only tool list. It disables Pi extensions, skills, prompt templates, themes, context files, and session persistence.

Pi receives a prompt that says Amp is the executor and Pi must provide structured advice only. The plugin strips a Markdown JSON fence if present, parses the first JSON object if needed, validates the mode-specific payload, extracts token usage where possible, writes redacted audit logs, and returns a compact JSON envelope to Amp.

## Permissions and side effects

Pi gets only `read`, `grep`, `find`, and `ls`. The plugin writes redacted audit logs under `~/.config/amp/logs/pi-code-subagent/` and appends token usage to `~/.config/amp/logs/agent-token-usage.jsonl` unless overridden by environment variables.

Do not dump raw Amp threads into `brief` or `context`. Pass curated context so the subagent sees only what it needs.

Secrets must come from 1Password at execution time. Do not put plaintext provider keys in local `.env` files or rely on Amp's ambient process environment. If Pi needs provider keys, set `AMP_PI_CODE_SUBAGENT_ENV_FILE` to an env file containing only `op://...` references; the wrapper validates that file and rejects plaintext before running Pi through `op run --env-file`.

## Examples

Review current changes:

```json
{
  "mode": "review",
  "brief": "Review the current diff for concurrency bugs and missing tests.",
  "workingDirectory": "/path/to/project"
}
```

Request a patch proposal:

```json
{
  "mode": "patch",
  "brief": "Propose a minimal unified diff to add input validation.",
  "context": "Relevant file excerpts and expected behavior."
}
```

Use a lower thinking level for speed:

```json
{
  "mode": "research",
  "brief": "Find where this helper is used and summarize callers.",
  "thinking": "medium"
}
```

## Troubleshooting

- `workingDirectory does not exist`: pass an existing absolute path or a path relative to the plugin process cwd.
- `prompt is too large`: shrink `brief` and `context`; do not paste whole threads.
- Provider auth missing: use Pi's own credential store or set `AMP_PI_CODE_SUBAGENT_ENV_FILE` to a 1Password-backed env file. Do not export plaintext provider keys into Amp's environment.
- `Pi exited with code ...`: inspect the returned `stderr` and audit log path.
- `returned invalid JSON`: retry with a narrower brief and explicit output requirements.
- Timeout: raise `timeoutMinutes` up to `30` or reduce scope.

## Maintenance notes

Update this doc when `plugins/pi-code-subagent.ts` changes its input schema, mode schemas, tool allowlist, prompt size limit, audit paths, or default provider/model. Keep the behavior aligned with `claude_code_subagent` where the two tools intentionally mirror each other.
