---
name: syncing-holistics-external-git
description: Bootstraps local sync for a new, empty external Git repository connected to a Holistics project by creating the branch selected in Holistics and its empty root commit before the first `holistics sync-code .`.
---

# Set up Holistics external Git sync

## Inputs

- `<external-git-link>`: URL configured for the Holistics project's empty external Git repository
- `<directory-name>`: path for a new local directory that does not exist
- `<branch-name>`: exact branch currently selected in Holistics
- `<region>`: Holistics server region or custom domain confirmed by the user

## Workflow

1. Authenticate to the confirmed Holistics server:

   ```bash
   holistics auth "<region>"
   holistics auth --status
   ```

   Complete when `holistics auth --status` exits successfully and reports the expected server.

2. Create the local repository directly on the branch selected in Holistics, configure its remote, and add the empty root commit:

   ```bash
   mkdir "<directory-name>" &&
   cd "<directory-name>" &&
   git init --initial-branch="<branch-name>" &&
   git remote add origin "<external-git-link>" &&
   git commit --allow-empty -m "Initial empty commit"
   ```

   Complete when `origin` resolves to `<external-git-link>`, the current branch is `<branch-name>`, `HEAD` is the repository's only commit, that commit contains no files, and the working tree is empty.

3. From the repository root, start continuous synchronization:

   ```bash
   holistics sync-code .
   ```

   Complete when the CLI reports `Sync active. Watching for changes...` after initial reconciliation and the expected Holistics project files are present. Leave the process running while synchronization is needed.
