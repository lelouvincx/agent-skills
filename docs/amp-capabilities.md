# Amp capabilities

These are the local Amp plugins, CLIs, modes and MCP launchers this repository provides. Each link opens the capability's contract. The full index, including maintenance files, is in [amp/docs/tools](../amp/docs/tools/README.md).

## Shell commands

| Capability | Use it to |
| --- | --- |
| [Amp ChatGPT selector](../amp/docs/tools/amp-chatgpt-selector.md) | switch Amp ChatGPT subscriptions based on Codex quota |
| [Amp runner](../amp/docs/tools/amp-runner.md) | run named Amp background runners as user LaunchAgents |
| [Amp runner log maintenance](../amp/docs/tools/amp-runner-logs.md) | rotate, back up, and restore private runner logs |

## Agent tools and MCP

| Capability | Use it to |
| --- | --- |
| [Anfra Discourse MCP](../amp/docs/tools/anfra-discourse-mcp.md) | read, post and reply on community.anfra.ai as Chinh, through a workspace MCP launcher |
| [Claude Code subagent](../amp/docs/tools/claude-code-subagent.md) | ask Claude Code for read-only advice |
| [Pi Code subagent](../amp/docs/tools/pi-code-subagent.md) | ask Pi Coding Agent for read-only advice |
| [Label skill and plugin usage](../amp/docs/tools/label-skill-plugin-usage.md) | add or correct usage-event labels |

The [MCP source index](../amp/mcp-servers/README.md) maps each local MCP implementation to the capability that owns it.

## Agent modes

Pick these in the mode picker:

| Capability | Use it to |
| --- | --- |
| [Claude Fable 5.1](../amp/docs/tools/claude-fable-5-1.md) | run Amp high mode on Claude Fable 5.1 |
| [Claude Opus 4.7](../amp/docs/tools/claude-opus-4-7.md) | run Amp high mode on Claude Opus 4.7 |
| [Claude Opus 5.5](../amp/docs/tools/claude-opus-5-5.md) | run Amp high mode on Claude Opus 5.5 |

## Command palette

| Capability | Use it to |
| --- | --- |
| [Local Claude CLIProxyAPI runtime](../amp/docs/tools/local-claude-cliproxy.md) | open and review the projected local Claude proxy runtime |
| Second Brain: Log (global User Plugins: `second-brain-log/`) | log the current Amp task into the Obsidian-synced second-brain vault from local and orb threads |
| [Track event](../amp/docs/tools/track-event.md) | record skill or plugin usage manually |

## Event handlers

These run automatically in the plugin event pipeline:

| Capability | Use it to |
| --- | --- |
| [Capture skill and plugin magic words](../amp/docs/tools/capture-skill-plugin-magic-words.md) | record usage events from trigger phrases |
| [Holistics MCP error logger](../amp/docs/tools/holistics-mcp-errors.md) | log Holistics MCP CLI failures |
| [Holistics Markdown result renderer](../amp/docs/tools/holistics-md.md) | turn selected YAML result blocks into Markdown tables |
