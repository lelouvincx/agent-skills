---
title: "Amp Plugin Capability Docs"
slug: "amp-plugin-capability-docs"
doc_schema: "amp-plugin-doc-index/v1"
status: "active"
last_reviewed: "2026-06-24"
---

# Amp artifact docs

This folder documents active local Amp artifacts. The unit of documentation is an artifact, not a source file: one plugin can expose multiple capabilities, while one skill is loaded from its `SKILL.md` contract.

## Source of truth

Use these sources in order when adding or refreshing a document:

1. `amp plugins list` for the active capabilities.
2. `amp plugins show-docs` for the Amp plugin API and supported registration surfaces.
3. `amp plugins show-agent-options --json` for plugin-agent models and built-in tool names.
4. `plugins/*.ts` for registered names, schemas, side effects, dependencies, and behavior.
5. `skills/*/SKILL.md` for skill names, descriptions, declared tools, instructions, and behavior.

## Capability documents

New documents use `amp-artifact/v2`, which supports skills and plugin capabilities. Existing plugin documents can remain on `amp-plugin-capability/v1` until otherwise edited.

### Agent-callable tools

- [Claude Code Subagent](./claude-code-subagent.md)
- [Label Skill/Plugin Usage](./label-skill-plugin-usage.md)
- [Pi Code Subagent](./pi-code-subagent.md)
- [Spawn Subagent](./spawn-subagent.md)
- [Send to Thread](./send-to-thread.md)

### Agent modes

- [Deep Classic](./deep-classic.md)
- [DeepSeek V4 Pro](./deepseek-v4-pro.md)
- [Smart Classic](./smart-classic.md)

### Commands

- [Codex Usage Command](./codex-usage.md)
- [Logseq: Log Current Task](./logseq-log-current-task.md)
- [Track Event](./track-event.md)

### Event handlers

- [Capture Skill/Plugin Magic Words](./capture-skill-plugin-magic-words.md)
- [RTK Rewrite](./rtk-rewrite.md)
- [Holistics Markdown Result Renderer](./holistics-md.md)
- [Holistics MCP Error Logger](./holistics-mcp-errors.md)
- [macOS Turn End Notifier](./macos-turn-end-notifier.md)

## Maintenance files

- [_schema.md](./_schema.md) defines the versioned frontmatter schema.
- [_template.md](./_template.md) provides a copyable skeleton for new capability docs.
