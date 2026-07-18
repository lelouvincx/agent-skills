# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project does not currently use versioned releases.

## [Unreleased]

### Added

- Add an experimental Inkling-backed Amp agent mode. [#106](https://github.com/lelouvincx/agent-skills/pull/106)
- Add `readai` for retrieving speaker-attributed call transcripts through the Read AI MCP. [#105](https://github.com/lelouvincx/agent-skills/pull/105)
- Add parent-scoped list, status, and cancel controls for spawned Amp subagents. [#101](https://github.com/lelouvincx/agent-skills/pull/101)
- Add a narrowly scoped Claude Design subagent that proxies authenticated design work through Claude Code. [#92](https://github.com/lelouvincx/agent-skills/pull/92)
- Add RFC-0008 and implement layered pre-commit, pre-push, and authoritative GitHub Actions validation. [#87](https://github.com/lelouvincx/agent-skills/pull/87)
- Add `testing4` and `duty-support` to the shared project registry and document zoxide-based registry maintenance. [#85](https://github.com/lelouvincx/agent-skills/pull/85)
- Preserve the original Amp plugin capability schema as a versioned v1 reference. [#80](https://github.com/lelouvincx/agent-skills/pull/80)
- Add `delegating-subagents` to choose between built-in `Task`, asynchronous `spawn_subagent`, and direct work. [#78](https://github.com/lelouvincx/agent-skills/pull/78)
- Add a dedicated TypeScript workspace for developing with the Amp SDK. [#77](https://github.com/lelouvincx/agent-skills/pull/77)
- Add version-controlled `deep-classic` and `smart-classic` Amp agent modes with capability documentation. [#76](https://github.com/lelouvincx/agent-skills/pull/76)
- Add a personal `agent-browser` overlay documenting the existing local persistent browser profile. [#71](https://github.com/lelouvincx/agent-skills/pull/71)
- Add `creating-client-design-systems` for Google DESIGN.md files that guide client branding and Holistics dashboard themes. [#67](https://github.com/lelouvincx/agent-skills/pull/67)
- Add ReadAI as a global Amp MCP server through `mcp-remote`. [#66](https://github.com/lelouvincx/agent-skills/pull/66)
- Add `writing-investigation-docs` for evidence-first investigation, incident, PR decision, and RFC-style notes, plus `skill-tests` for fixture-based skill feedback loops. [#65](https://github.com/lelouvincx/agent-skills/pull/65)
- Add a changelog and enforce changelog updates for every pull request. [#54](https://github.com/lelouvincx/agent-skills/pull/54)
- Add `explaining-technical-concepts`, GOV.UK style, ponytail, writing-great-skills, modern-web-guidance, Remotion, shadcn/ui, teaching, grilling, copywriting, and other reusable local or remote skills. [#53](https://github.com/lelouvincx/agent-skills/pull/53) [#37](https://github.com/lelouvincx/agent-skills/pull/37) [#29](https://github.com/lelouvincx/agent-skills/pull/29) [#26](https://github.com/lelouvincx/agent-skills/pull/26) [#24](https://github.com/lelouvincx/agent-skills/pull/24) [#23](https://github.com/lelouvincx/agent-skills/pull/23) [#22](https://github.com/lelouvincx/agent-skills/pull/22) [#21](https://github.com/lelouvincx/agent-skills/pull/21) [#20](https://github.com/lelouvincx/agent-skills/pull/20) [#16](https://github.com/lelouvincx/agent-skills/pull/16) [#15](https://github.com/lelouvincx/agent-skills/pull/15) [#13](https://github.com/lelouvincx/agent-skills/pull/13)
- Add the Holistics Semantic API/AQL skill and BigQuery skill, including later Holistics API documentation and BigQuery dbt-to-prod lookup guidance. [#1](https://github.com/lelouvincx/agent-skills/pull/1) [#2](https://github.com/lelouvincx/agent-skills/pull/2) [#3](https://github.com/lelouvincx/agent-skills/pull/3) [#4](https://github.com/lelouvincx/agent-skills/pull/4) [#14](https://github.com/lelouvincx/agent-skills/pull/14) [#28](https://github.com/lelouvincx/agent-skills/pull/28)
- Add remote skill syncing with personal overlays, generated-file ignores, smart caching, companion-file manifests, and multi-runtime skill link targets. [#8](https://github.com/lelouvincx/agent-skills/pull/8) [#10](https://github.com/lelouvincx/agent-skills/pull/10) [#19](https://github.com/lelouvincx/agent-skills/pull/19)
- Add version-controlled Amp plugin/runtime artifacts, Amp settings/docs projection, plugin capability docs, plugin usage capture, Logseq task logging, `spawn_worker`, and Codex usage command support. [#30](https://github.com/lelouvincx/agent-skills/pull/30) [#31](https://github.com/lelouvincx/agent-skills/pull/31) [#34](https://github.com/lelouvincx/agent-skills/pull/34) [#38](https://github.com/lelouvincx/agent-skills/pull/38) [#39](https://github.com/lelouvincx/agent-skills/pull/39) [#40](https://github.com/lelouvincx/agent-skills/pull/40) [#49](https://github.com/lelouvincx/agent-skills/pull/49)
- Add the shared project registry, `bin/project-resolve`, generated `PROJECTS.md`, project resolution skill, and RFC-0005. [#44](https://github.com/lelouvincx/agent-skills/pull/44)
- Add Orb bootstrap lifecycle support with cold-start and warm-start scripts plus RFC-0006. [#42](https://github.com/lelouvincx/agent-skills/pull/42) [#52](https://github.com/lelouvincx/agent-skills/pull/52)
- Add CI validation for Amp plugin docs and enforce the plugin capability schema contract. [#50](https://github.com/lelouvincx/agent-skills/pull/50)
- Add RFC documentation schema, scoped RFC guidance, and CI validation for RFC frontmatter, relationships, and headings. [#56](https://github.com/lelouvincx/agent-skills/pull/56)

### Changed

- Label parent Amp threads from their Logseq backlog project, working project, and customer before archiving logging workers. [#111](https://github.com/lelouvincx/agent-skills/pull/111)
- Let `spawn_subagent` run locally, in an Amp Orb, or on a live runner selected by stable ID while preventing local `cwd` paths from reaching remote targets. [#110](https://github.com/lelouvincx/agent-skills/pull/110)
- Update the `slackcli` skill for SlackCLI v0.7.0 search, saved-item, canvas, file-upload, and draft workflows. [#104](https://github.com/lelouvincx/agent-skills/pull/104)
- Harden the command-only Logseq workflow with process-scoped operation ordering, truthful pending and partial states, verified structured worker results, same-worker repair, independent rename, label and archive outcomes, and schema-managed ISSUE-0001 rationale. [#98](https://github.com/lelouvincx/agent-skills/pull/98)
- Update the Amp SDK workspace to use the latest bundled Amp CLI and platform packages. [#102](https://github.com/lelouvincx/agent-skills/pull/102)
- Remove the blanket "every browser task" wording from the local agent-browser workflow. [#100](https://github.com/lelouvincx/agent-skills/pull/100)
- Guide GOV.UK-style writing to use articles sparingly, especially "the", and avoid em dashes. [#99](https://github.com/lelouvincx/agent-skills/pull/99)
- Require agent-browser tasks to use visible system Chrome with a persistent local profile, CDP connection checks, and user-assisted login. [#97](https://github.com/lelouvincx/agent-skills/pull/97)
- Let `spawn_subagent` choose the working directory for a bounded task, defaulting to the parent thread's working directory. [#96](https://github.com/lelouvincx/agent-skills/pull/96)
- Run Logseq logging workers in fixed `high` mode without recent-message seeds, require `read_thread` for parent context, block Oracle escalation, and fail fast when a high-mode worker cannot start. [#94](https://github.com/lelouvincx/agent-skills/pull/94)
- Reserve Oracle escalation for the parent coordinator when using `spawn_subagent`. [#91](https://github.com/lelouvincx/agent-skills/pull/91)
- Update the maintained Matt Pocock skills for upstream 1.1.0 by renaming `to-prd` to `to-spec`, cleaning retired generated artifacts, and validating remote frontmatter while preserving personal overlays. [#90](https://github.com/lelouvincx/agent-skills/pull/90)
- Delegate side questions introduced with `btw` or triggered with `|btw` without displacing the parent task. [#88](https://github.com/lelouvincx/agent-skills/pull/88)
- Scope agent guidance to the directories where it applies and shorten the root `AGENTS.md`. [#86](https://github.com/lelouvincx/agent-skills/pull/86)
- Stress-test subagent delegation scenarios and require spawned agents to reconstruct parent intent through `read_thread`. [#83](https://github.com/lelouvincx/agent-skills/pull/83)
- Update the RTK rewrite capability's verified stable version to `0.43.0`. [#82](https://github.com/lelouvincx/agent-skills/pull/82)
- Migrate active Amp capability documentation and validation to the role-preserving `amp-artifact/v2` contract, including separate Logseq tool and command artifacts and the first skill artifact. [#81](https://github.com/lelouvincx/agent-skills/pull/81)
- Expand Amp capability documentation into an artifact schema that supports both plugin capabilities and skills. [#79](https://github.com/lelouvincx/agent-skills/pull/79)
- Document when to use Amp's built-in `Task` tool versus the asynchronous `spawn_subagent` capability. [#78](https://github.com/lelouvincx/agent-skills/pull/78)
- Default plugin-spawned helper agents to Amp `medium` mode and document the OpenAI-backed rationale for that default in plugin guidance. [#74](https://github.com/lelouvincx/agent-skills/pull/74)
- Update the `deepseek-v4-pro` agent mode to use the deprecated built-in Deep mode prompt and tool list (matching `deep-classic`), replacing the previous GLM 5.2-era prompt and narrower tool set. [#73](https://github.com/lelouvincx/agent-skills/pull/73)
- Document `AMP_NO_TUI=1` as an Amp remote control thread signal. [#69](https://github.com/lelouvincx/agent-skills/pull/69)
- Enable remote Amp thread creation in shared Amp settings. [#68](https://github.com/lelouvincx/agent-skills/pull/68)
- Document the `send_to_thread` `steer=true` rationale for GPT-5.5 deep-mode parent threads. [#64](https://github.com/lelouvincx/agent-skills/pull/64)
- Clarify and reflow the `spawn_subagent` capability docs for `read_thread` intent reconstruction and diff-friendly maintenance. [#63](https://github.com/lelouvincx/agent-skills/pull/63)
- Use Markdown section headings for `send_to_thread` and `spawn_subagent` completion reports. [#62](https://github.com/lelouvincx/agent-skills/pull/62)
- Document explicit `/subagent` and `|subagent` trigger forms for the spawn subagent capability and agent instructions. [#61](https://github.com/lelouvincx/agent-skills/pull/61)
- Remove a stale RFC handoff dependency path that failed RFC validation. [#61](https://github.com/lelouvincx/agent-skills/pull/61)
- Rename the `spawn_worker` Amp capability to `spawn_subagent`. [#59](https://github.com/lelouvincx/agent-skills/pull/59)
- Replace the browser automation remote skill with `agent-browser`.
- Add a compact GOV.UK-style message contract to the `send_to_thread` capability doc. [#59](https://github.com/lelouvincx/agent-skills/pull/59) [#60](https://github.com/lelouvincx/agent-skills/pull/60)
- Move the `|subagent` start-of-prompt guidance into the `spawn_subagent` capability doc.
- Manage migrated skills from upstream remote sources, including Holistics, Matt Pocock, and Impeccable skill sources plus shared Holistics references. [#46](https://github.com/lelouvincx/agent-skills/pull/46)
- Run project resolution through `uvx` and document `uv`/`uvx` prerequisites for local and Orb setup. [#45](https://github.com/lelouvincx/agent-skills/pull/45)
- Rework README and maintenance docs for clearer human setup, Amp capability tables, and agent-facing repository maintenance guidance. [#18](https://github.com/lelouvincx/agent-skills/pull/18) [#41](https://github.com/lelouvincx/agent-skills/pull/41) [#47](https://github.com/lelouvincx/agent-skills/pull/47)
- Update Amp runtime defaults, including xhigh deep reasoning, system notifications, hidden costs, and medium default reasoning for worker agents. [#35](https://github.com/lelouvincx/agent-skills/pull/35) [#48](https://github.com/lelouvincx/agent-skills/pull/48)
- Make Logseq task logging backlog-first, expose it as both command and tool, move optional user instruction near the end of the prompt, and retry transient worker wait timeouts. [#38](https://github.com/lelouvincx/agent-skills/pull/38) [#43](https://github.com/lelouvincx/agent-skills/pull/43) [#49](https://github.com/lelouvincx/agent-skills/pull/49) [#51](https://github.com/lelouvincx/agent-skills/pull/51)
- Archive completed `spawn_worker` threads and clarify parent follow-up behavior. [#33](https://github.com/lelouvincx/agent-skills/pull/33)
- Refine remote skill syncing, including sync target simplification, multi-target support, frontmatter preservation, personal overlay rebuilds, portable hashing, companion file handling, and `PERSONAL.md` placement. [#6](https://github.com/lelouvincx/agent-skills/pull/6) [#7](https://github.com/lelouvincx/agent-skills/pull/7) [#9](https://github.com/lelouvincx/agent-skills/pull/9) [#10](https://github.com/lelouvincx/agent-skills/pull/10) [#25](https://github.com/lelouvincx/agent-skills/pull/25)
- Move the Holistics AQL cheatsheet into a reference file and simplify BigQuery usage to call `bq` directly instead of a wrapper. [#5](https://github.com/lelouvincx/agent-skills/pull/5) [#11](https://github.com/lelouvincx/agent-skills/pull/11)
- Sync Amp settings and docs from the repo as the source of truth. [#39](https://github.com/lelouvincx/agent-skills/pull/39)

### Deprecated

### Removed

- Remove the redundant agent-callable Logseq logging tool now that its command-palette action is available on Amp Web. [#108](https://github.com/lelouvincx/agent-skills/pull/108)
- Remove the `setup-amql-development` remote skill. [#107](https://github.com/lelouvincx/agent-skills/pull/107)

- Remove unused or retired skills, including context window notifier, caveman, holistics-query, sql-formatter, grill-me, grill-with-docs, and teach. [#12](https://github.com/lelouvincx/agent-skills/pull/12) [#17](https://github.com/lelouvincx/agent-skills/pull/17) [#27](https://github.com/lelouvincx/agent-skills/pull/27) [#36](https://github.com/lelouvincx/agent-skills/pull/36)
- Remove stale duplicated README maintenance sections after moving agent-facing instructions into `AGENTS.md`. [#41](https://github.com/lelouvincx/agent-skills/pull/41) [#47](https://github.com/lelouvincx/agent-skills/pull/47)
- Remove the `glm-5.2` experimental agent mode plugin and capability doc, since GLM 5.2 is now the default model for the built-in `low` mode per [The Dial](https://ampcode.com/news/the-dial). [#72](https://github.com/lelouvincx/agent-skills/pull/72)

### Fixed

- Support Claude Fable 5 in Claude Code subagents and remove obsolete Claude Code tool names that prevented the read-only agent from launching. [#109](https://github.com/lelouvincx/agent-skills/pull/109)
- Reconcile completed Logseq worker responses at the five-minute timeout boundary instead of reporting successful writes as failures. [#95](https://github.com/lelouvincx/agent-skills/pull/95)
- Preserve Claude Design audit and opt-in raw transcript paths when the Claude Code proxy times out or fails, add deterministic regression coverage, and document the verified supervised design and response-mediated source handoff workflow. [#93](https://github.com/lelouvincx/agent-skills/pull/93)
- Prevent `spawn_subagent` from launching `ultra` mode subagents. [#89](https://github.com/lelouvincx/agent-skills/pull/89)
- Harden `spawn_subagent` lifecycle instructions, report formatting, parent-context reconstruction, and orphan-thread diagnostics. [#84](https://github.com/lelouvincx/agent-skills/pull/84)
- Fix the `deepseek-v4-pro` Amp plugin prompt literal so the agent mode loads again. [#75](https://github.com/lelouvincx/agent-skills/pull/75)
- Fix project resolver guidance to use the PATH-level `project-resolve` command from other project directories. [#70](https://github.com/lelouvincx/agent-skills/pull/70)
- Fix Holistics query guidance for documentation links, pooling, dataset IDs, and optional SQL generation. [#2](https://github.com/lelouvincx/agent-skills/pull/2) [#3](https://github.com/lelouvincx/agent-skills/pull/3)
- Fix remote skill sync edge cases around YAML frontmatter, `PERSONAL.md` change detection, order-independent parsing, portable hashing, and generated frontmatter delimiters. [#9](https://github.com/lelouvincx/agent-skills/pull/9) [#25](https://github.com/lelouvincx/agent-skills/pull/25)
- Fix transient Logseq worker wait failures by retrying `thread.messages` timeouts until the worker timeout expires. [#51](https://github.com/lelouvincx/agent-skills/pull/51)

### Security

- Isolate Claude subagents from repository-controlled settings, preserve Claude Design session identity across ambiguous failures, and stop oversized child output. [#103](https://github.com/lelouvincx/agent-skills/pull/103)
