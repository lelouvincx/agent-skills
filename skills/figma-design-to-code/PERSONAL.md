---
description: "Figma design-to-code and read-only inspection. MUST load before get_design_context, when implementing a Figma design as code, or when asked to read, inspect, explain, or summarize a node-specific Figma URL."
---

## Read-only route

For a read-only request routed here, follow the upstream MCP retrieval and orientation workflow, but return a report instead of implementing the design.

If the Figma MCP server is unavailable, run `op run --env-file ~/.credentials/figma.env -- python3 ~/.agents/skills/figma-design-to-code/scripts/read-node.py '<figma-url>'`. Treat its JSON as structured context. Open the non-null `image` URL and inspect the rendered image before reporting. If the returned direct children do not contain enough detail, rerun the script with a node-specific URL for the relevant child.

Report the returned file and node identities; page identity when the source returns it; visible text, hierarchy, components, layout, styles and variables that the source actually provides; visual appearance; uncertainty; and whether the source was MCP or REST.

Finish only when the report names the requested node ID, uses both structured data and an inspected visual, labels the source, and makes no code or Figma edits.
