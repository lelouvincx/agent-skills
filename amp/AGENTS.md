# Personal Context

- My name is Chinh, or lelouvincx

## Working style

- Prefer concise and clear communication, but don't be too brief to the point of being vague
- When planning/devising plan, tell what to do from your side and my side, and what the expected output is

## Holistics

- When in a directory that has at least one `.aml` file, always activate the `develop-amql` and `search-docs` skill
- Holistics returns max 1000 rows of data

## SQL

- Preferred SQL style guide: to use lower case, to use leading comma for everything, and to write join and on the same line

## Amp plugins

- For Amp plugin work, treat `docs/tools/*.md` as the source of truth over `plugins/*.ts`
- Every plugin code change must originate from a docs change first: update the relevant capability document and metadata, then make the plugin implementation match it
- If plugin docs and code disagree, do not silently follow the code; update the docs first, or ask for confirmation when changing the documented contract would be material
- Keep new capability docs aligned with `docs/tools/_schema.md` before changing or adding plugin code

## Agent-skills repository maintenance

- Treat `agent-skills` as the source of truth for reusable skills, Amp plugins, Amp capability docs, and the project registry.
- Treat `~/.config/amp` as the runtime projection. Do not edit projected files there when the change belongs in `agent-skills`.
- After changing version-controlled Amp runtime artifacts, run `./sync-skills.sh` to project them into `~/.config/amp`.
- Runtime projection paths:
  - `amp/AGENTS.md` -> `~/.config/amp/AGENTS.md`
  - `amp/plugins/` -> `~/.config/amp/plugins/`
  - `amp/docs/tools/` -> `~/.config/amp/docs/tools/`
  - `projects.yaml` and `PROJECTS.md` -> `~/.config/amp/`
- Use `AMP_CONFIG_DIR=/path/to/amp-config ./sync-skills.sh` to test against a temporary Amp config directory.
- For local skills, create `skills/<name>/SKILL.md` with YAML frontmatter, then run `./sync-skills.sh`.
- For remote skills, add the skill to `remote-skills.yaml`, optionally add `skills/<name>/PERSONAL.md`, add generated payloads to `.gitignore`, then run `./sync-skills.sh --remote`.
- Remote skill generated files usually include `skills/<name>/SKILL.md`, `skills/<name>/.remote-source`, and remote companion directories. Commit the registry entry and intentional local overlays, not the fetched payload.
- Some remote skills depend on shared generated references. For example, Holistics AMQL skills fetch `references/` from `github.com/holistics/skills`; treat that directory as generated runtime support.
- To remove a local skill, delete `skills/<name>/`.
- To remove a remote skill, remove it from `remote-skills.yaml`, delete its directory, remove related `.gitignore` entries, then run `./sync-skills.sh --remote`.
- For the project registry, use `projects.yaml` as the source of truth and `bin/project-resolve` as the executable interface for humans, agents, and scripts.
- Prefer `bin/project-resolve <spoken-name> --json` when agents need to resolve project names.
- Set `AGENTS_REGISTRY_ENV` to force an environment such as `local`, `amp-orb`, or `vps`; otherwise the resolver auto-detects where possible.
- Set `AGENTS_REGISTRY_WORKSPACE_ROOT` when a host uses a different workspace root than the registry default.

## Linear

- I work mostly in these projects: data (DAT), presales (PS), and docs (DOC)
- The most used command is reading linear issues, you need to prioritize this

## Notion

- When writing any content in notion, prefer writing it as a subpage
- Do not write to notion unless I explicit ask you in the prompt

## Secrets and local env files

- For any AI-agent-related action, local `.env` / `*.env` / credential files must store 1Password secret references (`op://...`) only, not plaintext secrets.
- Do not `cat`, echo, paste, or summarize plaintext secret values from local env/credential files. If inspection is needed, report variable names and whether values are `op://`, empty, or plaintext — never the value.
- When a command needs secrets, resolve them at execution time with 1Password, preferably `op run --env-file <file> -- <command>` or a repo/helper loader that reads `op://` references without printing resolved values.
- When creating or editing env files, write `KEY=op://<vault>/<item>/<field>` references only. Ask me to create/copy the 1Password item/reference if the correct path is unknown.
- Treat exported secret-looking environment variables (`*TOKEN*`, `*KEY*`, `*SECRET*`, `*PASSWORD*`, `*CREDENTIAL*`, `*AUTH*`) as runtime-only; do not forward them to subagents unless injected through an explicit 1Password-backed env file.

## Version control

- When committing code, write clear and concise commit messages, don't write too long
- When creating pull request, GitHub token references are stored at `~/.credentials/github.env` as 1Password `op://...` references only; do not store or read plaintext tokens from local `.env` files:
  - Resolve with 1Password at execution time, e.g. `op run --env-file ~/.credentials/github.env -- sh -c 'GH_TOKEN="$GH_TOKEN_BOT" gh pr ...'`, or use a repo/helper loader that resolves `op://` values without printing them
  - If the user explicitly requests the bot token, resolve `GH_TOKEN_BOT` and pass it only in the command environment (`GH_TOKEN=$GH_TOKEN_BOT gh pr ...`); never echo it
  - If the user explicitly requests the work token, resolve `GH_TOKEN_WORK`
  - Otherwise, if in holistics-related projects, use `chinh-dm-holistics`, if personal, use `lelouvincx`
- Looking for pull request template and use it

## Presales

- Holistics offer calls with prospects/customers to evaluate the product better. I prepare for calls
- When writing internal team updates (Slack/Notion posts), default to prose with minimal section labels ("Updates:" / "Next:"). 3-5 sentences max. Drop context the audience already has (attendees, agenda recap). Credit teammates by @mention. Owner-only next steps, not granular checklists. Match the platform's native format, not markdown doc structure.
