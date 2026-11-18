---
version: alpha
name: Colorfigures
description: Hand-inked, flat-coloured interactive objects on warm paper, with working mechanisms and see-through views.
colors:
  surface: "#f2efe7"
  text: "#231e16"
  muted: "#857d6e"
  rule: "#ddd6c8"
  shadow: "#41538f"
  label: "#fff4d6"
  notice: "#fff1bf"
  key-surface: "#fbf7ea"
  status-ready: "#43c25c"
  status-stop: "#e2483d"
  screen: "#1d2a26"
  screen-text: "#8af0ae"
  glass: "#cfe9f0"
  primary: "#f4b829"
  body-mustard-mid: "#d49c1f"
  body-mustard-dark: "#4e4a18"
  body-tomato-light: "#ef6a4c"
  body-tomato-mid: "#cf5038"
  body-tomato-dark: "#4a2219"
  body-mint-light: "#93d3b0"
  body-mint-mid: "#71b693"
  body-mint-dark: "#1f4034"
  body-cobalt-light: "#76a0e2"
  body-cobalt-mid: "#5a82c6"
  body-cobalt-dark: "#1c2948"
  body-blush-light: "#f3a6bb"
  body-blush-mid: "#d8869c"
  body-blush-dark: "#4b2430"
  metal-light: "#eef0f0"
  metal-mid: "#c6ccce"
  metal-dark: "#8f989b"
  clear-light: "#e4f2f4"
  clear-mid: "#c4dfe4"
  clear-dark: "#97b9c0"
  ceramic-light: "#fbfaf3"
  ceramic-mid: "#e3e0d2"
  ceramic-dark: "#bdb8a6"
  dark-light: "#55504a"
  dark-mid: "#3d3935"
  dark-dark: "#272421"
  board-light: "#e6e1d4"
  board-mid: "#cfc8b8"
  board-dark: "#aaa293"
  wood-light: "#d9a86c"
  wood-mid: "#bf8a4f"
  wood-dark: "#8e6236"
typography:
  body:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  heading:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.02em
  control-label:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.08em
  choice:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 11.5px
    fontWeight: 700
    lineHeight: 1.4
  stat:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 34px
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -0.01em
  notice:
    fontFamily: ui-monospace, Menlo, monospace
    fontSize: 12.5px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 0.01em
  mobile-legend:
    fontFamily: ui-monospace, Menlo, monospace
    fontSize: 10.5px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: 0.03em
rounded:
  sm: 7px
  md: 8px
  lg: 12px
  keypad: 14px
  full: 999px
spacing:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 24px
  3xl: 32px
  content-max: 760px
  mobile-breakpoint: 560px
components:
  action:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
    padding: 5px 14px
    typography: "{typography.body}"
  selected-action:
    backgroundColor: "{colors.text}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
  choice:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    typography: "{typography.choice}"
  choice-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  part-label:
    backgroundColor: "{colors.label}"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
  notice:
    backgroundColor: "{colors.notice}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 7px 13px 7px 9px
    typography: "{typography.notice}"
  directional-key:
    backgroundColor: "{colors.key-surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
  instrument-screen:
    backgroundColor: "{colors.screen}"
    textColor: "{colors.screen-text}"
---

## Overview

Colorfigures makes everyday objects feel like working illustrations in a printed technical notebook. Warm paper, coloured solids, dark ink and restrained controls keep attention on the object. The viewer learns by turning it, operating it and revealing its mechanism.

This is an extraction of [Colorfigures by April Zhu](https://april-zhu.com/colorfigures), not a new application theme. It covers single-object interactive illustrations, their surrounding controls and their mobile presentation. It does not define dashboards, forms, navigation, data-chart palettes or a dark theme.

Evidence: `assets/core.js` supplies palettes, materials, page CSS, labels, camera and controls; `scripts/build.py` supplies final-page overrides; `SKILL.md` supplies modelling and illustration rules. `assets/examples/toaster.html`, `lamp.html` and `claw.html` demonstrate object, scene and game variants. Values describe the built page where build-time overrides differ from the core. Keep the original `LICENSE` and Colorfigures credit when reusing the implementation.

The YAML tokens are the extracted design values for reuse. These tokens do not configure the existing engine automatically. The renderer remains in `assets/core.js` and `scripts/build.py`; reconcile changes there before changing this contract. Accessibility recommendations below are additions for future implementations, not claims about existing compliance.

## Colors

### Paper, ink and accents

Use `surface` for the warm paper canvas and resting controls. Use `text` for readable copy, outlines and active UI backgrounds. Use `rule` for quiet dividers, `label` for resting part-name pills and `notice` for temporary feedback. `muted` is the upstream secondary-caption colour; it is not a substitute for readable essential text.

Choose one body family per object: mustard, `body-tomato-*`, `body-mint-*`, `body-cobalt-*` or `body-blush-*`. Each has light, mid and dark tones. Mustard uses `primary` as its light tone, with `body-mustard-mid` and `body-mustard-dark`. These are material families, not 15 unrelated accents or a categorical chart palette. The current family's light tone becomes the UI accent for active part labels, hovered choices and pressed directional keys. Mustard is the engine's fallback; an individual figure may choose another family.

Reserve `status-ready` and `status-stop` for physical indicator lights and mechanism state. Use `screen` with `screen-text` for miniature instrument displays. Use `glass` at low opacity with one or two white highlight strokes at approximately 0.38 opacity. Do not turn the whole scene into glossy glass.

### Material families

Use the `metal-*`, `clear-*`, `ceramic-*`, `dark-*`, `board-*` and `wood-*` triplets for secondary parts with those physical materials. `clear-*` is the shaded material family; `glass` is the separate translucent-glazing accent. Keep dark material local to plausible components, rather than making all shadowed surfaces nearly black.

Use `tone(normal, material)` for body shading and `toneI` for interiors and props. The engine blends around three tonal bands; do not replace it with photorealistic continuous lighting. Coloured faces, ink and the blue `shadow` should remain distinguishable.

The Google linter reports unreferenced colours because these SVG material families, status colours and decorative roles are not static HTML component backgrounds. Those orphan-token warnings are intentional: retain the values for illustration reuse rather than inventing interface components just to consume them.

### Contrast and semantic limits

Preserve source colours when reproducing the original. The WCAG sRGB contrast calculation gives `muted` on `surface` 3.54:1 and white on `status-stop` 4.02:1, below the 4.5:1 threshold for normal-size text. For new accessible interfaces, use `text` on `surface` for essential captions, which gives 14.40:1, and use ink rather than white for small red-button text. These recommendations do not alter the bundled renderer. Coloured materials and the pale `rule` are illustration or decorative roles, not automatically valid text or interactive-boundary colours. Use text, shape or pressed state alongside colour to communicate meaning.

## Typography

Use the system monospace stack, with no downloaded display font. The `body` and `heading` styles are deliberately both 13px: weight and spacing, rather than a large title, establish hierarchy. Keep the figure larger than its title.

Use `control-label` for small uppercase utility headings, `choice` for picker options and `stat` for measured values. Stats use tabular numerals. Small stats and mobile stats are 20px, rather than the desktop 34px. The built-page `notice` uses sentence case and the `mobile-legend` uses short uppercase part names.

SVG part labels use 800-weight monospace with 0.04em tracking. Their size scales with the figure's reference frame, not the page's 13px body font. Keep names short and anchor each label to a drawn part. Plain letters and digits are safest for modelled face text; Unicode arrows and zoom symbols already supplied by the interface are separate controls.

## Layout

### Object-first composition

Centre a single stage inside `content-max`, 760px. Header, stage, figure, control strip and credit share this maximum width. The desktop page padding is 24px top, 16px horizontal and 32px bottom. Use the extracted spacing values as recurring intervals, not a claim that every measurement is a multiple of four.

Place two to five process actions in a vertical stack at the upper left, with 8px gaps. Place optional stats and the see-through controls at the upper right. Keep controls clear of the silhouette and labels. Below the stage, use a rule and a responsive control grid with minimum 200px columns, 14px row gaps and 28px column gaps. Avoid enclosing everything in dashboard cards.

Frame the complete object's bounding box, including handles, trays, lifted parts and its board. The built page uses a figure aspect setting of 0.75 on desktop and limits its height to the available viewport when practical. Keep the object and its interactions readable without relying on a large introductory paragraph.

### Mobile at 560px and below

Use 14px top, 12px horizontal and 24px bottom page padding. The built page hides the header, moves actions into wrapping rows and uses a taller figure aspect setting of 1.1. It moves stats into normal flow, uses 12px action text with 4px by 11px padding, and positions view switches below the figure rather than over it.

Replace external text callouts with numbered badges and a two-column `mobile-legend` under the figure. Selecting a legend entry highlights its matching badge. A game's keypad becomes one slim row; directional buttons are 46px by 42px with 9px corners, and its action button becomes a pill. Hide the wobble adjustment and disable the artwork's grain/wobble filter on narrow or coarse-pointer presentations, as the build script does.

## Elevation & Depth

### Physical illustration depth

Use orthographic 3D geometry with a default yaw of 45 degrees and pitch of approximately 35.26 degrees. Shapes must hold up when rotated. Build rounded housings from swept profiles; give wheels, doors and plates thickness, caps and backs. Sort separate parts for the current camera, including bounding boxes. Show face-mounted details only when their face is visible.

Draw a heavy silhouette at approximately 2.8 model units, panel outlines at 2.2, openings at 1.6 to 1.8 and detail strokes at 0.8 to 1.4. The engine rescales strokes against a 585-unit reference viewBox; these are not fixed CSS-pixel border widths. Let the silhouette dominate without making thin physical parts bulky.

Use one short, connected cast shadow in `shadow` blue for each object. It falls toward the lower left of the screen as the view turns. Clip it to a board when applicable. See-through components can cast lighter shadows, but revealing a mechanism should not fade the entire object's grounding shadow. Soft ambient UI shadows are not a replacement for this flat graphic shadow.

### Interface depth and texture

Use ink outlines and hard offset shadows for tactile choices: 2px by 2px on a `choice`, 3px by 3px on a `choice-panel`, and a 3px downward step under a `directional-key`. A hovered choice lifts by 1px. The built-page `notice` is the exception, with its soft 8px-offset, 22px-blur shadow.

UI outlines use `text`: 1.5px on actions, choices and directional keys, 2px around a choice panel and 1.2px around part labels. Notices use a 1px `rgba(35,30,22,0.28)` border and a `0 8px 22px rgba(35,30,22,0.16)` shadow. Borders and shadows stay in prose because Google's current component-token schema does not recognise those properties.

The paper has fine, low-opacity grain. Artwork has stable hand-drawn wobble and grain, rather than noise that changes every frame. The default wobble displacement is 2.4 times the engine's ink scale. Zoom adjusts grain frequency so texture does not grow into large blotches. Keep texture subordinate to legibility.

## Shapes

Use `full` for action pills, selected toggles and part-name tags. Use `md` for choice chips and notices, `lg` for the choice panel and `sm` for desktop directional keys. The desktop keypad container uses `keypad`; the mobile keypad drops that outer container. Body geometry has its own physical proportions and corner radii, independent of this UI radius scale.

Use 26px circular colour swatches with a 2px ink outline offset by 2px when selected. The source action buttons and keypad are intentionally compact. For new interfaces, increase hit areas where needed without changing their visible silhouette; do not claim these extracted dimensions alone meet touch-target requirements.

## Components

### Actions, choices and state

An `action` is a paper-filled ink-outline pill with a verb describing a real step. A `selected-action` reverses ink and paper and exposes pressed state. Action focus uses a 2px ink outline with 3px offset. A choice opens a small hard-shadow `choice-panel`; current options reverse colour, while unavailable options use 0.45 opacity and explain why they are unavailable when activated.

Order actions by the real process. Every action changes a visible physical state: a lever lowers, a coin travels, a door opens or an item drops. Missing prerequisites produce a sensible intermediate step or a short `notice` on the figure. Do not replace a working mechanism with an explanatory caption.

### Illustration, see-through and labels

The default view is the complete closed object. See-through fades covering surfaces to a ghost and draws the actual internal mechanism above them. It is not a permanent cutaway or a flat mechanism diagram placed on the front face. Support every part physically; connect drives, wires and tubes to plausible endpoints.

See-through transitions over 0.7 seconds. Show external callouts after the reveal passes 0.6. A `part-label` uses the resting label colour or the current body accent while its part works. Draw labels last, use noncrossing leaders and move anchors with their parts. Labels and see-through begin off; objects without meaningful internals need no see-through switch.

### Camera, zoom and game controls

Drag to orbit; double-click or use the front-view control to reset. Allow full rotation after all sides have been checked. The build adds zoom from 100% to 500%, with 1.5-times button steps, wheel-modifier zoom and touch pinch/pan. Keep notices and controls usable while zoomed.

Use measured stats only where they explain the object, such as credit or score. An `instrument-screen` belongs on the object rather than becoming a large separate dashboard. Game arrows and the action key drive the same state as keyboard input. A pressed directional key takes the current accent; the round desktop action key uses the stop-red physical-button colour.

Mechanism animations should follow the real causal sequence, usually finishing within about two seconds unless the process needs longer. Notice transitions are 180ms; the stat bump is 350ms; keypad press feedback is 50ms. These are source behaviours, not a universal animation duration scale. For future accessible implementations, add a reduced-motion alternative and verify keyboard operation; neither is guaranteed by extracting the current tokens.

## Do's and Don'ts

- Do keep the physical object, its operating sequence and its materials recognisable.
- Do pair a single body palette with quiet paper, ink and restrained material accents.
- Do keep the closed object, see-through mechanism and labelled view geometrically consistent.
- Do inspect front, rear, elevated, operating and mobile states before delivery.
- Do retain the original licence and Colorfigures credit when reusing the supplied assets.
- Don't flatten the illustration into a one-view picture that breaks when turned.
- Don't substitute glossy gradients, floating glass panels, neon backgrounds or large display typography for the printed-notebook character.
- Don't interpret body colours as chart semantics or assume decorative colours meet interface contrast requirements.
- Don't copy the source's compact typography, targets or motion into a new product without accessibility checks.
