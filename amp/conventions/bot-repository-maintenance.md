# Bot repository maintenance conventions

- Use `agent-bot-pr` for bot commits, pushes, pull request operations, changelog insertion and check polling in repositories approved for `lelouvincx-bot`.
- Treat `agent-skills/amp/agent-secrets/github-identities.json` as the source of truth for the approved repository set. Update that policy when bot repository scope changes.
- Run `agent-bot-pr` from the repository being maintained. The helper operates on the current Git repository and loads the shared bot contract from the `agent-skills` checkout.
- Keep branch names and commit messages conventional.
- Keep the repository's own `AGENTS.md`, pull request template, changelog policy and validation policy authoritative for repository-specific steps.
- If `agent-bot-pr` cannot find the shared `agent-skills` checkout or the approved bot path fails, stop and ask Chinh. Do not rebuild the bot path by hand or fall back to a personal identity.
