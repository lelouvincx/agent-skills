---
doc_schema: "amp-rfc/v1"
code: "RFC-0008"
title: "Layered local and CI validation"
slug: "layered-validation"
file: "rfc-0008-layered-validation.md"
status: "Implemented (repository validation; required-check configuration pending)"
summary: "Run fast repository checks locally for early feedback while retaining authoritative, path-aware validation and PR policy in GitHub Actions."
created: "2026-07-12"
updated: "2026-07-12"
amp_thread_id:
  T-019f5757-2d35-7280-9c53-6cac7c21cbca: "researched past PR validation and designed the layered local and CI validation model"
dependency: []
implementation:
  - path: "../../../.pre-commit-config.yaml"
  - path: "../../../.github/workflows/ci.yml"
  - path: "../../../scripts/check-project-registry"
  - path: "../../../scripts/check-project-resolver"
  - path: "../../../scripts/check-projection"
  - path: "../../../scripts/check-plugin-builds"
inputs:
  - name: "changed repository files"
    kind: "staged files, pushed commits, or pull request diff"
    purpose: "Select the smallest applicable validation set."
  - name: "repository validation commands"
    kind: "validators, syntax checks, builds, and projection checks"
    purpose: "Provide shared validation behavior across local hooks and CI."
outputs:
  - name: "local validation result"
    kind: "pre-commit or pre-push status"
    purpose: "Give humans and agents actionable feedback before CI."
  - name: "authoritative CI result"
    kind: "required GitHub status checks"
    purpose: "Enforce correctness and pull-request policy in a clean environment."
supersedes: []
superseded_by: null
related: []
tags:
  - "ci"
  - "pre-commit"
  - "validation"
  - "github-actions"
---

# RFC-0008: Layered local and CI validation

## Summary

Add layered, path-aware validation to `agent-skills`. Fast and deterministic checks run locally through pre-commit for early feedback. Broader integration checks may run at pre-push. GitHub Actions reruns every correctness-relevant check in a clean environment and remains the authoritative merge gate.

Pull-request policy stays at the pull-request boundary. In particular, the existing requirement to update `CHANGELOG.md` remains a GitHub Actions check because it compares the complete PR with its base branch, not an individual commit.

## Context

Recent pull requests use useful but inconsistent local validation. Amp changes commonly run the artifact and RFC validators, plugin changes sometimes add a Bun build, registry changes resolve modified projects and regenerate documentation, and skill changes run `sync-skills.sh`. GitHub Actions currently enforces the changelog requirement on every PR but runs repository validation only for selected Amp paths.

This leaves two gaps:

1. humans and agents can discover fast, deterministic failures only after pushing; and
2. checks used successfully in past PRs, such as isolated projection and generated registry consistency, are not consistently enforced in CI.

Local hooks alone cannot close these gaps because they may be absent or bypassed. CI alone provides late feedback. The repository needs both, with each check placed at the earliest stage where its inputs and semantics are valid.

## Decision

Use three validation layers:

1. **Pre-commit:** fast, deterministic, offline checks selected from staged paths.
2. **Pre-push:** broader local integration checks where the additional latency is justified.
3. **GitHub Actions:** authoritative correctness checks and PR-level policy in a clean environment.

Correctness checks may run in more than one layer. Running a check locally does not remove it from CI. Local execution improves feedback time; CI provides reproducibility and enforcement.

Checks should invoke the same repository-owned command at every applicable layer. Existing single-purpose validators remain direct entrypoints rather than gaining unnecessary wrappers:

```bash
python3 -m unittest amp/scripts/test_validate_plugin_docs.py
python3 amp/scripts/validate-plugin-docs.py
python3 amp/scripts/validate-rfcs.py
```

Add a repository script only when a check needs compound orchestration, temporary state, or a stable shared interface, such as comparing generated registry documentation or projecting into an isolated home directory.

Validation is path-aware. A documentation-only change should not install SDK dependencies or build every plugin. Changes to validation configuration or shared validation scripts must trigger the checks they can affect.

## Contract

### Pre-commit

Pre-commit checks must be fast, deterministic, offline, and meaningful for the staged files. The initial scope is:

| Check | Applicable paths |
| --- | --- |
| whitespace, final newline, merge markers, YAML, and JSON hygiene | supported tracked files |
| shell syntax | changed shell scripts |
| Amp validator unit tests and artifact validation | Amp artifact docs, plugins, or validator implementation |
| RFC validation | Amp RFCs or RFC validator implementation |
| generated `PROJECTS.md` consistency | `projects.yaml`, `PROJECTS.md`, or `bin/project-resolve` |

Pre-commit must not enforce `CHANGELOG.md`, perform network requests, synchronize remote skills, write to live runtime paths, or install project dependencies as a side effect.

### Pre-push

Pre-push is optional for checks that are too broad or slow for every commit. Candidate checks are:

- isolated `sync-skills.sh` projection;
- project resolver behavior checks;
- Amp plugin builds; and
- SDK checks when `sdk/**` changes.

These checks remain mandatory in CI when they protect repository correctness. Whether the repository installs pre-push hooks by default is an implementation choice; it does not alter CI requirements.

### GitHub Actions

GitHub Actions must:

- remain authoritative even when equivalent local checks exist;
- run applicable correctness checks using pinned dependencies;
- keep the changelog requirement as a PR-level check;
- validate generated artifacts without modifying the checkout;
- run projection only against temporary runtime paths; and
- expose independent, clearly named status checks for actionable failures.

The changelog workflow compares the PR base and head. It must not be moved to pre-commit because a valid branch may add its changelog entry in a later commit.

The initial CI job boundaries should follow repository responsibilities rather than individual files:

| Job | Responsibility |
| --- | --- |
| `require-changelog-update` | require `CHANGELOG.md` in the complete PR diff |
| `validate-amp-artifacts` | test validators and validate Amp artifact and RFC documents |
| `validate-project-registry` | verify resolver behavior and generated `PROJECTS.md` |
| `validate-projection` | run `sync-skills.sh` with an isolated `HOME` and `AMP_CONFIG_DIR` |
| `validate-plugins` | build changed plugin TypeScript where a build command is defined |
| `validate-sdk` | run reproducible npm checks for `sdk/**` changes |

Basic file hygiene may run as a dedicated CI job or as the same pre-commit configuration over all tracked files. It must not duplicate PR-level changelog policy.

## Behavior

The expected flow is:

```diagram
╭────────────────╮     ╭──────────────────────╮     ╭───────────────────────╮
│ edit and stage │────▶│ pre-commit           │────▶│ commit                │
╰────────────────╯     │ fast, path-aware     │     ╰───────────┬───────────╯
                       ╰──────────────────────╯                 │
                                                              ▼
                       ╭──────────────────────╮     ╭───────────────────────╮
                       │ GitHub Actions       │◀────│ optional pre-push     │
                       │ authoritative gate   │     │ integration feedback  │
                       ╰──────────────────────╯     ╰───────────────────────╯
```

When a local check fails, it should identify the failing check and provide the smallest corrective command. Hooks may fix harmless formatting issues, but semantic validators should fail without rewriting files.

When CI runs the same check, its result is authoritative. A local pass does not allow the CI job to be skipped. A contributor may bypass hooks with `--no-verify`, but cannot bypass required GitHub status checks.

Path selection should minimize unrelated work without hiding dependencies. At minimum:

- Amp docs, plugins, or validators trigger Amp validation;
- registry, generated registry docs, or resolver changes trigger registry validation;
- projected skills, Amp artifacts, registry files, resolver files, or sync logic trigger isolated projection;
- plugin changes trigger plugin builds where supported;
- `sdk/**` changes trigger SDK validation; and
- validation workflow or shared check-script changes trigger every check they can affect.

Remote skill synchronization is not normal validation. `./sync-skills.sh --remote` performs network access and updates generated payloads, so it remains an explicit maintenance operation unless a future deterministic verification mode is designed.

## Permissions and side effects

Pre-commit may read staged and tracked files and may apply standard whitespace or newline fixes. It must not access the network, install repository dependencies, update generated remote payloads, or write outside the checkout.

Pre-push and CI checks may spawn local validators, compilers, and package-manager commands. Projection checks must override both `HOME` and `AMP_CONFIG_DIR` with temporary directories so they never change `~/.config/amp`, `~/.agents`, `~/.claude`, or `~/.local/bin`.

CI may download pinned validation dependencies. It must not use personal credentials for validation that can run without them. Validation commands must not print secrets.

No validation layer may automatically commit generated output, push branches, approve pull requests, or alter GitHub merge state.

## Examples

An Amp artifact change receives early and authoritative validation:

```text
stage amp/docs/tools/example.md
  -> pre-commit runs Amp validator tests and artifact validation
push branch
  -> GitHub Actions reruns the same checks in a clean environment
```

A registry change verifies generated documentation:

```bash
tmp="$(mktemp)"
project-resolve --generate-md > "$tmp"
diff -u PROJECTS.md "$tmp"
```

An isolated projection check uses no live runtime paths:

```bash
tmp_home="$(mktemp -d)"
HOME="$tmp_home" \
  AMP_CONFIG_DIR="$tmp_home/.config/amp" \
  ./sync-skills.sh
```

A branch may contain implementation and changelog commits separately:

```text
commit A: implement validation
commit B: update tests
commit C: update CHANGELOG.md
```

Pre-commit accepts each commit based on its staged files. GitHub Actions evaluates the complete PR and confirms that `CHANGELOG.md` changed.

## Maintenance notes

- Treat GitHub Actions as the source of truth for required merge checks.
- Treat `.pre-commit-config.yaml` as the source of truth for local hook selection.
- Prefer invoking the same underlying command locally and in CI.
- Pin third-party hook and validation dependency versions.
- Keep commit-stage checks fast enough that contributors do not routinely bypass them.
- Keep PR policy separate from file correctness checks.
- Add checks incrementally: fast existing validators first, then generated-state and integration checks.
- Do not add a monolithic validation framework until repeated orchestration demonstrates a need.
- Document hook installation and manual commands in `README.md` when implementation begins.
- Update branch protection when new CI jobs become required checks.
- Test deliberate failures before making a new job required.

The first implementation phase should add pre-commit file hygiene and existing Amp validators, then run the same configuration in CI. Registry consistency, isolated projection, plugin builds, and SDK checks can follow as separate reviewable changes.

## Open questions

- Which CI jobs should become required status checks in GitHub branch protection? Repository-owner approval is required before changing this shared setting.
