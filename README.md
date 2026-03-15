# agent-skills

Reusable Claude Code and [Amp](https://ampcode.com) skills from @lelouvincx.

## Skills

| Skill                                          | Type   | Description                                           |
| ---------------------------------------------- | ------ | ----------------------------------------------------- |
| [slackcli](skills/slackcli/SKILL.md)           | Local  | Interact with Slack workspaces via the `slackcli` CLI |
| [sql-formatter](skills/sql-formatter/SKILL.md) | Local  | Enforce internal SQL style guide                      |
| [holistics-query](skills/holistics-query/SKILL.md) | Local  | Query Holistics datasets via Semantic API (AMQL)  |
| [bigquery-query](skills/bigquery-query/SKILL.md) | Local  | Query Google BigQuery datasets using the bq CLI   |
| [notion](skills/notion/SKILL.md)*              | Remote | Manage Notion pages, databases, and comments          |

\* *Remote skills are synced from external sources and merged with personal context*

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

# Sync remote skills (fetches from external sources)
./sync-skills.sh --remote

# Sync local symlinks (run after adding/updating skills)
./sync-skills.sh
```

This process:
1. `--remote` flag: Fetches remote skills from configured URLs and merges with personal context
2. Default: Symlinks skills into `~/.config/agents/skills/` and CLI scripts into `~/.local/bin/`

## Adding a Local Skill

1. Create a directory under `skills/`:
   ```
   skills/my-skill/
   └── SKILL.md
   ```
2. Write the `SKILL.md` with YAML frontmatter (`name`, `description`) and markdown instructions.
3. Run `./sync-skills.sh` to register it.

## Adding a Remote Skill

Remote skills are fetched from external sources and merged with your personal context.

1. Add the skill to `remote-skills.yaml`:
   ```yaml
   skills:
     - name: my-remote-skill
       url: https://raw.githubusercontent.com/user/repo/main/skills/my-skill/SKILL.md
       enabled: true
   ```

2. (Optional) Create personal context for the skill:
   ```bash
   mkdir -p skills/my-remote-skill
   cat > skills/my-remote-skill/PERSONAL.md << 'EOF'
   # Personal Context for My Remote Skill
   
   ## My Preferences
   - Custom settings here
   - Workflow preferences
   EOF
   ```

3. Sync remote skills:
   ```bash
   ./sync-skills.sh --remote
   ```

The script will:
- Fetch the remote `SKILL.md` from the URL
- Prepend your `PERSONAL.md` content (if it exists)
- Generate the final `SKILL.md` in `skills/my-remote-skill/`
- Store metadata in `.remote-source` for change tracking

**Note**: Generated `SKILL.md` files for remote skills are gitignored. Only `PERSONAL.md` and the configuration are version-controlled.

## Syncing Remote Skills

Remote skills are only fetched when using the `--remote` flag:

```bash
# Fetch/update remote skills
./sync-skills.sh --remote

# Normal sync (links skills, doesn't fetch remote)
./sync-skills.sh
```

Remote skills are cached and only re-downloaded when the upstream content changes.
