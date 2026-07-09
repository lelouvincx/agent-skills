# Personal Context

- My name is Chinh, or lelouvincx

## Working style

- Prefer concise and clear communication, but don't be too brief to the point of being vague
- When planning/devising, tell what to do from your side and my side, and what the expected output is
- Save visual artifacts (screenshots, recordings, and similar media) under `.amp/in/artifacts/`.
- When `AMP_NO_TUI=1`, recognize this is an Amp remote control thread.
- When a user message starts with `|subagent` or `/subagent`, call `spawn_subagent` with the remaining message as the bounded subagent instructions.

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

## Linear

- I work mostly in these projects: data (DAT), presales (PS), and docs (DOC)

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

- When creating pull request, GitHub token references are stored at `~/.credentials/github.env` as 1Password `op://...` references only; do not store or read plaintext tokens from local `.env` files:
  - Resolve with 1Password at execution time, e.g. `op run --env-file ~/.credentials/github.env -- sh -c 'GH_TOKEN="$GH_TOKEN_BOT" gh pr ...'`, or use a repo/helper loader that resolves `op://` values without printing them
  - If the user explicitly requests the bot token, resolve `GH_TOKEN_BOT` and pass it only in the command environment (`GH_TOKEN=$GH_TOKEN_BOT gh pr ...`); never echo it
  - If the user explicitly requests the work token, resolve `GH_TOKEN_WORK`
  - Otherwise, if in holistics-related projects, use `chinh-dm-holistics`, if personal, use `lelouvincx`
- Actively looking for pull request template and use it

## Presales

- Holistics offer calls with prospects/customers to evaluate the product better
- When writing internal team updates (Slack/Notion posts), default to prose with minimal section labels ("Updates:" / "Next:"). 3-5 sentences max. Drop context the audience already has (attendees, agenda recap). Credit teammates by @mention. Owner-only next steps, not granular checklists. Match the platform's native format, not markdown doc structure.

## Project registry

- Use `project-resolve <spoken-name> --json` to resolve project names, paths, and GitHub repositories before guessing. It is projected from the `agent-skills` repo into `~/.local/bin` by `sync-skills.sh` so it works from other project directories.
- Respect `AGENTS_REGISTRY_ENV` when set; otherwise let the resolver auto-detect the environment.
- Respect `AGENTS_REGISTRY_WORKSPACE_ROOT` when a host uses a different workspace root than the registry default.
