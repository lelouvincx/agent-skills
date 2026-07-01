---
name: resolving-projects
description: "Resolves Chinh's spoken project names to local paths and GitHub repositories. Use when a task mentions projects like logseq, agent-skills, dotfiles, nvim, data, demo4, dbt, or prefect."
---

# Resolving Projects

Use the shared project registry before guessing local paths or GitHub remotes.

1. Prefer `bin/project-resolve <spoken-name> --json` from the `agent-skills` repo.
2. Use `projects.yaml` as the source of truth.
3. Treat `PROJECTS.md` as a generated human-readable view, not canonical data.
4. Respect `AGENTS_REGISTRY_ENV` when set; otherwise let the resolver auto-detect the environment.
5. Respect `AGENTS_REGISTRY_WORKSPACE_ROOT` when a host uses a different workspace root than the registry default.

Examples:

```bash
bin/project-resolve "log this to logseq" --path
bin/project-resolve data --github
bin/project-resolve prefect --json
```
