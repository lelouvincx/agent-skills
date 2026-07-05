# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project does not currently use versioned releases.

## [Unreleased]

### Added

- Add a changelog and enforce changelog updates for every pull request. [#54]
- Add `explaining-technical-concepts`, GOV.UK style, ponytail, writing-great-skills, modern-web-guidance, Remotion, Playwright, shadcn/ui, teaching, grilling, copywriting, and other reusable local or remote skills. [#53] [#37] [#29] [#26] [#24] [#23] [#22] [#21] [#20] [#16] [#15] [#13]
- Add the Holistics Semantic API/AQL skill and BigQuery skill, including later Holistics API documentation and BigQuery dbt-to-prod lookup guidance. [#1] [#2] [#3] [#4] [#14] [#28]
- Add remote skill syncing with personal overlays, generated-file ignores, smart caching, companion-file manifests, and multi-runtime skill link targets. [#8] [#10] [#19]
- Add version-controlled Amp plugin/runtime artifacts, Amp settings/docs projection, plugin capability docs, plugin usage capture, Logseq task logging, `spawn_worker`, and Codex usage command support. [#30] [#31] [#34] [#38] [#39] [#40] [#49]
- Add the shared project registry, `bin/project-resolve`, generated `PROJECTS.md`, project resolution skill, and RFC-0005. [#44]
- Add Orb bootstrap lifecycle support with cold-start and warm-start scripts plus RFC-0006. [#42] [#52]
- Add CI validation for Amp plugin docs and enforce the plugin capability schema contract. [#50]
- Add RFC documentation schema, scoped RFC guidance, and CI validation for RFC frontmatter, relationships, and headings. [#56]

### Changed

- Manage migrated skills from upstream remote sources, including Holistics, Matt Pocock, and Impeccable skill sources plus shared Holistics references. [#46]
- Run project resolution through `uvx` and document `uv`/`uvx` prerequisites for local and Orb setup. [#45]
- Rework README and maintenance docs for clearer human setup, Amp capability tables, and agent-facing repository maintenance guidance. [#18] [#41] [#47]
- Update Amp runtime defaults, including xhigh deep reasoning, system notifications, hidden costs, and medium default reasoning for worker agents. [#35] [#48]
- Make Logseq task logging backlog-first, expose it as both command and tool, move optional user instruction near the end of the prompt, and retry transient worker wait timeouts. [#38] [#43] [#49] [#51]
- Archive completed `spawn_worker` threads and clarify parent follow-up behavior. [#33]
- Refine remote skill syncing, including sync target simplification, multi-target support, frontmatter preservation, personal overlay rebuilds, portable hashing, companion file handling, and `PERSONAL.md` placement. [#6] [#7] [#9] [#10] [#25]
- Move the Holistics AQL cheatsheet into a reference file and simplify BigQuery usage to call `bq` directly instead of a wrapper. [#5] [#11]
- Sync Amp settings and docs from the repo as the source of truth. [#39]

### Deprecated

### Removed

- Remove unused or retired skills, including context window notifier, caveman, holistics-query, sql-formatter, grill-me, grill-with-docs, and teach. [#12] [#17] [#27] [#36]
- Remove stale duplicated README maintenance sections after moving agent-facing instructions into `AGENTS.md`. [#41] [#47]

### Fixed

- Fix Holistics query guidance for documentation links, pooling, dataset IDs, and optional SQL generation. [#2] [#3]
- Fix remote skill sync edge cases around YAML frontmatter, `PERSONAL.md` change detection, order-independent parsing, portable hashing, and generated frontmatter delimiters. [#9] [#25]
- Fix transient Logseq worker wait failures by retrying `thread.messages` timeouts until the worker timeout expires. [#51]

### Security
