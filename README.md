# agent-skills

Reusable Claude Code and [Amp](https://ampcode.com) skills from @lelouvincx.

## Skills

| Skill                                              | Type   | Description                                           |
| -------------------------------------------------- | ------ | ----------------------------------------------------- |
| [slackcli](skills/slackcli/SKILL.md)               | Local  | Interact with Slack workspaces via the `slackcli` CLI |
| [bigquery-query](skills/bigquery-query/SKILL.md)   | Local  | Query Google BigQuery datasets using the bq CLI       |
| [notion](skills/notion/SKILL.md)                   | Remote | Manage Notion pages, databases, and comments          |
| [modern-web-guidance](skills/modern-web-guidance/SKILL.md) | Remote | Search tool for modern web development best practices |
| [linear-cli](skills/linear/SKILL.md)               | Remote | Manage Linear issues from the command line            |
| [shadcn](skills/shadcn/SKILL.md)                   | Remote | Manage shadcn/ui components — adding, styling, composing UI |
| [playwright-skill](skills/playwright-skill/SKILL.md) | Remote | Browser automation for web projects using playwright-cli |
| [grill-with-docs](skills/grill-with-docs/SKILL.md) | Remote | Stress-test plans against project language and documented decisions |
| [grill-me](skills/grill-me/SKILL.md) | Remote | Stress-test plans through relentless one-question-at-a-time grilling |
| [remotion](skills/remotion/SKILL.md) | Remote | Best practices for Remotion - Video creation in React |

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

- Add `.gitignore` entries for the generated files (SKILL.md, `.remote-source`, and any companion file directories):
  ```gitignore
  skills/my-remote-skill/SKILL.md
  skills/my-remote-skill/.remote-source
  skills/my-remote-skill/references/
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
