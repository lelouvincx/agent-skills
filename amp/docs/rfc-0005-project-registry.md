---
doc_schema: "amp-rfc/v1"
code: "RFC-0005"
title: "Shared project registry and resolver"
slug: "project-registry"
file: "rfc-0005-project-registry.md"
status: "Implemented (initial registry and resolver)"
summary: "Map spoken project names to GitHub repositories and environment-relative local paths, with generated docs, a resolver CLI, and a short AI skill."
created: "2026-07-01"
updated: "2026-07-01"
amp_thread_id: "T-019f1cc3-406e-75d8-877b-64fc80f2e8d3"
implementation:
  - path: "../../projects.yaml"
  - path: "../../PROJECTS.md"
  - path: "../../bin/project-resolve"
  - path: "../../skills/resolving-projects/SKILL.md"
related: []
tags:
  - "project-registry"
  - "shared-tooling"
  - "resolver"
---

# RFC-0005: Shared project registry and resolver

## Summary

Create a shared project registry that maps Chinh's spoken project names to GitHub repositories and local workspace paths across environments.

The output artifacts are a canonical YAML mapping, a generated Markdown view for humans, a CLI resolver, and a short AI skill that tells agents to use the registry before guessing. GitHub repository slugs are the source of truth when a project maps to a repository; `github` may be null for parent workspace directories that contain multiple repositories. Local paths are derived from the active environment's workspace root plus each project's configured directory.

## Context

Chinh often refers to projects by short or spoken names: “logseq”, “agent-skills”, “dotfiles”, “nvim”, “data”, “demo4”, “dbt”, “prefect”. Agents and scripts need to resolve those names consistently without guessing paths or remotes.

Without a registry, every agent or helper has to rediscover mappings from local directories, shell aliases, git remotes, or conversation memory. That does not work reliably across local machines, Amp Orb, VPS hosts, or parallel subagents.

The registry should be shared tooling, not Amp-only memory. It should work across agent runtimes and environments, with GitHub-backed projects as the source of truth.

## Decision

Add four output artifacts to `agent-skills`:

| Artifact                             | Role                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `projects.yaml`                      | Canonical machine-readable project mapping.                            |
| `PROJECTS.md`                        | Generated Markdown view for human reading.                             |
| `bin/project-resolve`                | CLI tool that resolves spoken names for humans, agents, and scripts.   |
| `skills/resolving-projects/SKILL.md` | Short AI skill instructing agents to use the registry before guessing. |

Project keys use Chinh's natural spoken names, not necessarily GitHub repo names. GitHub repository slugs remain the authoritative remote identifier.

## Contract

The registry uses environment roots plus per-project directories:

Example:

```yaml
ownership_entities:
  lelouvincx: {}
  lelouvincx-bot: {}
  holistics: {}
  open-source: {}

environments:
  local:
    workspace_root: ~/Developer
  amp-orb:
    workspace_root: /home/user/workspace
    project_dir_overrides:
      agent-skills: repo
  vps:
    workspace_root: /home/lelouvincx

projects:
  logseq:
    github: lelouvincx/second-brain-logseq
    owner: lelouvincx
    dir: second-brain-logseq
    aliases:
      - second brain
      - log this to logseq

  data:
    github: null
    owner: holistics
    dir: holistics/data
    aliases:
      - holistics data
      - data workspace
```

The local path is computed as:

```text
environment.workspace_root + project.dir
```

This keeps the project directory and GitHub slug stable while allowing environment-specific roots.

Each project must set `owner` to one of the current ownership entities: `lelouvincx`, `lelouvincx-bot`, `holistics`, or `open-source`. This groups projects by the person, bot, organization, or upstream community that owns the repository/workflow. `github` should be a compact `owner/repo` slug when the project maps to one repository, and `null` only for parent workspace directories such as `~/Developer/holistics/data`.

Environment-specific `project_dir_overrides` handle hosts such as Amp Orb, where the active repository is cloned into `/home/user/workspace/repo` rather than its GitHub repository name.

The default VPS root is `/home/lelouvincx`, but VPS layouts may vary. Set `AGENTS_REGISTRY_WORKSPACE_ROOT` for hosts that use a different home or workspace path.

Required resolver dependencies:

- Python 3
- `pyyaml`
- `rapidfuzz`

The generated Markdown view is created with:

```bash
bin/project-resolve --generate-md > PROJECTS.md
```

## Behavior

Environment selection uses a hybrid policy:

1. If `AGENTS_REGISTRY_ENV` is set, use it.
2. Otherwise auto-detect from environment rules in `projects.yaml`.
3. If detection has zero or multiple matches, fail with a clear message asking for `AGENTS_REGISTRY_ENV`.

The environment variable name is intentionally `AGENTS_REGISTRY_ENV` because this registry is shared across agent runtimes, not only Amp.

`AGENTS_REGISTRY_WORKSPACE_ROOT` overrides the selected environment's `workspace_root` at runtime. Use it for hosts whose checkout root differs from the registry default, especially Amp Orb or VPS environments where the workspace path may change.

`bin/project-resolve` resolves a query in this order:

1. Exact project key.
2. Exact alias.
3. Exact GitHub repository basename, when unique.
4. Deterministic fuzzy match.

Fuzzy matching uses Python and `rapidfuzz`; no LLM is allowed in the resolver. If fuzzy matching is not clearly unique, the resolver must fail and print candidates instead of guessing.

The desired flow is:

```diagram
╭────────────────────────╮
│ spoken project mention │
│ "log this to logseq"   │
╰───────────┬────────────╯
            │
            ▼
╭────────────────────────╮
│ bin/project-resolve    │
│ exact + fuzzy matching │
╰───────────┬────────────╯
            │
            ▼
╭──────────────────────────────────────────────╮
│ key: logseq                                  │
│ local: ~/Developer/second-brain-logseq       │
│ github: lelouvincx/second-brain-logseq       │
╰──────────────────────────────────────────────╯
```

## Permissions and side effects

The resolver reads `projects.yaml` and environment variables. It does not write files, clone repositories, call GitHub, or call an LLM.

`PROJECTS.md` is generated documentation. It must not become a second source of truth.

The AI skill is intentionally short. Its job is only to route future agents to `bin/project-resolve` and `projects.yaml`, not to duplicate the mapping.

`sync-skills.sh` projects `projects.yaml` and `PROJECTS.md` into `~/.config/amp` so Amp runtime artifacts have the same registry source and human-readable view as this repo.

## Examples

Example commands:

```bash
bin/project-resolve logseq --path
bin/project-resolve "log this to logseq" --github
bin/project-resolve dbt --json
AGENTS_REGISTRY_ENV=vps bin/project-resolve prefect --path
```

Initial important mappings:

| Spoken name     | Owner        | GitHub                           | Directory                      |
| --------------- | ------------ | -------------------------------- | ------------------------------ |
| `logseq`        | `lelouvincx` | `lelouvincx/second-brain-logseq` | `second-brain-logseq`          |
| `agent-skills`  | `lelouvincx` | `lelouvincx/agent-skills`        | `agent-skills`                 |
| `dotfiles`      | `lelouvincx` | `lelouvincx/dotfiles`            | `dotfiles`                     |
| `data`          | `holistics`  | null                             | `holistics/data`               |
| `data-internal` | `holistics`  | `holistics/data-internal`        | `holistics/data/data-internal` |

## Maintenance notes

- Give humans, agents and programs one shared way to resolve project names.
- Make GitHub repository slugs the canonical remote identity when a project maps to one repository; use `github: null` only for parent workspaces that contain multiple repositories.
- Derive local paths portably across local, Amp Orb, and VPS environments.
- Support natural spoken project names and aliases.
- Support deterministic fuzzy matching without LLM calls.
- Fail safely when a fuzzy query is ambiguous.
- Do not model local-only projects as first-class entries unless they later get a GitHub source of truth.
- Do not replace git remotes, shell aliases, or package-manager workspace metadata.
- Do not automatically clone missing repositories in the first version.
- `projects.yaml` is the source of truth.
- `PROJECTS.md` must be updated in the same change when mappings change.
- `sync-skills.sh` must project `projects.yaml` and `PROJECTS.md` into `~/.config/amp`.
- Projects must declare one of the known ownership entities: `lelouvincx`, `lelouvincx-bot`, `holistics`, or `open-source`.
- Prefer adding aliases for common spoken phrases instead of weakening fuzzy-match thresholds.
- Keep GitHub values as compact slugs such as `owner/repo`, not full URLs, unless the value is explicitly `null` for a parent workspace.
- Keep environment-specific behavior in `environments`, not duplicated inside every project.

`data` intentionally maps to the parent Holistics data workspace, while `data-internal` maps to the GitHub-backed internal AML project.

## Open questions
