---
description: Turns the current technical topic into concise diagrams, code-shape sketches, and focused HTML artifacts. Use when the user says "show me", "|show-me", or "show-me"; asks to visualize code, architecture, control flow, state, or a diff; or says prose is too much.
---

## Local guidance

Apply this guidance before conflicting upstream instructions.

- When the visual describes existing code, inspect the relevant source first. Keep paths, symbols, types, and relationships exact.
- Use a `diagram` fence with square-corner box drawing when connections carry the meaning. Use Mermaid only when the user explicitly asks for Mermaid.
- For a polished standalone HTML, SVG, or PNG artifact, load `diagram-design`, pass it the verified symbols and relationships, and save the result under `.amp/in/artifacts/` unless the user requests another location.
- Lead with the conclusion in one sentence. Follow the visual with at most 3 short implications, decisions, or unknowns when they materially help.

The answer is complete when the reader can identify the important shape and every element in the visual helps answer the current question.
