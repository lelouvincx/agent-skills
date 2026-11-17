#!/usr/bin/env bash
# Skill MCP entry point; the projected launcher owns credential selection.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
exec "$HOME/.local/bin/google-analytics-mcp"
