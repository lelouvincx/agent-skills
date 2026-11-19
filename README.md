# agent-skills

Chinh's (@lelouvincx) agent skills, Amp plugins and helper scripts, kept in one place and installed on every machine with one command.

Use this repository to:

- install the same skills and Amp setup on a new machine
- find the source of a skill or Amp capability
- resolve spoken project names, such as `logseq` or `dbt`, to local paths and GitHub repositories

## Get started

```bash
git clone <repo-url>
cd agent-skills
./sync-skills.sh --remote
./sync-skills.sh
```

This installs:

- Amp runtime files into `~/.config/amp`
- skills into `~/.agents/skills` and `~/.claude/skills`
- helper scripts from `bin/` into `~/.local/bin`

After you edit anything here, run `./sync-skills.sh` again. Never edit the installed copies directly.

[Setup and sync](docs/setup.md) explains Claude, Cursor, development orbs, browser automation and background Amp runners.

## How it fits together

```diagram
╭──────────────╮   asks for a change   ╭────────╮   follows   ╭───────────╮
│ Chinh        │──────────────────────▶│ Agents │────────────▶│ AGENTS.md │
╰──────────────╯                       ╰───┬────╯             ╰───────────╯
                                           │ edits the source
                                           ▼
╭─────────────────────────────────────────────────────────╮
│ this repository (source of truth)                       │
│  skills/          agent skills                          │
│  remote-skills.yaml  skills fetched from upstream       │
│  amp/             Amp guidance, plugins and docs        │
│  bin/             helper scripts                        │
╰──────────────────────────┬──────────────────────────────╯
                           │ ./sync-skills.sh
                           ▼
╭─────────────────────────────────────────────────────────╮
│ ~/.config/amp, ~/.agents/skills, ~/.claude/skills,      │
│ ~/.local/bin   (used by future agent sessions)          │
╰─────────────────────────────────────────────────────────╯
```

## Find a skill

[Skills](docs/skills.md) lists every skill, grouped by purpose:

- writing and documents
- planning and development practice
- agent workflow and delivery
- Holistics and data
- design, visuals and frontend
- automation and integrations

## Resolve a project name

`projects.yaml` maps short project names to local paths and GitHub repositories:

```bash
project-resolve logseq --path
project-resolve "log this to logseq" --github
project-resolve dbt --json
```

[PROJECTS.md](PROJECTS.md) lists every registered project.

## More guides

| Guide | Read it to |
| --- | --- |
| [Setup and sync](docs/setup.md) | see what sync installs and set up Claude, Cursor, orbs and runners |
| [Skills](docs/skills.md) | find a skill and improve one with skill tests |
| [Amp capabilities](docs/amp-capabilities.md) | find local Amp plugins, CLIs, modes and MCP launchers |
| [Secrets and bot publishing](docs/secrets-and-publishing.md) | run commands with 1Password-backed secrets and publish as `lelouvincx-bot` |
| [Validation](docs/validation.md) | run pre-commit checks and debug a failed one |
