# Google DESIGN.md reference

This reference captures the parts of Google's alpha DESIGN.md format that are useful for client design-system work. Refresh it periodically from the upstream spec instead of expanding the main skill.

## CLI

Use the published CLI rather than memorized command variants:

```bash
npx @google/design.md lint <path-to-design.md>
```

Other useful commands include `diff`, `export`, and `spec`.

## Structure

A DESIGN.md file has two layers:

1. YAML front matter with machine-readable design tokens.
2. Markdown prose with human-readable design rationale.

Tokens are the normative values. Prose explains why and how to apply them.

## Section order

Sections can be omitted, but sections that are present should appear in this order:

1. `Overview`
2. `Colors`
3. `Typography`
4. `Layout`
5. `Elevation & Depth`
6. `Shapes`
7. `Components`
8. `Do's and Don'ts`

## Token schema

Common top-level token groups:

```yaml
version: alpha
name: <string>
description: <string>
colors:
  <token-name>: <css-color>
typography:
  <token-name>:
    fontFamily: <string>
    fontSize: <dimension>
    fontWeight: <number-or-string>
    lineHeight: <number-or-dimension>
rounded:
  <scale-level>: <dimension>
spacing:
  <scale-level>: <dimension-or-number>
components:
  <component-name>:
    backgroundColor: "{colors.token}"
    textColor: "{colors.token}"
```

Token references use `{path.to.token}` syntax.

## Starter skeleton

Trim or expand this based on evidence:

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
