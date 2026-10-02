# Personal Context

- My name is Chinh, or lelouvincx

## Working style

- When Chinh's response shows that an explanation did not land, load `clear-writing` and use its technical explanation mode.
- For plans, separate the actions for the agent and Chinh, then state the expected outcome.
- Before drafting text that Chinh will send to someone else, including Slack messages and emails, load `clear-writing`.
- Store screenshots, recordings, and other visual artifacts under `.amp/in/artifacts/`.
- When creating a subdirectory under `.amp/in/artifacts/`, add a `.thread-metadata` file in that subdirectory containing the current Amp thread ID.
- When Chinh asks to create an Amp runner for a directory path, run `amp-runner install --workdir <path> macbook.<directory-basename>` and verify it is running with `amp-runner status macbook.<directory-basename>`.

## Decisions

This section is Chinh's standing request to ask decision questions with `ask_user_choice`. Skills with their own question workflow, such as `grilling`, take precedence.

- Ask Chinh about each judgement call before acting on it. A judgement call has at least 2 viable options, evidence cannot settle it, and it depends on Chinh's preferences, product direction or taste, or is expensive to reverse, such as a public interface, data schema, scope change, deletion or anything visible to others.
- Settle facts yourself from code, docs, tests and tools. Decide yourself when evidence, convention or an existing instruction settles the choice, or when reversing it is cheap.
- Collect judgement calls before implementation and ask the 3 with the highest impact. Decide the rest yourself.
- For each question, put the decision, why it matters and your recommendation in `question`. Pass 2 to 5 concrete `options` with the recommended option first, and set `allowOther` to `true`.
- Chinh can set the ask level for a thread: `ask: low` means ask only about irreversible or externally visible choices; `ask: high` means ask every judgement call with no cap.
- End each task that changed something with a "Decisions I made" list. It is complete when every judgement call you settled alone appears with its choice and a one-line reason.
- When Chinh says a question was unnecessary or a decision should have been asked, add an observation to `amp/docs/experiments/experiment-0001-decision-balance.md` in the `agent-skills` repository.

## Delegation

- Before non-trivial work, consider whether it contains independent, bounded workstreams. Keep simple reads, exact searches, localized edits, and unresolved product or design decisions in the parent.
- Delegation, expert consultation, `/subagent`, `|subagent`, `btw` or `|btw`: load `delegating-subagents` before acting; it routes the work and discloses handoff rules.

## Conventions

- Before working with dbx, dbdiagram, dbdocs, or runsql, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/dbdiagram.md`.
- Browser automation, browser testing or workflow timing: read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/agent-browser.md` before acting.
- Before any Cloudflare task, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/cloudflare.md`.
- Before working with `.aml` files or interpreting Holistics query results, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/holistics.md`.
- Before Python tasks, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/python.md`.
- Before writing or editing SQL, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/sql.md`.
- Before changing Amp plugin documentation or code, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/amp-plugins.md`.
- Before searching, creating, or moving Linear issues, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/linear.md`.
- Before reading or writing Notion content, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/notion.md`.
- Before changing or operating Logseq report automation, its service-account authentication, or its bot repository allowlist, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/logseq-report-automation.md`.
- Before bot-owned repository maintenance such as bot commits, pushes, pull requests, changelog updates or check polling, read `{AMP_CONFIG_DIR:~/.config/amp}/conventions/bot-repository-maintenance.md`.

## Secrets and local env files

- For any action, local `.env` / `*.env` / credential files must store 1Password secret references (`op://...`) only, not plaintext secrets.
- Do not `cat`, echo, paste, or summarize plaintext secret values from local env/credential files. If inspection is needed, report variable names and whether values are `op://`, empty, or plaintext — never the value.
- When a command needs secrets, resolve them at execution time with 1Password, preferably `op run --env-file <file> -- <command>` or a repo/helper loader that reads `op://` references without printing resolved values.
- Resolve `op://Agent Secrets/...` with `agent-secrets` when supported; otherwise pass `--account my.1password.com` to interactive `op` commands.
- Use 1Password as the default vault. Exception: `readai` stores its OAuth credential in macOS Keychain, not 1Password.
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
- When adding or updating a project in the root `projects.yaml` of the `agent-skills` repository, create its Amp project if none exists: run `amp projects create <github>` when `github` is non-null, or `amp projects create --amp-hosted --name <project-key>` when `github` is null.
