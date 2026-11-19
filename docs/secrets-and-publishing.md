# Secrets and bot publishing

This page covers two helpers:

- `agent-secrets` runs a command with only the 1Password-backed secrets approved for it
- `agent-bot-pr` commits, pushes and manages pull requests as `lelouvincx-bot`

## Run commands with secret bundles

`agent-secrets` starts a registered local command with only the capability bundles approved for that command class.

```bash
agent-secrets run \
  --bundle amp-runtime \
  --bundle work \
  -- /Users/lelouvincx/.amp/bin/amp

agent-secrets run \
  --bundle lelouvincx-bot \
  -- gh auth status

agent-secrets doctor
```

The resolver has only 2 subcommands, `run` and `doctor`. It never prints, exports, evaluates or copies resolved values to the clipboard.

### Where bundles live

Local bundle files live in `~/.credentials/agent-secrets/`:

- the directory has mode `0700` and each file has mode `0600`
- files may contain only simple assignments to `op://Agent Secrets/...` references
- the service-account bootstrap file is separate, and this repository never projects it

`./sync-skills.sh` validates and installs the bundle references, then links the resolver into `~/.local/bin`.

### Policy

The [agent-secrets guide](../amp/agent-secrets/README.md) covers capability policy and private references.

The shared GitHub identity policy records the full repository access expected for bot accounts. Each consuming repository separately limits which targets and operations its automation may use.

## Publish as the bot

Use `agent-bot-pr` for repository maintenance through the approved bot path in approved repositories:

```bash
agent-bot-pr commit -m "fix: keep agent-secrets hot paths unattended" -- bin/agent-secrets amp/scripts/test_agent_secrets.py
agent-bot-pr open --title "fix: keep agent-secrets hot paths unattended" --body-file /tmp/pr-body.md
agent-bot-pr changelog --pr 233 --entry "Keep agent-secrets hot paths unattended."
agent-bot-pr checks
agent-bot-pr merge --pr 233
```

How it authenticates:

- commits and pushes use the hardened bot SSH identity
- where that key is missing, as in orbs, it pushes over HTTPS with the `lelouvincx-bot` bundle token and makes unsigned commits
- other GitHub writes go through `agent-secrets` and the `lelouvincx-bot` bundle

The approved repositories are listed in `amp/agent-secrets/github-identities.json`.
