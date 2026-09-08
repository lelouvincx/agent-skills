# RFC-0012 stage 5: sharing and retired files

Verified locally on macOS on 7 September 2026, with actual post-reboot cleanup verified on 8 September 2026. Stage 5 adds no resident service and changes no native build inputs.

## Outcome

The parent and a real subagent shared one disposable browser successfully. Shutdown waited for detachment, then reported `closed`. The active view was empty. Same-boot sweep retained the profile without reporting an active or blocked session.

The parent ran all 6 lifecycle suites: 94 tests passed in 47.867 seconds. After adding a directory-sync failure regression, the same suites passed through pre-commit with 95 tests. Tests cover replay, process identity, gated launch, sharing, filesystem deletion and sweep integration. Initial deletion tests used simulated boot identities and disposable directories. The later real-reboot check below used only the saved disposable test session, never a personal profile.

## Live handoff

- owner: [implementation thread](https://ampcode.com/threads/T-01a070b7-4cf5-76f3-a833-96c78deacde7)
- child: [live sharing checkpoint](https://ampcode.com/threads/T-01a07bef-6dd3-70fe-bdbb-a28dd35dce2f)
- session: `fd64a0b0-f48a-46f8-9d39-1482c9bd3797`
- isolated state: `.amp/in/artifacts/stage5-live/state/agent-browser/`
- recorded Chrome PID: `105`; daemon PID: `450`; CDP port: `49975`
- build identity: `0.36.0+43de535afc3b1f5a`

The owner opened tab `t2` with a local data-URL fixture titled `Owner fixture`. A screenshot rendered that heading, confirmed with image inspection. The child attached using its actual thread ID and opened `t3`, titled `Child fixture`.

After the child read its title, the owner used `exec --tab-id t2 -- get title`. It still returned `Owner fixture`. This exercised tab selection after another thread had changed the active tab.

The first owner `stop` returned `draining`, listed the child attachment and sent no shutdown request. An owner command was refused. While draining, the child read `Child fixture`, closed only `t3`, and detached. The resulting attachment list was empty.

The second owner `stop` returned `closed` with no pending reasons. `show` returned an empty sessions array. Repeated owner recovery returned `closed` with `attempted_verified_shutdown: false`.

Same-boot sweep returned:

```json
{"removed": 0, "awaiting_reboot": 1, "blocked": 0, "blocked_details": []}
```

Evidence files under `.amp/in/artifacts/stage5-live/`: `start.json`, `drain.json`, `closed.json`, `current-after.json`, `sweep.json`, `owner.png`, and `tests.log`. The private profile and runtime directory remain retired until a safe post-reboot sweep. No process signals were sent.

## Parent review corrections

The parent reviewed delegated code and requested or applied corrections before acceptance:

- restored recovery for partial startup states
- replaced invented tab IDs in tests with native `t2` and 32-character CDP target IDs; rejected flag and numeric-index input
- used the injected process-identity provider for artifact boot tests, preserving non-macOS fixture execution
- checked overlapping legacy and managed profile/runtime claims, not just exact managed paths
- held the journal lock through conflict checks, deletion and completion recording, preventing a concurrent claim during deletion
- synced deleted directory entries before recording completion, including retries after a sync failure
- skipped same-boot sessions from the initial replay and capped blocked details at 10
- removed an unused cleanup-append helper and corrected command examples against live output

## Repository checks

Lifecycle, pinned packaging, config merge, installed config precedence, documentation, schema and isolated projection checks passed. The native binary was unchanged from stage 4, so its full Rust build was not repeated.

The initial broader pre-commit run rejected an unrelated `openrouter` bundle in the secret-policy inventory test. Chinh subsequently authorized that change. The separate signed OpenRouter commit updated the inventory and policy assertion; all 58 secret-policy/resolver tests and its relevant hooks passed. Plain `git diff --check` flags space-only context lines in the native patch; checks excluding patch payloads passed. The patch's required context whitespace was preserved.

## Actual post-reboot cleanup

The [guided validation thread](https://ampcode.com/threads/T-01a07c05-b8b1-763d-a505-dca738e97aac) completed this check after Chinh's normal restart on 8 September 2026. No Chrome launch or page action occurred. The parent independently checked the resulting paths, journal and counts.

The actual kernel boot UUID changed from `CC4CBF50-C9DB-44E1-9263-BA93A32AA7B0` to `AA224B94-AFD4-45C0-80FE-0C44655722D5`. Boot time advanced from `1788692227780758` to `1788836009177172` microseconds. The lifecycle controller used real boot metadata, not simulated values.

The isolated state directory was `.amp/in/artifacts/rfc0012-observe-20260907-b8b1763d/state/`. It contained only session `af12f419-fc18-4ecb-a1c1-ea643142ad5f`. Before sweep, the private profile existed with its saved device and inode. The runtime directory was already absent.

- first sweep returned `removed=1`, `awaiting_reboot=0`, `blocked=0`
- both saved paths were absent afterward
- `managed_artifacts_removed` was recorded exactly once
- the active view was empty
- second sweep returned all-zero counts and left the journal unchanged

This proves real profile deletion and safe completion with a missing runtime. It does not prove sweep deleted an existing runtime directory during this run. The actual reboot acceptance check is complete. Raw commands and observations are preserved in that artifact directory's `EVIDENCE.md` and `postreboot-*` files.

## Tested failure boundaries

Fixtures cover removal before closure, duplicate completion, changed identity and reusing a closed session UUID. Unsafe paths, symlink components, live listeners, unavailable metadata and active overlapping claims block deletion. Interrupted deletion before the completion append retries safely. Repeated completed sweeps do nothing.

Sharing tests verify that draining refuses new attachment and owner work, existing children can finish, and stale attachment reconciliation requires owner confirmation. The per-command tab selection and action both execute under the same operation lock.

## Limits

Complete Chrome helper accounting remains inconclusive. `closed` means the recorded roots and session listeners are gone, not that every helper exited. The accepted weekly reboot policy is unchanged.

Older histories and failures before artifact metadata was saved cannot authorize automatic disk removal. Empty unrecorded parent directories and audit history remain. Sweep may briefly delay other lifecycle operations while deleting a large profile under the journal lock.

Tab selection and one command are serialized. Separate snapshot and ref commands are not a transaction; participants must coordinate or use semantic selectors. Thread identity remains cooperative same-user metadata, not hostile-process authorization.
