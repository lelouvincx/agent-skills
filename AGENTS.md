# Repository instructions

## Maintenance

- `amp/AGENTS.md` is the global AGENTS.md
- When Chinh supplies a directory path for a new Amp runner, follow `amp/docs/tools/amp-runner.md` and name it `macbook.<directory-basename>`.
- Use conventional branches and conventional commits.
- Publish repository maintenance as `lelouvincx-bot` through the `logseq-weekly-report` 1Password service account. Resolve the `logseq` project with `project-resolve`, read its RFC-0010, set `LOGSEQ_REPORT_AUTH=service-account`, and use its repository helpers to resolve `GH_TOKEN_BOT` without printing it.
- Use the hardened bot SSH identity for commits and pushes, and the service-account-resolved bot PAT for pull requests and other GitHub API writes. If those local service-account artifacts are unavailable, stop and ask Chinh rather than falling back to a personal identity.
- After opening a pull request, add a separate commit that adds the PR number to the changelog entry.
- Find historical changes in `CHANGELOG.md` before searching Git or pull request history.
- Treat this repository as the source of truth; `~/.config/amp` is a runtime projection and must not be edited in place.
- After changing projected artifacts, run `./sync-skills.sh`. Use `./sync-skills.sh --remote` when remote skill payloads must be fetched.
- Test projection without writing to live runtime paths: `tmp_home="$(mktemp -d)"; HOME="$tmp_home" AMP_CONFIG_DIR="$tmp_home/.config/amp" ./sync-skills.sh`.

## Root-owned files

- `projects.yaml` is the project-registry source of truth; regenerate `PROJECTS.md` with `project-resolve --generate-md > PROJECTS.md`.
- Use `project-resolve <spoken-name> --json` rather than guessing project paths or repositories.
- When curating `projects.yaml`, inspect `zoxide query --list --score`; keep durable, specific project roots and omit generated directories or generic workspace parents.
- Respect `AGENTS_REGISTRY_ENV` and `AGENTS_REGISTRY_WORKSPACE_ROOT` when resolving projects.
- Before changing the project-registry schema or resolver behavior, read `bin/AGENTS.md`.
- For a remote skill, update `remote-skills.yaml`, optionally add `skills/<name>/PERSONAL.md`, ignore fetched payloads, then run `./sync-skills.sh --remote`.
- Commit the registry entry and intentional overlays, not fetched `SKILL.md`, `.remote-source`, companion directories, or shared references.
- To remove a remote skill, remove its registry entry, directory, and `.gitignore` entries, then run `./sync-skills.sh --remote`.

Other directory-specific instructions are loaded on demand from nested `AGENTS.md` files.
