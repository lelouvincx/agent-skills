---
description: Create, redraw, brand, inspect, or export diagrams and charts as standalone HTML, SVG, or PNG. Use for architecture and data-platform diagrams; flow, process, sequence, state, timeline, hierarchy, relationship, and quantitative visuals; draw.io or Mermaid imports; website-derived branding; accessible motion; or hand-drawn styling. Apply the Local workflow for artifact paths, project branding, browser work, and installed validation.
---

## Local workflow

Apply this section before conflicting upstream setup, onboarding, export, or validation procedures.

### Output

- Save generated diagrams, browser screenshots, and exports under `.amp/in/artifacts/` unless the user requests another location.
- Copy a packaged template to the output location before editing it. Treat this installed skill's `SKILL.md`, `assets/`, `references/`, and `scripts/` as read-only.
- Keep output static unless the user requests animation. Keep resources within the allowlist enforced by the packaged self-check.

### Project branding

A **project branding source** is an existing project-owned `DESIGN.md`, `design.md`, or local style/token file.

1. When a project branding source exists, treat it as the single source of truth and apply its tokens directly to generated output.
2. When the user requests website-derived branding, load `agent-browser` and follow the Agent Browser convention. Use `references/onboarding.md` for semantic-role mapping, contrast checks, exact-font checks, and the brand fidelity receipt; `agent-browser` owns website inspection.
3. Apply one-off branding directly to the requested output. Persist approved branding only when the user requests reusable branding, and write it to a project branding source whose path the user has provided or confirmed.
4. When creating or structurally updating `DESIGN.md` or `design.md`, load `creating-client-design-systems`; that skill owns the contract structure and validation.
5. When no project branding source exists and no branding was requested, apply the packaged defaults directly to the output. This completes the first-run branding gate without user confirmation.

### Browser inspection and PNG export

For website branding, rendered-output inspection, and PNG export, load `agent-browser` before the first browser action and follow the Agent Browser convention. Use its dedicated headed Chrome instance and persistent local profile. This workflow replaces the Playwright detection, Playwright rasterization, separate Chromium installation, and stale fetch commands in the generated references.

For PNG export:

1. Open the generated HTML by absolute `file:` URI. Add `?motion=static` for motion-enabled output.
2. Set the selected viewport and device scale with `agent-browser set viewport <width> <height> <scale>`. Use scale `2` unless the user or output preset specifies another scale.
3. Wait for the first SVG, loaded fonts, and the static motion frame:

   ```bash
   agent-browser wait --fn "document.fonts.status === 'loaded' && document.querySelector('svg') && (!document.querySelector('[data-motion-root]') || document.querySelector('[data-motion-root]').dataset.frame === 'static')"
   ```

4. Size the first SVG to its `viewBox` dimensions in browser runtime, then capture that element:

   ```bash
   agent-browser eval "const s=document.querySelector('svg'),v=s.viewBox.baseVal;s.style.width=v.width+'px';s.style.height=v.height+'px';s.style.minWidth='0';true"
   agent-browser screenshot "svg" "<output.png>"
   ```

The SVG's own background determines the PNG background. PNG export is complete when the file exists at the requested path and its pixel dimensions equal the rendered SVG dimensions multiplied by the selected scale.

### Installed-output validation

After the upstream §9 taste gate:

1. Resolve the directory containing this loaded skill and run:

   ```bash
   python3 <diagram-design-skill-dir>/scripts/self_check.py <output.html>
   ```

2. Treat exit status 0 as the installed validator's completion criterion. References to `scripts/verify-geometry.py`, `scripts/verify-motion.py`, the skin linter, or other repository-root checks apply only to upstream maintenance and are unavailable in this installation.
3. Inspect the rendered output through `agent-browser` at the requested viewport. Complete inspection when fonts are loaded, the requested static or motion state is active, the first SVG is present, and no content is visibly clipped.

Upstream source: [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design), licensed under [MIT](https://github.com/cathrynlavery/diagram-design/blob/main/LICENSE), with [third-party notices](https://github.com/cathrynlavery/diagram-design/blob/main/THIRD_PARTY_LICENSES.md).
