# Project rules

## Maintenance

- Follow: conventional branches, conventional commits
- Whenever opening a new PR, use bot token
- Treat `agent-skills` as the source of truth for reusable skills, Amp plugins, Amp capability docs, and the project registry.
- Treat `~/.config/amp` as the runtime projection. Do not edit projected files there when the change belongs in `agent-skills`.
- After changing version-controlled Amp runtime artifacts, run `./sync-skills.sh` to project them into `~/.config/amp`.
- Runtime projection paths:
  - `amp/AGENTS.md` -> `~/.config/amp/AGENTS.md`
  - `amp/plugins/` -> `~/.config/amp/plugins/`
  - `amp/docs/tools/` -> `~/.config/amp/docs/tools/`
  - `projects.yaml` and `PROJECTS.md` -> `~/.config/amp/`
- Use `AMP_CONFIG_DIR=/path/to/amp-config ./sync-skills.sh` to test against a temporary Amp config directory.
- For local skills, create `skills/<name>/SKILL.md` with YAML frontmatter, then run `./sync-skills.sh`.
- For remote skills, add the skill to `remote-skills.yaml`, optionally add `skills/<name>/PERSONAL.md`, add generated payloads to `.gitignore`, then run `./sync-skills.sh --remote`.
- Remote skill generated files usually include `skills/<name>/SKILL.md`, `skills/<name>/.remote-source`, and remote companion directories. Commit the registry entry and intentional local overlays, not the fetched payload.
- Some remote skills depend on shared generated references. For example, Holistics AMQL skills fetch `references/` from `github.com/holistics/skills`; treat that directory as generated runtime support.
- To remove a local skill, delete `skills/<name>/`.
- To remove a remote skill, remove it from `remote-skills.yaml`, delete its directory, remove related `.gitignore` entries, then run `./sync-skills.sh --remote`.
- For the project registry, use `projects.yaml` as the source of truth and `project-resolve` as the executable interface for humans, agents, and scripts.
- Prefer `project-resolve <spoken-name> --json` when agents need to resolve project names.
- Set `AGENTS_REGISTRY_ENV` to force an environment such as `local`, `amp-orb`, or `vps`; otherwise the resolver auto-detects where possible.
- Set `AGENTS_REGISTRY_WORKSPACE_ROOT` when a host uses a different workspace root than the registry default.
- After opening PR, add another commit for adding PR number into the changelog entry

## Amp artifacts

Treat `~/.config/amp` as the runtime projection, but the long-term source of truth is here.

When changing a plugin capability:

1. Update `amp/docs/tools/*.md` first.
2. Update `amp/plugins/*.ts` to match the documented contract.
3. Run `./sync-skills.sh` to project the change into `~/.config/amp`.

## Skills

- Local: create `skills/my-skill/SKILL.md` with YAML frontmatter, then run `./sync-skills.sh`.
- Remote: add the skill to `remote-skills.yaml`, optionally add `skills/my-skill/PERSONAL.md`, add generated files to `.gitignore`, then run `./sync-skills.sh --remote`.

Remote entry template:

```yaml
skills:
  - name: my-remote-skill
    url: https://raw.githubusercontent.com/user/repo/main/skills/my-skill/SKILL.md
    enabled: true
    files: # optional companion files
      - references/commands.md
```

Generated remote files usually need `.gitignore` entries:

```gitignore
skills/my-remote-skill/SKILL.md
skills/my-remote-skill/.remote-source
skills/my-remote-skill/references/
```

To remove a skill:

- Local: delete `skills/my-skill/`.
- Remote: remove it from `remote-skills.yaml`, delete its directory, and remove related `.gitignore` entries.

```bash
rm -rf skills/my-remote-skill
./sync-skills.sh --remote   # cleans up stale entries
```
