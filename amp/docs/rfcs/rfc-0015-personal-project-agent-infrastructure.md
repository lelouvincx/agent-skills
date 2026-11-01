---
doc_schema: "amp-rfc/v1"
code: "RFC-0015"
title: "Personal project agent infrastructure"
slug: "personal-project-agent-infrastructure"
file: "rfc-0015-personal-project-agent-infrastructure.md"
status: "Accepted"
summary: "Centralize Orb agent infrastructure, project customizations, and personal Amp project configuration."
created: "2026-11-01"
updated: "2026-11-01"
amp_thread_id:
  T-01a19705-d7e6-724a-81d8-1d17cc98a738: "Define shared infrastructure, record cleanup, and begin phase-one discovery"
dependency: []
implementation: []
inputs:
  - "agent-skills source, consuming project customizations, and approved Amp project scope"
outputs:
  - "synced agent runtime and verified personal project settings"
supersedes: []
superseded_by: null
related:
  - path: "./rfc-0006-amp-orb-bootstrap-lifecycle.md"
    purpose: "Extends the earlier Orb lifecycle proposal with explicit sync and project customizations."
  - path: "./rfc-0010-shared-local-agent-and-bot-secrets.md"
    purpose: "Preserve the approved credential boundary during publishing workflow replacement."
tags: [orbs, infrastructure, projects]
---

# RFC-0015: Personal project agent infrastructure

## Summary

Apply one configuration policy to selected Amp projects whose primary GitHub repository is owned by `lelouvincx`.
Use agent-skills and smartclass as the combined baseline. Share policy, not repository identity or application setup.

The shared infrastructure must support its own development Orb, consuming projects, an explicit sync command, and project-specific customizations.
Phase 1 is complete with an explicit backup waiver for 2 settings. Shared checkout safety and the SmartClass consumer lifecycle have shipped; live settings updates have not started.

## Context

The current bootstrap refreshes infrastructure source and projects runtime artifacts through several partially duplicated entry points.
Project-level pre-setup scripts match, but repository setup and resume hooks differ. There is no settled common customization contract.
RFC-0006 proposed lifecycle-only entry points; this proposal adds explicit runtime sync. Resolve that earlier proposal when this RFC is accepted.
Local checkout cleanup is separate from GitHub repository ownership and Amp project configuration.

## Decision

- use a custom Ship prompt that opens a bot PR, waits for checks, merges, verifies the result, and cleans up; preserve repository-specific release gates
- use GitHub-connected mode for every selected project; block a project when GitHub access preflight fails
- let `shipping-personal-projects` own the readable publishing workflow and retain a hardened `agent-bot-pr` for bounded publishing operations; Chinh selected this over replacing the executable
- list all discovered repositories before deciding which projects to configure or create
- clean up the requested local checkouts using macOS Trash, including pending work where explicitly approved; leave GitHub repositories and Amp projects unchanged
- treat agent-skills as centralized agent infrastructure with an explicit runtime sync operation in its own Orb and every consuming project's Orb
- let consuming projects clone or refresh agent-skills and apply project-specific customizations after the shared baseline
- treat dotfiles as an ordinary consuming project for now; merging it with agent-skills is future work
- configure the 7 remaining existing Amp projects and create mappings for all 6 remaining unmapped repositories
- delete the Amp projects `lms-leitner-material` and `wwi-data-platform`, as separately approved during phase 1; preserve their GitHub repositories
- use the common custom Ship workflow for all 13 selected projects, as reconfirmed during settings review
- use empty additional-repository lists; provide second-brain access through the existing Obsidian Sync workflow, not another Git checkout
- proceed without backups of the old shipping configuration and additional-repository lists; Chinh accepts that their previous values cannot be restored from the captured exports
- honor an explicit infrastructure checkout override, otherwise reuse Amp's existing additional checkout or a sibling checkout before cloning the fallback
- stop SmartClass lifecycle execution when a required shared-runtime step fails; replace warning-and-continue behavior

## Contract

### Baseline evidence

Read on 1 November 2026 using `amp projects get <project> --json`:

| Setting | agent-skills | smartclass |
| --- | --- | --- |
| Primary repository | `https://github.com/lelouvincx/agent-skills` | `https://github.com/lelouvincx/smartclass` |
| Repository mode | `github` | `mapped` |
| Orb commit author | `thread-creator` | `thread-creator` |
| Base branch override | empty | empty |
| Remote URLs | primary HTTPS URL only | primary HTTPS URL only |
| Pre-clone script | empty | empty |
| Pre-setup script | canonical agent-skills dispatcher | identical dispatcher |
| Desktop resume script | empty | empty |
| Store listing | disabled | disabled |
| Store description | empty | empty |
| Gallery media | empty | empty |
| Orb size | `a1.small` | `a1.medium` |

The installed CLI's project JSON does not expose shipping settings or additional repositories.
Their old values are unverified, not assumed empty or default. Chinh waived recovery backups for those 2 fields; the approved replacement values do not depend on recovering them.

Both repositories document bot PR publishing and post-merge verification and cleanup.
Agent-skills requires `agent-bot-pr`; smartclass documents different credential paths, including an Orb exception.
Do not copy smartclass credential handling into every project as part of this settings change.

Sources:

- agent-skills: `AGENTS.md`, `.agents/pre-setup`, `.agents/setup`, and `amp/agent-secrets/github-identities.json`
- smartclass: `AGENTS.md`, `docs/release-management.md`, `.agents/setup`, and `.agents/bootstrap-agent-skills`
- installed CLI: `amp projects list/get/update/create --help` and project JSON
- settings contract: `manage_amp(topic="projects", operation="help")`
- GitHub inventory: `gh repo list lelouvincx --limit 1000`, authenticated as `lelouvincx`

### Target settings

These targets remain proposals unless explicitly selected above. Approve the complete settings diff before applying them.

| Area | Target policy | CLI mechanism |
| --- | --- | --- |
| Shipping | custom prompt following the contract below | `--ship-behavior custom --custom-ship-prompt-file <file>` |
| Git authorship | `thread-creator`, matching both baselines | `--commit-author thread-creator` |
| Base branch | no override; follow each GitHub repository's default branch | `--clear-base-branch` |
| Primary repository | canonical `https://github.com/lelouvincx/<repository>` with GitHub integration | `--repository-url <url> --repository-mode github` |
| Extra repositories | none by default; shared runtime comes from pre-setup, not an extra checkout | `--clear-additional-repositories` |
| Remote matching | retain primary HTTPS URL; add that repository's standard SSH URL | `--remote-url git@github.com:lelouvincx/<repository>.git` |
| Pre-clone script | empty, matching both baselines | `--pre-clone-script-file <empty-file>` |
| Pre-setup script | thin shared bootstrap implementing the environment contract below; revise the current dispatcher before rollout | `--pre-setup-script-file <approved-bootstrap-file>` |
| Desktop resume script | empty at project level, matching both baselines | `--desktop-resume-script-file <empty-file>` |
| Amp Store | unlisted; empty description and gallery | `--no-listed-on-amp-store --description ''`; gallery-media command |

Do not change project name, icon, orb size, ownership, virtual-executor settings, or unrelated project settings.
Do not change GitHub repository visibility. Amp Store listing and GitHub visibility are separate settings.

Remote aliases and extra repositories use replacement semantics. Record and review existing entries before removing them.
Do not assign another repository's aliases or URLs to a project.
Report custom SSH host aliases for review rather than guessing them.

The same base-branch policy does not mean the same literal branch name.
For example, `second-brain-logseq` currently uses `master`; both baseline repositories use `main`.

The Amp `thread-creator` setting does not specify a bot identity.
The publishing workflow must establish and verify bot author, committer, authentication, and signing independently.
Never treat this Amp setting as proof that a commit or PR was created by `lelouvincx-bot`.

### Ship prompt and publishing skill

Keep the full publishing procedure in `skills/shipping-personal-projects/SKILL.md`. The common custom Ship prompt lives beside it in `ship.txt` and loads the skill and the repository's release instructions.
Retain and harden `agent-bot-pr` as the publishing interface. Existing helper subcommands remain conveniences; the skill owns the shipping procedure and completion criteria.

The workflow must:

1. Check the current repository, intended base branch, requested work, applicable instructions, and unrelated local changes.
2. Verify that the bot is authorized for that exact repository. Project ownership does not expand the bot repository allowlist.
3. Verify the approved bot credential path and signing policy without exposing credential values or falling back to a personal identity.
4. Run repository-required checks and satisfy repository-specific release gates.
5. Use a conventional branch and commits, read the PR template, and open the PR as `lelouvincx-bot`.
6. Add the linked PR changelog entry after opening the PR when the repository requires that sequence.
7. Subscribe to exact-head CI and PR feedback. Fix relevant failures, then merge only when required checks and release gates pass.
8. Verify default-branch CI and any required deployment. Do not invent production probes or deployments for repositories without them.
9. Clean up only this thread's temporary resources. Preserve unrelated work and archive only when no requested work remains.

Do not generalize SmartClass-specific media, application routes, database steps, or deployments.
Explicit user restrictions such as "no merge" or "no deploy" take precedence over routine shipping.

A skill explains the workflow; it does not enforce credential isolation, authorization, or signing. Harden the existing executable to bind repository authorization, authenticated bot identity, transport, commit identity and merge checks before activating the common prompt.
Preserve local SSH signing and unsigned Orb branch commits where the SSH key is unavailable. These are trusted-runtime guardrails, not isolation from another process with equivalent credential access or permission to modify trusted files.
Keep the existing secret resolver and its registered callers unchanged in this rollout; do not claim its generic GitHub CLI capability restricts arbitrary API operations.

### Environment contract

Agent-skills owns the shared infrastructure source and runtime projection logic.
Every Orb, including an agent-skills development Orb, must have a synced runtime and an explicit command to refresh it.
Separate obtaining source, projecting runtime files, and applying project customizations. Do not call all three operations an unspecified "sync".

Required flow:

1. Locate the infrastructure source. Consuming projects clone agent-skills when missing and safely refresh an existing clean checkout.
2. Project the selected agent-skills source into the Orb's agent runtime paths.
3. Apply the consuming project's customizations to the runtime, without modifying the shared infrastructure checkout.
4. Report the source revision, customization source, and whether any source refresh was skipped because of local work.

In an agent-skills development Orb, support projecting the current working checkout so changes can be tested before publication.
Never pull, reset, or replace that working checkout implicitly during runtime projection.
The agent-skills development interface is `.agents/sync`, forwarding arguments to `sync-skills.sh` without acquiring or refreshing source. An explicit `AGENT_SKILLS_DIR` selects an existing source, never a clone destination for this command.
Canonical setup and resume default to their own working checkout without pulling. Explicit consumer selections retain safe clean-only refresh; the dispatcher conveys primary-checkout no-refresh with `AGENT_SKILLS_NO_REFRESH=1`.
The SmartClass consumer interface is defined below.

Use one shared implementation, with thin lifecycle entry points in consuming projects.
Fresh setup, resume, and an explicit sync must leave project customizations applied after the shared baseline.
Define customization precedence, ownership, and removal behavior before implementing patches.
An explicit sync must report failure rather than claiming success after skipping a required step.

Preserve repository-specific application setup alongside this flow, including SmartClass's toolchain, dependencies, and local database setup.
Dotfiles follows the same consumer contract as SmartClass. Do not import dotfiles installation into the shared baseline or merge repositories in this work.

Do not duplicate the shared dispatcher as an additional repository requirement.
Do not embed credentials in scripts or settings. Preserve the approved environment-specific secret boundary.
Test a fresh Orb and a resumed Orb for both baseline repositories before applying the settings broadly.
Also test explicit resync after changing infrastructure source and project customizations.
Verify that repeated sync preserves customizations and unrelated runtime files, without accumulating obsolete project-managed files.

#### SmartClass consumer lifecycle

SmartClass's `.agents/setup`, `.agents/resume`, and `.agents/sync` run the shared baseline first, then invoke `.agents/project` with the matching stage.
The consumer bootstrap locates or clones source; canonical agent-skills hooks own refresh and projection.
The consumer must not pull and then call another hook that pulls again.
Explicit sync uses the shared resume hook and runs no SmartClass application installation, migration, or seed commands.

Source selection uses the first applicable candidate:

1. A nonempty `AGENT_SKILLS_DIR` override.
2. Amp's existing `/home/user/workspace/repos/agent-skills` additional checkout.
3. An existing sibling `agent-skills` beside the consuming checkout.
4. `/home/user/workspace/agent-skills`, cloned only when absent.

An invalid selected path is an error, not a reason to replace files or silently try another candidate.
Support normal checkouts and linked Git worktrees, and require the selected path to be the checkout root.
Canonical hooks pull only when tracked, staged, and untracked work is absent; dirty source remains usable without a pull.
Existing duplicate checkouts remain untouched. No additional-repository settings change is part of this source change.

SmartClass owns `.agents/project`. Its common section applies runtime customizations after each baseline projection; stage branches own app setup and resume seeding.
SmartClass currently needs no runtime patches. Its repository-local skills stay local.
Customizations must be idempotent, preserve unrelated runtime files, and fail explicitly.
Removing a baseline-file override restores baseline contents on the next projection. A removed customization must explicitly clean up files it alone created.
No automatic project-overlay garbage collection or callback-discovery framework is introduced.

#### Second-brain access

The installed `second-brain-log` plugin queues a parent-thread turn that delegates vault writes through Task.
In an Orb, its default vault is `~/notes`; it instructs the logging task to load `syncing-obsidian-notes` and sync before reading and after writing.
On the Mac, it uses the local `second-brain-logseq` vault synced by the Obsidian app.
It does not require an Amp additional-repository mapping or a Git clone of the notes repository.

Keep additional-repository lists empty for all selected projects.
Verify plugin and skill availability, the headless sync prerequisites, and required secret availability in the pilot Orbs without printing secret values.
Exercise the real sync path before claiming notes access works; source inspection alone is not an end-to-end check.
Do not write test notes or invoke the logging command just to test configuration without an approved logging task.
Leave `AMP_SECOND_BRAIN_DIR` and `NOTES_DIR` unset for the default path; if overriding them, ensure the plugin and sync client use the same vault directory.

This decision follows inspection of the installed plugin's `index.ts`, its command documentation, and the sync skill's `scripts/notes-sync`.
That script uses `obsidian-headless`, requires Node 22 or later when installing it, and initializes an Obsidian Sync vault rather than a Git checkout.
Live Orb sync and secret availability remain unverified during phase 1.

### Repository inventory

GitHub returned 66 repositories: 39 active originals, 20 active forks, and 7 archived repositories.
Nine active originals already have matching Amp projects. The other 30 active originals have no direct primary-repository match in the Amp inventory.
All names below belong to `lelouvincx`. Private repositories are marked.
This is the discovery-time remote inventory. Local cleanup does not remove these repositories from GitHub or their existing Amp mappings.

### Local cleanup outcome

The following checkouts were moved to macOS Trash. Their original paths were verified absent after the moves; Trash was not emptied.

| Original path relative to `~/Developer/` | Result |
| --- | --- |
| `contribute/mise` | moved after the audit found no pending work requiring retention |
| `contribute/claudecode.nvim` | moved with modified files after explicit approval |
| `contribute/notion-cli` | moved with its stash after explicit approval |
| `contribute/prefect` | moved with local configuration and history after explicit approval |
| `contribute/slackcli` | moved despite uncertain remote preservation after explicit approval |
| `ubunchuu/ubunchuu-truong-us.github.io` | moved with its stash after explicit approval; this is the separate `ubunchuu-truong-us`-owned repository |
| `second-brain-obsidian` | moved with local changes after explicit approval; remote is `lelouvincx/second-brain` |
| `tmp-python` | moved including 182 untracked files after explicit approval |
| `wwi-data-platform` | moved; existing Amp project was not removed |

No matching local checkout was found for `lms-leitner-material` in the searched locations.
Of the 24 active originals requested for cleanup, only `tmp-python` remained as a matching checkout at audit time; `second-brain-obsidian` had already been moved.
The other 22 were not found. All 24 requests are retained in the inventory below, not silently treated as GitHub deletions.
For the 20 forks, the audit found the 5 contribution checkouts listed above; the other 15 were not found.
No exact local clone of the 7 archived personal repositories was found; the separately owned Ubunchuu checkout was removed only after Chinh explicitly named its local path.

Searches used Git remote identity within bounded development and runtime locations. They were not exhaustive whole-disk scans.
Preserve installed tools and unrelated upstream copies, including the active `second-brain-logseq` vault, its linked worktree, and external Git storage.
The `second-brain` registry alias does not make `second-brain-logseq` a cleanup target.

### Approved rollout scope

After setting aside the local-cleanup requests, Chinh selected:

- 7 existing Amp mappings: agent-skills, dotfiles, duty-support, blog (`lelouvincx.github.io`), personal-finance, second-brain-logseq, and smartclass
- 6 active originals without a direct Amp mapping: agent-checkpoints, holistics-performance-review, nvim, self-taught-amql, self-taught-design, and self-taught-lsp

Chinh approved these 13 repositories during phase 1 and separately approved deletion of the 2 cleanup-requested Amp projects.
Creation of the 6 missing mappings belongs to the later apply phase, after settings and recovery prerequisites pass.
Do not create Amp projects for other cleanup-requested repositories, forks, or archived repositories without an explicit scope decision.

### Existing Amp projects: 9

| GitHub repository | Amp project | Visibility |
| --- | --- | --- |
| agent-skills | agent-skills | public |
| dotfiles | dotfiles | public |
| duty-support | duty-support | private |
| lelouvincx.github.io | blog | public |
| lms-leitner-material | lms-leitner-material | private |
| personal-finance | personal-finance | private |
| second-brain-logseq | second-brain-logseq | private |
| smartclass | smartclass | private |
| wwi-data-platform | wwi-data-platform | public |

### Other active originals: 30

- agent-checkpoints (private)
- airflow-astronomer-quickstart
- big-data-exercises
- Chinh-Dinh-training
- copy-constructor-demonstration
- CTDL-GT-_-Do-an-tuan-3-5
- de-zoomcamp-2024
- DSAImplementations
- exam-interview
- goodreads-elt-pipeline
- happy-valentine
- holistics-performance-review (private)
- lelouvincx
- lelouvincx-new-blog
- lelouvincx-pipeline (private)
- linear-programming-solver
- llamamba-coding
- mlops-mara23 (private)
- nvim
- proenvus
- second-brain (private)
- self-taught-amql (private)
- self-taught-design (private)
- self-taught-lsp (private)
- spotify-data-pipeline-ingestion
- sx-billing-assistant (private)
- test-vercel-deployment
- tmp-python (private)
- video-subtitle-merger
- zanle93.github.io

### Active forks without a direct Amp match: 20

- agent-browser
- blink.cmp
- blowfish
- claudecode.nvim
- custom-github-style
- dagster
- danswer
- docker-elk-nginx
- Fundamental-ML
- GDSCxSAB-cs101-git
- introduction-datascience-python-book
- kwin-effects-yet-another-magic-lamp
- maybe
- mise
- neocodeium
- notion-cli
- Notion-and-Google-Calendar-2-Way-Sync
- prefect
- py4ds-spark-data-platform
- slackcli

### Archived repositories without a direct Amp match: 7

- 2048
- citadels
- learning-git
- obsidian-vault (private)
- redmapleleaf
- test-mcp-delete-repo
- ubunchuu-truong-us.github.io

Do not infer personal GitHub ownership from the Amp namespace.
Exclude `holistics/*`, `lelouvincx-bot/*`, and Amp-hosted repositories unless Chinh separately expands scope.
For example, Amp project `lms-leitner-flashcards` points to `lelouvincx-bot/lms-leitner-material`, not the personal repository.
An Amp-hosted project named `prefect` is not a substitute for a direct mapping to `lelouvincx/prefect`.

## Behavior

Phase 1 is complete with the scoped backup waiver below. Shared checkout safety and the SmartClass consumer lifecycle from phase 3 have shipped at Chinh's request; the remaining infrastructure, publishing-skill migration and live settings rollout remain pending.
Keep the historical inventory above separate from the approved target list and current phase-one results below.

### Phase 1: Approve scope and capture current settings

Agent actions:

1. Refresh the GitHub and Amp inventories. Match by canonical repository identity, not project display name.
2. Present a selection list with existing project IDs, missing mappings, archive status, and bot authorization status.
3. Capture available settings. The explicit waiver below permits proceeding without the old shipping configuration and additional-repository lists; do not extend that waiver to other fields.
4. After scope approval, save private before-state snapshots and a per-project desired-state diff, including all fields the rollout could replace or clear.

Chinh actions:

- select repositories and approve any missing-project creation
- approve the proposed defaults and intentional removal of existing settings

Expected outcome: an approved target list and recoverable snapshots. No configuration updates occur in this phase; the separately approved project deletions are the only exception.

#### Phase-one findings: 1 November 2026

Scope approval and read-only inventory are complete. Settings capture is partial, and Chinh explicitly waived backups of the 2 missing fields, completing the phase-one recovery gate within that exception.
Private exports of both inventories and all 9 existing personal GitHub-backed project settings are under `.amp/in/rfc-0015-phase-1/` with owner-only access.
These exports are not complete restoration backups: shipping settings and additional repositories are absent from the supported CLI JSON.
No supported read path for those fields has been established from the available CLI help and project management tool contract.
Do not infer their old values or claim they can be restored. Set the approved new values during rollout: the common custom Ship workflow and empty additional-repository lists.
The waiver does not authorize unrelated settings changes, bypass publishing controls, or activate a Ship prompt before its skill exists.

All 13 selected repositories are active, non-fork repositories according to the refreshed GitHub inventory.
Repository metadata reads do not prove the Amp GitHub integration has access; that access check remains a rollout preflight.

| Repository | Existing Amp project ID | Current mode | Default branch | Local bot policy allows repository |
| --- | --- | --- | --- | --- |
| agent-skills | `cb46769a-7f2c-40d2-90e4-19e82f916b0d` | github | main | yes |
| dotfiles | `b53eb384-18f2-4862-933a-6754aa56417d` | github | main | yes |
| duty-support | `f12b5ef2-7ace-4dac-b3fb-cdf0ee3626bd` | mapped | main | no |
| lelouvincx.github.io (blog) | `f0c18cbd-8322-4e9a-bc7b-68c9b66ea8f7` | mapped | main | no |
| personal-finance | `4eb41c04-d1fb-4962-9f5d-e49492d8f58d` | github | main | no |
| second-brain-logseq | `092db102-f6d4-414f-9cac-48e262a8ed91` | github | master | yes |
| smartclass | `47074776-e8db-412e-b694-7619003809c5` | mapped | main | yes |
| agent-checkpoints | not created | not applicable | main | no |
| holistics-performance-review | not created | not applicable | main | no |
| nvim | not created | not applicable | main | yes |
| self-taught-amql | not created | not applicable | main | no |
| self-taught-design | not created | not applicable | main | no |
| self-taught-lsp | not created | not applicable | main | no |

Bot status above checks only `amp/agent-secrets/github-identities.json`; it does not prove effective GitHub permissions or credential availability.
Eight selected repositories are absent from that policy. Approval for configuration or project creation does not silently expand bot authorization.

Known desired-state differences for the 7 existing targets:

- switch duty-support, blog, and smartclass from mapped to GitHub-connected mode after access preflight
- add each repository's standard SSH alias; every target currently has its primary HTTPS URL only
- replace the shared pre-setup script after implementing the revised infrastructure contract; all 7 currently have identical 832-character script strings
- replace shipping and additional-repository settings with the approved targets; old values are unknown and their backup is explicitly waived
- leave matching settings unchanged: thread-creator author, no base-branch override, empty pre-clone and desktop-resume scripts, unlisted Store, empty descriptions and galleries
- preserve orb sizes and all other unmanaged settings

The 6 missing mappings are approved for later creation, not created in this phase.
The final apply payload remains pending implementation of the new bootstrap and Ship prompt, not the waived missing reads.

Chinh separately approved deletion of `lms-leitner-material` and `wwi-data-platform` Amp projects.
The CLI refused the first deletion because permanent project deletion must be performed by the owner, not an agent.
The second deletion was not attempted after that refusal. Chinh subsequently reported deleting both projects.
A fresh `amp projects list --json` confirmed both mappings are absent and the 7 selected existing personal mappings remain.
The deletion action is complete. The missing-settings backup blocker was subsequently resolved through Chinh's explicit waiver.
Their GitHub repositories remain outside the deletion request.

### Phase 2: Design and implement the publishing skill

Agent actions:

1. Read the skill-authoring guidance before creating skill files. Inspect the existing `agent-bot-pr` implementation, callers, secret policy, and repository release instructions.
2. Separate workflow orchestration from credential isolation, repository authorization, signing, and publisher identity checks. The approved choice is to retain and harden `agent-bot-pr`, not replace it.
3. Enforce the helper's repository, identity, transport and merge checks without exposing bot credentials to the parent shell. Preserve the approved resolver path and signing policy.
4. Implement `shipping-personal-projects` and its short custom Ship prompt. Keep repository-specific release instructions authoritative.
5. Update affected guidance and callers together: root `AGENTS.md`, `amp/AGENTS.md`, the bot-maintenance convention, and selected repositories' publishing instructions where required.
6. Remove conflicting duplicated procedures once the skill and hardened helper pass validation. Do not introduce a second publishing executable or personal-identity fallback.

Chinh actions:

- approve the security boundary and any expansion of the bot's repository permissions

Expected outcome: one readable shipping workflow with verified publishing controls and no conflicting instructions.

Validation must cover wrong repository, unavailable credentials, personal-identity fallback attempts, failed checks, explicit no-merge requests, and unrelated local work.
Test the successful bot PR flow only against an explicitly approved test repository or PR. Do not merge or deploy production changes merely to test the skill.

### Phase 3: Prepare repeatable settings application

Agent actions:

1. Implement the environment contract before publishing lifecycle scripts: source acquisition, runtime projection, explicit sync, and project customizations. Decide checkout layout and customization ownership first; test an agent-skills working checkout, a consuming checkout, dirty source, repeated sync, and customization removal. Keep entry points thin and preserve application setup.
2. Store the approved Ship prompt beside its owning skill rather than duplicating the procedure per project.
3. Prepare a reviewed, explicit command set for each selected project using supported Amp interfaces. Avoid adding a general-purpose configuration framework for this rollout.
4. Compute differences before issuing updates. Use complete replacement lists for aliases and additional repositories, including explicit empty values where approved.
5. Separate existing-project updates from approved project creation. Preserve existing IDs, and record any newly created project ID immediately for recovery.
6. Record field-level results after each operation. If the connection fails, read current state before retrying a potentially completed write.

Expected outcome: reviewable, repeatable operations that touch only approved fields and produce no writes when desired state already matches.

### Phase 4: Pilot agent-skills and smartclass

Agent actions:

1. Confirm both baseline projects are approved targets and preflight their GitHub integration and default branches.
2. Apply approved settings to one baseline project at a time. Read back every managed field before proceeding.
3. Start fresh and resumed Orbs for each baseline. Confirm the shared runtime is available and repository setup still works.
4. Verify SmartClass application setup independently of the shared bootstrap. Do not modify production data or deploy during this smoke test.
5. Verify the Ship prompt loads the canonical skill in both projects. Use the approved publishing test from phase 2 for actual write-path evidence.

Expected outcome: both baselines pass settings readback and runtime checks. Stop broad rollout if either baseline fails.

### Phase 5: Apply the remaining approved projects

Agent actions:

1. Recheck each project's managed fields against its snapshot immediately before writing. Report concurrent changes instead of overwriting them.
2. Apply each project's reviewed diff, then read back and compare managed values, including script contents.
3. Stop on unexpected failures and report partial completion. Keep access-preflight failures isolated to the affected project.
4. Run the comparison again after all updates. Require zero remaining differences for successful targets.

Expected outcome: an outcome table listing unchanged, updated, created, blocked, and failed projects, with evidence and remaining actions.

### Phase 6: Validate, recover if needed, and hand off

Agent actions:

1. Run the README Validation checks applicable to implementation files. For projected artifacts, verify isolated projection before syncing the approved source changes.
2. Confirm excluded projects and unmanaged settings are unchanged. Compare approved repository identities and aliases for accidental cross-project mapping.
3. If recovery is required, restore captured fields this rollout changed, provided those fields still equal this rollout's written values. Old shipping and additional-repository values are unavailable under the approved waiver; report that limitation and obtain a replacement decision instead of inventing a rollback. Escalate concurrent edits instead of overwriting them.
4. Do not automatically delete a newly created project during recovery; obtain approval and check for threads or work created after provisioning.
5. Report source delivery and live configuration separately: local, committed, pushed, merged, projected, and applied are distinct states.

Expected outcome: verified settings, no unexplained drift, and an explicit completion or blocker report. Retain private recovery records until rollout acceptance.

### Rollout and verification

### Agent actions

1. Refresh both inventories and record Chinh's explicit inclusion and exclusion list. Do not bulk-create projects before that decision.
2. Export available before-state for every selected project, including scripts, aliases, and gallery. Old shipping and additional-repository settings are exempt under Chinh's explicit backup waiver. Protect snapshots from accidental publication.
3. Produce a per-project desired-state diff. Flag nonempty settings that the policy would clear and any bot authorization gaps.
4. Verify primary repository identity, GitHub integration access, and default-branch existence. Block only the affected project when preflight fails.
5. Complete the publishing-skill migration prerequisites before activating the new Ship prompt.
6. Pilot agent-skills and smartclass, then apply the approved fields to remaining selected projects. Do not recreate existing project IDs.
7. Read back each setting and compare scripts byte-for-byte. Report unchanged, updated, blocked, and failed projects separately.
8. Run fresh and resumed Orb smoke checks for both baselines. Exercise the publishing skill in an isolated, non-production test before calling shipping verified.
9. Rerun the desired-state comparison. A second application must make no changes.

Project updates are not a cross-project transaction. Stop after an unexpected failure and report the partial state.
Restore only captured fields changed by this rollout from their snapshots, after checking that nobody edited those fields concurrently. The 2 waived settings have no captured old values.
Do not delete projects, repositories, shared snapshots, or historical media as a rollback shortcut.

### Chinh actions

1. Choose the repository groups or exact repositories to include, and identify which missing Amp projects to create.
2. Review the proposed settings, especially clearing extra repositories, custom aliases, scripts, descriptions, or galleries.
3. Approve the publishing-skill security boundary and any required bot authorization expansion.

### Done when

- every selected repository has the intended Amp mapping and all managed settings match this policy
- excluded projects and unrelated settings are unchanged
- the canonical shipping skill exists and preserves approved bot identity and credential controls
- required settings readback and Orb and publishing checks pass, with failures reported rather than assumed away
- a second comparison reports no drift, and a field-level recovery record exists

## Permissions and side effects

Phase 1 reads GitHub metadata, local bot policy, and Amp project settings. Private snapshots live in ignored `.amp/in/rfc-0015-phase-1/`, not in committed documentation.
Only the 2 separately approved project deletions may mutate live Amp state during phase 1. They do not delete GitHub repositories.
Later phases require the approved settings diff before changing project configuration, creating mappings, or replacing publishing controls.
No secrets may appear in scripts, snapshots, logs, or project customizations. Preserve concurrent edits and unrelated resources.

## Examples

In an agent-skills Orb, project the working checkout into the runtime to test unpublished infrastructure changes without pulling over local work.
In a SmartClass Orb, clone or refresh the infrastructure checkout, project its runtime, then apply SmartClass customizations.
Dotfiles uses the same consumer flow; no dotfiles merger or workstation installation is part of this RFC.

## Maintenance notes

This RFC replaces the earlier planning spec as the design source of truth.
Keep lifecycle hooks, sync behavior, project settings, and publishing guidance aligned with this contract as implementation proceeds.
Run `python3 amp/scripts/validate-rfcs.py` and applicable pre-commit checks after documentation changes.

### Baseline test record: 1 November 2026

These checks test existing code, not the unimplemented sync/customization design or publishing skill.

| Environment | Executed check | Outcome |
| --- | --- | --- |
| Local working tree | `bash scripts/test-orb-setup.sh` | passed stale-setup handoff, clone/current-destination delegation, and warm invocation fixtures |
| Local working tree | `scripts/check-projection` with direct installed-tool paths | passed isolated repeated projection, preservation, and reference-only policy checks |
| Published agent-skills Orb | bootstrap fixtures and shell syntax checks | passed |
| Published agent-skills Orb | projection suite and separate two-pass runtime manifest comparison in temporary HOME | passed; both passes had 48 skills and 12 helper links with identical file hashes and link targets |
| Published SmartClass Orb | lifecycle script syntax and toolchain/dependency-marker checks | passed; Node v26.8.1 matched its pinned toolchain and root lock marker matched |
| Both Orbs | plugin/skill source inspection and secret-presence checks | plugin and sync skill present; both required Obsidian secrets nonempty; default vault paths agree |
| Published agent-skills Orb | live notes sync | not executed: fresh-vault helper passes the resolved password through a process argument, violating the environment-only secret boundary |

Local projection initially failed because changing HOME left mise shims consulting an untrusted configuration.
The successful run put the actual installed Python, uv, Bun, and Node directories on PATH ahead of the shims; no trust settings were changed.
Stock browser installation was explicitly skipped by projection checks. Browser functionality was not tested.

Both Orbs used published agent-skills revision `3c8f1d7ca6099f698a1a224d8d75c66bfb135ead`.
SmartClass used revision `bd4ac188c1db0fba23a541650cff0ddfc82a9f25`.
The SmartClass inspection found both `/home/user/workspace/repos/agent-skills` and `/home/user/workspace/agent-skills`, at the same revision, confirming the checkout-layout issue needs an explicit design.
Neither test reran SmartClass seeding or exercised application behavior, real publishing, or notes writes.
The setup tests are fixtures; they do not establish a fresh installation and resume end to end.

The notes test stopped before unsafe initialization. No secret value was printed and no note was read or edited.
Repair the authoritative notes-sync helper's credential transport before testing a fresh vault; do not bypass that boundary to obtain a passing result.
The `entire` executable was absent in both Orbs although `entire-agent-amp` was available; the cause and impact were not established.

Evidence is retained in the [agent-skills baseline test thread](https://ampcode.com/threads/T-01a1975b-ef38-7414-9f8f-7ed610e5024f) and [SmartClass baseline test thread](https://ampcode.com/threads/T-01a1975c-b812-7723-8337-c0ca2c1c2dbf).
Both disposable test threads were archived after finishing. The implementation thread remains open.

### Consumer implementation verification: 1 November 2026

Shared checkout safety merged first in [agent-skills PR #300](https://github.com/lelouvincx/agent-skills/pull/300); its PR and main CI passed. Local runtime projection and plugin reload completed afterward.
The consumer lifecycle then merged in [SmartClass PR #373](https://github.com/lelouvincx/smartclass/pull/373). PR and main unit and integration checks, Cloudflare Pages and the Worker deployment passed.
Both production API version endpoints reported the full SmartClass merge commit `af88007c768615f33458dd476f8da77664818f82` after deployment.
The stored pre-setup script and additional-repository settings remain unchanged. Repository source changes alone do not activate the complete future-Orb flow.

The table below records pre-publication verification. The transferred hooks were unpublished at test time, not at the time of this delivery update.

| Environment | Executed check | Outcome |
| --- | --- | --- |
| Local working trees | shared and SmartClass lifecycle fixtures | 39 shared PASS groups and 9 consumer PASS groups; real Git, mocked installers, projection and app commands |
| Local working tree | applicable pre-commit and pre-push hooks | passed after removing inherited `OP_SERVICE_ACCOUNT_TOKEN` from the test process; includes projection, archive sync, resolver, plugin builds and SDK checks |
| Disposable Linux Orb, transferred unpublished hooks | both fixture suites and syntax | passed, including all 10 shell files |
| Same Orb | actual inherited setup | exit 0 in 99 seconds; installed Node v26.8.1 and dependencies, applied local migrations and seeds |
| Same Orb | actual resume hook | exit 0 in 3 seconds; local reseeding succeeded |
| Same Orb | 2 explicit syncs | exit 0 in 1 and 2 seconds; no app install, migration or seed; identical managed AGENTS.md hash and 12 helper links |

The first local pre-commit run failed because the unrelated runner fixture assumed an absent service-account token while inheriting the caller's environment.
The same runner check and full hooks passed with that variable unset for the test process; no credential value was printed or changed.
This test-isolation issue was offered as separate follow-up work, not changed in this implementation.

The Orb used the transferred archive with SHA256 `68c6239f58fa85983c19fdf7dfc64e636941f82577bdf6b413259468873cc6f1`.
Projection targeted temporary HOME and AMP_CONFIG_DIR. Transferred hooks remained byte-identical; dirty source skipped pulls.
Captured existing checkout revisions, Git status and hook hashes stayed unchanged, as did the live runtime's AGENTS.md hash.
This was direct hook execution, not an actual pause/wake cycle or fresh-snapshot activation. A second real warm setup was not run.

The optional Entire installation failed: installer input was redirected away from the downloaded script, and Go extraction ran before temporary HOME/.local existed.
Both Entire executables were absent afterward; setup treated that failure as optional and continued.
This inherited installer defect was offered as separate follow-up work, not repaired here.
Stock browser installation was skipped, and Entire checkout scans were guarded to preserve existing hooks.
No application test suites, browser interaction, notes access, publishing, production operations or live settings changes were performed.

Evidence and logs are retained in the [archived consumer lifecycle test thread](https://ampcode.com/threads/T-01a1976e-4cef-7474-ad95-de277b65cbcf), under `.amp/in/lifecycle-test/report.md` in its Orb.

### End-to-end rollout authorization

Chinh authorized proceeding through the remaining implementation, testing and live configuration, asking only about consequential decisions.
The approved 13-project scope and backup waiver still apply. This does not expand bot permissions or approve a replacement publishing security boundary.
Use independent review and disposable Orb tests where useful, preserve unrelated work, and archive disposable test threads after verification.
Keep notes-sync unchanged: its password transport does not block this rollout, and Chinh explicitly deferred it.

Chinh subsequently chose to retain and harden `agent-bot-pr`, with the skill owning orchestration, rather than introduce a replacement executable.
Chinh approved adding the 8 previously excluded targets to the bot policy. Read-only GitHub checks show `personal-finance` already has effective bot write access; the other 7 need an access grant or upgrade.
Chinh will grant that GitHub access himself. The agent may update the approved policy but must not use the owner's credential for collaborator changes.
The 7 access changes are `duty-support`, `lelouvincx.github.io`, `agent-checkpoints`, `holistics-performance-review`, `self-taught-amql`, `self-taught-design` and `self-taught-lsp`.
Treat settings configuration and shipping readiness separately while these grants remain pending.

### Development-sync verification: 1 November 2026

The new development sync and checkout selection are implemented locally, not yet published or applied to project settings.
The parent ran all 57 lifecycle fixture groups on macOS. Isolated runtime projection, documentation validation and policy validation passed.
The existing policy-inventory unit test initially rejected the newly approved repositories; its expected inventory was updated to match the 8 approved additions.

The [disposable Linux verification thread](https://ampcode.com/threads/T-01a197b0-f12c-7181-bda0-bbb263134fc5) verified final overlay SHA256 `9e143d9158f38cf50c6ace1b4722f3ba66e50693a50b8456f408d1ad4f73497d`:

| Executed check | Result |
| --- | --- |
| syntax and complete lifecycle fixture suite | passed; 57 groups in 3.41 seconds |
| actual offline projection of 2 unpublished edits | projected each working edit without changing source HEAD or status |
| repeated identical projection | all 189 compared runtime file/link entries preserved |
| primary setup, resume and stored pre-setup, clean and dirty | newer local upstream ignored; working checkout preserved |
| explicitly selected consumer source, clean and dirty | one real ff-only pull per clean invocation; dirty source projected without a pull |
| existing duplicate checkouts | content and Git metadata preserved |
| actual projection scenario matrix | passed in 15.16 seconds; independent final sync took 1.03 seconds |

Projection used the unchanged real `sync-skills.sh` with isolated HOME and AMP_CONFIG_DIR. Installers and Entire were mocked; browser and remote payload installation were disabled.
This verifies projection and source selection, not installation, actual pause/wake, fresh project-settings activation or the publishing helper.
The preliminary test queried Entire Git-tracking metadata in existing checkouts, including the notes checkout, but read no note content; the final driver blocked those probes.
The Linux historical migration suite was not run because its required Git object was absent; the parent's local isolated projection suite passed separately.
Reports and evidence were retrieved into private `.amp/in/rfc-0015-rollout/`, their hashes verified, and the disposable thread archived.

## Open questions

- Have the 7 owner-managed GitHub access grants completed, and does the bot's effective access match the approved policy?
- Do the two settings-driven pilots pass fresh setup, resume and repeated explicit sync before broad application?
