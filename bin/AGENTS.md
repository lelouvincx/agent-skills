# Project resolver instructions

- Keep `project-resolve` aligned with the root `projects.yaml` schema and the generated `PROJECTS.md` documentation.
- The resolver must remain usable by humans, agents, and scripts.
- Respect explicit `AGENTS_REGISTRY_ENV` and `AGENTS_REGISTRY_WORKSPACE_ROOT` values; only auto-detect when they are absent.
