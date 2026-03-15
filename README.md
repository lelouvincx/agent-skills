# agent-skills

Reusable Claude Code and [Amp](https://ampcode.com) skills from @lelouvincx.

## Skills

| Skill | Type | Description |
| ----- | ---- | ----------- |
| [slackcli](skills/slackcli/SKILL.md) | Local | Interact with Slack workspaces via the `slackcli` CLI |
| [sql-formatter](skills/sql-formatter/SKILL.md) | Local | Enforce internal SQL style guide |
| [holistics-query](skills/holistics-query/SKILL.md) | Local | Query Holistics datasets via Semantic API (AMQL) |
| [bigquery-query](skills/bigquery-query/SKILL.md) | Local | Query Google BigQuery datasets using the bq CLI |
| [notion](skills/notion/SKILL.md) | Remote | Manage Notion pages, databases, and comments |
| [linear](skills/linear/SKILL.md) | Remote | Manage Linear issues from the command line |

## Setup

```bash
git clone <repo-url>
cd agent-skills
./sync-skills.sh --remote   # fetch remote skills
./sync-skills.sh             # symlink skills + CLI scripts
```

## Adding Skills

**Local:** Create `skills/my-skill/SKILL.md` with YAML frontmatter, then run `./sync-skills.sh`.

**Remote:** Add to `remote-skills.yaml`:

```yaml
skills:
  - name: my-remote-skill
    url: https://raw.githubusercontent.com/user/repo/main/skills/my-skill/SKILL.md
    enabled: true
    files:                        # optional companion files
      - references/commands.md
```

Optionally add personal context in `skills/my-remote-skill/PERSONAL.md` — it gets prepended to the fetched SKILL.md. Run `./sync-skills.sh --remote` to sync.
