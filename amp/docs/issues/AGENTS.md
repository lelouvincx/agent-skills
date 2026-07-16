# Amp issue documentation rules

- Treat `_schema.md` as the source of truth for issue frontmatter, required headings, and the issue template.
- Use `doc_schema: "amp-issue/v1"`, the next unique `ISSUE-0000` code, and a matching `issue-0000-<slug>.md` filename.
- Preserve original intent and incident evidence. Update resolution status without rewriting history as if the resolved behavior existed at the time.
- Link every issue from `README.md` and link affected capability docs back to the issue when it explains their contract.
