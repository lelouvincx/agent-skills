# Project rules

- Whenever opening a new PR, use bot token

## Amp artifacts

Treat `~/.config/amp` as the runtime projection, but the long-term source of truth is here.

When changing a plugin capability:

1. Update `amp/docs/tools/*.md` first.
2. Update `amp/plugins/*.ts` to match the documented contract.
3. Run `./sync-skills.sh` to project the change into `~/.config/amp`.

## Skills

- Local: create `skills/my-skill/SKILL.md` with YAML frontmatter, then run `./sync-skills.sh`.
- Remote: add the skill to `remote-skills.yaml`, optionally add `skills/my-skill/PERSONAL.md`, add generated files to `.gitignore`, then run `./sync-skills.sh --remote`.

Remote entry template:

```yaml
skills:
  - name: my-remote-skill
    url: https://raw.githubusercontent.com/user/repo/main/skills/my-skill/SKILL.md
    enabled: true
    files: # optional companion files
      - references/commands.md
```

Generated remote files usually need `.gitignore` entries:

```gitignore
skills/my-remote-skill/SKILL.md
skills/my-remote-skill/.remote-source
skills/my-remote-skill/references/
```

To remove a skill:

- Local: delete `skills/my-skill/`.
- Remote: remove it from `remote-skills.yaml`, delete its directory, and remove related `.gitignore` entries.

```bash
rm -rf skills/my-remote-skill
./sync-skills.sh --remote   # cleans up stale entries
```
