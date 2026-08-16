# Amp plugin conventions

- For Amp plugin work, treat `docs/tools/*.md` as the source of truth over `plugins/*.ts`
- Every plugin code change must originate from a docs change first: update the relevant capability document and metadata, then make the plugin implementation match it
- If plugin docs and code disagree, do not silently follow the code; update the docs first, or ask for confirmation when changing the documented contract would be material
- Keep new capability docs aligned with `docs/tools/_schema.md` before changing or adding plugin code
