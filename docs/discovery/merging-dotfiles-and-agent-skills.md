# Discovery: merging dotfiles and agent-skills

| Field | Value |
| --- | --- |
| Status | Discovery only |
| Observed | 23 August 2026 |
| Current thread | [Merge discovery](https://ampcode.com/threads/T-01a02c7d-277c-766c-8671-651383a1a1f7) |
| Historical thread | [Runner-first runtime discussion](https://ampcode.com/threads/T-019f4775-56e0-72ad-9b40-3b4af668cf8d) |

## Trigger

Chinh is considering merging `dotfiles` and `agent-skills`. The earlier discussion established some intent, but its repository inventory and Amp platform assumptions are now stale.

This document records the current evidence before problem definition and grilling. It does not decide:

- whether the repositories should merge
- which repository or name should survive
- what the target directory layout should be
- whether one command should install everything
- how existing Git history or remotes should move

## Current situation

The repositories are separate, but they already form one runtime chain.

- `dotfiles` owns persistent workstation configuration, packages, tool versions and local shell commands
- `agent-skills` owns agent instructions, skills, Amp plugins, project resolution, agent secret policy and runtime projection
- both repositories contain identical Amp Orb hooks that clone and project `agent-skills`
- both repositories write into user-level paths, including a shared `~/.local/bin` namespace
- neither repository provides a complete fresh-machine path by itself
- Amp now offers hosted personal and workspace skills and plugins, but Chinh's hosted repositories are empty

The split is therefore not simply “machine files versus agent files”. It is a set of source, fetch, projection and runtime boundaries that cross both repositories.

```diagram
┌──────────────────────────┐       ┌────────────────────────────┐
│ dotfiles source          │       │ agent-skills source        │
│                          │       │                            │
│ Stow modules             │       │ skills and overlays        │
│ Brewfile and Mise        │       │ Amp config and plugins     │
│ local CLIs               │       │ registry and policy        │
│ shell runtime variables  │       │ projection scripts         │
└────────────┬─────────────┘       └─────────────┬──────────────┘
             │ ./install.sh                     │ ./sync-skills.sh
             ▼                                  ▼
┌──────────────────────────┐       ┌────────────────────────────┐
│ workstation targets      │       │ agent runtime targets      │
│                          │       │                            │
│ $HOME                    │       │ ~/.config/amp              │
│ ~/.config                │       │ ~/.agents/skills           │
│ ~/.local/bin             │◀─────▶│ ~/.claude/skills          │
└──────────────────────────┘       │ ~/.local/bin               │
                                   └────────────────────────────┘

Any project Orb
      │ repository-local .agents/setup or .agents/resume
      ▼
clone agent-skills into a sibling checkout
      │
      ▼
project agent runtime into the Orb home directory
```

## Evidence boundary

This snapshot uses the 2 local checkouts resolved through `project-resolve`:

| Repository | Local checkout | GitHub | Snapshot |
| --- | --- | --- | --- |
| `agent-skills` | `~/Developer/agent-skills` | `lelouvincx/agent-skills` | clean `main` at `f7cc016`, dated 22 August 2026 |
| `dotfiles` | `~/Developer/dotfiles` | `lelouvincx/dotfiles` | `main` at `9f2e5e0`, dated 1 August 2026, with local changes |

The discovery did not fetch either remote. “Current” means the local checkout and its existing remote-tracking refs at the observation time.

`dotfiles` had pre-existing changes in:

- `herdr/herdr/config.toml`
- `nvim/nvim`, whose checked-out commit differs from the recorded gitlink
- `zshrc/.zsh/env.zsh`
- `zshrc/.zsh/tools.zsh`

This work remained untouched. Findings below distinguish committed behavior from local work where it matters.

## Historical intent that remains valid

The historical thread contains 2 explicit decisions from Chinh:

1. The primary conceptual abstraction is a runner.
2. Readiness should mean behavioral consistency, not identical files or installation.

The thread paused before deciding whether all environments should interpret one shared behavior contract. It did not approve a repository destination, merged layout, bootstrap design or migration plan.

The thread also proposed, but did not approve:

- a personal runtime source of truth or “runtime constitution”
- runner profiles for a laptop, VPS and Amp Orb
- shared human and agent behavior contracts
- merging `agent-skills` into `dotfiles`
- one top-level installation command

These are design inputs, not settled requirements.

### The term runner now has 2 meanings

The historical discussion used runner as an umbrella for a laptop, VPS, Orb or future execution surface.

Amp currently uses runner more narrowly. An Amp runner is an `amp` process on a user-managed machine that accepts remote threads. Amp treats an Orb as a separate executor type. Current plugin APIs also distinguish `executor: 'orb'` from `executor: { type: 'runner', id }`.

Problem definition must either keep the broader domain term and define it clearly, or choose another umbrella term. This discovery does not choose one.

Sources: [Amp manual](https://ampcode.com/manual), [Amp Orbs manual](https://ampcode.com/manual/orbs).

## Repository map

### dotfiles

`dotfiles` began on 25 May 2022. Its current history contains 217 commits and has a separate Git root from `agent-skills`. It has an MIT licence.

It contains 44 tracked paths and 9 GNU Stow modules:

| Module | Source shape | Target root |
| --- | --- | --- |
| `zshrc` | shell startup and tool files | `$HOME` |
| `tmux` | tmux configuration | `$HOME` |
| `local` | 7 local commands | `$HOME` |
| `spaceship` | prompt configuration | `$HOME` |
| `alacritty` | terminal configuration | `$HOME/.config` |
| `nvim` | Neovim submodule | `$HOME/.config` |
| `mise` | tool version configuration | `$HOME/.config` |
| `bat` | pager configuration | `$HOME/.config` |
| `herdr` | terminal workspace configuration | `$HOME/.config` |

The canonical module-to-target map is `dotfiles/scripts/stow-modules.sh`. Both lifecycle commands use it:

```bash
./install.sh [module ...]
./uninstall.sh [module ...]
```

Install uses `stow -R`; uninstall uses `stow -D`. Install creates `~/.config` and `~/.local/bin`, but it does not install packages, run Homebrew, initialise submodules or install Amp.

`Brewfile` is a separate package inventory. It currently declares:

- 3 taps
- 26 formulae
- 8 casks
- 66 VS Code extensions
- one Cargo package

No tracked command runs `brew bundle`. Mise separately declares tool runtimes and agent-adjacent tools such as Claude, `agent-browser`, Python, Node, `uv`, GitHub CLI and 1Password CLI.

The `local` module installs 7 commands into `~/.local/bin`:

- `amp-to-claudebin`
- `holistics-init`
- `r2up`
- `sqlfix-gum.sh`
- `sqlfix.sh`
- `youtube-transcribe`
- `yt-transcript`

The committed shell environment adds `~/.local/bin` and `~/.amp/bin` to `PATH`. It also sets `PLUGINS=all` and `AGENTS_REGISTRY_ENV=local`. The local uncommitted change adds `AMP_CONFIG_DIR=~/.config/amp`.

#### dotfiles source and runtime boundaries

Tracked source includes Stow modules, package inventories, scripts, the Neovim gitlink and repository automation.

Local or generated state includes:

- ignored `zshrc/.zsh/secrets.zsh`
- Zim and tmux plugin installations
- Herdr logs, sockets and session state
- local CLI authentication state
- temporary transcription files
- ignored files inside the Neovim Stow package

The ignored shell secret file currently contains populated plaintext assignments rather than `op://` references. Values were not read into this document. This conflicts with the current global agent instruction that local environment and credential files contain only 1Password references.

#### dotfiles validation and maintenance

Available checks are:

```bash
./scripts/test-youtube-transcribe.sh
uvx pre-commit run --all-files
bash -n install.sh uninstall.sh scripts/stow-modules.sh
```

There is no repository check that runs every Stow package against an isolated target. A read-only dry run passed for 8 modules. The Neovim module failed because ignored local files inside its Stow package would also be linked into `~/.config`.

Repository automation includes approved-pull-request auto-merge and scheduled Neovim submodule updates. `dotfiles` has no changelog.

### agent-skills

`agent-skills` began on 24 February 2026. Its current history contains 182 commits and has no licence file.

It contains 147 tracked files. Its main inventories are:

| Area | Current inventory | Role |
| --- | ---: | --- |
| skills | 44 directories | reusable agent behavior |
| local tracked skills | 14 `SKILL.md` files | repository-authored source |
| remote skills | 30 enabled entries | fetched and generated source |
| Amp plugins | 14 TypeScript files | system-level Amp behavior |
| Amp RFCs | 9 files | design and lifecycle records |
| project registry | one YAML registry and generated Markdown | cross-environment project resolution |
| command scripts | 3 projected commands under `bin/` | PATH-level helpers |
| Orb hooks | `.agents/setup` and `.agents/resume` | repository lifecycle |

The repository owns several kinds of durable source:

- `amp/AGENTS.md`: global projected agent guidance
- `amp/settings.json`: Amp settings
- `amp/conventions/`: task-specific personal instructions
- `amp/docs/`: capability, issue and RFC records
- `amp/plugins/`: plugin implementations
- `amp/mcp-servers/`: local MCP server code
- `amp/agent-secrets/`: schemas and capability policy, not credentials
- `amp/github-thread-events/`: policy and configuration, not runtime state
- `skills/*/SKILL.md`: local skill source
- `skills/*/PERSONAL.md`: local overlays for remote skills
- `remote-skills.yaml`: remote skill registry
- `projects.yaml`: canonical project registry
- `bin/`: projected user commands

Fetched remote skill payloads, `.remote-source` metadata, shared downloaded references, dependency directories, logs, SQLite state and credentials are not durable source.

#### agent-skills projection

`./sync-skills.sh --remote` first refreshes generated remote skills, then performs the normal projection. `./sync-skills.sh` projects without refreshing every remote skill.

| Source | Target | Method |
| --- | --- | --- |
| `skills/*` | `~/.agents/skills/*` | absolute symlink |
| `skills/*` | `~/.claude/skills/*` | absolute symlink |
| `bin/*` | `~/.local/bin/*` | absolute symlink |
| selected skill scripts | `~/.local/bin/*` | absolute symlink |
| `amp/AGENTS.md` | `~/.config/amp/AGENTS.md` | copy |
| `amp/settings.json` | `~/.config/amp/settings.json` | copy |
| Amp subdirectories | `~/.config/amp/*` | `rsync --delete` by owned subtree |
| `projects.yaml` and `PROJECTS.md` | `~/.config/amp/` | copy |

This gives 2 update semantics:

- repository edits to a symlinked skill or command become visible immediately
- repository edits to copied Amp artifacts need another sync

The sync removes stale files inside selected owned Amp subtrees. It preserves runtime siblings such as `~/.config/amp/state` and never creates credential files.

The local machine currently uses this projection. Its 44 `~/.agents/skills` and `~/.claude/skills` entries point into the checkout. The active `project-resolve` and `agent-secrets` commands also point into it. Active plugins load from `~/.config/amp/plugins`.

#### Project registry

`projects.yaml` describes `local`, `amp-orb` and `vps` environments. It derives paths from an environment workspace root and per-project overrides.

The registry currently models `dotfiles` and `agent-skills` as separate repositories. It also maps `nvim` to `lelouvincx/dotfiles` and a path under `dotfiles`, although the actual configuration is a submodule backed by `lelouvincx/nvim`.

The `amp-orb` environment maps `agent-skills` to `/home/user/workspace/repo`. `AGENTS_REGISTRY_ENV` and `AGENTS_REGISTRY_WORKSPACE_ROOT` can override detection and path roots.

#### Agent secret boundary

Source-controlled policy declares approved variable names, command classes and executable paths. Local credentials belong under `~/.credentials/agent-secrets/` as `op://` references. A separate service-account bootstrap file is never projected.

The `agent-secrets` command validates policy, command paths, bundle compatibility and local permissions before it asks 1Password to resolve a command environment. It does not print or export resolved values.

#### agent-skills validation and maintenance

The repository has layered pre-commit, pre-push and GitHub Actions checks. Relevant focused commands include:

```bash
scripts/check-project-registry
scripts/check-project-resolver
scripts/check-skill-dependencies
scripts/check-projection
scripts/check-plugin-builds
```

The first 4 checks passed during discovery. Projection tests use an isolated temporary home. They verify copies, links, stale-file deletion, runtime-state preservation and the absence of credentials.

Repository maintenance requires conventional commits, changelog updates and a bot service account for publishing. This workflow is stricter than the current `dotfiles` workflow.

## Amp platform facts that changed

The historical thread predated Amp's hosted global skills and plugins.

Amp now supports these skill scopes, in precedence order relevant here:

1. machine-global `~/.config/agents/skills`
2. machine-global `~/.agents/skills`
3. machine-global `~/.config/amp/skills`
4. project and parent `.agents/skills`
5. project and parent `.claude/skills`
6. home `~/.claude/skills`
7. home Claude plugin cache
8. paths in `amp.skills.path`
9. built-in skills
10. hosted personal skills
11. hosted workspace skills

Local skills therefore mask hosted skills with the same name.

Plugins load from project, system, personal and workspace scopes, in that order. The current `agent-skills` projection installs system plugins into `~/.config/amp/plugins`, so those plugins take precedence over hosted personal and workspace plugins with the same name.

Chinh's Amp account currently has writable hosted personal repositories for both skills and plugins, but both report “no skills yet” or “no plugins yet”. The current runtime still comes from local `agent-skills` projection.

This creates a new distribution boundary to consider later. It does not by itself replace:

- cross-runtime Claude skill projection
- project registry and PATH helpers
- Amp settings and AGENTS guidance
- remote skill fetching and personal overlays
- local secret policy
- machine packages and configuration

Sources: [Amp manual skill repositories](https://ampcode.com/manual), [Amp manual plugin repositories](https://ampcode.com/manual).

## Amp Orb lifecycle

Amp clones the selected project into a fresh Debian 12 Orb. It runs executable `.agents/setup` and `.agents/resume` hooks from that project repository's root.

Current platform behavior is:

- setup prepares project state and may contribute to a reusable project snapshot
- setup has a 20-minute limit
- setup must not authenticate a user or thread service because snapshots may be reused
- resume runs after initial activation and whenever the Orb wakes
- Amp waits up to 10 seconds for resume, then allows it to continue in the background
- resume should contain fast, idempotent authentication, reconnect or repair work

Both repositories currently contain byte-identical setup and resume files. Their checksums match.

The hooks do not configure dotfiles in the Orb. They:

1. clone or update `agent-skills` at `/home/user/workspace/agent-skills` by default
2. preserve dirty `agent-skills` work by skipping pulls
3. ensure selected projection dependencies during cold setup
4. run `sync-skills.sh --remote` during setup
5. run `sync-skills.sh` during resume

This reveals 3 current lifecycle facts:

- lifecycle hooks are project-local, so one central repository hook does not automatically run for other project Orbs
- `dotfiles` needs its own hook today if a `dotfiles` Orb should receive the agent runtime
- an `agent-skills` Orb clones a second `agent-skills` checkout by default, even though Amp already cloned the active project to `/home/user/workspace/repo`

The last point follows from the hook default and project registry path. Unless `AGENT_SKILLS_DIR` is overridden, projection comes from the sibling checkout rather than the active `agent-skills` worktree. This behavior was not tested in a fresh Orb during discovery.

RFC-0006 says `agent-skills` is the source of truth for Orb lifecycle behavior and that external dotfiles copies should be removed. The RFC remains marked `Draft`, while the duplicate remains in use. Amp's repository-local hook contract explains why removal is not a simple file deletion.

The current resume hook also performs a Git pull and full projection. Discovery did not measure whether it completes within Amp's 10-second blocking window.

Sources: `agent-skills/.agents/setup`, `agent-skills/.agents/resume`, `dotfiles/.agents/setup`, `dotfiles/.agents/resume`, `agent-skills/amp/docs/rfcs/rfc-0006-amp-orb-bootstrap-lifecycle.md`, [Amp Orbs manual](https://ampcode.com/manual/orbs).

## Ownership overlaps

### Shared user-level paths

Both repositories can write under `~/.local/bin`:

- Stow owns 7 dotfiles commands
- agent projection links all 4 tracked files under `bin`, including 3 commands and `AGENTS.md`, plus any eligible skill shell scripts

There are no current command basename collisions. The shared namespace still has no single collision policy or combined uninstall path.

The current `~/.config` ownership is adjacent rather than conflicting:

- dotfiles owns selected application subdirectories
- agent-skills owns `~/.config/amp`

Skills are outside Stow ownership. Dotfiles connects them to the shell by placing `~/.local/bin` on `PATH` and setting agent-related environment variables.

### Package and runtime dependencies

Dotfiles inventories several tools that agent-skills uses, including Bash, Git, `curl`, `rsync`, Node, npm, `uv`, `uvx`, 1Password CLI and common search tools. Ownership is split:

- dotfiles describes workstation packages and versions
- agent-skills cold setup installs only the subset needed in an Orb
- no command proves that a fresh laptop has every dependency required by both repositories

### Different projection semantics

The repositories use different materialisation models:

| Concern | dotfiles | agent-skills |
| --- | --- | --- |
| primary mechanism | GNU Stow | custom Bash sync |
| main target | home and app config | agent runtime locations |
| links | relative Stow-managed links | absolute links into checkout |
| copied trees | none in normal install | selected Amp trees with delete semantics |
| remote fetch | package managers remain manual | remote skills fetched on demand |
| uninstall | module-level `stow -D` | no full uninstall command |
| isolated projection check | absent | implemented |

A Git repository merge would not reconcile these lifecycle semantics by itself.

### Shared policy but separate enforcement

Both repositories carry agent-facing `AGENTS.md` files and bot-assisted maintenance rules. `agent-skills` also projects a global `AGENTS.md` into Amp.

Security policy currently differs:

- agent-skills requires 1Password references and command-scoped secret bundles
- dotfiles still supports an ignored shell file with direct assignments
- Amp Orbs use platform-managed secrets, environment variables or workload identity rather than local workstation files

These are distinct trust environments even if their durable source moves into one repository.

## Current drift and cleanup facts

These findings affect the reliability of any future inventory or migration. They are not part of a merge solution.

### dotfiles drift

- `AGENTS.md` lists 8 modules and omits Herdr, while scripts define 9
- its documented directory tree includes deleted or moved files
- README names `scripts/stow-modules`, but the file is `scripts/stow-modules.sh`
- `.gitmodules` contains a stale declaration for `nvim/.config/nvim` and the active `nvim/nvim` declaration
- only `nvim/nvim` is a tracked gitlink
- ignored local files inside the Neovim Stow package affect Stow behavior
- Brewfile is not connected to the install command
- Amp itself is not installed by Brewfile or Mise

### agent-skills drift

- README's skill inventory omits the installed `herdr` skill
- README's cold-start example runs normal projection twice because `--remote` already continues into projection
- sync retains one-time cleanup for several retired generated skills
- sync links `bin/AGENTS.md` into `~/.local/bin` because it projects every regular file under `bin`
- RFC-0006 remains `Draft` while its lifecycle code is active
- dotfiles still contains the external lifecycle copy that RFC-0006 says to replace or remove
- hard-coded local executable and browser paths limit portability beyond the current workstation

## Constraints already supported by evidence

The following constraints exist independently of a merge decision:

- durable source, fetched source, projected files, credentials and runtime state must remain distinct
- generated remote skill payloads must not become durable authored source by accident
- credentials and runtime databases must not enter repository projection
- project paths must remain environment-aware and machine-readable
- local macOS, VPS, Amp runner and Debian Orb capabilities differ
- Orb setup must remain safe for reusable snapshots
- Orb resume must remain fast and idempotent
- dirty worktrees must not be reset or overwritten during bootstrap
- the Neovim submodule has its own repository identity and update automation
- existing user-level targets need explicit ownership and collision behavior
- cross-runtime skill behavior currently includes Amp and Claude-compatible locations
- `agent-skills` and `dotfiles` have separate histories, governance and licensing state
- behavioral consistency was approved as the readiness criterion, but its exact behaviors remain undefined

## Unknowns for problem definition and grilling

### Purpose and boundary

- What user-visible failure or cost should the merge solve?
- Is the desired source of truth a Git repository, a behavior contract, a runner definition, a package manifest, or a combination?
- Does “merge” mean one Git remote, one checkout, one bootstrap command, one release process, one runtime model, or all of them?
- Which current behaviors must remain identical, and which may vary by execution environment?

### Domain language

- Should runner remain the umbrella term despite Amp's narrower product meaning?
- What terms distinguish authored source, fetched source, projection, runtime state and secrets?
- Is a personal laptop one runner, or a host for several runners and human sessions?

### Repository and history

- Which repository identity, name, visibility and licence should survive?
- Must all 217 dotfiles commits and 182 agent-skills commits remain reachable in the final history?
- What happens to the retired repository, open links, project registry keys and existing clones?
- Should the Neovim repository remain a submodule?

### Distribution and lifecycle

- Which artifacts should use Stow, direct symlinks, copies, package managers, Amp hosting or another mechanism?
- Should hosted Amp skills and plugins become a source, a release target or remain unused?
- How should other project Orbs receive personal runtime behavior when hooks are repository-local?
- Should an Orb for the unified repository project from its active checkout or a separate stable checkout?
- What is the supported fresh-laptop, VPS, local Amp runner and Orb lifecycle?
- What is the uninstall, rollback and drift-repair contract for each environment?

### Capability and trust

- Which tools, network access, credentials and write permissions exist on each environment?
- Which behavior is shared, and which behavior is selected by capability or trust?
- How should the plaintext shell-secret interface move toward the current 1Password policy?
- When should Amp platform secrets or workload identity replace local 1Password references?

### Ownership and validation

- Which file owns package dependencies used by agent projection?
- How should `~/.local/bin` collision and removal work?
- Which source owns global agent guidance when Amp also has personal and workspace repositories?
- What isolated tests prove fresh install, repeat install, resume, uninstall and secret non-projection?
- Which repository governance model should apply after consolidation?

### Current local work

- Should the uncommitted dotfiles changes land before migration discovery becomes a design?
- Are ignored files inside the Neovim Stow package intentional payloads or accidental workspace state?
- Is the stale `.gitmodules` entry still needed for compatibility?

## Evidence index

Primary repository evidence:

- `agent-skills/README.md`
- `agent-skills/CHANGELOG.md`
- `agent-skills/AGENTS.md`
- `agent-skills/sync-skills.sh`
- `agent-skills/scripts/check-projection`
- `agent-skills/projects.yaml`
- `agent-skills/remote-skills.yaml`
- `agent-skills/.agents/setup`
- `agent-skills/.agents/resume`
- `agent-skills/amp/docs/rfcs/rfc-0005-project-registry.md`
- `agent-skills/amp/docs/rfcs/rfc-0006-amp-orb-bootstrap-lifecycle.md`
- `agent-skills/amp/docs/rfcs/rfc-0010-shared-local-agent-and-bot-secrets.md`
- `dotfiles/README.md`
- `dotfiles/AGENTS.md`
- `dotfiles/install.sh`
- `dotfiles/uninstall.sh`
- `dotfiles/scripts/stow-modules.sh`
- `dotfiles/Brewfile`
- `dotfiles/mise/mise/config.toml`
- `dotfiles/zshrc/.zsh/env.zsh`
- `dotfiles/.agents/setup`
- `dotfiles/.agents/resume`
- `dotfiles/.gitmodules`

Read-only discovery commands included:

```bash
project-resolve dotfiles --json
project-resolve agent-skills --json
git status --short --branch
git log --date=short
git rev-list --count HEAD
git ls-files
git submodule status
diff -u <agent-skills-hook> <dotfiles-hook>
stow -n -R -t <target> <module>
amp skills repositories
amp plugins repositories
amp skills list
amp plugins list
```

## Next step

Use this evidence to define the problem before choosing a target architecture. Then grill the problem, domain terms, invariants and unresolved ownership decisions. Do not begin file migration until those decisions produce explicit acceptance criteria.
