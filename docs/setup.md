# Setup and sync

This page explains what `./sync-skills.sh` installs, how other agents pick up the same files, and how development orbs sync.

## Install on a new machine

```bash
git clone <repo-url>
cd agent-skills
./sync-skills.sh --remote
./sync-skills.sh
```

`--remote` fetches remote skill payloads. Run it again only when you want to refresh them.

## What sync installs

`./sync-skills.sh` projects this repository into your home directory:

| Source | Destination | Used by |
| --- | --- | --- |
| `amp/` runtime files | `~/.config/amp` | Amp |
| `skills/*` | `~/.agents/skills` | Amp, Cursor and other Agent Skills clients |
| `skills/*` | `~/.claude/skills` | Claude Code CLI and Claude Desktop local Code sessions |
| `bin/*` | `~/.local/bin` | your shell, when `~/.local/bin` is on `PATH` |
| `amp/AGENTS.md` | `~/.cursor/rules/agent-skills.mdc` | Cursor |

Skills and scripts are symlinks, so edits in this repository take effect without copying.

Never edit the projected files under `~/.config/amp` in place. Edit the source here and run `./sync-skills.sh` again.

## Claude

Claude Code CLI and Claude Desktop local Code sessions read `~/.claude/skills`.

Claude Desktop Cowork and cloud sessions do not read local skills. They use skills synced through the claude.ai **Customize** settings.

## Cursor

Cursor reads the shared skills in `~/.agents/skills` directly, so it needs no separate copies.

Sync also generates an always-applied rule at `~/.cursor/rules/agent-skills.mdc` from `amp/AGENTS.md`, with a short Cursor compatibility note. To change it, edit `amp/AGENTS.md` and run `./sync-skills.sh`. Sync leaves your other Cursor rules alone.

Limits:

- repository CLIs stay available through the shell; check `command -v <tool>` for `PATH` conflicts, and use `~/.local/bin/<tool>` to pick the repository helper explicitly
- Amp plugins and session-bound helpers do not carry over to Cursor
- sync does not register MCP servers in Cursor
- these local paths do not configure Cursor Cloud Agents

## Development orbs

In an agent-skills development orb, run `.agents/sync` to project the current working checkout. It never clones, pulls or resets source. Pass `--remote` only when you also want to refresh remote skill payloads.

Setup and resume use their own working checkout and do not pull when no source override is supplied.

Consuming projects select their infrastructure source explicitly:

- a clean checkout refreshes with `pull --ff-only`
- a dirty checkout is projected without a pull

Keep consuming-project customizations after the shared baseline, as SmartClass does in `.agents/project`. Do not put application installation or database work in an explicit runtime sync.

## Browser and desktop automation

Agent Browser uses a pinned stock release. The version lives in `amp/agent-browser/version`. Sync installs it under `~/.local/libexec/agent-browser-stock`, and `bin/agent-browser` wraps it (RFC-0013).

Agent Desktop automates native desktop apps alongside the browser workflow. Sync projects the official skill pinned to v1.3.1, but it does not install the CLI or grant Accessibility permission. To set it up on a Mac:

```bash
brew install agent-desktop
agent-desktop status
agent-desktop permissions --guide
```

If the CLI version differs from the pinned skill, load the matching guide with `agent-desktop skills get desktop`. The binary embeds its platform and command references. No MCP server or desktop VM is configured.

## Background Amp runners

`amp-runner` installs a user LaunchAgent for a named Amp runner. The runner starts at login, restarts after failure, enables Amp remote terminal control, and keeps the Mac awake on AC power.

```bash
amp-runner install macbook.agent-skills
amp-runner list
amp-runner status macbook.agent-skills
amp-runner restart all
amp-runner logs macbook.agent-skills
```

`amp-runner-logs` rotates, backs up and restores the private runner logs.

For lifecycle, backup, restore and safety details, see the [Amp runner guide](../amp/docs/tools/amp-runner.md) and the [runner log maintenance guide](../amp/docs/tools/amp-runner-logs.md).
