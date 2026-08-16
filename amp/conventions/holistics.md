# Holistics conventions

- Before reading, creating, or editing `.aml` files, load `develop-amql` and `search-docs`.
- Treat Holistics query results as capped at 1,000 rows. Do not assume a 1,000-row result is complete unless the query guarantees at most 1,000 rows.

## Code sync

- `holistics sync-code` synchronizes the entire repository in both directions.
- `.gitignore` does not limit its scope. Ignored local files can be uploaded, and cloud edits or deletions can be applied locally.
- Before starting, inspect local files—including ignored files—and move or back up unrelated files outside the synced repository.
- Code sync skips files larger than 5 MiB.
- Diverged non-UTF-8 files, such as images and PDFs, fail automatic merge and remain local; reconcile each reported failure manually.
- Leave the process running through transient timeout and connection errors so it can recover automatically. Treat a failed session refresh as terminal.
- When cloud and local changes conflict, stop code sync, resolve the conflict locally, then restart code sync.
- After stopping sync, inspect `git status` and `git diff`, confirm the end of the session’s `sync.log` shows the expected final events and stop, and verify `state.json` reports `dirty_count: 0`, `conflicts: []`, and `last_error: null`.
