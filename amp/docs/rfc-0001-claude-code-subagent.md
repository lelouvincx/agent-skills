---
doc_schema: "amp-rfc/v1"
code: "RFC-0001"
title: "Claude Code as a manual read-only Amp subagent"
slug: "claude-code-subagent"
file: "rfc-0001-claude-code-subagent.md"
status: "Implemented (initial)"
summary: "Use Claude Code CLI as a manual, read-only, structured-output Amp subagent."
created: "2026-06-20"
updated: "2026-06-20"
amp_thread_id: "T-019ee5a6-032c-7009-9c49-bef9be1543ea"
dependency:
  - type: "handoff"
    title: "handoff-claude-code-subagent.md"
    path: "./handoff-claude-code-subagent.md"
---

# RFC-0001: Claude Code as a manual read-only Amp subagent

## Summary

Create a user-wide Amp plugin that exposes Claude Code CLI as a manual, read-only, structured-output helper. Amp remains the primary agent and executor. Claude Code is used only when the user explicitly mentions “Claude” or “Claude Code”, and returns advice, review findings, or a proposed unified diff in JSON.

The core value is getting a second Claude-powered coding opinion without spending Amp model tokens, while avoiding the main risk of two coding agents editing the same workspace.

## Motivation

Amp custom agents can create Amp-managed agents, but they cannot use Claude Code as the runtime. Claude Code can still be invoked from an Amp plugin as an external CLI. This gives Amp a cheap second opinion or patch advisor while preserving Amp's orchestration, final edits, and verification.

The desired behavior is not “Claude Code takes over”. It is:

```diagram
╭────────────╮       manual trigger       ╭────────────────────╮
│ User / Amp │───────────────────────────▶│ Amp plugin tool    │
╰─────┬──────╯                            ╰─────────┬──────────╯
      │                                             │
      │                                             ▼
      │                                  ╭────────────────────╮
      │                                  │ Claude Code CLI    │
      │                                  │ read-only advisor  │
      │                                  ╰─────────┬──────────╯
      │                                            │ JSON result
      ▼                                            ▼
╭────────────────────╮                 ╭────────────────────────╮
│ Amp reviews/adapts │◀────────────────│ advice / findings /    │
│ applies/verifies   │                 │ proposed unified diff   │
╰────────────────────╯                 ╰────────────────────────╯
```

## Goals

- Provide a Claude Code-backed Amp plugin tool for explicit manual use.
- Keep Claude Code read-only with no Bash and no file edit/write tools.
- Let Claude Code access approved read-only context sources: repo, Slack, Notion, Linear, GitHub, web, and configured safe filesystem roots.
- Require mode-specific structured JSON output.
- Let Amp decide whether to apply/adapt Claude's proposed patch based on user wording.
- Save a redacted summarized audit trail by default.
- Support raw transcript capture only when requested/debugging.

## Non-goals

- Do not create a native Amp `createAgent()` replacement backed by Claude Code.
- Do not let Claude Code directly modify the real workspace.
- Do not auto-trigger Claude Code without explicit user mention.
- Do not make Claude Code the lead agent for complex coding tasks.
- Do not rely on Claude Code transcript internals as a stable API.

## Trigger policy

Claude Code is invoked only when the user explicitly mentions **“Claude”** or **“Claude Code”**.

Examples that trigger:

- “ask Claude Code to review this”
- “use Claude to help implement this”
- “double-check with Claude”
- “run Claude Code on this diff”

Examples that do not trigger:

- “review this”
- “use a subagent”
- “think harder”
- “research this”

The plugin tool description should say this explicitly so Amp does not call the tool opportunistically.

## Task fit

Appropriate uses:

- review / second opinion
- small-to-medium coding help
- high-risk advisory review, with independent Amp verification

Not appropriate by default:

- complex coding tasks where Claude Code would become the lead agent

Size/risk classification:

- **Small:** 1–2 files, localized change, expected patch under ~100 lines, obvious targeted verification.
- **Medium:** 2–6 files, one boundary crossed, expected patch ~100–400 lines, clear ownership path.
- **Complex:** many modules, unknown blast radius, migrations, auth, permissions, billing, data deletion, infra, plugin architecture, or meaningful design sequencing.

Risk overrides size. A small auth/permission change can be complex; a large copy-only update may be small/medium.

## User intent semantics

Claude Code result handling depends on wording:

- “Ask Claude Code”, “get Claude’s opinion”, “get Claude’s review” means advice only. Amp should show/summarize the result and not apply changes unless the user asks.
- “Use Claude Code to help implement/fix” means Amp may review, adapt, apply, and verify Claude's proposed patch.
- Amp must never blindly apply Claude Code output.

## Context contract

Amp sends Claude Code a pre-processed brief, not a raw Amp thread dump.

The brief should include:

- current objective
- relevant constraints and decisions
- selected repo/file context
- current diff for review mode
- relevant external-context summary if applicable
- the selected mode
- the required JSON schema

## Tool and permission model

Default Claude Code invocation should use non-interactive print mode and Opus:

```bash
claude -p \
  --model opus \
  --output-format json \
  --tools "Read,Grep,Glob,LS,WebSearch,WebFetch" \
  --disallowedTools "Bash,Edit,Write,MultiEdit,NotebookEdit" \
  --strict-mcp-config \
  --mcp-config <readonly-mcp-config> \
  <prompt>
```

Notes:

- `--tools` controls built-in Claude Code tools.
- MCP tools are separate, so use `--strict-mcp-config` and a dedicated read-only MCP config.
- Prefer exposing only read-only MCP tools for Slack, Notion, Linear, and GitHub.
- If a read-only-only MCP config is not available, explicitly deny known write-capable MCP tools before enabling that source.
- Use `--add-dir` only for configured safe filesystem roots outside the repo.

## Data access policy

Allowed read sources by default:

- current repository
- Slack read-only tools
- Notion read-only tools
- Linear read-only tools
- GitHub read-only tools
- web search/fetch
- approved safe filesystem roots

Filesystem outside the repo is an allowlist, not arbitrary `~` access.

Secrets-like files are allowed if they are inside the repo or safe roots. This is an intentional tradeoff, but logs must be redacted by default.

## Output contract

The plugin should request mode-specific structured JSON. If supported reliably, use Claude Code's `--json-schema`; otherwise use prompt instructions and validate the returned JSON in the plugin.

### Patch proposal mode

```json
{
  "summary": "string",
  "recommendation": "apply | do_not_apply | needs_amp_judgment",
  "confidence": "low | medium | high",
  "patch": "unified diff or empty string",
  "tests": ["string"],
  "risks": ["string"]
}
```

### Review mode

```json
{
  "summary": "string",
  "recommendation": "apply | do_not_apply | needs_amp_judgment",
  "confidence": "low | medium | high",
  "findings": [
    {
      "severity": "low | medium | high",
      "evidence": "file path, line, or quoted context",
      "issue": "string",
      "suggested_fix": "string"
    }
  ],
  "tests": ["string"],
  "risks": ["string"]
}
```

### Research/context mode

```json
{
  "summary": "string",
  "answer": "string",
  "confidence": "low | medium | high",
  "citations": ["string"],
  "risks": ["string"]
}
```

## Audit and transcript policy

Default audit record:

- timestamp
- Amp thread ID
- mode
- model
- timeout
- redacted prompt brief
- redacted final JSON
- command metadata, excluding secrets
- success/failure status

Full raw transcript or stream output should be saved only when explicitly requested or when debug mode is enabled. Before raw transcript logging, warn that it may contain sensitive context.

Claude Code local JSONL session files can include `thinking`, `tool_use`, and `tool_result` blocks, but this should be treated as debugging/audit material rather than a stable integration interface.

## Failure policy

- If the user specifically asked for Claude Code's review/opinion, return the failure and do not pretend Claude reviewed anything.
- If the user asked to use Claude Code to help implement/fix, Amp may continue alone after briefly noting Claude Code failed.
- Invalid JSON, timeout, unavailable MCP, missing Claude CLI, or no patch when a patch was expected are all explicit failure states.

## High-risk work

Claude Code may advise on high-risk work, but Amp must independently inspect and verify.

High-risk examples:

- production changes
- destructive operations
- auth/permissions/security
- billing
- data deletion
- infrastructure

Amp must not apply high-risk changes solely because Claude suggested them.

## Proposed implementation

Create a user-wide plugin:

```text
~/.config/amp/plugins/claude-code-subagent.ts
```

Start with one unified tool:

```text
claude_code_subagent
```

Suggested input schema:

```json
{
  "type": "object",
  "properties": {
    "mode": { "type": "string", "enum": ["patch", "review", "research"] },
    "brief": { "type": "string" },
    "context": { "type": "string" },
    "model": { "type": "string", "enum": ["opus", "sonnet"] },
    "timeoutMinutes": { "type": "number" },
    "safeRoots": { "type": "array", "items": { "type": "string" } },
    "includeRawTranscript": { "type": "boolean" }
  },
  "required": ["mode", "brief"]
}
```

Defaults:

- `model`: `opus`
- `timeoutMinutes`: `10`
- `includeRawTranscript`: `false`

Implementation outline:

1. Validate input.
2. Build mode-specific prompt and JSON schema.
3. Construct Claude CLI args with read-only built-ins and denied edit tools.
4. Add strict read-only MCP config if configured.
5. Add configured safe roots via `--add-dir`.
6. Run `claude -p` with timeout.
7. Parse and validate JSON.
8. Redact and save summary audit log.
9. Return structured result or failure payload.

## Open questions before implementation

- Exact location and format for the read-only MCP config.
- Exact local MCP tool names for Slack, Notion, Linear, and GitHub.
- Initial safe filesystem roots.
- Audit log location. Candidate: `~/.config/amp/logs/claude-code-subagent/`.
- Whether to use `--json-schema` immediately or start with prompt-only JSON plus plugin-side validation.

## Acceptance criteria

- Plugin registers a Claude Code subagent tool visible to Amp.
- Tool description says it must be used only when the user explicitly mentions Claude or Claude Code.
- Invocation denies Bash and file-edit/write tools.
- Invocation defaults to Opus and 10-minute timeout.
- Tool returns structured JSON for patch, review, and research modes.
- Invalid JSON and Claude CLI failures are surfaced honestly.
- Redacted audit log is written by default.
- Raw transcript is not stored unless requested/debug.

## Regression tests

Run the default local suite before and after changing the Claude subagent, MCP bridge, or context CLI:

```bash
test-amp-claude-subagent
```

The default suite avoids real external API calls. It checks syntax, JSON config parsing, Amp plugin registration, context CLI dry-run routing, rejection of natural-language CLI profile routing, and the Claude CLI `--` prompt separator regression.

For end-to-end reads against real services:

```bash
test-amp-claude-subagent --integration
```

For a real Claude CLI MCP startup check, opt in explicitly because it can spend Claude quota:

```bash
test-amp-claude-subagent --claude-smoke
```

## Rollout plan

1. Implement minimal unified plugin tool with repo/web read-only tools and no MCP config.
2. Test with a harmless review prompt.
3. Add audit redaction.
4. Add read-only MCP config support.
5. Add safe roots configuration.
6. Iterate on output schemas based on real Claude Code behavior.
