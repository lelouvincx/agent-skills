# agent-skills

Reusable Claude Code and [Amp](https://ampcode.com) skills from @lelouvincx.

## Skills

| Skill                                          | Description                                           |
| ---------------------------------------------- | ----------------------------------------------------- |
| [slackcli](skills/slackcli/SKILL.md)           | Interact with Slack workspaces via the `slackcli` CLI |
| [sql-formatter](skills/sql-formatter/SKILL.md) | Enforce internal SQL style guide                      |
| [holistics-query](skills/holistics-query/SKILL.md) | Query Holistics datasets via Semantic API (AMQL)  |
| [bigquery-query](skills/bigquery-query/SKILL.md) | Query Google BigQuery datasets using the bq CLI   |

## CLI Scripts

Standalone query tools in `bin/`, symlinked to `~/.local/bin` by `sync-skills.sh`:

| Script | Description |
| ------ | ----------- |
| [redshift-query.sh](bin/redshift-query.sh) | Redshift Data API query wrapper |
| [bigquery-query.sh](skills/bigquery-query/scripts/bigquery-query.sh) | BigQuery bq CLI query wrapper |

## Setup

```bash
git clone <repo-url>
cd agent-skills
./sync-skills.sh
```

This symlinks skills into `~/.config/agents/skills/` and CLI scripts into `~/.local/bin/`.

## Adding a new skill

1. Create a directory under `skills/`:
   ```
   skills/my-skill/
   └── SKILL.md
   ```
2. Write the `SKILL.md` with YAML frontmatter (`name`, `description`) and markdown instructions.
3. Run `./sync-skills.sh` to register it.
