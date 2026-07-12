# Skill instructions

## Local skills

- Create `skills/<name>/SKILL.md` with YAML frontmatter, then run `./sync-skills.sh`.
- To remove a local skill, delete its directory and sync again.

## Remote skills

- Configure remote skills in the root `remote-skills.yaml`; put intentional local customization in `PERSONAL.md`.
- Treat fetched `SKILL.md`, `.remote-source`, companion directories, and shared references as generated payloads. Add them to `.gitignore` and do not commit them.
- Run `./sync-skills.sh --remote` after adding, changing, or removing a remote skill.
- To remove one, delete its registry entry and directory and remove its `.gitignore` entries before syncing.
