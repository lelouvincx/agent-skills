---
name: designing-with-painter
description: Runs screenshot-grounded Painter design exploration, selected-concept refinement, and asset handoff. Use for new UI design, open-ended redesign, visual alternatives, rejected designs, or continuing a chosen Painter concept. Precise edits to an already settled design go directly to implementation unless visual exploration is requested.
compatibility: Requires Painter for generation and a media inspection tool; browser access is needed for live baselines and implementation verification.
---

# Designing with Painter

Own the design process so the user supplies intent and judgment, not tool-by-tool instructions. Carry the work from evidence through concepts, feedback, and a reviewed reference. Implement only within the user's authorization.

## 1. Ground the brief

Read the project's product and design guidance, then inspect the affected flow and related components. Use the available design skill for visual standards and browser guidance for capture; this skill owns orchestration, not their implementation rules.

Build a compact working brief from evidence:

- user, task, affected surfaces, roles, and target devices
- supported data and behavior, plus explicitly requested changes
- existing patterns to reuse and visual features to preserve
- unresolved taste or product choices
- authority to explore, implement, or ship

Resolve facts yourself. Ask only about choices that depend on the user's preferences, unresolved product requirements, or missing authorization. Follow the host's decision-question policy. Screenshots, prompt preparation, applicable state coverage, and corrections to clear defects are agent work, not separate approval gates.

Complete the brief when each proposed control or metric has a product source or is explicitly marked as a proposal. An attractive concept does not authorize new behavior.

## 2. Capture and inspect the baseline

For an existing product, open the real affected surface in the appropriate role and state. Inspect the screenshot before using it. Capture related pages when consistency or component reuse matters. Prefer local seeded or fictional data; exclude credentials and unnecessary personal information from references.

Reuse an earlier capture only after checking its route, role, state, and freshness. Label historical replays and substitute fixtures. If the app cannot run, use verified repository screenshots or supplied references and disclose the limitation. For a new surface, use the project's existing visual language; do not fabricate a current-screen baseline.

Crop to the area being designed while retaining enough context to judge placement and density. Choose states by risk: paired roles or pages, mobile layout, empty content, long labels, and open menus or dialogs where they affect the task. The user need not enumerate these.

Complete this step with inspected references and a clear statement of what each contributes: product context, style, layout, or the image to edit.

## 3. Explore or continue the selected direction

Check that Painter is available before promising generated concepts. If it is unavailable, report the blocker and retain the brief and references; do not present an unexecuted prompt as a generated design.

When the direction is open, use 2 or 3 meaningfully different layouts or interaction models unless the user requests another count. For a small component, use one labelled comparison image; use separate images when a comparison would make details unreadable.

When a direction is already chosen, refine it. Attach the selected output using its exact returned URL or saved file. Painter does not inherit this conversation: describe the required delta and what must remain unchanged. For combinations, identify what to take from each reference.

Write the prompt from the brief, including:

- goal, role, viewport, and states to show
- reference images and their individual purposes
- required content and supported interactions
- preservation constraints and excluded scope
- composition and legibility requirements

Check the prompt against the request before sending it. Preserve distinctions such as adding a control versus replacing one. Keep rejected directions excluded. Trace extra controls back to the brief and prompt before attributing them to Painter.

Maintain a small design record in the conversation: selected image, parent references, current requirements, rejected directions, user feedback, and unresolved defects. For a saved handoff, include that record alongside the reference. Update it after every selection or correction.

## 4. Review and refine in bounded passes

Inspect every generated candidate before recommending it. Compare it with the brief for product truth, required controls, consistency, readable content, state completeness, and actual composition. A label saying "mobile" is not evidence of a mobile layout. Check reviewer findings against the brief too; automated critique can flag required behavior as a defect.

Batch clear defects into one focused correction using the same reference lineage, then inspect the new output. Avoid open-ended polishing: after this correction pass, present remaining limitations or a concrete tradeoff rather than silently generating more rounds. New user feedback starts another bounded pass.

Recommend a direction with brief tradeoffs. Pause for unresolved taste or product decisions, not for permission to perform routine refinement. After selection, cover missing task-critical states without reopening the choice. Existing authorization to implement remains valid; design-only requests stop at the reviewed references.

Complete this step when requirements are visibly represented or their deviations are explicitly reported. Generated images remain design references: they cannot establish working interactions, exact touch targets, responsive behavior, or accessibility compliance.

## 5. Prepare assets when the design needs them

If the chosen concept contains a needed illustration or logo, generate that asset separately using the selected concept as reference. Preserve its visual identity rather than cropping a whole UI screenshot into production.

For an isolated asset, set the generation tool's transparent-background option explicitly. Check the alpha channel and inspect composites over light and dark surfaces. Trim, pad, and optimize with available image tooling; record actual dimensions rather than assuming the requested size was returned. For icons, inspect real downscaled outputs and follow the platform's safe-area requirements. Keep interface text in code rather than baked into artwork.

Complete this branch with inspected, usable assets and their source-reference lineage. Skip it when the design needs no generated asset.

## 6. Handoff, implement, and verify within scope

Provide the chosen reference, accumulated requirements, exact asset paths, and known image deviations. This text controls behavior where Painter omitted or invented details. If delegating authorized implementation, give workers the same handoff and clear file ownership.

Reuse the project's components and tokens. Render the implementation and exercise the affected task, including relevant non-default states. Follow the project's viewport, theme, accessibility, and test requirements. Compare real captures with the chosen reference and inspect them; generated mockups are not verification evidence.

For design-only work, present inspected concepts and the remaining decision. For implementation work, report executed checks, a representative inspected capture, limitations, and actual delivery state. Shipping permission comes from the user and repository policy, not from selecting an image.
