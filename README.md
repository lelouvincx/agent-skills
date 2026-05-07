# agent-skills

Reusable Claude Code and [Amp](https://ampcode.com) skills from @lelouvincx.

## Skills

| Skill                                              | Type   | Description                                           |
| -------------------------------------------------- | ------ | ----------------------------------------------------- |
| [slackcli](skills/slackcli/SKILL.md)               | Local  | Interact with Slack workspaces via the `slackcli` CLI |
| [bigquery-query](skills/bigquery-query/SKILL.md)   | Local  | Query Google BigQuery datasets using the bq CLI       |
| [notion](skills/notion/SKILL.md)                   | Remote | Manage Notion pages, databases, and comments          |
| [linear-cli](skills/linear/SKILL.md)               | Remote | Manage Linear issues from the command line            |
| [shadcn](skills/shadcn/SKILL.md)                   | Remote | Manage shadcn/ui components — adding, styling, composing UI |
| [playwright-skill](skills/playwright-skill/SKILL.md) | Remote | Browser automation for web projects using playwright-cli |

## Setup

```bash
git clone <repo-url>
cd agent-skills
./sync-skills.sh --remote   # fetch remote skills
./sync-skills.sh             # local
```

## Adding Skills

**Local:** Create `skills/my-skill/SKILL.md` with YAML frontmatter, then run `./sync-skills.sh`.

**Remote:** Add to `remote-skills.yaml`:

```yaml
skills:
  - name: my-remote-skill
    url: https://raw.githubusercontent.com/user/repo/main/skills/my-skill/SKILL.md
    enabled: true
    files: # optional companion files
      - references/commands.md
```

- Optionally add personal context in `skills/my-remote-skill/PERSONAL.md`.
- It gets prepended to the fetched SKILL.md.
- Run `./sync-skills.sh --remote` to sync.

## Removing Skills

**Local:** Delete `skills/my-skill/`, remove its row from the skills table above.

**Remote:** Remove the entry from `remote-skills.yaml` and delete the skill directory:
```bash
rm -rf skills/my-remote-skill
./sync-skills.sh --remote   # cleans up stale entries
```

If the skill was gitignored (check `.gitignore`), remove those lines too. Remove its row from the skills table above.
