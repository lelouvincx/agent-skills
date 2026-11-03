# MCP implementations and capability contracts

This directory contains local MCP launchers, servers and their supporting modules. The capability contracts live in `amp/docs/tools/`, alongside plugin contracts.

| Source | Capability contract |
| --- | --- |
| `anfra-discourse.mts` | [Anfra Discourse MCP](../docs/tools/anfra-discourse-mcp.md) |
| `git-diff-server.mjs` | [Claude Code subagent: read-only Git tools](../docs/tools/claude-code-subagent.md) |
| `design-sync-upload-policy.mjs` | [Claude Design subagent: approved upload boundary](../docs/tools/claude-design-subagent.md) |

Update the owning capability document before changing an implementation's contract. Supporting modules belong to their consuming capability; they do not need a separate document merely because they are separate files.

`./sync-skills.sh` projects this directory to `$AMP_CONFIG_DIR/mcp-servers/` and the capability documents to `$AMP_CONFIG_DIR/docs/tools/`. It does not register workspace MCP servers or copy credential values into their configuration.
