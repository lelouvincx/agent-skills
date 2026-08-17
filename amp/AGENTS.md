# Personal Context

- My name is Chinh, or lelouvincx

## Working style

- When Chinh's response shows that an explanation did not land, load `explaining-technical-concepts`.
- For plans, separate the actions for the agent and Chinh, then state the expected outcome.
- Before drafting text that Chinh will send to someone else, including Slack messages and emails, load `govuk-style`.
- Store screenshots, recordings, and other visual artifacts under `.amp/in/artifacts/`.

## Delegation

- Before starting non-trivial work, consider whether it contains independent, bounded workstreams that can run concurrently, but do not delegate simple reads, searches, localized edits, or unresolved product or design decisions. The parent remains responsible for synthesis, integration, and final verification.
- Load `delegating-subagents` before delegating and when hard review or expert judgment could use default Oracle or an Ultra child. The skill selects the reviewer and child-thread mechanism separately.
- Every delegated task needs a bounded brief with scope, constraints and non-goals, success criteria, validation, and a completion contract. Require a done report with evidence or a blocked report naming the smallest parent input needed. The parent verifies the result and closes any gap directly or through a focused follow-up.
- Ask the user when a blocked subagent or the parent needs input only the user can provide. Subagents must report the required input rather than guess.
- When a user message starts with `|subagent` or `/subagent`, call `spawn_subagent` with the remaining message as the bounded subagent instructions.
- Treat side questions introduced with `btw` or triggered with `|btw` as delegation requests so they do not displace the parent's current task. Load the `delegating-subagents` skill to choose the mechanism.

## Conventions

- Before using `agent-browser`, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/agent-browser.md`.
- Before working with `.aml` files or interpreting Holistics query results, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/holistics.md`.
- Before writing or editing SQL, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/sql.md`.
- Before changing Amp plugin documentation or code, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/amp-plugins.md`.
- Before searching, creating, or moving Linear issues, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/linear.md`.
- Before reading or writing Notion content, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/notion.md`.
- Before changing or operating Logseq report automation, its service-account authentication, or its bot repository allowlist, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/logseq-report-automation.md`.

## Secrets and local env files

- For any action, local `.env` / `*.env` / credential files must store 1Password secret references (`op://...`) only, not plaintext secrets.
- Do not `cat`, echo, paste, or summarize plaintext secret values from local env/credential files. If inspection is needed, report variable names and whether values are `op://`, empty, or plaintext — never the value.
- When a command needs secrets, resolve them at execution time with 1Password, preferably `op run --env-file <file> -- <command>` or a repo/helper loader that reads `op://` references without printing resolved values.
- When creating or editing env files, write `KEY=op://<vault>/<item>/<field>` references only. Ask me to create/copy the 1Password item/reference if the correct path is unknown.
- Treat exported secret-looking environment variables (`*TOKEN*`, `*KEY*`, `*SECRET*`, `*PASSWORD*`, `*CREDENTIAL*`, `*AUTH*`) as runtime-only; do not forward them to subagents unless injected through an explicit 1Password-backed env file.

## Version control

- Create worktrees under `<repository-root>/.amp/worktrees/`, where `<repository-root>` is the output of `git rev-parse --show-toplevel`. Before using a new worktree, verify that `git worktree list --porcelain` reports it under that directory.
- Before opening a pull request, find and use the repository's pull request template.
- For GitHub authentication:
  - Use `GH_TOKEN_BOT` when the user explicitly requests the bot token.
  - Use `GH_TOKEN_WORK` when the user explicitly requests the work token.
  - Otherwise, use the `chinh-dm-holistics` GitHub profile for Holistics repositories and the `lelouvincx` GitHub profile for personal repositories.
  - Resolve token references at execution time from `~/.credentials/github.env`; pass tokens only through the command environment.
- After opening a pull request and after each later commit, check its GitHub Actions runs asynchronously. Fix failures and repeat until every run passes.

## Project registry

- Use `project-resolve <spoken-name> --json` to resolve project names, paths, and GitHub repositories before guessing. It is projected from the `agent-skills` repo into `~/.local/bin` by `sync-skills.sh` so it works from other project directories.
- Respect `AGENTS_REGISTRY_ENV` when set; otherwise let the resolver auto-detect the environment.
- Respect `AGENTS_REGISTRY_WORKSPACE_ROOT` when a host uses a different workspace root than the registry default.
