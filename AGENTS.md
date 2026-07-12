# Repository instructions

## Maintenance

- Use conventional branches and conventional commits.
- Open pull requests with the bot token. After opening one, add a separate commit that adds the PR number to the changelog entry.
- Treat this repository as the source of truth; `~/.config/amp` is a runtime projection and must not be edited in place.
- After changing projected artifacts, run `./sync-skills.sh`. Use `./sync-skills.sh --remote` when remote skill payloads must be fetched.
- Test projection safely with `AMP_CONFIG_DIR=/tmp/amp-config ./sync-skills.sh`.

## Root-owned files

- `projects.yaml` is the project-registry source of truth; regenerate `PROJECTS.md` with `project-resolve --generate-md > PROJECTS.md`.
- Use `project-resolve <spoken-name> --json` rather than guessing project paths or repositories.
- When curating `projects.yaml`, inspect `zoxide query --list --score`; keep durable, specific project roots and omit generated directories or generic workspace parents.
- Respect `AGENTS_REGISTRY_ENV` and `AGENTS_REGISTRY_WORKSPACE_ROOT` when resolving projects.
- Before changing the project-registry schema or resolver behavior, read `bin/AGENTS.md`.
- `remote-skills.yaml` declares remote skills. Commit registry entries and intentional overlays, not fetched payloads under `skills/`.
- Before changing `remote-skills.yaml` or its generated payload ignores, read `skills/AGENTS.md`.

Other directory-specific instructions are loaded on demand from nested `AGENTS.md` files.
