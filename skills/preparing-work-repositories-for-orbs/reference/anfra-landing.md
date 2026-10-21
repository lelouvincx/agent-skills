# anfra-landing: verified workaround and limits

This is a historical case from 21 October 2026, not a claim about current Amp behavior or project settings. Reinspect live state before changing it.

## Request and choices

The user requested registration of `/Users/lelouvincx/Developer/anfra/anfra-landing` and orb compatibility. Its canonical remote was `holistics/anfra-landing`.

The user chose project-settings setup rather than committed Amp files, requested testing both hosted and mapped approaches in orbs, then chose an Amp-hosted launcher with a GitHub source subdirectory rather than a full mirror.

Inspection found that `anfra-demo-data` was Amp-hosted, while `anfra-docs` used mapped GitHub with a runtime-token pre-clone helper. Neither existing configuration was proof that the same approach would activate for another repository.

## Observed failures

- Normal GitHub project creation failed because Amp could not access the repository.
- Creating a hosted project and migrating it to mapped mode saved successfully, but starting a mapped orb still returned the GitHub-access rejection. The hook did not resolve that activation barrier.
- In a hosted orb, the first private clone failed with HTTP 403 while inherited Git helpers remained active. Resetting the helper list and using a repository-local helper reading `GH_TOKEN_WORK` succeeded. The particular inherited helper responsible was not identified.
- Fresh hosted orbs had only `.git/`, no source checkout, default tools, and zero-byte setup logs despite a saved pre-setup script. A second test with explicit `skip_setup: false` had the same observations. No project snapshots were listed. The cause remained unresolved.
- Node 24 build workers rejected an inherited `NODE_OPTIONS` flag, `--use-openssl-ca`. A diagnostic build without the variable succeeded; the final script removed only that flag in source-scoped login shells, then the normal login-shell build passed.
- An outer `/.amp/portals/` exclusion did not keep source-local portal metadata out of the nested Git status. The source repository needed its own local exclusion.

Do not generalize these into “mapped projects never work” or “pre-setup never runs.” They are the results for this repository and these tests.

## Final verified state

The hosted project `lelouvincx/anfra-landing` stored a pre-setup script that could be run manually after activation. It cloned into `source/`, preserved dirty source checkouts, installed Node 24 and pnpm from the application's pin, and wrote launcher guidance and local excludes.

| Check | Result |
| --- | --- |
| First / repeat manual setup | 17.802s / 1.863s, both exit 0 |
| Clean login-shell tools | Node 24.22.0, pnpm 11.15.1 |
| Ordinary login-shell build | Passed; TypeScript passed, 33 static pages |
| Dev HTTP | `/` and `/pricing/` returned 200 |
| Final outer and source status | Both clean, including generated portal metadata |
| Automatic pre-setup | Not demonstrated; absent effects and empty setup logs |

Unchanged application lint had 2 errors (`no-html-link-for-pages`, `set-state-in-effect`) and one warning (`exhaustive-deps`). Those were reported rather than fixed during environment setup.

The failed mapped configuration was retained as `anfra-landing-mapped-test`. Application source was not committed, pushed, or mirrored to Amp. Registry edits remained local at the end of the setup work.

## Evidence

- [Hosted activation, private fetch, install, build, lint and HTTP experiment](https://ampcode.com/threads/T-01a15e0a-437c-753b-b9e7-1a4fcf226fa9)
- [First saved-launcher lifecycle test and discovered environment issues](https://ampcode.com/threads/T-01a15e10-0810-772d-84ff-45992dd17c07)
- [Final revised-script verification with explicit setup enabled](https://ampcode.com/threads/T-01a15e15-5c79-7658-afbe-e85f59b73837)
- [Source tested](https://github.com/holistics/anfra-landing/commit/dccc3099df6f35cfed2b9f5819687f1667ff3f6f)

## Review scenarios

Use these to check future revisions of the skill without creating projects or publishing source:

1. **Mapped settings save, but orb creation fails.** Expected: report activation blocked; do not claim the credential helper fixed startup or silently publish a mirror.
2. **Manual bootstrap builds, but fresh-orb setup has no effects.** Expected: distinguish manual success from automatic startup; provide the verified manual path and keep the automatic path incomplete.
3. **Outer Git status is clean while nested source contains portal files or edits.** Expected: inspect the source repository separately; preserve source work and add generated-file exclusions at the correct repository boundary.
