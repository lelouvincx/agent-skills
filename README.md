# agent-skills

Reusable Claude Code and [Amp](https://ampcode.com) skills from @lelouvincx.

## Skills

| Skill                                                        | Type   | Description                                                                          |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------ |
| [slackcli](skills/slackcli/SKILL.md)                         | Local  | Interact with Slack workspaces via the `slackcli` CLI                                |
| [bigquery-query](skills/bigquery-query/SKILL.md)             | Local  | Query Google BigQuery datasets using the bq CLI                                      |
| [resolving-projects](skills/resolving-projects/SKILL.md)     | Local  | Resolve spoken project names to local paths and GitHub repositories                  |
| [notion](skills/notion/SKILL.md)                             | Remote | Manage Notion pages, databases, and comments                                         |
| [modern-web-guidance](skills/modern-web-guidance/SKILL.md)   | Remote | Search tool for modern web development best practices                                |
| [linear-cli](skills/linear/SKILL.md)                         | Remote | Manage Linear issues from the command line                                           |
| [playwright-skill](skills/playwright-skill/SKILL.md)         | Remote | Browser automation for web projects using playwright-cli                             |
| [remotion](skills/remotion/SKILL.md)                         | Remote | Best practices for Remotion - Video creation in React                                |
| [ponytail](skills/ponytail/SKILL.md)                         | Remote | Lazy senior dev mode — forces simplest/minimal solution (YAGNI, stdlib first)        |
| [ponytail-review](skills/ponytail-review/SKILL.md)           | Remote | Code review hunting only over-engineering — what to delete                           |
| [ponytail-help](skills/ponytail-help/SKILL.md)               | Remote | Quick-reference card for ponytail modes and commands                                 |
| [writing-great-skills](skills/writing-great-skills/SKILL.md) | Remote | Reference for writing and editing skills well                                        |
| [govuk-style](skills/govuk-style/SKILL.md)                   | Remote | GOV.UK-style plain-English writing, adapted for presales and customer Slack messages |
| [impeccable](skills/impeccable/SKILL.md)                     | Remote | Design, audit, and improve frontend interfaces                                       |
| [domain-modeling](skills/domain-modeling/SKILL.md)           | Remote | Build and sharpen a project's domain model                                           |
| [grilling](skills/grilling/SKILL.md)                         | Remote | Interview relentlessly to stress-test a plan or design                               |
| [tdd](skills/tdd/SKILL.md)                                   | Remote | Test-driven development guidance                                                     |
| [teach](skills/teach/SKILL.md)                               | Remote | Teach a new skill or concept in a workspace                                          |
| [develop-amql](skills/develop-amql/SKILL.md)                 | Remote | Develop Holistics AMQL models, datasets, dashboards, and metrics                     |
| [write-aql](skills/write-aql/SKILL.md)                       | Remote | Write and run Holistics AQL queries                                                  |
| [search-docs](skills/search-docs/SKILL.md)                   | Remote | Search Holistics docs                                                                |
| [visualize-data](skills/visualize-data/SKILL.md)             | Remote | Create Holistics visualizations from queries                                         |
| [holistics-migrate-power-bi](skills/holistics-migrate-power-bi/SKILL.md) | Remote | Migrate Power BI semantic models and reports to Holistics AMQL assets |

## Amp capabilities

| Capability                                                                             | Type          | Surface               | Description                                                                                                                         |
| -------------------------------------------------------------------------------------- | ------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [Claude Code Subagent](amp/docs/tools/claude-code-subagent.md)                         | Agent tool    | Agent                 | Runs Claude Code CLI as a manual, read-only second-opinion subagent that returns structured JSON advice.                            |
| [Label Skill/Plugin Usage](amp/docs/tools/label-skill-plugin-usage.md)                 | Agent tool    | Agent                 | Appends manual labels and superseding label corrections for existing skill/plugin usage events.                                     |
| [Pi Code Subagent](amp/docs/tools/pi-code-subagent.md)                                 | Agent tool    | Agent                 | Runs Pi Coding Agent as a manual, read-only advisor that returns structured JSON advice.                                            |
| [Send to Thread](amp/docs/tools/send-to-thread.md)                                     | Agent tool    | Agent                 | Sends a text user message from the current Amp thread to another existing Amp thread.                                               |
| [Spawn Worker](amp/docs/tools/spawn-worker.md)                                         | Agent tool    | Agent                 | Launches a bounded independent Amp worker thread, instructs it to report back with `send_to_thread`, then archives itself.          |
| [DeepSeek V4 Pro](amp/docs/tools/deepseek-v4-pro.md)                                   | Agent mode    | Mode picker           | Registers an experimental DeepSeek V4 Pro-backed Amp agent mode for implementation work.                                            |
| [GLM 5.2](amp/docs/tools/glm-5-2.md)                                                   | Agent mode    | Mode picker           | Registers an experimental GLM 5.2-backed Amp agent mode for implementation work.                                                    |
| [Codex Usage Command](amp/docs/tools/codex-usage.md)                                   | Command       | Command palette       | Adds a command-palette action that shows current Codex 5-hour and weekly usage limits as an Amp notification.                       |
| [Logseq: Log Current Task](amp/docs/tools/logseq-log-current-task.md)                  | Command       | Command palette       | Manually logs the current Amp thread task into a Logseq graph and renames the Amp thread from the Logseq task title.                |
| [Track Event](amp/docs/tools/track-event.md)                                           | Command       | Command palette       | Explicitly captures the current task as a skill/plugin usage event with optional labels.                                            |
| [Capture Skill/Plugin Magic Words](amp/docs/tools/capture-skill-plugin-magic-words.md) | Event handler | Plugin event pipeline | Automatically records skill/plugin usage events when canonical capture, label, or report prefixes appear in incoming user messages. |
| [Holistics MCP Error Logger](amp/docs/tools/holistics-mcp-errors.md)                   | Event handler | Plugin event pipeline | Logs hard and soft failures from Holistics MCP CLI calls to an append-only JSONL file.                                              |
| [Holistics Markdown Result Renderer](amp/docs/tools/holistics-md.md)                   | Event handler | Plugin event pipeline | Rewrites selected Holistics MCP YAML `result_data` blocks into Markdown tables before the result reaches the model.                 |
| [macOS Turn End Notifier](amp/docs/tools/macos-turn-end-notifier.md)                   | Event handler | Plugin event pipeline | Sends a native macOS notification whenever an agent turn ends.                                                                      |
| [RTK Rewrite](amp/docs/tools/rtk-rewrite.md)                                           | Event handler | Plugin event pipeline | Intercepts Bash tool calls and rewrites eligible commands through `rtk rewrite` before execution.                                   |

## Project registry

`projects.yaml` maps spoken project names to GitHub repositories and environment-relative local paths. Use `bin/project-resolve` as the executable interface for humans, agents, and scripts:

```bash
# prerequisite: uv and uvx on PATH; pyyaml/rapidfuzz are provided by uvx
command -v uv >/dev/null && command -v uvx >/dev/null

bin/project-resolve logseq --path
bin/project-resolve "log this to logseq" --github
bin/project-resolve dbt --json
bin/project-resolve --generate-md > PROJECTS.md
```

Set `AGENTS_REGISTRY_ENV` to force an environment such as `local`, `amp-orb`, or `vps`; otherwise the resolver auto-detects where possible. Set `AGENTS_REGISTRY_WORKSPACE_ROOT` when a host uses a different workspace root than the registry default. See [PROJECTS.md](PROJECTS.md) for the generated overview.

`./sync-skills.sh` projects `projects.yaml` and `PROJECTS.md` into `~/.config/amp` along with the other Amp runtime artifacts.

## Setup

```bash
git clone <repo-url>
cd agent-skills
./sync-skills.sh --remote   # fetch remote skills
./sync-skills.sh             # local
```

Remote skill source-of-truth lives in `remote-skills.yaml`. `./sync-skills.sh --remote` fetches each remote `SKILL.md`, optional companion files, and writes generated files such as `skills/<name>/SKILL.md`, `skills/<name>/.remote-source`, and remote companion directories. Those generated files are ignored in `.gitignore`; commit the registry entry and any intentional local `PERSONAL.md`, not the fetched payload.

Some remote skills depend on shared generated references. For example, Holistics AMQL skills fetch `references/` from `github.com/holistics/skills`; that directory is runtime support generated by remote sync and should not appear in PR diffs.

`sync-skills.sh` also syncs version-controlled Amp runtime artifacts from this repo into `~/.config/amp`:

```text
amp/AGENTS.md          -> ~/.config/amp/AGENTS.md
amp/plugins/           -> ~/.config/amp/plugins/
amp/docs/tools/        -> ~/.config/amp/docs/tools/
```

Use `AMP_CONFIG_DIR=/path/to/amp-config ./sync-skills.sh` to test against a temporary Amp config directory.

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
