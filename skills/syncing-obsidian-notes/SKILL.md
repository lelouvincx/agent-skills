---
name: syncing-obsidian-notes
description: "Reads and writes Chinh's second-brain notes (journals, backlog, pages) through Obsidian Sync. Use when a thread, local or in an orb, needs context from the notes or should record an update, finding, or task back into them."
---

# Syncing Obsidian Notes

The notes are one Markdown vault, `second-brain-logseq`, synced by Obsidian Sync. The Obsidian app on the Mac and every orb read and write the same files.

## 1. Locate the vault

- **Orb** (`AMP_ORB=1`): run `scripts/notes-sync`. The vault lands in `~/notes`. The first run downloads every file and takes about 2 minutes, so keep polling the command until it exits; later runs take seconds. It prints one result line and writes per-file detail to `~/.cache/notes-sync.log`.
- **Mac** (local thread): the Obsidian app owns sync. Work directly in the path from `project-resolve logseq --path`. Leave `ob` unused there, because two sync clients on one device conflict.

`scripts/notes-sync` reads the personal Amp secrets `OBSIDIAN_AUTH_TOKEN` and `OBSIDIAN_VAULT_PASSWORD`. Keep both out of output and files. If either is missing, stop and tell Chinh which one.

## 2. Read

Start from the index pages listed in `pages/Canonical Pages.md`: `pages/Projects.md` maps `project::` values, `pages/Backlog.md` holds active tasks, and `pages/Backlog___Done.md` holds finished ones. Task state is the block's leading marker (`TODO`, `DOING`, `WAITING`, `DONE`, `CANCELLED`). Journals are `journals/YYYY_MM_DD.md`. `rg` over the vault is the fastest search.

## 3. Write

Keep every write small and append-only, then sync immediately (orb: run `scripts/notes-sync` again). Sync merges concurrent edits per file; a short edit window keeps merges clean.

- **Today's journal** is `journals/$(TZ=Asia/Ho_Chi_Minh date +%Y_%m_%d).md`. Orbs run in UTC, so always derive the date in Chinh's timezone. When the file is missing, copy `templates/Daily Journal.md` to that path unchanged.
- **Section headings** are top-level lines ending in `### Notes`, `### Tasks`, `### Partly today`, and `### Done`. The first one may lack the leading `- ` (Logseq writes `### Notes` on line 1), so match on the heading text.
- **Record an update** as one tab-indented bullet appended after the last existing child of `### Notes`, ending with the full thread URL:

  ```markdown
  	- Found the D1 mirror drops FTS rows on full replace; fix in PR #12. https://ampcode.com/threads/T-...
  ```

- **Record a task** the same way under `### Tasks`, taking the project name from `pages/Projects.md` and the priority from `pages/Priority Rules.md`:

  ```markdown
  	- TODO Check failed dbt tests and file Linear issues
  	  project:: [[Internal]]
  	  priority:: #P2
  ```

- Format is Logseq Markdown: tab-indented bullets for hierarchy, `key:: value` properties, `[[Page]]` links. Leave existing blocks, `id::` lines, and `((uuid))` references exactly as they are.
- Write into `journals/` and `pages/` only. Leave `logseq/`, `automation/`, and generated `Weekly Report -`, `Weekly Planning -`, `1-on-1 Report -`, and `1-on-1 Planning -` pages to their owners.
- Keep attachments under 5 MB; Sync skips larger files.

The step is done when the sync after your edit prints its "in sync" line (orb) and you have told the user which file and heading you changed.
