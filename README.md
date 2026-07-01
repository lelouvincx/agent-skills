# agent-skills

Reusable skills, Amp capabilities, and project helpers from @lelouvincx.

Use this repo when you want to:

- install the same skills and Amp plugins on a new machine
- find the source for a skill or Amp capability
- resolve spoken project names such as `logseq` or `dbt` to paths and GitHub repositories

## Get started

```bash
git clone <repo-url>
cd agent-skills
./sync-skills.sh --remote
./sync-skills.sh
```

This copies the runtime files into `~/.config/amp` and fetches remote skills.

## Use the project registry

`projects.yaml` maps short project names to local paths and GitHub repositories.

```bash
bin/project-resolve logseq --path
bin/project-resolve "log this to logseq" --github
bin/project-resolve dbt --json
```

See [PROJECTS.md](PROJECTS.md) for the generated project list.

## Skills

| Skill | Type | Use it to |
| --- | --- | --- |
| [slackcli](skills/slackcli/SKILL.md) | Local | read, send, and manage Slack messages from the CLI |
| [bigquery-query](skills/bigquery-query/SKILL.md) | Local | query Google BigQuery with the `bq` CLI |
| [resolving-projects](skills/resolving-projects/SKILL.md) | Local | resolve spoken project names to paths and GitHub repositories |
| [notion](skills/notion/SKILL.md) | Remote | manage Notion pages, databases, and comments |
| [modern-web-guidance](skills/modern-web-guidance/SKILL.md) | Remote | check current web platform guidance before frontend work |
| [linear-cli](skills/linear-cli/SKILL.md) | Remote | manage Linear issues from the command line |
| [playwright-skill](skills/playwright-skill/SKILL.md) | Remote | automate browser checks with `playwright-cli` |
| [remotion](skills/remotion/SKILL.md) | Remote | create videos with Remotion in React |
| [ponytail](skills/ponytail/SKILL.md) | Remote | choose the simplest code that works |
| [ponytail-review](skills/ponytail-review/SKILL.md) | Remote | review code for over-engineering only |
| [ponytail-help](skills/ponytail-help/SKILL.md) | Remote | show ponytail commands and modes |
| [writing-great-skills](skills/writing-great-skills/SKILL.md) | Remote | write and edit skills well |
| [govuk-style](skills/govuk-style/SKILL.md) | Remote | write clear plain-English prose |
| [impeccable](skills/impeccable/SKILL.md) | Remote | design, review, and improve frontend interfaces |
| [domain-modeling](skills/domain-modeling/SKILL.md) | Remote | define domain terms and decisions |
| [grilling](skills/grilling/SKILL.md) | Remote | stress-test a plan or design through questions |
| [tdd](skills/tdd/SKILL.md) | Remote | work test-first |
| [teach](skills/teach/SKILL.md) | Remote | teach a skill or concept in a workspace |
| [develop-amql](skills/develop-amql/SKILL.md) | Remote | develop Holistics AMQL assets |
| [write-aql](skills/write-aql/SKILL.md) | Remote | write and run Holistics AQL queries |
| [search-docs](skills/search-docs/SKILL.md) | Remote | search Holistics documentation |
| [visualize-data](skills/visualize-data/SKILL.md) | Remote | create charts and tables from data |
| [holistics-migrate-power-bi](skills/holistics-migrate-power-bi/SKILL.md) | Remote | migrate Power BI models and reports to Holistics |

## Amp capabilities

| Capability | Type | Where it appears | Use it to |
| --- | --- | --- | --- |
| [Claude Code subagent](amp/docs/tools/claude-code-subagent.md) | Agent tool | Agent | ask Claude Code for read-only advice |
| [Label skill and plugin usage](amp/docs/tools/label-skill-plugin-usage.md) | Agent tool | Agent | add or correct usage-event labels |
| [Pi Code subagent](amp/docs/tools/pi-code-subagent.md) | Agent tool | Agent | ask Pi Coding Agent for read-only advice |
| [Send to thread](amp/docs/tools/send-to-thread.md) | Agent tool | Agent | send a message to another Amp thread |
| [Spawn worker](amp/docs/tools/spawn-worker.md) | Agent tool | Agent | start a bounded worker thread that reports back |
| [DeepSeek V4 Pro](amp/docs/tools/deepseek-v4-pro.md) | Agent mode | Mode picker | run an experimental DeepSeek-backed agent mode |
| [GLM 5.2](amp/docs/tools/glm-5-2.md) | Agent mode | Mode picker | run an experimental GLM-backed agent mode |
| [Codex usage command](amp/docs/tools/codex-usage.md) | Command | Command palette | show Codex usage limits |
| [Logseq log current task](amp/docs/tools/logseq-log-current-task.md) | Command | Command palette | log the current Amp task into Logseq |
| [Track event](amp/docs/tools/track-event.md) | Command | Command palette | record skill or plugin usage manually |
| [Capture skill and plugin magic words](amp/docs/tools/capture-skill-plugin-magic-words.md) | Event handler | Plugin event pipeline | record usage events from trigger phrases |
| [Holistics MCP error logger](amp/docs/tools/holistics-mcp-errors.md) | Event handler | Plugin event pipeline | log Holistics MCP CLI failures |
| [Holistics Markdown result renderer](amp/docs/tools/holistics-md.md) | Event handler | Plugin event pipeline | turn selected YAML result blocks into Markdown tables |
| [macOS turn end notifier](amp/docs/tools/macos-turn-end-notifier.md) | Event handler | Plugin event pipeline | send a macOS notification when an agent turn ends |
| [RTK rewrite](amp/docs/tools/rtk-rewrite.md) | Event handler | Plugin event pipeline | rewrite eligible shell commands through `rtk rewrite` |

## Development and maintenance flow

```diagram
╭──────────────╮
│ Chinh / user │
╰──────┬───────╯
       │ asks for a skill, capability, or docs update
       ▼
╭──────────────╮      follows repo guidance       ╭───────────╮
│  Agents      │─────────────────────────────────▶│ AGENTS.md │
╰──────┬───────╯                                  ╰───────────╯
       │
       │ edits source-of-truth files in this repo
       ▼
╭──────────────────────────────────────────────────────────────╮
│ agent-skills repo                                            │
│                                                              │
│  skills/*/SKILL.md        reusable agent skills              │
│  remote-skills.yaml       remote skill registry              │
│  amp/docs/tools/*.md      Amp capability contracts           │
│  amp/plugins/*.ts         Amp plugin implementations         │
╰──────┬───────────────────────────────────────────────────────╯
       │ run ./sync-skills.sh or ./sync-skills.sh --remote
       ▼
╭──────────────────────────────────────────────────────────────╮
│ ~/.config/amp runtime projection                             │
│                                                              │
│  AGENTS.md                active personal guidance           │
│  plugins/                 active local Amp plugins           │
│  docs/tools/              active capability docs             │
│  skills/                  active reusable skills             │
╰──────┬───────────────────────────────────────────────────────╯
       │ used by future Amp sessions and subagents
       ▼
╭────────────────────╮
│ Maintained workflow│
╰────────────────────╯
```
