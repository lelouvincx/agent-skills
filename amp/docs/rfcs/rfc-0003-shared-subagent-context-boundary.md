---
doc_schema: "amp-rfc/v1"
code: "RFC-0003"
title: "Shared read-only subagent toolkit and Amp-owned external context"
slug: "shared-subagent-context-boundary"
file: "rfc-0003-shared-subagent-context-boundary.md"
status: "Implemented (initial)"
summary: "Standardize Claude Code and Pi Coding Agent as read-only subagents while Amp owns external context gathering."
created: "2026-06-20"
updated: "2026-07-05"
amp_thread_id:
  T-019ee65b-a854-70f8-b4a8-477b22471a34: "initial RFC design"
dependency:
  - type: "rfc"
    code: "RFC-0001"
    title: "Claude Code as a manual read-only Amp subagent"
    path: "./rfc-0001-claude-code-subagent.md"
  - type: "rfc"
    code: "RFC-0002"
    title: "Raw agent token usage ledger"
    path: "./rfc-0002-agent-token-usage-ledger.md"
implementation:
  - path: "../../plugins/claude-code-subagent.ts"
  - path: "../../plugins/pi-code-subagent.ts"
inputs:
  - "Amp-curated local and optional external context for read-only subagents"
outputs:
  - "structured read-only subagent advice, findings, or patch proposals"
---

# RFC-0003: Shared read-only subagent toolkit and Amp-owned external context

## Summary

Standardize Claude Code and Pi Coding Agent as equivalent manual, read-only subagents under Amp.

The default subagent contract is intentionally narrow:

- Subagents may inspect local workspace files.
- Subagents may search/list local workspace files.
- Subagents may return structured JSON advice, review findings, or proposed unified diffs.
- Subagents must not execute shell commands, write files, edit files, or fetch external/web context themselves.

Amp owns all external context gathering, including web search, docs, Slack, Notion, Linear, GitHub, and other MCP-backed sources. Amp passes curated summaries and citations into the subagent prompt.

## Context

### Motivation

RFC-0001 introduced Claude Code as a read-only advisor, but its initial default toolkit included Claude-specific capabilities such as web search/fetch and auto-loaded read-only MCP context. Pi Coding Agent does not expose the same default web/MCP tool surface without adding custom extensions or allowing shell access.

Maintaining different default toolkits creates drift:

- Claude and Pi may answer from different evidence.
- The tool wrappers become harder to reason about.
- Safety boundaries differ by runtime.
- Future changes must be implemented twice with different semantics.

The maintainable boundary is to keep subagents on the shared local read-only toolkit and let Amp handle everything external.

## Decision

### Decision

Use one default subagent capability model across Claude Code and Pi:

```text
local read/search/list only
```

Tool mapping:

| Capability | Claude Code | Pi Coding Agent |
| --- | --- | --- |
| Read file | `Read` | `read` |
| Search contents | `Grep` | `grep` |
| Find files | `Glob` | `find` |
| List directory | `LS` | `ls` |

Claude Code defaults must not include `WebSearch`, `WebFetch`, or auto-loaded MCP tools.

Pi defaults must not use `bash`, `edit`, `write`, extensions, skills, prompt templates, themes, auto-loaded context files, or persisted sessions.

## Contract

### External context ownership

Amp is responsible for web and external context.

```diagram
╭─────╮   web_search / read_web_page / MCP   ╭────────────────────╮
│ Amp │─────────────────────────────────────▶│ External context   │
╰──┬──╯                                      │ web/docs/SaaS APIs │
   │ curated excerpts + citations            ╰────────────────────╯
   ▼
╭────────────────────────────╮
│ Claude Code or Pi subagent │
│ local read-only toolkit    │
╰──────────────┬─────────────╯
               │ structured JSON
               ▼
╭────────────────────────────╮
│ Amp reviews/applies/verifies│
╰────────────────────────────╯
```

When a task needs external information, Amp should:

1. Search or read the external source directly using Amp tools.
2. Summarize only the relevant information.
3. Include citations or source references in `context`.
4. Ask the subagent to reason over that curated context and the local repository.

Subagents should not independently browse the web by default.

### Default command policy

### Claude Code

Default Claude invocation should allow only the shared local read-only tools:

```bash
claude -p \
  --model opus \
  --output-format json \
  --permission-mode dontAsk \
  --tools Read,Grep,Glob,LS \
  --allowedTools Read,Grep,Glob,LS \
  --disallowedTools Bash,Edit,Write,MultiEdit,NotebookEdit \
  --json-schema '<mode schema>' \
  -- '<prompt>'
```

MCP is explicit-only. Passing `allowedMcpTools` without an explicit `mcpConfigPath` is an error.

### Pi Coding Agent

Default Pi invocation should allow only the equivalent shared local read-only tools and disable optional discovery/session features:

```bash
pi \
  --provider deepseek \
  --model deepseek-v4-pro \
  --thinking high \
  --tools read,grep,find,ls \
  --no-extensions \
  --no-skills \
  --no-prompt-templates \
  --no-themes \
  --no-context-files \
  --no-session \
  --print \
  'Read the subagent instructions from stdin. Return only the required JSON object.'
```

Pi receives the subagent prompt over stdin so user-controlled task content is not interpreted as CLI flags.
The wrapper should reject oversized stdin prompts before spawning Pi; the initial cap is 500 KB.

### Explicit exceptions

Claude Code may still support explicit external read-only context for one-off needs by passing `mcpConfigPath` and approved read-only MCP tools. This is not part of the default shared toolkit.

Any web-enabled subagent mode should be a separate future profile, not a silent default. A future profile must provide parity across runtimes, for example:

- Claude Code: `WebSearch` / `WebFetch`
- Pi Coding Agent: a matching read-only web search/fetch extension

Until that exists, web context stays with Amp.

### Output contract

Both subagents use the same mode-specific JSON schemas from RFC-0001:

- `patch`: summary, recommendation, confidence, unified diff, tests, risks
- `review`: summary, recommendation, confidence, findings, tests, risks
- `research`: summary, answer, confidence, citations, risks

Amp validates the returned JSON before using it.

## Behavior

### Implementation status

Implemented initially in:

- `plugins/claude-code-subagent.ts`
- `plugins/pi-code-subagent.ts`

Current implementation choices:

- Claude Code default built-in tools are `Read`, `Grep`, `Glob`, and `LS`.
- Claude Code MCP is explicit-only.
- Pi default tools are `read`, `grep`, `find`, and `ls`.
- Pi disables context-file discovery with `--no-context-files`.
- Pi subagent prompts are capped at 500 KB before spawn.
- Pi uses `deepseek-v4-pro` by default.
- Both wrappers keep Amp as the only agent allowed to apply changes.

## Permissions and side effects

### Audit and usage logging

Both subagent wrappers should follow the same logging policy:

- Write a redacted audit log for each run.
- Store raw transcripts only when explicitly requested/debugging.
- Append token usage/status events to `~/.config/amp/logs/agent-token-usage.jsonl` when usage metadata is available.
- Do not put prompts, raw transcripts, file contents, user messages, or tool results in the token usage ledger.

Pi usage extraction may be best-effort because Pi print mode output is not guaranteed to include usage metadata in the same shape as Claude Code.

### Security and maintainability notes

- Amp remains the only executor/writer.
- Subagents must not directly mutate the workspace.
- Subagents must not use shell access as a substitute for missing web tools.
- External context should be curated by Amp to reduce prompt bloat and avoid divergent evidence.
- The default contract should stay boring and symmetric; runtime-specific extras should be explicit and documented.

## Examples

None.

## Maintenance notes

### Future work

- Factor common schema, validation, redaction, audit, and usage-ledger helpers if more subagent wrappers are added.
- Add a separate explicit web-enabled profile only if both Claude Code and Pi can expose equivalent read-only web tools.
- Add focused tests around shared JSON validation and command construction if the plugin code continues to grow.

## Open questions

None.
