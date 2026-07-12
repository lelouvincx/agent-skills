---
doc_schema: "amp-artifact/v2"
title: "Track Event"
slug: "track-event"
status: "active"
summary: "Adds the `track event` command-palette action for explicitly capturing the current task as a skill/plugin usage event with optional labels."
artifact:
  id: "track_event"
  type: "command"
  surface: "command_palette"
  invocation: "command_palette"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/skill-plugin-usage.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerCommand"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-06-28"
contract:
  input_kind: "ui_prompt"
  output_kind: "ui_notification"
  trigger: "command_palette"
  allowed_tools: []
  event: null
  command_id: "track_event"
  agent_mode_key: null
runtime:
  uses:
    - "amp.registerCommand"
    - "ctx.ui.input"
    - "ctx.ui.notify"
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
    - "current Amp thread ID"
    - "latest user request and recent assistant outcome as a compact seed"
    - "tracked artifact paths and git metadata"
  writes:
    - "~/.config/amp/logs/skill-plugin-usage/events.jsonl"
    - "~/.config/amp/logs/skill-plugin-usage/labels.jsonl when labels are provided"
  network: []
  logs:
    - "plugin load log"
    - "command failures without sensitive payloads"
safety:
  permission_level: "manual-local-append-only"
  user_gate: "manual command palette invocation"
  constraints:
    - "Command palette label is exactly `track event`."
    - "Records thread_id only; do not record thread URLs."
    - "Do not store secrets, raw transcripts, full file contents, or tool outputs that may contain private data."
    - "Append event rows only; append label rows only when labels are provided."
    - "Do not modify skill/plugin artifacts, thread messages, or git state."
  risks:
    - "Manual notes can accidentally include private context if the prompt copy is too broad."
    - "Ambiguous artifact targets can create labels that are hard to report on."
related:
  - "capture-skill-plugin-magic-words"
  - "label-skill-plugin-usage"
tags:
  - "command"
  - "skill-plugin-usage"
  - "dataset"
  - "manual-capture"
---

# Track Event

## Summary

`track_event` adds the command-palette action `track event`. It is the explicit fallback for moments when Chinh knows the current task should be recorded in the grounded skill/plugin usage dataset without relying on magic words.

The command appends a compact event row and, when labels are supplied, one or more label rows. It reports the generated IDs back to Chinh.

## Invocation

- Surface: command palette
- Registered with: `amp.registerCommand`
- Command ID: `track_event`
- Palette label: `track event`
- Plugin file: `plugins/skill-plugin-usage.ts`

## Contract

The command accepts no JSON input. It requires an active Amp thread and opens a UI prompt for optional capture details.

Prompt fields should collect or derive:

| Prompt field | Notes |
| --- | --- |
| Artifact target | Optional skill, plugin capability, AGENTS section, prompt, or instruction reference. |
| Labels | Optional taxonomy labels such as `helped`, `no_op`, `tool_mismatch`, `too_verbose`, or `missed_trigger`. |
| Verdict | Optional `keep`, `rewrite`, `delete`, `split`, `merge`, or `needs_more_data`. |
| Notes | Optional short evidence note written by Chinh. |

The appended event row must use `schema: skill-plugin-usage-event/v1`, include the current `thread_id` only, and include version-control fields for each known artifact: `source_repo`, `source_path`, `runtime_path`, `vcs.commit`, and `vcs.dirty`.

The command returns a UI notification containing the new `event_id` and any `label_id` values. It must not return or store raw transcript text.

## Behavior

When invoked, the command captures the current Amp thread ID, uses the latest user request and recent assistant outcome only as a compact event seed, prompts for optional artifact target, labels, verdict, and notes, then appends one event row. If labels are provided, it appends label rows referencing the new `event_id`.

Labels are append-only. If Chinh uses `track event` to correct an earlier judgment, the command should append a new superseding label row instead of editing an existing label row. The latest label row for the same event and target wins for simple reporting, while older rows remain auditable.

If artifact metadata can be resolved to the canonical repo, the row must include `source_repo: /Users/lelouvincx/Developer/agent-skills`, a repo-relative `source_path`, the installed `runtime_path` under `~/.config/amp` when applicable, and `vcs.commit` plus `vcs.dirty`. If the artifact is not version-controlled yet, record nulls for unavailable source fields rather than inventing paths.

## Permissions and side effects

This command reads current thread metadata, a minimal recent-message seed, local artifact paths, and git metadata. It appends local JSONL rows to `events.jsonl` and optionally `labels.jsonl`. It shows a UI notification.

It must not store plaintext secrets, env values, raw transcripts, full user messages, full file contents, or tool outputs that may contain private data. It must not edit skill/plugin files, rewrite existing dataset rows, rename threads, call network services, or change git state.

## Examples

Run from the command palette:

```text
track event
```

Example prompt values:

```text
Artifact target: amp/docs/tools/pi-code-subagent.md#Invocation
Labels: helped
Verdict: keep
Notes: Pi fallback instruction made the review boundary clear.
```

Correction example:

```text
Artifact target: amp/AGENTS.md#Amp plugins
Labels: no_op
Verdict: rewrite
Notes: The docs-first instruction did not affect this plugin task.
```

## Troubleshooting

- Command not visible: reload Amp plugins and confirm `plugins/skill-plugin-usage.ts` registers `track_event` with palette label `track event`.
- No active thread: open an Amp thread and run the command again.
- Event row missing: check append permissions for `~/.config/amp/logs/skill-plugin-usage/events.jsonl`.
- Label row missing: confirm labels were supplied in the prompt.
- Version-control fields missing: confirm the artifact exists under `/Users/lelouvincx/Developer/agent-skills` and git metadata can be read.

## Maintenance notes

Keep the command label exactly `track event` unless RFC-0004 is updated. Keep this command as explicit capture, not automatic phrase detection. Update this document when prompt fields, returned IDs, row schemas, artifact metadata resolution, or privacy constraints change.
