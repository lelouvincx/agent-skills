---
name: creating-client-design-systems
description: Creates and maintains Google DESIGN.md files for client or product visual identities, especially Holistics dashboard themes. Use when asked to create a design.md, extract a brand into reusable design tokens, theme a Holistics client demo, or keep dashboard AML styling aligned with a documented design system.
---

# Creating client design systems

Turn a client, product, or dashboard brand into a reusable Google-style `DESIGN.md` file, then use it as the source of truth for implementation.

Use Google's DESIGN.md spec and CLI for structure and validation; do not use the Stitch-specific `design-md` skill unless the task is actually about Google Stitch.

When editing `DESIGN.md`, use the lint command from `npx @google/design.md` rather than relying on memory; Google's alpha syntax can change.

Use `reference/google-design-md.md` when you need the current section order, token schema, or starter skeleton.

## Workflow

1. **Find the brand source**
   - Prefer official brand guidelines, website pages, product screenshots, existing dashboards, logos, or customer-provided assets.
   - If no formal guideline exists, state which source became the brand reference.

2. **Create or update the design file**
   - Default path for client work: `clients/<client-name>/design.md`.
   - Preserve existing useful decisions instead of replacing the file wholesale.
   - Keep the file both machine-readable and human-readable.

3. **Use Google DESIGN.md structure**
   - YAML front matter contains normative tokens.
   - Markdown prose explains rationale and usage.
   - Check `reference/google-design-md.md` for the current section order and starter shape.

4. **Model tokens for implementation**
   - Include `version`, `name`, `description`, `colors`, `typography`, `rounded`, `spacing`, and `components` when useful.
   - Use token references such as `{colors.primary}` inside component definitions.
   - Name colors by role first, not just hue: `primary`, `surface`, `text`, `muted`, `success`, `warning`, `danger`, `info`.
   - For dashboards, include categorical palette guidance and any sequential/diverging palette guidance needed for charts.

5. **Connect to Holistics assets when relevant**
   - Treat `design.md` as upstream of `*.theme.aml`, `*.page.aml`, dashboards, and chart palette decisions.
   - Document the theme identifiers and dashboard files that implement the design.
   - If a design decision cannot be encoded directly in AML, record it as implementation guidance in prose.

6. **Validate and fix findings**
   - Run the DESIGN.md linter through `npx @google/design.md`.
   - Fix errors and meaningful WCAG contrast warnings.
   - Orphan-token warnings are acceptable only when the token is intentionally documented for future dashboard or chart use; mention that in the final summary.
   - If AMQL changed, run `holistics aml validate` after edits.

## Final response

Report:

- where the `design.md` file lives
- what brand source was used
- which implementation files were updated, if any
- validation commands and results
- any intentional lint warnings or unverified visual assumptions
