---
name: showing-code
description: Turns the current technical topic into compact code-shape visuals. Use when the user says "show me", asks to visualize code, architecture, control flow, state, or a diff, or says prose is too much.
---

# Showing code

Make the current topic scannable. Use the smallest visual that exposes the important ownership, order, state, or change.

When the visual describes existing code, inspect the relevant source first. Keep paths, symbols, types, and relationships exact.

## Choose the shape

| Question | Shape |
| --- | --- |
| Where does this live? | Shallow file tree with one responsibility per entry |
| What renders or owns state? | Component tree with only relevant hooks and boundaries |
| What calls what? | Call tree |
| Who interacts, and in what order? | Sequence diagram |
| How does state change? | State-transition diagram |
| How does the logic work? | Pseudocode |
| What contract are we designing? | Types and signatures |
| What changes? | Shape-preserving `diff` |

Pick one primary shape. Add a second only when it answers a different necessary question.

## Render it

- Use a `diagram` fence with square-corner box drawing when connections carry the meaning.
- Use plain code fences for file trees, component trees, call trees, pseudocode, and signatures.
- Use a `diff` fence when unchanged context helps the reader understand the change.
- Use Mermaid only when the user explicitly asks for Mermaid.
- Keep only the nodes, calls, files, props, states, and boundaries needed for the current point.
- Prefer real labels over generic placeholders. Annotate unfamiliar entries inline instead of adding a separate legend.

For example, show a runtime path as:

```text
submitReport
  validateInput
  saveDraft
  queueExport
    renderPdf
    storeArtifact
```

Show a proposed change while preserving its existing shape:

```diff
 submitReport
   validateInput
+  enforceQuota
   saveDraft
   queueExport
+    emitUsageEvent
```

## Answer around the visual

Lead with the conclusion in one sentence. Place the visual immediately beside the text it supports. Follow with at most 3 short implications, decisions, or unknowns when they materially help.

For a polished standalone HTML, SVG, or PNG artifact, load `diagram-design` instead of expanding this skill into a design workflow.

The answer is complete when the reader can identify the important shape and the visual contains no element that does not help answer the current question.
