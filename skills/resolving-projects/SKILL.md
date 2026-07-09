---
name: resolving-projects
description: "Resolves Chinh's spoken project names to local paths and GitHub repositories. Use when a task mentions projects like logseq, agent-skills, dotfiles, nvim, data, demo4, dbt, or prefect."
---

# Resolving Projects

Use the shared project registry before guessing local paths or GitHub remotes.

1. Prefer `project-resolve <spoken-name> --json`; `sync-skills.sh` exposes it from `~/.local/bin` so it works outside the `agent-skills` checkout.
2. Use `projects.yaml` as the source of truth.
3. Treat `PROJECTS.md` as a generated human-readable view, not canonical data.
4. Respect `AGENTS_REGISTRY_ENV` when set; otherwise let the resolver auto-detect the environment.
5. Respect `AGENTS_REGISTRY_WORKSPACE_ROOT` when a host uses a different workspace root than the registry default.

Examples:

```bash
project-resolve "log this to logseq" --path
project-resolve data --github
project-resolve prefect --json
```
