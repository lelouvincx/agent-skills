---
description: Builds detailed interactive isometric SVG figures that explain technical ideas as working physical objects, with optional WebGL effects, 3D motion, and printable sheets. Use when asked for Anatomy, an isometric illustration, or a mechanical-object explainer. Use creating-views or diagram-design for ordinary charts, flowcharts, and architecture diagrams.
---

## Local workflow

Apply this section before conflicting upstream instructions.

- Build from a workspace copy of the kit, required scripts, and closest example. Preserve relative paths; the installed skill stays read-only.
- Save figures and exports under `.amp/in/artifacts/` unless the user specifies another location. Follow global artifact conventions for screenshots and directory metadata.
- For browser verification, load `agent-browser` and follow its convention instead of the upstream Chrome launchers. Keep the upstream geometry audits.
- When the user requests community publishing, prepare gallery output with `--no-session` to exclude conversation logs. Use the repository's approved publisher for GitHub writes instead of `publish.mjs --submit`.

Upstream: [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy), licensed under MIT. The pinned archive preserves the complete skill directory, including its kit, scripts, references, examples, and license.
