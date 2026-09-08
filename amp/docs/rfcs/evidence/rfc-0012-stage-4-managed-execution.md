# RFC-0012 stage 4 verification

## Scope

Verified locally on macOS arm64 on 7 September 2026. This checks managed execution, not complete descendant cleanup or the stage 5 instruction cutover.

The installed native build reported `0.36.0+43de535afc3b1f5a`. Its packaging fingerprint was `85e4ebf4cb816d4acde6bd8613cf6e75b34f3e5fd876ae50a5b07d1ff1f00521`. The build used the pinned upstream source, RFC-0011 authentication patch and RFC-0012 managed-mode patch. No real account credentials or browser history were used.

## Automated checks

| Check | Result |
| --- | --- |
| Full native unit suite | 1,230 passed; 110 opt-in tests ignored |
| Native CLI integration tests | 6 passed; 2 opt-in tests ignored |
| Existing synthetic credential-provider login tests | 3 passed, including destination/account checks, OTP and cross-origin blocking |
| Lifecycle, gated launch and process-identity suite | 51 passed |
| Secret resolver and credential-plugin suite | 58 passed |
| Config merge tests | 9 passed |
| Packaging failure tests | Passed |
| Installed config precedence checks | Passed |
| Native format check | Passed during build |
| Secret policy and RFC validation | Passed |
| Isolated runtime projection | Passed |

The native suite includes managed missing-daemon refusal, failed-send handling, the relaunch race guard, one-attempt initialization, shutdown completion and MCP refusal. Simulated socket tests do not prove every possible OS scheduling sequence.

## Live disposable browser

The public `start` command created a fresh profile and reported ready only after its process, endpoint and daemon checks. The session was `2801c629-c68c-4565-bd26-b3124950affa`, with Chrome PID 55620, daemon PID 55658 and CDP port 55108.

The parent exercised these actions through managed execution:

- opened a local data-URL fixture
- captured an interactive snapshot
- filled a textbox with `batch script`, proving ordinary text is not mistaken for a command container
- extracted the expected `Ready` text and page title
- captured and inspected a screenshot containing the expected heading, textbox value and status
- refused stream enable, batch execution and CDP/namespace overrides before effects
- confirmed the same browser still worked after those refusals

Direct native socket checks also refused stream enable, launch, batch and repeat initialization. Native status still reported the original daemon PID, a connected browser and streaming disabled.

Stop returned a successful browser-close and daemon-shutdown response. Subsequent libproc inspection found both recorded PIDs absent. The CDP port had no listener. The lifecycle claim remained cleanup-pending and its private profile remained present.

Repeated recovery retained that claim without attempting to signal a missing process. A later public `exec -- get title` returned recovery-required rather than starting another daemon.

Local artifacts are under `.amp/in/artifacts/stage4-1788778395290268000/`: `report.json`, `managed.png` and the retained lifecycle state/profile. These artifacts are local evidence, not committed browser state.

## Installed-binary refusal checks

A disposable Unix socket fixture supplied managed metadata with a wrong build ID. The installed CLI refused to restart it and preserved its metadata. After the socket closed, managed and unmanaged invocations both refused replacement; neither created a daemon PID file.

These fixtures exercised startup refusal, not a live browser crash. The native failed-send test and relaunch guard tests cover the command-loss paths separately.

## Limits and next stage

The stage 3 macOS ownership checkpoint remains inconclusive. Absence of the 2 recorded PIDs and CDP listener is not proof that every helper is gone. No profile deletion or terminal lifecycle event was performed.

Managed sessions are owner-only in stage 4. Attachment, draining, final cleanup, reboot reconciliation and switching normal instructions to managed commands remain stage 5 work. The existing authentication tests passed; a real-account login was deliberately not attempted.

## Revised closure rule verification

The user subsequently accepted untracked helpers until reboot. The earlier cleanup-pending result above remains historical evidence, not the current closure requirement.

Parent verification of the revised implementation passed 59 lifecycle/process-identity tests. Coverage includes terminal replay, retained profiles, released port claims, repeated owner recovery, lost shutdown responses, foreign listeners, replaced profiles and inspection failures. Socket timeouts and permission errors do not count as absence.

A new disposable browser run used session `4ae68f0a-0d0e-4538-a065-7e6a9f9c2aac`. Startup and navigation to `about:blank` succeeded. Stop reported `closed` with no pending reasons. `show` returned an empty active-session list. Repeated recovery returned `closed` without another shutdown attempt. The private profile remained on disk.

Local evidence is under `.amp/in/artifacts/closure-rule.6ex7Yw/`, including `start.json`, `stop.json`, `show.json` and `recover.json`. No real account credentials were used. No native code changed or Rust rebuild was needed for this revision. Complete helper cleanup is still not certified; post-reboot removal of retired disk artifacts remains planned work.
