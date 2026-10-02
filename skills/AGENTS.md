# Skill maintenance instructions

## Local skills

- Create `skills/<name>/SKILL.md` with YAML frontmatter, then run `./sync-skills.sh` from the repository root.
- To remove a local skill, delete its directory and sync again.

## Remote skills

- `remote-skills.yaml` is the source of truth for fetched skill sources and companion-file manifests.
- `PERSONAL.md` is the intentional local overlay for a remote skill.
- Treat fetched `SKILL.md`, `.remote-source`, companion files and directories, and sync scratch outputs as generated. Do not edit or commit them.
- When a remote skill has companion files and its repository is on GitHub, prefer `archive` with `archive_path` over a `files` list. Archives follow upstream renames; a stale `files` entry fails `./sync-skills.sh --remote` and blocks Orb setup.
- To add or update a remote skill, change `remote-skills.yaml`, add or update the intentional `PERSONAL.md` overlay when needed, update generated-file ignores, then run `./sync-skills.sh --remote`.
- Commit only the registry change and intentional overlay. Do not commit fetched payloads.
- To remove a remote skill, remove its registry entry, directory, and generated-file ignore entries, then run `./sync-skills.sh --remote`.
