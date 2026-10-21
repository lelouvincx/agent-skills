---
name: preparing-work-repositories-for-orbs
description: "Prepares private work repositories for Amp orbs, including GitHub-access failures, mapped projects, and Amp-hosted launchers. Use when making a work or Holistics repository orb-native, registering it for remote development, or adapting the anfra-demo-data or anfra-landing workaround."
---

# Prepare work repositories for orbs

Make the repository usable in a real orb without confusing a successful manual bootstrap with automatic lifecycle setup.

Load `orb-setup` for lifecycle implementation and `resolving-projects` for registry changes. This skill adds the private-work-repository access and verification workflow, not a replacement lifecycle specification.

## 1. Establish the source and access boundary

- Resolve the supplied project or inspect the supplied path. Read its guidance, Git status, remotes, toolchain pins, lockfiles, build commands, and service requirements.
- Inspect existing Amp projects with `amp projects list` and `amp projects get <namespace/name> --json`. Distinguish `github`, `mapped`, and `amp-hosted` modes from the returned settings.
- Read current [orb lifecycle documentation](https://ampcode.com/docs/orbs/customizing), especially which credentials exist during setup versus after activation. A secret available to an agent is not proof that a pre-clone or pre-setup hook receives it.
- Inspect secret names and scopes only. Use the approved secret-management tools for changes. Keep local env files reference-only (`op://...`) and resolve them at execution time; keep token values out of scripts, Git URLs, logs, and prompts.

Complete when the canonical repository, expected branch, local changes to preserve, required tools, and available credential scopes are known.

## 2. Choose and test the access route

Prefer the normal GitHub-connected project when Amp can access the repository. If project creation or orb activation rejects GitHub access, inspect the failure before choosing a fallback with the user:

| Route | Tradeoff and verification |
| --- | --- |
| Mapped GitHub project with a pre-clone credential helper | Keeps GitHub as the primary checkout. The hook cannot help if Amp rejects the repository before executing it. Test actual orb activation, not just a successful settings update. |
| Amp-hosted launcher with a separate GitHub source checkout | Avoids a published source mirror. The agent works in a nested checkout; the outer Changes and Ship surfaces are not delivery for that checkout. Authentication and bootstrap still need an explicitly verified lifecycle or manual path. |
| Full Amp-hosted mirror | Publishes a second copy of the repository and requires a sync/delivery policy. Obtain authorization before copying or pushing work source. |

Confirm permission to place private work source in the selected environment. Treat migrating an existing hosted project, replacing its repository, or publishing a mirror as a separate decision. Test with isolated projects rather than silently changing a working project's identity.

When comparing routes, create actual orb threads using the available thread tools. Load `delegating-subagents` first and state that a separate orb environment is required. Give each test a bounded scope and retain the evidence. Do not launch agents through the Amp CLI.

For a Git credential helper:

- read the token from the runtime environment, not from an interpolated value stored in Git config;
- restrict it to the intended repository, through repository-local config or a host/path-scoped helper;
- reset inherited helper entries before adding the intended helper, so an earlier helper cannot supply the wrong credentials;
- verify private `ls-remote` or clone access without printing credentials. A local fetch does not establish initial orb-clone access.

Complete when the chosen route has a real activation result, or a precise blocker and an explicitly labeled fallback.

## 3. Implement a repeatable environment

Follow `orb-setup` for the user's chosen repository-file or project-settings approach. Store setup outside the work repository when requested. Read settings back after saving them.

For a hosted launcher:

- Keep the outer Amp-hosted repository and the application checkout distinct, for example `source/` beneath the launcher root.
- Generate root guidance that directs application work to the source checkout and its `AGENTS.md`. Explain that application delivery uses its GitHub remote, not the launcher's Ship action.
- Clone only into an absent destination. Refuse to overwrite a non-checkout. Preserve dirty checkouts and local commits; update clean tracking branches with fast-forward-only operations.
- Exclude generated launcher files from the outer repository. Exclude generated portal metadata in the source repository too: the outer exclusion does not cover the nested repository's Git status.
- Derive tool versions from the application rather than copying the anfra-landing versions. Make tools available in subsequent non-interactive login shells and supervised services, not just the setup process.
- Keep credentials out of snapshots. Put authentication at the lifecycle stage that receives the required identity. If private source or dependencies cannot be accessed during setup, report that constraint instead of assuming a personal runtime secret will be available there.

If an inherited environment flag breaks a pinned toolchain, reproduce the failure first. Apply the smallest project-scoped environment correction and retest the ordinary command without a diagnostic-only unset. Avoid replacing the entire inherited environment to hide the failure.

Complete when the saved implementation passes syntax checks and repeated runs, and preserves user work.

## 4. Verify the lifecycle, not just the script

In a fresh orb, inspect these before manually repairing anything:

1. Primary origin, source-checkout presence, generated guidance, and tool versions.
2. Setup log contents and timestamps at `~/.cache/amp/logs/setup.log`; inspect resume logs when relevant.
3. Whether the configured hooks actually ran. An empty log and absent setup effects are not automatic-setup success. Do not invent a platform diagnosis from missing evidence.

Then verify:

- Run the exact saved setup twice and time both runs. Check that helpers, profile hooks, and exclude entries do not accumulate.
- Add a temporary untracked sentinel to verify dirty-checkout preservation; remove only that sentinel afterward.
- Start a clean non-interactive login shell from the application directory with minimal `HOME`, `PATH`, and `USER`. Check only required tool paths and versions, not the full environment.
- Run the normal build, applicable lint/tests, and representative HTTP checks. Separate pre-existing source failures from setup failures.
- Check both repositories' tracked, staged, and untracked status after starting a service. Inspect the source diff directly; a clean outer checkout alone proves nothing about nested source changes.

If manual execution succeeds but automatic startup does not, report **manual bootstrap verified; automatic startup blocked**. Provide the tested bootstrap command and a usable orb thread. Do not call it fully orb-native.

For a project-settings bootstrap, replace `namespace/project` below with the exact project ref. Run from the launcher root after runtime credentials are available:

```bash
set -o pipefail
amp projects get "namespace/project" --json | jq -er '.preSetupScript | select(length > 0)' | bash
```

Treat that command as an explicit manual workaround, not an automatic lifecycle fix. Use it only after inspecting and verifying the saved script.

## 5. Register and report delivery

When registry registration is in scope, update canonical `projects.yaml`, regenerate `PROJECTS.md`, and run the registry/resolver checks. Preserve the canonical GitHub mapping even when the Amp project is a hosted launcher; state the actual orb source path separately.

Report the project link, access route, working directory, automatic versus manual startup result, repeat timings, build/test/HTTP results, and remaining blockers. State whether source or registry edits are local, committed, pushed, or deployed. Identify retained test projects and which service is left running.

For the concrete failure sequence and evidence behind this workflow, read [the anfra-landing case](reference/anfra-landing.md) when comparing workarounds or diagnosing apparently successful setup.
