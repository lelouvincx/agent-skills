# Skill instructions

## Local skills

- Create `skills/<name>/SKILL.md` with YAML frontmatter, then run `./sync-skills.sh`.
- To remove a local skill, delete its directory and sync again.

## Remote skills

- `PERSONAL.md` is the intentional local overlay for a remote skill.
- When upgrading a remote skill, strip model-invocation controls such as `disable-model-invocation` from the fetched base during generation because Amp cannot load user-invoked-only skills by default.
- Treat fetched files and companion directories as generated; do not edit them in place.
