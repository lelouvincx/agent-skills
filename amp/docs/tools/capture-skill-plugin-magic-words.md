---
doc_schema: "amp-plugin-capability/v1"
title: "Capture Skill/Plugin Magic Words"
slug: "capture-skill-plugin-magic-words"
status: "active"
summary: "Automatically records skill/plugin usage events when canonical magic words, label phrases, or report phrases appear in user-facing task context."
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
  event: "agent.end"
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "amp.on('agent.end')"
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
    - "current Amp thread ID and recent message metadata needed to detect canonical phrases"
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
  user_gate: "canonical magic phrase or tracked artifact/capability activity"
  constraints:
    - "Records thread_id only; do not record thread URLs."
    - "Do not store secrets, raw transcripts, full file contents, or tool outputs that may contain private data."
    - "Append event rows only; never rewrite historical events."
    - "Append label rows only when a canonical label phrase maps to a clear target; corrections are superseding label rows."
    - "At most one automatic event per thread turn by default unless Chinh explicitly names multiple artifacts or labels."
  risks:
    - "Phrase matching can be noisy if a broad phrase appears incidentally."
    - "Plugin event APIs may not expose enough user-message context; implementation may need an agent-callable fallback with this same contract."
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

`capture_skill_plugin_magic_words` is the automatic-first capture capability for the grounded skill/plugin usage dataset. It watches predictable, canonical phrases and tracked artifact activity, then appends compact usage events under `~/.config/amp/logs/skill-plugin-usage/` without copying private task context.

The capability exists so Chinh can say lightweight phrases such as `track this`, `this helped`, or `which instructions are no-ops` and get durable usage evidence for later skill/plugin maintenance.

## Invocation

- Surface: plugin event pipeline
- Registered with: `amp.on`
- Event: `agent.end` unless Amp later exposes a better incoming-user-message event
- ID: `capture_skill_plugin_magic_words`
- Plugin file: `plugins/skill-plugin-usage.ts`

The initial implementation should use an event handler if Amp exposes enough recent user-message context. If the plugin event API cannot reliably observe canonical phrases, implement the same behavior as an agent-callable tool fallback whose description tells Amp to call it whenever the current user message contains a canonical phrase. The product behavior remains automatic-first capture either way.

## Contract

Input is the current plugin event plus the current thread metadata available through the Amp plugin API. The handler appends JSONL rows and returns `undefined`.

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

Canonical capture phrases are case-insensitive and phrase-based:

- `learn this`
- `record this`
- `log this`
- `track this`
- `capture this`
- `add this to the dataset`
- `add this to skill/plugin usage`
- `remember this for skills/plugins`
- `usage event`
- `skill/plugin usage`

Canonical label phrases trigger event capture plus a label row when the target is clear:

- `label this`
- `mark this`
- `this helped`
- `this was useful`
- `this saved time`
- `this was a no-op`
- `no-op`
- `ignored instruction`
- `you ignored`
- `wrong trigger`
- `missed trigger`
- `wrong tool`
- `tool mismatch`
- `too verbose`
- `over-scoped`
- `docs/code drift`
- `unsafe`
- `risky`
- `I had to correct`

Canonical report phrases trigger a report flow later and may capture the report request as its own usage event:

- `usage report`
- `skill/plugin report`
- `what should we delete`
- `what should we rewrite`
- `which instructions are no-ops`

## Behavior

On each eligible event, the handler inspects only the minimal recent task context needed to detect canonical phrases and identify tracked artifacts. It matches phrases case-insensitively, normalizes obvious punctuation boundaries, and avoids broad semantic guessing.

The handler appends at most one event per thread turn by default. It may append multiple rows only when Chinh explicitly names multiple artifacts, multiple labels, or multiple distinct events to capture.

When a canonical label phrase maps clearly to a taxonomy label, the handler appends both an event row and a label row. For example, `this helped` maps to `helped`, `no-op` maps to `no_op`, `wrong tool` maps to `tool_mismatch`, `too verbose` maps to `too_verbose`, and `missed trigger` maps to `missed_trigger`. If the target artifact or instruction is ambiguous, capture the event with an `unclear` or `needs_more_data` label rather than asking a broad follow-up question.

Tracked artifact activity also creates usage events when the signal is reliable: edits or reviews of `AGENTS.md`, `SKILL.md`, `amp/docs/tools/*.md`, plugin prompts, plugin docs, subagent prompts, or invocations of tracked plugin capabilities, commands, modes, and subagent wrappers.

## Permissions and side effects

This capability reads current thread metadata, minimal recent message text needed for phrase matching, tracked artifact paths, and git metadata for `/Users/lelouvincx/Developer/agent-skills`. It appends local JSONL rows to the skill/plugin usage dataset. It does not modify skill files, plugin code, thread messages, tool outputs, or git state.

Privacy constraints are strict: no plaintext secrets, env values, raw transcripts, full user messages, full file contents, or tool outputs that may contain private data. If richer evidence is needed, write a short note or a pointer to a redacted audit log, not the sensitive content itself.

## Examples

User phrase that captures one event:

```text
track this for skill/plugin usage
```

User phrase that captures an event and a positive label:

```text
this helped
```

User phrase that captures an event and a negative label:

```text
wrong tool; this should have used the Pi Code subagent
```

Report phrase that may also be captured as a usage event:

```text
which instructions are no-ops?
```

## Troubleshooting

- Expected event missing: check whether the phrase is in the canonical list and whether the plugin event API exposed the relevant user-message context.
- Event captured too broadly: tighten phrase matching, keep the canonical phrase list small, and preserve the one-event-per-turn default.
- Label missing: verify the phrase maps to a taxonomy label and that the target artifact or instruction was clear enough.
- Git fields missing: verify the artifact has a canonical source under `/Users/lelouvincx/Developer/agent-skills` and that `git` is available.
- Privacy concern: inspect only row shape and redacted summaries; do not copy raw task text into the dataset.

## Maintenance notes

Keep the canonical phrase list aligned with RFC-0004 and the dataset README. Add new phrases only after repeated real usage shows Chinh naturally uses them. If Amp adds a first-class incoming-user-message event, update the invocation metadata and implementation while preserving the append-only row contract. If the implementation uses an agent-callable fallback, keep this document as the behavior contract and add or update the fallback capability doc only when that surface is actually registered.
