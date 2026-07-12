---
doc_schema: "amp-artifact/v2"
title: "Label Skill/Plugin Usage"
slug: "label-skill-plugin-usage"
status: "active"
summary: "Appends manual labels and superseding label corrections for existing skill/plugin usage events."
artifact:
  id: "label_skill_plugin_usage"
  type: "agent_tool"
  surface: "agent"
  invocation: "tool_call"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/skill-plugin-usage.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerTool"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-06-28"
contract:
  input_kind: "json_schema"
  output_kind: "text"
  trigger: "tool_call"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "amp.registerTool"
    - "local JSONL append"
    - "git rev-parse"
    - "git status --porcelain"
  dependencies:
    - "skill-plugin-usage dataset directory under ~/.config/amp/logs"
    - "canonical artifact repo at /Users/lelouvincx/Developer/agent-skills"
    - "git on PATH"
  env: []
  reads:
    - "~/.config/amp/logs/skill-plugin-usage/events.jsonl for target event resolution"
    - "~/.config/amp/logs/skill-plugin-usage/labels.jsonl for previous labels when superseding"
    - "tracked artifact paths and git metadata"
  writes:
    - "~/.config/amp/logs/skill-plugin-usage/labels.jsonl"
  network: []
  logs:
    - "plugin load log"
    - "label append failures without sensitive payloads"
safety:
  permission_level: "local-append-only"
  user_gate: "agent decision from explicit user label or correction request"
  constraints:
    - "Records thread_id only when thread identity is needed; do not record thread URLs."
    - "Do not store secrets, raw transcripts, full file contents, or tool outputs that may contain private data."
    - "Append label rows only; never edit or delete historical labels."
    - "Corrections supersede earlier label rows by event and target."
    - "Do not create a new event unless the user explicitly asks for a backfill and enough event context is available."
  risks:
    - "Incorrect event resolution can attach a valid label to the wrong usage event."
    - "Overly broad notes can leak private context if copied from the thread."
related:
  - "capture-skill-plugin-magic-words"
  - "track-event"
tags:
  - "agent-tool"
  - "skill-plugin-usage"
  - "labels"
  - "correction"
---

# Label Skill/Plugin Usage

## Summary

`label_skill_plugin_usage` appends manual labels for existing skill/plugin usage events. It covers canonical label-prefix requests such as `usage label: helped` and `usage label: wrong tool`, plus explicit correction requests that name the event or label to supersede.

The tool preserves auditability by treating labels as append-only rows. Corrections append superseding label rows instead of modifying older rows.

## Invocation

- Surface: agent
- Registered with: `amp.registerTool`
- Invocation: `tool_call`
- ID: `label_skill_plugin_usage`
- Plugin file: `plugins/skill-plugin-usage.ts`

Amp should call this tool when Chinh explicitly labels or corrects a captured event. Simple previous-turn labels should come through the canonical `usage label:` prefix, such as `usage label: helped`, `usage label: no-op`, `usage label: wrong tool`, `usage label: too verbose`, or `usage label: missed trigger`. Backfills and corrections should use explicit event or label pointers rather than adding extra free-form magic words.

## Contract

The tool accepts JSON input with these fields:

| Field | Required | Notes |
| --- | --- | --- |
| `event_id` | Optional | Required when not resolving from `relative_event`. |
| `relative_event` | Optional | `current`, `previous`, or another narrow pointer the implementation supports. |
| `target` | Required | Event, artifact, capability, instruction, or prompt target. |
| `labels` | Required | One or more taxonomy labels. |
| `verdict` | Optional | `keep`, `rewrite`, `delete`, `split`, `merge`, or `needs_more_data`. |
| `confidence` | Optional | `low`, `medium`, or `high`. |
| `notes` | Optional | Short user-written evidence note; not raw transcript text. |
| `supersedes_label_id` | Optional | Previous label row superseded by this correction when known. |

Each appended label row must include `schema: skill-plugin-usage-label/v1`, a generated `label_id`, `event_id`, timestamp, `labeled_by`, target metadata, labels, optional verdict, confidence, notes, and source metadata where available. Target metadata should include `source_repo`, `source_path`, and `runtime_path`; associated artifact metadata should include `vcs.commit` and `vcs.dirty` when the canonical source is under `/Users/lelouvincx/Developer/agent-skills`.

The tool output is short text containing the appended `label_id`, the resolved `event_id`, and whether it supersedes a previous label.

## Behavior

When Chinh provides a clear label or correction, Amp resolves the target event and artifact, then calls this tool to append a label row. The tool validates the requested labels against the RFC-0004 taxonomy when possible, records the exact short user judgment in `notes` when provided, and returns the generated IDs.

Corrections are represented as new rows. For simple reporting, the latest label row for the same `event_id` and target wins. Historical rows remain in `labels.jsonl`, optionally linked through `supersedes_label_id` when the previous label is known.

If the requested event is ambiguous, the tool should reject with a concise message asking for a narrower pointer such as an `event_id` or “previous event.” It should not guess across unrelated threads or create broad labels without a target.

## Permissions and side effects

This tool reads existing usage events and labels to resolve the target and previous labels. It reads git metadata for canonical artifacts and appends one or more rows to `labels.jsonl`. It does not edit `events.jsonl`, rewrite historical label rows, modify skills/plugins, call network services, or change git state.

Privacy constraints are strict: do not store plaintext secrets, env values, raw transcripts, full user messages, full file contents, or tool outputs that may contain private data. Notes should be concise user-authored evidence, not copied transcript chunks.

## Examples

Label the previous event as helpful:

```json
{
  "relative_event": "previous",
  "target": {
    "scope": "artifact",
    "id": "amp/docs/tools/track-event.md"
  },
  "labels": ["helped"],
  "verdict": "keep",
  "confidence": "medium",
  "notes": "usage label: helped"
}
```

Correct a previous label:

```json
{
  "event_id": "evt_2026-06-28T12-34-56Z_a1b2c3",
  "target": {
    "scope": "capability",
    "id": "pi-code-subagent"
  },
  "labels": ["tool_mismatch"],
  "verdict": "rewrite",
  "confidence": "high",
  "notes": "usage label: wrong tool",
  "supersedes_label_id": "lbl_2026-06-28T12-45-00Z_d4e5f6"
}
```

## Troubleshooting

- Tool asks for a narrower target: provide an `event_id`, `relative_event: previous`, or a clearer artifact target.
- Label rejected: use the RFC-0004 taxonomy or add a new label only after repeated real cases justify it.
- Correction not reflected in reports: ensure the report logic treats the latest label row for the same event and target as superseding older rows.
- Git metadata missing: confirm the target artifact has a canonical source under `/Users/lelouvincx/Developer/agent-skills`.
- Privacy concern: shorten `notes` and avoid copying file contents, tool outputs, or transcript snippets.

## Maintenance notes

Keep this tool focused on labels and corrections. Do not fold automatic magic-word capture or command-palette event capture into this capability; those are documented separately. Update this document when label schema fields, taxonomy values, superseding-label semantics, event resolution rules, or artifact metadata requirements change.
