---
name: creating-client-design-systems
description: Creates and maintains Google DESIGN.md files for client or product visual identities, especially Holistics dashboard themes. Use when asked to create a design.md, extract a brand into reusable design tokens, theme a Holistics client demo, or keep dashboard AML styling aligned with a documented design system.
---

# Creating client design systems

Turn a client, product, or dashboard brand into a reusable Google-style `DESIGN.md` file, then use it as the source of truth for implementation.

Use Google's DESIGN.md spec and CLI for structure and validation; do not use the Stitch-specific `design-md` skill unless the task is actually about Google Stitch.

## When working in Holistics projects

If the workspace contains `.aml` files, also load and follow the `develop-amql` and `search-docs` skills.

For AMQL changes, always run:

```bash
holistics aml validate
```

For `DESIGN.md` changes, run:

```bash
npx @google/design.md lint path/to/design.md
```

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
   - Sections should appear in this order when present:
     1. `Overview`
     2. `Colors`
     3. `Typography`
     4. `Layout`
     5. `Elevation & Depth`
     6. `Shapes`
     7. `Components`
     8. `Do's and Don'ts`

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
   - Run `npx @google/design.md lint <file>`.
   - Fix errors and meaningful WCAG contrast warnings.
   - Orphan-token warnings are acceptable only when the token is intentionally documented for future dashboard or chart use; mention that in the final summary.
   - If AMQL changed, run `holistics aml validate` after edits.

## DESIGN.md skeleton

Use this as the starting shape, then trim or expand based on evidence:

```markdown
---
version: alpha
name: Client Name
description: Short description of the visual identity and implementation context.
colors:
  primary: "#000000"
  on-primary: "#FFFFFF"
  surface: "#FFFFFF"
  text: "#111827"
typography:
  heading:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
---

## Overview

State the brand source, visual atmosphere, and target experience.

## Colors

Explain color roles, accessibility constraints, and chart palette usage.

## Typography

Explain font choices, hierarchy, and dashboard readability constraints.

## Layout

Explain spacing, density, grid behavior, and dashboard composition.

## Elevation & Depth

Explain shadows, borders, layering, and card treatment.

## Shapes

Explain radius, pills, sharpness, and geometry.

## Components

Explain cards, buttons, filters, KPI tiles, charts, tables, and chips.

## Do's and Don'ts

- Do ...
- Don't ...
```

## Final response

Report:

- where the `design.md` file lives
- what brand source was used
- which implementation files were updated, if any
- validation commands and results
- any intentional lint warnings or unverified visual assumptions
