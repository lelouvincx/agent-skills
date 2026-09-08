# Agent Browser custom build

This directory owns the pinned native build used for [RFC-0011 authentication](../docs/rfcs/rfc-0011-quiet-browser-sessions-and-approved-authentication.md). `upstream-commit` selects the upstream revision. The build applies `rfc0011.patch` for authentication, then `rfc0012.patch` for managed execution, and installs matching upstream skill content.

## Install and use

Run from the repository root:

```bash
amp/agent-browser-custom/build
agent-browser skills list
agent-browser skills get core
agent-browser skills get core --full
```

The default installation is `~/.local/libexec/agent-browser-rfc0011/`:

| Path | Purpose |
| --- | --- |
| `agent-browser` | Pinned native binary |
| `skill-data/` | All runtime skills, references and templates from the same pinned source |
| `skill-data.sha256` | Checksums for the installed skill files |
| `build-input.sha256` | Receipt for the pinned source, patch, skill manifest and packaging scripts |

The [command wrapper](../../bin/agent-browser) checks both receipts and the installed skill files before execution. Missing, changed, extra or symlinked skill files cause a rebuild error. It sets `AGENT_BROWSER_SKILLS_DIR` to the installed bundle, overriding inherited values. Runtime commands do not need npm-global files or the temporary upstream checkout. Verification requires `python3` alongside the wrapper's existing shell tools.

The remote discovery stub in `skills/agent-browser/SKILL.md` stays separate. The build packages upstream `skill-data/` without modifying its contents or installing it into Amp's skill discovery directories.

## Rebuild and maintain

Re-run `build` to repair missing resources or replace an old distribution. The build verifies the skill payload against the repository's `skill-data.sha256` before compiling. It stages the complete installation before replacing the old directory. A failed replacement attempts to restore the previous directory. A forced process kill can leave temporary directories or no active installation; rerun the build rather than accepting an incomplete installation.

When deliberately updating the upstream pin, regenerate `skill-data.sha256` from that revision's `skill-data/` and review the content changes. Do not regenerate the manifest merely to accept unexpected installed files. The manifest check detects local drift; it is not protection against a hostile process with the same user's file access.

Run `scripts/check-agent-browser-custom` for offline packaging and failure tests without Chrome. Run `AGENT_BROWSER_RUN_TESTS=1 amp/agent-browser-custom/build` for the browser-free native suite, then verify the three skill commands above. The build and CI leave ignored Chrome login tests disabled under the testing policy. See the root [Validation table](../../README.md#debug-a-failed-check) for other checks.

## Configuration defaults

`./sync-skills.sh` uses [the config merger](../scripts/merge-agent-browser-plugin.py) to fill missing keys in `~/.agent-browser/config.json`:

| Key | Default | Purpose |
| --- | --- | --- |
| `$schema` | `https://agent-browser.dev/schema.json` | Editor assistance; not runtime validation |
| `contentBoundaries` | `true` | Mark page content as untrusted input; not prompt-injection prevention |
| `maxOutput` | `50000` | Limit plain-text page output, not JSON output |
| `autoConnect` | `false` | Do not discover and attach to an arbitrary browser by default |

The merger preserves existing valid preferences, unrelated keys and plugins. It validates the types of these four keys against the pinned version and rejects invalid config or conflicting `onepassword` registration without writing the file. It is not a full validator for every upstream option. New files use mode `0600`; existing file modes are preserved.

The [managed workflow](../conventions/agent-browser.md#managed-macos-workflow) validates the user config and selects a private snapshot explicitly. This bypasses automatic user/project config discovery, so a repository's `agent-browser.json` cannot add plugins or extensions. Legacy commands explicitly select `--config "$HOME/.agent-browser/config.json"`.

In this pinned build, a valid numeric `AGENT_BROWSER_MAX_OUTPUT` overrides config, and `--max-output` overrides both. Boolean environment values such as `false` do not disable `contentBoundaries: true` or `autoConnect: true`; use `--content-boundaries false` or `--auto-connect false` explicitly. These preferences are overridable defaults, not lifecycle enforcement. They do not change how externally launched Chrome starts.

Run `python3 -m unittest amp/scripts/test_merge_agent_browser_config.py` for merge validation and `scripts/check-agent-browser-config` for installed CLI discovery/override checks without Chrome. Page-output formatting is covered by the pinned native suite, not that CLI smoke test.

## Responsibilities

The following table is copied from [RFC-0012](../docs/rfcs/rfc-0012-deterministic-browser-configuration-and-lifecycle.md#contract). Keep this copy aligned with the RFC.

| Layer | Owns | Does not own |
| --- | --- | --- |
| Config | Stable defaults, plugin registration, output preferences | Authorization or live process ownership |
| `agent-browser-lifecycle` program | Tracking which browser belongs to each session, checking startup, allowing commands, waiting for workers, stopping and resuming cleanup | Understanding arbitrary page content |
| Agent skill and conventions | Navigation, choosing evidence, interpreting outcomes and authentication escalation | Reconstructing launch and cleanup sequences |
| Human | Approval for consequential external actions and material policy changes | Approval for each routine browser click |

Stage 1 packages version-matched skills. Stage 5 uses the internal managed mode through [the lifecycle controller](../agent-browser-lifecycle/README.md#managed-commands) for routine macOS browser sessions. Normal native commands retain their existing behavior outside managed mode.

The lifecycle controller starts the daemon with `AGENT_BROWSER_MANAGED=1` and `AGENT_BROWSER_MANAGED_CDP` set to its claimed endpoint. Managed commands require that existing daemon and matching build. They never spawn a replacement or retry a failed send. The daemon rejects automatic browser relaunch, identity changes, streaming and command containers. An unmanaged CLI also refuses a daemon marked managed.

The private newline-JSON socket operations are `managed_status`, `managed_initialize` and `managed_shutdown`. Initialization may attempt the exact CDP connection only once. Shutdown requests `Browser.close` before disconnecting and exiting. These operations belong to the lifecycle controller, not the public CLI or MCP tool surface. MCP refuses calls in managed mode. The internal `--managed-build-id` probe returns the native compile-time identity without starting a session; it is distinct from the packaging fingerprint.

Managed mode is a cooperative safety boundary, not protection against hostile processes running as the same user. The lifecycle controller closes sessions after recorded roots and session listeners are gone; untracked helpers are accepted until weekly reboot. Private retired profile/runtime files remain without active claims until `agent-browser-lifecycle sweep` removes safely recorded artifacts after reboot.
