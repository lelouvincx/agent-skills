# Personal Context

- My name is Chinh, or lelouvincx

## Working style

- When Chinh's response shows that an explanation did not land, load `technical-precision`.
- For plans, separate the actions for the agent and Chinh, then state the expected outcome.
- Before drafting text that Chinh will send to someone else, including Slack messages and emails, load `govuk-style`.
- Store screenshots, recordings, and other visual artifacts under `.amp/in/artifacts/`.
- When Chinh asks to create an Amp runner for a directory path, run `amp-runner install --workdir <path> macbook.<directory-basename>` and verify it is running with `amp-runner status macbook.<directory-basename>`.

## Delegation

- Before non-trivial work, consider whether it contains independent, bounded workstreams. Keep simple reads, exact searches, localized edits, and unresolved product or design decisions in the parent.
- Before delegating or requesting hard expert review, load and follow `delegating-subagents`; it owns mechanism selection, brief contents, lifecycle, and completion handling.
- Treat `/subagent`, `|subagent`, `btw`, and `|btw` according to the explicit-trigger rules in that skill.

## Conventions

- Before working with dbx, dbdiagram, dbdocs, or runsql, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/dbdiagram.md`.
- Before using `agent-browser`, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/agent-browser.md` and `{AMP_CONFIG_DIR:~/.config/amp}/conventions/agent-browser-lifecycle.md`.
- Before working with `.aml` files or interpreting Holistics query results, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/holistics.md`.
- Before Python tasks, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/python.md`.
- Before writing or editing SQL, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/sql.md`.
- Before changing Amp plugin documentation or code, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/amp-plugins.md`.
- Before searching, creating, or moving Linear issues, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/linear.md`.
- Before reading or writing Notion content, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/notion.md`.
- Before changing or operating Logseq report automation, its service-account authentication, or its bot repository allowlist, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/logseq-report-automation.md`.

## Secrets and local env files

- For any action, local `.env` / `*.env` / credential files must store 1Password secret references (`op://...`) only, not plaintext secrets.
- Do not `cat`, echo, paste, or summarize plaintext secret values from local env/credential files. If inspection is needed, report variable names and whether values are `op://`, empty, or plaintext — never the value.
- When a command needs secrets, resolve them at execution time with 1Password, preferably `op run --env-file <file> -- <command>` or a repo/helper loader that reads `op://` references without printing resolved values.
- Resolve `op://Agent Secrets/...` with `agent-secrets` when supported; otherwise pass `--account my.1password.com` to interactive `op` commands.
- When creating or editing env files, write `KEY=op://<vault>/<item>/<field>` references only. Ask me to create/copy the 1Password item/reference if the correct path is unknown.
- Treat exported secret-looking environment variables (`*TOKEN*`, `*KEY*`, `*SECRET*`, `*PASSWORD*`, `*CREDENTIAL*`, `*AUTH*`) as runtime-only; do not forward them to subagents unless injected through an explicit 1Password-backed env file.

## Version control

- Use the current working tree by default. Create a Git worktree only when Chinh explicitly asks for one. When requested, create it under `<repository-root>/.amp/worktrees/`, where `<repository-root>` is the output of `git rev-parse --show-toplevel`, and verify that `git worktree list --porcelain` reports it there before use.
- Before opening a pull request, find and use the repository's pull request template.
- For GitHub authentication:
  - Use `GH_TOKEN_BOT` when the user explicitly requests the bot token.
  - Use `GH_TOKEN_WORK` when the user explicitly requests the work token.
  - Otherwise, use the `chinh-dm-holistics` GitHub profile for Holistics repositories and the `lelouvincx` GitHub profile for personal repositories.
  - Resolve token references at execution time from `~/.credentials/github.env`; pass tokens only through the command environment.
- After opening a pull request and after each later commit, check its GitHub Actions runs asynchronously. Fix failures and repeat until every run passes.

## Project registry

- Resolve spoken project names, paths, and repositories with `project-resolve <spoken-name> --json`; do not guess them.
