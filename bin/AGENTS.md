# CLI instructions

## Project resolver

- Keep `project-resolve` aligned with the root `projects.yaml` schema and the generated `PROJECTS.md` documentation.
- Preserve its human-readable selectors (`--path`, `--github`, `--https`, and `--ssh`), machine-readable `--json` output, and non-zero exit codes for errors.

## SmartClass Wrangler

- Use `smartclass-wrangler-dev` when local SmartClass Wrangler needs the `smartclass-deepseek` secret bundle.
- Start it with `agent-secrets run --bundle smartclass-deepseek -- /Users/lelouvincx/.local/bin/smartclass-wrangler-dev dev`.
- Keep the wrapper limited to its fixed local `wrangler dev --local` command and non-secret presence probe. Do not add argument forwarding.
