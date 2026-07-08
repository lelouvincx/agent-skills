---
name: creating-client-design-systems
description: Creates Google DESIGN.md design contracts from client or product brands. Use when asked to create a design.md, extract brand tokens, theme a Holistics demo, or align dashboard AML styling with a documented visual identity.
---

# Creating client design systems

Create a design contract: brand evidence → Google-style `DESIGN.md` → matching implementation.

Use `reference/google-design-md.md` only when you need the current Google section order, token schema, or starter skeleton.

When editing `DESIGN.md`, use the lint command from `npx @google/design.md` rather than relying on memory; Google's alpha syntax can change.

## Workflow

1. **Anchor the brand evidence**
   - Prefer official brand guidelines, website pages, product screenshots, existing dashboards, logos, or customer-provided assets.
   - Complete when the final response can name the source used, or explicitly say no reliable source was available.

2. **Create or update the design file**
   - Default path for client work: `clients/<client-name>/design.md`.
   - Preserve existing useful decisions instead of replacing the file wholesale.
   - Complete when the file has machine-readable tokens and human-readable rationale, or the task is intentionally reference-only.

3. **Use Google DESIGN.md structure**
   - Keep normative values in YAML front matter and rationale in Markdown prose.
   - Consult `reference/google-design-md.md` before creating a new file or making structural changes.
   - Complete when the file lints or remaining lint findings are intentional and reported.

4. **Model tokens for implementation**
   - Name colors by role first, not just hue.
   - For dashboards, include categorical palette guidance and any sequential/diverging palette guidance needed for charts.
   - Complete when dashboard-critical roles, typography, shape, spacing, and component patterns are either specified or deliberately omitted.

5. **Connect to Holistics assets when relevant**
   - Treat `design.md` as upstream of `*.theme.aml`, `*.page.aml`, dashboards, and chart palette decisions.
   - Document the theme identifiers and dashboard files that implement the design.
   - Complete when every modified Holistics asset can be traced back to a token or prose decision.

6. **Validate and fix findings**
   - Run the DESIGN.md linter through `npx @google/design.md`.
   - Fix errors and meaningful WCAG contrast warnings.
   - Treat orphan-token warnings as acceptable only when the token is intentionally documented for future dashboard or chart use.
   - If AMQL changed, run `holistics aml validate` after edits.
   - Complete when validation results and intentional warnings are ready to report.

## Final response

Report:

- where the `design.md` file lives
- what brand source was used
- which implementation files were updated, if any
- validation commands and results
- any intentional lint warnings or unverified visual assumptions
