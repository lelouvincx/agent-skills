---
title: "RFC 0006: Amp Orb bootstrap lifecycle"
slug: "rfc-0006-amp-orb-bootstrap-lifecycle"
status: "proposed"
last_reviewed: "2026-07-05"
---

# RFC 0006: Amp Orb bootstrap lifecycle

## Status

Proposed.

## Context

Amp-managed runtime bootstrap logic has drifted across Logseq notes, dotfiles, and this repository. The only supported consumer for this capability is the Amp Orb runtime, and Amp already defines lifecycle script entrypoints for that runtime.

`agent-skills` should be the source of truth for those lifecycle scripts so Amp runtime setup can be maintained in one place.

## Decision

Manage Amp Orb runtime initialization through Amp's script convention only:

- `.agents/setup`
- `.agents/resume`

No other runtime entrypoints are part of this capability. In particular, do not add `~/.config/amp/bootstrap`, a local workstation bootstrap target, or a user-facing local bin wrapper for this lifecycle.

## Scope

In scope:

- Amp Orb runtime setup only.
- Cloning or updating `agent-skills` inside the orb.
- Installing the already-specified missing runtime dependencies used by the bootstrap path.
- Syncing Amp artifacts, skills, and generated remote skill payloads according to lifecycle stage.
- Preserving dirty local work in `agent-skills`.

Out of scope:

- Local macOS workstation bootstrap.
- Dotfiles setup.
- Logseq graph setup.
- `~/.config/amp/bootstrap` as an entrypoint.
- User-facing CLI wrappers.

## Lifecycle behavior

### `.agents/setup`

`.agents/setup` is the cold-start bootstrap script.

It should:

1. ensure the `agent-skills` repository exists at `AGENT_SKILLS_DIR`, cloning `AGENT_SKILLS_REPO` when needed;
2. pull latest changes with `git pull --ff-only` only when the repository has no local changes;
3. skip pull when local changes exist;
4. install missing specified dependencies needed by the bootstrap path, including `uv` / `uvx`, `curl` or `wget` for the `uv` installer when possible, and `rsync` when possible;
5. provide the existing limited `rsync -a --delete` shell fallback for locked-down orbs where package installation is unavailable;
6. run `sync-skills.sh --remote` so a fresh orb receives generated remote skill payloads and Amp artifacts.

### `.agents/resume`

`.agents/resume` is the warm-start refresh script.

It should:

1. ensure the `agent-skills` repository exists at `AGENT_SKILLS_DIR`, cloning `AGENT_SKILLS_REPO` when needed;
2. pull latest changes with `git pull --ff-only` only when the repository has no local changes;
3. skip pull when local changes exist;
4. run `sync-skills.sh` without `--remote`;
5. avoid remote skill refresh by default;
6. avoid package installation unless the already-specified setup dependencies prove required for resume correctness.

## Safety

- Never discard local changes.
- Never force-reset `agent-skills`.
- Dirty `agent-skills` means skip pull, not skip sync.
- Never overwrite files outside the established `sync-skills.sh` projection paths.
- Never print secrets.
- Keep one-off upstream compatibility patches out of the lifecycle scripts once the source configuration has been fixed.

## Migration

1. Treat `agent-skills` as the source of truth for Amp Orb bootstrap lifecycle behavior.
2. Move Amp Orb-specific bootstrap behavior into `.agents/setup` and `.agents/resume`.
3. Replace or remove external Logseq and dotfiles copies that duplicate this behavior.
4. Keep only Amp-required lifecycle scripts as runtime entrypoints.

## Verification

Run shell syntax checks:

```bash
bash -n .agents/setup
bash -n .agents/resume
```

Validate sync behavior against a temporary Amp config directory:

```bash
AMP_CONFIG_DIR="$(mktemp -d)" ./sync-skills.sh --remote
AMP_CONFIG_DIR="$(mktemp -d)" ./sync-skills.sh
```

When practical, validate `.agents/setup` and `.agents/resume` in a fresh orb-like environment.
