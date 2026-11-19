# Skills

This page lists every skill that this repository projects, grouped by what you use it for.

The source column says where a skill comes from:

- **Local**: maintained in this repository
- **Remote**: fetched from upstream by `./sync-skills.sh --remote`, plus any local `PERSONAL.md` overrides
- **Global**: lives in Amp global User Skills, not in `skills/`

## Writing and documents

| Skill | Source | Use it to |
| --- | --- | --- |
| [clear-writing](../skills/clear-writing/SKILL.md) | Local | write clear prose, technical documentation, customer-facing messages, and agent-facing instructions |
| [govuk-style](../skills/govuk-style/SKILL.md) | Local | compatibility alias for `clear-writing` |
| [writing-essays](../skills/writing-essays/SKILL.md) | Local | develop, draft and revise essays and blog posts around one argued idea |
| [writing-for-agents](../skills/writing-for-agents/SKILL.md) | Remote | write documents for agents, including skills and agent instructions |
| [writing-investigation-docs](../skills/writing-investigation-docs/SKILL.md) | Local | write evidence-first investigation and decision docs |
| [to-spec](../skills/to-spec/SKILL.md) | Remote | turn a conversation into a specification in the project issue tracker |
| [to-questionnaire](../skills/to-questionnaire/SKILL.md) | Remote | turn missing stakeholder knowledge into a reusable questionnaire |
| [handoff](../skills/handoff/SKILL.md) | Remote | compact a conversation for another agent to continue |

## Planning and development practice

| Skill | Source | Use it to |
| --- | --- | --- |
| [grill-me](../skills/grill-me/SKILL.md) | Remote | sharpen a plan or design through a focused interview |
| [grill-with-docs](../skills/grill-with-docs/SKILL.md) | Remote | sharpen a plan while recording decisions and domain terms |
| [grilling](../skills/grilling/SKILL.md) | Remote | stress-test a plan or design through questions |
| [domain-modeling](../skills/domain-modeling/SKILL.md) | Remote | define domain terms, context, and architectural decisions |
| [prototype](../skills/prototype/SKILL.md) | Remote | build throwaway logic or UI prototypes to test a design |
| [tdd](../skills/tdd/SKILL.md) | Remote | work test-first |
| [teach](../skills/teach/SKILL.md) | Remote | teach a skill or concept in a workspace |

## Agent workflow and delivery

| Skill | Source | Use it to |
| --- | --- | --- |
| [delegating-subagents](../skills/delegating-subagents/SKILL.md) | Local | choose direct work, named Claude or Pi specialists, built-in `Task`, or native `create_thread` |
| [resolving-projects](../skills/resolving-projects/SKILL.md) | Local | resolve spoken project names to paths and GitHub repositories |
| [shipping-personal-projects](../skills/shipping-personal-projects/SKILL.md) | Local | ship approved personal projects through the bot publisher and repository release gates |
| [proto](../skills/proto/SKILL.md) | Local | deploy static sites, SPAs, and images with route-specific preflight and verification |
| [security-audit](../skills/security-audit/SKILL.md) | Remote | review security boundaries and run coverage-led audits with independently verified findings |

## Holistics and data

| Skill | Source | Use it to |
| --- | --- | --- |
| [develop-amql](../skills/develop-amql/SKILL.md) | Remote | develop Holistics models, datasets, dashboards, and metrics |
| [write-aql](../skills/write-aql/SKILL.md) | Remote | write and run Holistics AQL queries |
| [search-docs](../skills/search-docs/SKILL.md) | Remote | search Holistics documentation |
| [build-dashboard](../skills/build-dashboard/SKILL.md) | Remote | build and edit Holistics canvas dashboards |
| [build-dashboard-controls](../skills/build-dashboard-controls/SKILL.md) | Remote | add filters, date drills, and comparisons to Holistics dashboards |
| [build-dashboard-theme](../skills/build-dashboard-theme/SKILL.md) | Remote | create and apply Holistics dashboard themes |
| [build-visualizations](../skills/build-visualizations/SKILL.md) | Remote | author Holistics dashboard visualizations and dynamic content |
| [build-custom-chart](../skills/build-custom-chart/SKILL.md) | Remote | create reusable Holistics custom chart definitions |
| [creating-client-design-systems](../skills/creating-client-design-systems/SKILL.md) | Local | create Google DESIGN.md files for client brands and Holistics dashboard themes |
| [create-holistics-skill](../skills/create-holistics-skill/SKILL.md) | Remote | author and refine Holistics AML skills |
| [convert-agent-skill-to-holistics](../skills/convert-agent-skill-to-holistics/SKILL.md) | Remote | convert skills between Agent Skills and Holistics AML formats |
| [holistics-migrate-power-bi](../skills/holistics-migrate-power-bi/SKILL.md) | Remote | migrate Power BI models and reports to Holistics |
| [syncing-holistics-external-git](../skills/syncing-holistics-external-git/SKILL.md) | Local | bootstrap local sync for a new, empty external Git repository connected to Holistics |
| [bigquery-query](../skills/bigquery-query/SKILL.md) | Local | query Google BigQuery with the `bq` CLI |
| [google-analytics](../skills/google-analytics/SKILL.md) | Local | query and manage GA4 properties through Google's official Analytics MCP server |

## Design, visuals and frontend

| Skill | Source | Use it to |
| --- | --- | --- |
| [impeccable](../skills/impeccable/SKILL.md) | Remote | design, review, and improve frontend interfaces |
| [modern-web-guidance](../skills/modern-web-guidance/SKILL.md) | Remote | check current web platform guidance before frontend work |
| [motion](../skills/motion/SKILL.md) | Remote | use official Motion animation best practices and search free documentation and examples |
| [figma-design-to-code](../skills/figma-design-to-code/SKILL.md) | Remote | inspect Figma designs and implement them as code |
| [collaborating-with-claude-design](../skills/collaborating-with-claude-design/SKILL.md) | Local | coordinate Claude Design creation, browser verification, and evidence-based iteration |
| [diagram-design](../skills/diagram-design/SKILL.md) | Remote | create and export branded diagrams as HTML, SVG, or PNG |
| [show-me](../skills/show-me/SKILL.md) | Remote | explain technical topics with concise diagrams, code-shape sketches, and focused HTML artifacts |
| [anatomy](../skills/anatomy/SKILL.md) | Remote | explain technical ideas as detailed interactive isometric objects in SVG, WebGL, or 3D |
| [creating-colorfigures](../skills/creating-colorfigures/SKILL.md) | Local | create hand-inked interactive isometric objects with working mechanisms and see-through views |
| [painting-ink-and-wash](../skills/painting-ink-and-wash/SKILL.md) | Local | paint conceptual watercolor illustrations on mechanical drafting paper in Chinh's Ink & Wash style |

## Automation and integrations

| Skill | Source | Use it to |
| --- | --- | --- |
| [agent-browser](../skills/agent-browser/SKILL.md) | Remote | automate browser and UI tasks with `agent-browser` |
| [agent-desktop](../skills/agent-desktop/SKILL.md) | Remote | operate native desktop apps through accessibility trees with `agent-desktop` |
| [email](../skills/email/SKILL.md) | Local | read, send, and organize personal and bot email through `gog` |
| [notion](../skills/notion/SKILL.md) | Remote | manage Notion pages, databases, and comments |
| [readai](../skills/readai/SKILL.md) | Local | retrieve speaker-attributed Read AI call transcripts |
| [reading-social-posts](../skills/reading-social-posts/SKILL.md) | Local | read social posts and inspect all attached media through TikHub |
| syncing-obsidian-notes (global User Skills: `syncing-obsidian-notes/`) | Global | read and write the second-brain notes through Obsidian Sync from local threads and orbs |

## Skills from Amp and plugins

These skills are active in Amp, but this repository does not maintain them.

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

## Skill notes

### Motion AI Kit (free)

The [official Motion AI Kit](https://motion.dev/docs/ai-kit) is fetched from `motiondivision/ai-kit` at a pinned revision, including its companion guides. The global skill links make `/motion` available in Amp and Claude Code.

Amp loads the skill's `mcp.json`, which allows only `search-motion-docs` from https://mcp.motion.dev. No account, API key or Motion+ server is configured. The local `PERSONAL.md` limits the upstream instructions to free features.

Claude Code does not load Amp's skill-bundled MCP configuration. Register the same free hosted server once per machine:

```bash
claude mcp add --scope user --transport http motion https://mcp.motion.dev
claude mcp get motion
```

### Local MCP overrides for remote skills

For archive-based remote skills, a Git-tracked `mcp.json` is a local override and survives remote refreshes, like `PERSONAL.md`. Untracked upstream MCP files remain generated payloads.

## Improve a skill

Use [skill-tests](../skill-tests/README.md) when a skill works sometimes but not reliably enough:

1. Add a fixture for the failure mode.
2. Run the skill against it.
3. Review the output with feedback tags.
4. Update the skill only when the failure generalizes.
