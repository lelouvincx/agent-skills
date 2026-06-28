---
doc_schema: "amp-plugin-capability/v1"
title: "Capture Skill/Plugin Magic Words"
slug: "capture-skill-plugin-magic-words"
status: "active"
summary: "Automatically records skill/plugin usage events when canonical capture, label, or report prefixes appear in incoming user messages."
capability:
  id: "capture_skill_plugin_magic_words"
  type: "event_handler"
  surface: "plugin_event_pipeline"
  invocation: "plugin_event"
  registration_api: "amp.on"
  api_stability: "mixed"
plugin:
  file: "plugins/skill-plugin-usage.ts"
  scope: "system"
  install_source: "local"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  api_docs_source: "amp plugins show-docs"
  agent_options_source: "amp plugins show-agent-options --json"
  last_verified: "2026-06-28"
contract:
  input_kind: "plugin_event"
  output_kind: "append_only_jsonl"
  event: "agent.start_and_tool.result"
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "amp.on('agent.start')"
    - "amp.on('tool.result') for tracked subagent/tool wrappers"
    - "agent-callable fallback when no suitable plugin event exists"
    - "optional agent.end finalizer for pending capture enrichment"
    - "ctx.thread.messages"
    - "local JSONL append"
    - "git rev-parse"
    - "git status --porcelain"
  dependencies:
    - "canonical artifact repo at /Users/lelouvincx/Developer/agent-skills"
    - "skill-plugin-usage dataset directory under ~/.config/amp/logs"
    - "git on PATH"
  env: []
  reads:
    - "current Amp thread ID and current user message metadata needed to detect canonical prefixes"
    - "previous meaningful user request and assistant response when resolving usage labels"
    - "compact thread intent only when needed to disambiguate a target"
    - "tracked artifact paths and git metadata"
  writes:
    - "~/.config/amp/logs/skill-plugin-usage/events.jsonl"
    - "~/.config/amp/logs/skill-plugin-usage/labels.jsonl when a canonical label phrase has a clear target"
  network: []
  logs:
    - "plugin load log"
    - "capture failures without sensitive payloads"
safety:
  permission_level: "local-append-only"
  user_gate: "canonical capture, label, or report prefix in incoming user message; tracked artifact/capability activity"
  constraints:
    - "Records thread_id only; do not record thread URLs."
    - "Do not store secrets, raw transcripts, full file contents, or tool outputs that may contain private data."
    - "Append event rows only; never rewrite historical events."
    - "Append label rows only when a canonical label phrase maps to a clear target; corrections are superseding label rows."
    - "At most one automatic event per user turn by default unless Chinh explicitly names multiple artifacts or labels."
  risks:
    - "Phrase matching can be noisy if prefixes are made too broad."
    - "Plugin event APIs may not expose an incoming-user-message or turn-start event; implementation may need an agent-callable fallback with this same contract."
related:
  - "track-event"
  - "label-skill-plugin-usage"
tags:
  - "event-handler"
  - "skill-plugin-usage"
  - "magic-words"
  - "dataset"
---

# Capture Skill/Plugin Magic Words

## Summary

`capture_skill_plugin_magic_words` is the automatic-first capture capability for the grounded skill/plugin usage dataset. It watches predictable, canonical prefixes in incoming user messages and tracked artifact activity, then appends compact usage events under `~/.config/amp/logs/skill-plugin-usage/` without copying private task context.

The capability exists so Chinh can use explicit prefixes such as `usage capture: plugin ...`, `usage label: wrong tool`, or `usage report` and get durable usage evidence for later skill/plugin maintenance.

## Invocation

- Surface: plugin event pipeline
- Registered with: `amp.on`
- Preferred event: `agent.start`, fired when the user submits a prompt
- Tracked invocation event: `tool.result` for terminal tracked subagent/tool wrapper results
- Fallback: agent-callable tool with the same contract when no suitable plugin event exists
- Optional later event: `agent.end` only to enrich or finalize a pending capture with outcome metadata
- ID: `capture_skill_plugin_magic_words`
- Plugin file: `plugins/skill-plugin-usage.ts`

The initial implementation should detect capture intent at turn start, before the assistant answers. If the plugin event API cannot reliably observe incoming user messages, implement the same behavior as an agent-callable tool fallback whose description tells Amp to call it whenever the current user message starts with a canonical prefix. `agent.end` must not be the primary detection point; it may only be added later as a finalizer that enriches an already-captured pending event with outcome metadata.

## Contract

Input is the current turn-start or incoming-user-message event plus the current thread metadata available through the Amp plugin API. The fallback tool receives the current user message context from Amp. The handler appends JSONL rows and returns `undefined`.

Every captured event row must include:

| Field | Requirement |
| --- | --- |
| `schema` | `skill-plugin-usage-event/v1` |
| `event_id` | Stable generated ID. |
| `captured_at` | ISO timestamp. |
| `thread_id` | Amp thread ID only. Do not write any thread URL field. |
| `workspace` | Current workspace path when available. |
| `task.summary` | Short summary or seed, not the raw transcript. |
| `task.tags` | Optional coarse tags. Omit when unclear. |
| `artifacts[].source_repo` | Canonical repo, normally `/Users/lelouvincx/Developer/agent-skills`, when known. |
| `artifacts[].source_path` | Canonical path such as `amp/AGENTS.md`, `skills/<name>/SKILL.md`, or `amp/docs/tools/<capability>.md`. |
| `artifacts[].runtime_path` | Installed runtime path under `~/.config/amp` when applicable. |
| `artifacts[].vcs.commit` | Git commit for the canonical repo when available. |
| `artifacts[].vcs.dirty` | Boolean dirty-state marker for the canonical repo. |
| `usage.trigger` | `automatic`, `explicit`, `implicit`, `agent_decision`, or `user_correction`. |
| `privacy.contains_raw_transcript` | Must be `false`. |
| `privacy.contains_file_contents` | Must be `false`. |
| `privacy.contains_secrets` | Must be `false`. |

Canonical capture phrases are case-insensitive prefixes, not broad natural-language phrases:

- `usage capture: skill <skill-or-instruction-target>`
- `usage capture: plugin <plugin-or-capability-target>`

Canonical label phrases trigger event capture plus a label row when the target is clear. They must start with `usage label:` followed by one of these label phrases:

- `usage label: helped`
- `usage label: useful`
- `usage label: saved time`
- `usage label: no-op`
- `usage label: ignored instruction`
- `usage label: wrong trigger`
- `usage label: missed trigger`
- `usage label: wrong tool`
- `usage label: tool mismatch`
- `usage label: too verbose`
- `usage label: over-scoped`
- `usage label: docs/code drift`
- `usage label: unsafe`
- `usage label: risky`
- `usage label: had to correct`

Canonical report phrase:

- `usage report`

## Behavior

On each eligible turn start, the handler inspects only the current user message needed to detect canonical prefixes and identify explicitly named tracked artifacts. It matches prefixes case-insensitively, normalizes obvious punctuation boundaries, and avoids broad semantic guessing.

The handler appends at most one event per user turn by default. It may append multiple rows only when Chinh explicitly names multiple artifacts, multiple labels, or multiple distinct events to capture.

`usage capture: skill ...` and `usage capture: plugin ...` capture the current or upcoming task at turn start. `usage report` triggers report behavior at turn start so the assistant can answer with the report in the same turn.

When a canonical label phrase maps clearly to a taxonomy label, the handler appends both an event row and a label row. `usage label: ...` labels the previous meaningful agent turn by inspecting the current user message, the previous assistant response, the previous user request, and compact thread intent only when needed to resolve ambiguity. For example, `usage label: helped` maps to `helped`, `usage label: no-op` maps to `no_op`, `usage label: wrong tool` maps to `tool_mismatch`, `usage label: too verbose` maps to `too_verbose`, and `usage label: missed trigger` maps to `missed_trigger`. If the target artifact or instruction is ambiguous, capture the event with an `unclear` or `needs_more_data` label rather than asking a broad follow-up question.

An optional `agent.end` finalizer may later enrich a pending capture with compact outcome metadata. It must not inspect broad raw transcripts or create the initial capture event from scratch.

Tracked artifact activity also creates usage events when the signal is reliable: edits or reviews of `AGENTS.md`, `SKILL.md`, `amp/docs/tools/*.md`, plugin prompts, plugin docs, subagent prompts, or invocations of tracked plugin capabilities, commands, modes, and subagent wrappers.

A passive `tool.result` handler captures terminal invocations for the first reliable tracked tool set: `claude_code_subagent`, `pi_code_subagent`, and `spawn_worker`. It records the tool name, terminal status, compact summary, artifact metadata, and privacy booleans. It must not store raw tool input, raw output, error text, prompts, transcripts, or command payloads. Dataset-maintenance capabilities such as `track_event` and `label_skill_plugin_usage` are excluded from self-capture.

## Permissions and side effects

This capability reads current thread metadata, the current user message needed for prefix matching, the previous meaningful user/assistant pair when resolving labels, tracked artifact paths, and git metadata for `/Users/lelouvincx/Developer/agent-skills`. It appends local JSONL rows to the skill/plugin usage dataset. It does not modify skill files, plugin code, thread messages, tool outputs, or git state.

Privacy constraints are strict: no plaintext secrets, env values, raw transcripts, full user messages, full file contents, or tool outputs that may contain private data. If richer evidence is needed, write a short note or a pointer to a redacted audit log, not the sensitive content itself.

## Examples

User phrase that captures one event:

```text
usage capture: plugin pi-code-subagent
```

User phrase that captures an event and a positive label:

```text
usage label: helped
```

User phrase that captures an event and a negative label:

```text
usage label: wrong tool
```

Report phrase that may also be captured as a usage event:

```text
usage report
```

## Troubleshooting

- Expected event missing: check whether the phrase starts with a canonical prefix and whether the implementation is wired to a turn-start/incoming-user-message event or the agent-callable fallback.
- Event captured too broadly: tighten phrase matching, keep the canonical phrase list small, and preserve the one-event-per-turn default.
- Label missing: verify the phrase maps to a taxonomy label and that the target artifact or instruction was clear enough.
- Git fields missing: verify the artifact has a canonical source under `/Users/lelouvincx/Developer/agent-skills` and that `git` is available.
- Privacy concern: inspect only row shape and redacted summaries; do not copy raw task text into the dataset.

## Maintenance notes

Keep the canonical phrase list aligned with RFC-0004 and the dataset README. Add new phrases only after repeated real usage shows Chinh naturally uses them. If Amp adds a first-class turn-start or incoming-user-message event, update the invocation metadata and implementation while preserving the append-only row contract. If the implementation uses an agent-callable fallback, keep this document as the behavior contract and add or update the fallback capability doc only when that surface is actually registered. Use `agent.end` only for optional outcome enrichment of pending captures, not for initial user-intent detection.
