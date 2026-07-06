---
title: "Amp Plugin Capability Docs"
slug: "amp-plugin-capability-docs"
doc_schema: "amp-plugin-doc-index/v1"
status: "active"
last_reviewed: "2026-06-24"
---

# Amp plugin capability docs

This folder documents the active local Amp plugin capabilities. The unit of documentation is a capability, not a plugin file: one plugin can expose a tool, command, event handler, agent mode, or future Amp extension surface.

## Source of truth

Use these sources in order when adding or refreshing a document:

1. `amp plugins list` for the active capabilities.
2. `amp plugins show-docs` for the Amp plugin API and supported registration surfaces.
3. `amp plugins show-agent-options --json` for plugin-agent models and built-in tool names.
4. `plugins/*.ts` for registered names, schemas, side effects, dependencies, and behavior.

## Capability documents

### Agent-callable tools

- [Claude Code Subagent](./claude-code-subagent.md)
- [Label Skill/Plugin Usage](./label-skill-plugin-usage.md)
- [Pi Code Subagent](./pi-code-subagent.md)
- [Spawn Subagent](./spawn-subagent.md)
- [Send to Thread](./send-to-thread.md)

### Agent modes

- [DeepSeek V4 Pro](./deepseek-v4-pro.md)
- [GLM 5.2](./glm-5-2.md)

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
