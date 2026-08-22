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
It also symlinks scripts from `bin/` into `~/.local/bin`, so they can be used from any project when `~/.local/bin` is on `PATH`.

## Use the project registry

`projects.yaml` maps short project names to local paths and GitHub repositories.

```bash
project-resolve logseq --path
project-resolve "log this to logseq" --github
project-resolve dbt --json
```

See [PROJECTS.md](PROJECTS.md) for the generated project list.

## Skills

### Repository skills

Local skills are maintained in this repository. Remote skills are fetched and projected by `./sync-skills.sh --remote`.

| Skill | Type | Use it to |
| --- | --- | --- |
| [agent-browser](skills/agent-browser/SKILL.md) | Remote | automate browser and UI tasks with `agent-browser` |
| [bigquery-query](skills/bigquery-query/SKILL.md) | Local | query Google BigQuery with the `bq` CLI |
| [build-custom-chart](skills/build-custom-chart/SKILL.md) | Remote | create reusable Holistics custom chart definitions |
| [build-dashboard](skills/build-dashboard/SKILL.md) | Remote | build and edit Holistics canvas dashboards |
| [build-dashboard-controls](skills/build-dashboard-controls/SKILL.md) | Remote | add filters, date drills, and comparisons to Holistics dashboards |
| [build-dashboard-theme](skills/build-dashboard-theme/SKILL.md) | Remote | create and apply Holistics dashboard themes |
| [build-visualizations](skills/build-visualizations/SKILL.md) | Remote | author Holistics dashboard visualizations and dynamic content |
| [collaborating-with-claude-design](skills/collaborating-with-claude-design/SKILL.md) | Local | coordinate Claude Design creation, browser verification, and evidence-based iteration |
| [convert-agent-skill-to-holistics](skills/convert-agent-skill-to-holistics/SKILL.md) | Remote | convert skills between Agent Skills and Holistics AML formats |
| [create-holistics-skill](skills/create-holistics-skill/SKILL.md) | Remote | author and refine Holistics AML skills |
| [creating-client-design-systems](skills/creating-client-design-systems/SKILL.md) | Local | create Google DESIGN.md files for client brands and Holistics dashboard themes |
| [delegating-subagents](skills/delegating-subagents/SKILL.md) | Local | choose direct work, named Claude or Pi specialists, built-in `Task`, or native `create_thread` |
| [develop-amql](skills/develop-amql/SKILL.md) | Remote | develop Holistics models, datasets, dashboards, and metrics |
| [diagram-design](skills/diagram-design/SKILL.md) | Remote | create and export branded diagrams as HTML, SVG, or PNG |
| [domain-modeling](skills/domain-modeling/SKILL.md) | Remote | define domain terms, context, and architectural decisions |
| [technical-precision](skills/technical-precision/SKILL.md) | Local | explain technical concepts and write or edit unambiguous technical documentation |
| [figma-design-to-code](skills/figma-design-to-code/SKILL.md) | Remote | inspect Figma designs and implement them as code |
| [gmail](skills/gmail/SKILL.md) | Local | search and read Gmail through a read-only `gog` account |
| [govuk-style](skills/govuk-style/SKILL.md) | Local | write clear plain-English prose |
| [grill-me](skills/grill-me/SKILL.md) | Remote | sharpen a plan or design through a focused interview |
| [grill-with-docs](skills/grill-with-docs/SKILL.md) | Remote | sharpen a plan while recording decisions and domain terms |
| [grilling](skills/grilling/SKILL.md) | Remote | stress-test a plan or design through questions |
| [handoff](skills/handoff/SKILL.md) | Remote | compact a conversation for another agent to continue |
| [holistics-migrate-power-bi](skills/holistics-migrate-power-bi/SKILL.md) | Remote | migrate Power BI models and reports to Holistics |
| [impeccable](skills/impeccable/SKILL.md) | Remote | design, review, and improve frontend interfaces |
| [linear-cli](skills/linear-cli/SKILL.md) | Remote | manage Linear issues from the command line |
| [modern-web-guidance](skills/modern-web-guidance/SKILL.md) | Remote | check current web platform guidance before frontend work |
| [notion](skills/notion/SKILL.md) | Remote | manage Notion pages, databases, and comments |
| [prototype](skills/prototype/SKILL.md) | Remote | build throwaway logic or UI prototypes to test a design |
| [proto](skills/proto/SKILL.md) | Local | deploy static sites, SPAs, and images with route-specific preflight and verification |
| [readai](skills/readai/SKILL.md) | Local | retrieve speaker-attributed Read AI call transcripts |
| [reading-social-posts](skills/reading-social-posts/SKILL.md) | Local | read social posts and inspect all attached media through TikHub |
| [resolving-projects](skills/resolving-projects/SKILL.md) | Local | resolve spoken project names to paths and GitHub repositories |
| [search-docs](skills/search-docs/SKILL.md) | Remote | search Holistics documentation |
| [showing-code](skills/showing-code/SKILL.md) | Local | turn technical topics into compact code-shape visuals |
| [slackcli](skills/slackcli/SKILL.md) | Local | read, send, and manage Slack messages from the CLI |
| [tdd](skills/tdd/SKILL.md) | Remote | work test-first |
| [teach](skills/teach/SKILL.md) | Remote | teach a skill or concept in a workspace |
| [to-questionnaire](skills/to-questionnaire/SKILL.md) | Remote | turn missing stakeholder knowledge into a reusable questionnaire |
| [to-spec](skills/to-spec/SKILL.md) | Remote | turn a conversation into a specification in the project issue tracker |
| [write-aql](skills/write-aql/SKILL.md) | Remote | write and run Holistics AQL queries |
| [writing-for-agents](skills/writing-for-agents/SKILL.md) | Remote | write documents for agents, including skills and agent instructions |
| [writing-investigation-docs](skills/writing-investigation-docs/SKILL.md) | Local | write evidence-first investigation and decision docs |

### Amp and plugin skills

These skills are active in Amp but are not maintained by this repository.

| Skill | Source | Use it to |
| --- | --- | --- |
| `building-plugins` | Amp | build and maintain Amp plugins |
| `building-schedules` | Amp | create and manage thread schedules and triggers |
| `building-skills` | Amp | create, install, move, and publish Agent Skills |
| `creating-charts` | Amp | render interactive charts in replies |
| `creating-webhooks` | Amp | create durable webhook handlers in Amp plugins |
| `orb-setup` | Amp | prepare repositories to run in Amp orbs |
| `setup-tmux` | Amp | configure tmux for Amp CLI |
| `holistics-design` | Plugin | create Holistics-branded interfaces and assets |
| `media-manager` | Plugin | manage files on Media Manager CDN |

## Skill behavior tests

Use [skill-tests](skill-tests/README.md) to improve skills with repeatable fixtures, self-checks and user feedback tags.

Start there when a skill works sometimes but not reliably enough. Add a fixture for the failure mode, run the skill against it, review the output with tags, then update the skill only when the failure generalizes.

## Validation

Use [pre-commit](https://pre-commit.com) as the local entry point for validation.

### Set up once

```bash
pre-commit install
pre-commit install --hook-type pre-push
```

### Run checks

Run fast checks on staged files while you work. Run all integration checks before you push:

```bash
pre-commit run
pre-commit run --hook-stage pre-push --all-files
```

Full pre-push validation requires `uv`/`uvx`, `rsync`, Bun 1.3.14 or newer, and npm. The SDK check uses `npm ci` and the committed lockfile.

### Debug a failed check

Run the relevant repository command directly:

| Check | Command |
| --- | --- |
| Test the Amp documentation validator | `python3 -m unittest amp/scripts/test_validate_plugin_docs.py` |
| Validate Amp capability and issue docs | `python3 amp/scripts/validate-plugin-docs.py` |
| Validate Amp RFCs | `python3 amp/scripts/validate-rfcs.py` |
| Test the GitHub thread event validator | `python3 -m unittest amp/scripts/test_validate_github_thread_events.py` |
| Validate GitHub thread event configuration | `python3 amp/scripts/validate-github-thread-events.py` |
| Validate the project registry | `scripts/check-project-registry` |
| Test the project resolver | `scripts/check-project-resolver` |
| Validate runtime projection | `scripts/check-projection` |
| Build Amp plugins | `scripts/check-plugin-builds` |
| Validate SDK dependencies | `npm ci --prefix sdk` |

## Amp capabilities

| Capability | Type | Where it appears | Use it to |
| --- | --- | --- | --- |
| [Claude Code subagent](amp/docs/tools/claude-code-subagent.md) | Agent tool | Agent | ask Claude Code for read-only advice |
| [Label skill and plugin usage](amp/docs/tools/label-skill-plugin-usage.md) | Agent tool | Agent | add or correct usage-event labels |
| [Pi Code subagent](amp/docs/tools/pi-code-subagent.md) | Agent tool | Agent | ask Pi Coding Agent for read-only advice |
| [DeepSeek V4 Flash](amp/docs/tools/deepseek-v4-flash.md) | Agent mode | Mode picker | run an experimental DeepSeek-backed agent mode |
| [Gemini 3.5 Flash](amp/docs/tools/gemini-3-5-flash.md) | Agent mode | Mode picker | run an experimental Gemini-backed agent mode |
| [GPT-5.5 Medium](amp/docs/tools/gpt-5-5-medium.md) | Agent mode | Mode picker | run an experimental GPT-5.5 agent mode with medium reasoning effort |
| [GPT-5.5 XHigh](amp/docs/tools/gpt-5-5-xhigh.md) | Agent mode | Mode picker | run an experimental GPT-5.5 agent mode with xhigh reasoning effort |
| [Codex usage command](amp/docs/tools/codex-usage.md) | Command | Command palette | show Codex usage limits |
| [Logseq log current task](amp/docs/tools/logseq-log-current-task-command.md) | Command | Command palette | log the current Amp task into Logseq |
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
