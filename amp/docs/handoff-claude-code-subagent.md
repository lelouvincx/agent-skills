# Handoff: Claude Code subagent policy for Amp plugin

Thread: https://ampcode.com/threads/T-019ee5a6-032c-7009-9c49-bef9be1543ea
Date: 2026-06-20

## Goal for next session

Implement an Amp plugin that lets Amp invoke Claude Code CLI as a manual, read-only, structured-output subagent. Claude Code should provide advice, review findings, or proposed unified diffs, while Amp remains the executor that applies/adapts changes and verifies them.

This document was created before implementation. It persists the design decisions from the grilling session.

## Feasibility notes

- Amp custom agents (`amp.createAgent`) create Amp-managed agents only; Claude Code cannot be used as a native Amp agent runtime.
- Claude Code can be wrapped as an Amp plugin tool because Amp plugins can execute shell commands via `amp.$`.
- Local `claude` supports non-interactive mode with `-p/--print`.
- Relevant Claude CLI flags observed locally/docs:
  - `--output-format text|json|stream-json`
  - `--model <model>` with aliases such as `opus` / `sonnet`
  - `--tools` to restrict built-in tools
  - `--disallowedTools` / `--allowedTools`
  - `--mcp-config` and `--strict-mcp-config`
  - `--permission-mode`
  - `--add-dir`
  - `--verbose`, `--include-partial-messages`
- Claude Code local session files under `~/.claude/projects` can include assistant `thinking`, `tool_use`, and `tool_result` blocks. Treat this as useful for debugging/audit, not a stable export API.
- There is no obvious first-class `claude export` command in the local `claude --help` output.

## Locked decisions

### Q1: Claude Code role

Decision: **B1: read-only diff advisor**.

Claude Code may inspect and reason, but must not directly edit files. It should return advice, review findings, or a proposed patch/diff. Amp remains the only executor.

### Q2: Tool safety model

Decision: Claude Code gets **no Bash and no file-write/edit tools**, but may use direct read-only external MCP tools.

Denied built-ins:
- `Bash`
- `Edit`
- `Write`
- `MultiEdit`
- `NotebookEdit`

Allowed built-ins:
- `Read`
- `Grep`
- `Glob`
- `LS`
- `WebSearch`
- `WebFetch`

Important nuance: MCP tools are separate from `--tools`; use `--strict-mcp-config` with a dedicated read-only MCP config and/or explicit MCP write-tool denials.

### Q3: Default readable context sources

Decision: Claude Code may read:
- repository
- Slack
- Notion
- Linear
- GitHub
- web search / web fetch
- approved filesystem safe roots outside the repo

### Q4: Filesystem outside repo

Decision: **safe roots allowlist**.

Outside-repo filesystem access should be granted only through configured safe roots, e.g. via `--add-dir`. Do not grant arbitrary home-directory access by default.

### Q5: Trigger policy

Decision revised: **manual trigger only**.

Amp should invoke Claude Code only when the user explicitly mentions “Claude” or “Claude Code”. No automatic trigger.

### Q6: Appropriate task types

Decision: Use Claude Code for:
- review / second opinion
- small-to-medium coding help

Do not use Claude Code as the lead agent for complex coding tasks. Primary Amp remains lead for complex work.

### Q7: Timing for small/medium tasks

Decision: **intent-sensitive**.

- Small tasks: Claude Code may propose first; Amp reviews/applies/adapts.
- Medium tasks: Amp may implement first, then ask Claude Code to review.
- Complex tasks: Amp leads; Claude Code only if explicitly requested and as advisor/reviewer.

### Q8: Size/risk classification

Accepted classification, with risk overriding size:

Small:
- touches 1–2 files
- localized behavior/UI/copy/test fix
- no architecture decision
- expected patch under roughly 100 lines
- targeted verification obvious

Medium:
- touches 2–6 files
- crosses one boundary, e.g. UI + API, model + tests
- expected patch roughly 100–400 lines
- ownership path clear despite some uncertainty
- may need multiple focused checks

Complex:
- many modules or unknown blast radius
- migrations, auth, permissions, billing, data deletion, infra, plugin architecture
- meaningful design tradeoffs / sequencing
- expected patch over roughly 400 lines
- high risk if wrong

Risk override examples: a 20-line auth/permission change can be complex; a 200-line copy update may still be small/medium.

### Q9: Claude Code output contract

Decision: **mode-specific structured JSON output**.

Patch/proposal mode should include:
- `summary`
- `recommendation`: `apply | do_not_apply | needs_amp_judgment`
- `confidence`: `low | medium | high`
- `patch`: unified diff if proposing code
- `tests`
- `risks`

Review mode should include:
- `summary`
- `recommendation`
- `confidence`
- `findings[]`, each with severity, evidence, issue, suggested fix
- `tests`
- `risks`

Research/context mode can include structured answer + citations/links when relevant.

### Q10: Applying Claude's patch

Decision: **depends on wording**.

- “Ask Claude Code”, “get Claude’s opinion/review” => advice only; Amp should not apply unless user later asks.
- “Use Claude Code to help implement/fix” => Amp may review/apply/adapt Claude’s patch and verify.
- Amp must never blindly apply Claude’s output.

### Q11: Context passed to Claude Code

Decision: **pre-processed Amp summary**, not raw thread dump.

Claude Code should receive a curated brief containing:
- current objective
- relevant constraints/decisions from the Amp thread
- repo/file context Amp selected
- current diff if reviewing
- external context summary if applicable
- explicit mode and output schema

Avoid sending the full raw Amp thread by default.

### Q12: Transcript/audit handling

Decision: **summarized audit by default, full transcript only when requested/debug**.

Default should store a concise audit trail: prompt brief, mode, model, timestamp, final structured JSON, and relevant metadata. Raw stream/session transcript can be saved only when the user explicitly requests it or debug mode is enabled.

### Q13: Model default

Decision: **Opus default**.

Use `claude -p --model opus ...` by default. Use Sonnet only when the user asks for speed/lightweight behavior.

### Q14: Timeout

Decision: **10-minute default timeout**.

Suggested overrides:
- quick: 3 minutes
- deep/thorough: 30 minutes

### Q15: Web access

Decision: **always allow web search/fetch** for Claude Code invocations.

### Q16: Secrets-like files

Decision: **allow** secrets-like files if they are inside the repo or configured safe roots.

This does not override Q4: no arbitrary home-directory access by default. Risk noted: read-only content can still enter Claude context, final output, local JSONL transcripts, and plugin audit logs.

### Q17: Log redaction

Decision: **redact logs by default**.

Plugin audit logs should attempt to redact obvious secrets/tokens/keys by default. Raw transcript only when explicitly requested/debug, with warning that it may contain sensitive content.

### Q18: Failure policy

Decision: **depends on wording**.

- If user asked specifically for Claude Code’s review/opinion: report the failure and do not pretend Claude reviewed anything.
- If user asked to use Claude Code to help implement/fix: Amp may continue alone after noting Claude Code failed.
- Never claim Claude Code reviewed/proposed anything if output was invalid/unusable.

### Q19: High-risk tasks

Decision: Claude Code may advise/review high-risk tasks, but Amp must independently inspect and verify.

High-risk examples: production, destructive actions, security, billing, data deletion, auth/permissions. Amp must not apply high-risk changes solely because Claude suggested them.

### Q20: Final trigger phrases

Decision: trigger only on explicit mention of **“Claude”** or **“Claude Code”**.

Examples:
- “ask Claude Code to review this”
- “use Claude to help implement”
- “double-check with Claude”
- “run Claude on this”

Non-triggers:
- “review this”
- “use a subagent”
- “think harder”
- “research this”

## Suggested implementation shape

Create an Amp plugin tool, likely in `~/.config/amp/plugins/claude-code-subagent.ts`, that registers one or more tools such as:

- `claude_code_review`
- `claude_code_patch_advice`
- maybe a unified `claude_code_subagent` with `mode: review | patch | research`

Core behavior:

1. Accept a structured request from Amp: mode, brief, relevant files/diff/context, optional safe roots, optional transcript/debug flag.
2. Build a curated prompt for Claude Code with the proper JSON schema.
3. Invoke Claude Code in non-interactive mode:
   - `claude -p --model opus --output-format json ...`
   - restrict built-ins to read/search/web tools
   - deny Bash and file edit/write tools
   - load strict read-only MCP config if available
   - add safe roots via `--add-dir` as configured
4. Parse/validate Claude’s structured JSON. If invalid, return a clear failure payload to Amp.
5. Save summarized, redacted audit metadata under a local log directory. Do not save raw transcript unless requested/debug.
6. Return the structured result to Amp. Amp decides whether to apply/adapt/verify based on user wording and risk.

## Open implementation questions

- Where should the read-only MCP config live?
  - Candidate: `~/.config/amp/claude-code-readonly-mcp.json` or plugin-local config.
- Which exact Slack/Notion/Linear/GitHub MCP tool names are available locally and which are read-only?
- What safe outside-repo roots should be configured initially?
- Should there be separate plugin tools per mode or one unified tool with a `mode` field?
- What log directory should be used for audit files? Prefer a local Amp config/cache path, not the project repo.
- How strict should JSON validation be initially? Smallest useful version: parse JSON and check required top-level fields per mode.

## Suggested skills for next agent

- `building-plugins`: use before implementing the Amp plugin.
- `ponytail` or local minimal-change judgment: keep the plugin small and avoid over-engineering.
- `search-docs` is not needed unless the task enters Holistics docs/AMQL territory.

## Security/redaction note

The user explicitly allowed Claude Code to read secrets-like files inside allowed roots, but requested log redaction by default. Do not paste secrets into the handoff, final answer, or saved audit artifacts. If raw transcript logging is requested, warn that it may contain sensitive content.
