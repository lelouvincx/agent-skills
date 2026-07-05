# RFC documentation rules

- Treat `_rfc_schema.md` as the single source of truth for RFC frontmatter, required headings, and the new-RFC template.
- Keep every `rfc-*.md` document aligned with `_rfc_schema.md` before changing RFC content.
- New RFCs must use `doc_schema: "amp-rfc/v1"`, a unique `code`, a stable `slug`, and `file` matching the filename.
- Keep `amp_thread_id` as a dictionary keyed by Amp thread ID, with each value describing that thread's intent or contribution.
- Use optional `inputs` and `outputs` list fields when the RFC defines a tool, command, event, dataset, script, API, or workflow boundary.
- Keep relationship paths such as `dependency[].path` relative to this directory when linking RFCs or supporting files.
- Do not recreate separate `_rfc_template.md` or `rfc_schema.md` files; update `_rfc_schema.md` instead.
