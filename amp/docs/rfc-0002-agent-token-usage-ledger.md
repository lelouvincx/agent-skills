---
code: "RFC-0002"
title: "Raw agent token usage ledger"
file: "rfc-0002-agent-token-usage-ledger.md"
status: "Implemented (initial)"
created: "2026-06-20"
updated: "2026-06-20"
amp_thread_id: "T-019ee630-2df6-7697-a737-c08bbe4ab3ba"
dependency:
  - type: "rfc"
    code: "RFC-0001"
    title: "Claude Code as a manual read-only Amp subagent"
    path: "./rfc-0001-claude-code-subagent.md"
---

# RFC-0002: Raw agent token usage ledger

## Summary

Create a raw, append-only local JSONL ledger for agent token usage events.

The goal is not to compare Amp and Claude Code. Their roles are different:

- Amp is the orchestrator, planner, executor, and verifier.
- Claude Code is a delegated helper for scoped read-only advisory work, review, and small-to-medium patch proposals.

The ledger should simply preserve enough raw usage data that Chinh can later ask Amp to read the file and explain usage patterns.

## Motivation

Agent work can consume meaningful token budget across Amp conversations and delegated Claude Code runs. The current Claude Code subagent already writes redacted audit logs, and Amp already displays a token gauge, but there is no simple durable ledger of usage events that can be analyzed later.

The desired workflow is:

```text
Agent activity happens → usage event is appended → later Amp reads JSONL and explains usage
```

This should be boring infrastructure: raw data capture first, analysis later.

## Goals

- Store raw token usage events in one append-only local JSONL file.
- Start with automatic Claude Code subagent usage capture because Claude CLI output already includes usage metadata.
- Preserve enough context to connect each usage event back to an Amp thread and detailed audit log.
- Keep the format easy for Amp to consume directly in a later conversation.
- Avoid summaries, dashboards, routing logic, or comparison logic in the first version.

## Non-goals

- Do not build an `agent-usage` CLI.
- Do not build a dashboard or report UI.
- Do not implement daily/weekly summaries.
- Do not compare Amp vs Claude Code efficiency.
- Do not implement automatic routing decisions.
- Do not implement a cost optimizer.
- Do not store raw transcripts by default.

## Ledger path

Use one user-wide JSONL file:

```text
~/.config/amp/logs/agent-token-usage.jsonl
```

Each line is one usage event.

## Event schema

Initial schema:

```json
{
  "timestamp": "2026-06-20T18:12:00.000Z",
  "source": "claude-code-subagent",
  "agent": "claude_code",
  "threadID": "T-019ee630-2df6-7697-a737-c08bbe4ab3ba",
  "mode": "review",
  "model": "opus",
  "durationMs": 32824,
  "exitCode": 0,
  "timedOut": false,
  "validationError": null,
  "usage": {
    "inputTokens": 2,
    "outputTokens": 166,
    "cacheCreationInputTokens": 2171,
    "cacheReadInputTokens": 10457,
    "totalTokens": 12796
  },
  "metadata": {
    "workingDirectory": "/Users/lelouvincx/.config/amp",
    "githubProfile": "work",
    "auditLogPath": "/Users/lelouvincx/.config/amp/logs/claude-code-subagent/..."
  }
}
```

Field notes:

- `timestamp`: event timestamp, usually the run start time.
- `source`: subsystem that emitted the row.
- `agent`: normalized agent/runtime name, for example `claude_code` or `amp`.
- `threadID`: Amp thread ID when available.
- `mode`: task mode when available, such as `research`, `review`, or `patch`.
- `model`: model alias or model name when available.
- `durationMs`: wall-clock duration for the event.
- `exitCode`, `timedOut`, `validationError`: enough status data to spot failed or wasteful runs.
- `usage`: token counters, using lower-camel-case names in JSON.
- `metadata.auditLogPath`: pointer to the detailed redacted audit log.

## Claude Code capture

The Claude Code subagent plugin should extract token usage from Claude CLI JSON output before stdout is truncated for audit logging.

For each completed Claude Code invocation, append one normalized row to `agent-token-usage.jsonl`.

Expected usage fields from Claude CLI output include some or all of:

- `input_tokens`
- `output_tokens`
- `cache_creation_input_tokens`
- `cache_read_input_tokens`

The plugin should normalize those to:

- `inputTokens`
- `outputTokens`
- `cacheCreationInputTokens`
- `cacheReadInputTokens`
- `totalTokens`

If multiple usage blocks are present in a single Claude CLI response, the implementation should pick the final aggregate result when available. If no aggregate exists, it may sum message-level usage blocks conservatively, but should avoid double-counting repeated cumulative values.

## Amp usage capture

Amp usage capture is desirable but secondary.

The implementation should first investigate whether Amp exposes per-thread or per-call token usage in local logs or an API. If reliable usage data is available, append Amp events into the same JSONL format with `agent: "amp"` and `source` set to the relevant source.

If Amp does not expose reliable local usage data, do not overbuild. Leave the ledger focused on automatic Claude Code usage capture and document the limitation.

## Privacy and retention

The usage ledger should not contain prompts, raw transcripts, file contents, user messages, or tool results.

It may contain:

- thread IDs
- model names
- timing data
- token counters
- status fields
- local audit log paths
- working directory paths

Existing redacted audit logs remain the place for richer debugging context. Raw transcript capture remains opt-in only.

## Expected usage

After enough events have accumulated, Chinh can ask Amp:

> Read `~/.config/amp/logs/agent-token-usage.jsonl` and explain my agent token usage this week.

Amp can then analyze the raw data directly without needing a dedicated reporting command.

## Implementation plan

1. Update `plugins/claude-code-subagent.ts` to parse usage from Claude CLI JSON output before truncation.
2. Add an append-only writer for `~/.config/amp/logs/agent-token-usage.jsonl`.
3. Append one usage event per Claude Code subagent run, including failure status and `auditLogPath`.
4. Add focused tests for usage extraction and JSONL writing.
5. Separately investigate Amp-local token metadata; only add Amp rows if there is a reliable source.

## Open questions

- Does Amp expose reliable per-thread/per-call token usage locally, or only through the visible token gauge?
- Should failed Claude Code calls with no usage metadata still append a status-only row?
- Should the ledger rotate eventually, or is one append-only file acceptable for now?
