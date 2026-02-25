# agent-skills

Reusable Claude Code and [Amp](https://ampcode.com) skills from @lelouvincx.

## Skills

| Skill                                          | Description                                           |
| ---------------------------------------------- | ----------------------------------------------------- |
| [slackcli](skills/slackcli/SKILL.md)           | Interact with Slack workspaces via the `slackcli` CLI |
| [sql-formatter](skills/sql-formatter/SKILL.md) | Enforce internal SQL style guide                      |
| [holistics-query](skills/holistics-query/SKILL.md) | Query Holistics datasets via Semantic API (AMQL)  |

## Setup

```bash
git clone <repo-url>
cd agent-skills
./sync-skills.sh
```

This symlinks each skill into `~/.config/agents/` so Amp discovers them automatically.

## Adding a new skill

1. Create a directory under `skills/`:
   ```
   skills/my-skill/
   └── SKILL.md
   ```
2. Write the `SKILL.md` with YAML frontmatter (`name`, `description`) and markdown instructions.
3. Run `./sync-skills.sh` to register it.
