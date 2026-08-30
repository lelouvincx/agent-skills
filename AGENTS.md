# Repository instructions

## Authorship and delivery

- Use conventional branch names and conventional commits.
- Publish repository maintenance as `lelouvincx-bot`. Use the hardened bot SSH identity for commits and pushes and only an approved service-account-backed publisher for pull requests and other GitHub writes.
- Never expose bot publisher credentials to an agent shell or fall back to a personal identity. If the approved bot path is unavailable, stop and ask Chinh.
- Add a `CHANGELOG.md` entry for every pull request. After opening the pull request, add its number and link in a separate commit.
- Check `CHANGELOG.md` before searching Git or pull-request history for a historical change.

## Source and projection

- This repository is the source of truth. Never edit its projection under `~/.config/amp` in place.
- To change globally projected agent instructions, edit `amp/AGENTS.md`.
- After changing projected artifacts, run `./sync-skills.sh`. Use `./sync-skills.sh --remote` only when remote payloads must be fetched.
- Verify projection without writing to live runtime paths:

  ```bash
  tmp_home="$(mktemp -d)"
  HOME="$tmp_home" AMP_CONFIG_DIR="$tmp_home/.config/amp" ./sync-skills.sh
  ```

## Project registry

- `projects.yaml` is the registry source of truth. Regenerate `PROJECTS.md` with `project-resolve --generate-md > PROJECTS.md`.
- When curating registry entries, inspect `zoxide query --list --score`; keep durable, specific roots and omit generated directories and generic workspace parents.
- Before changing registry schema or resolver behavior, read `bin/AGENTS.md`.

## Completion

- Run every check in the README Validation table that covers the changed paths.
- Run the applicable projection command after source changes and confirm that generated artifacts contain only intentional changes.
