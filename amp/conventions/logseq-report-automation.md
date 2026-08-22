# Logseq report automation conventions

- Before changing or operating unattended report automation in the `logseq` project, read its `AGENTS.md`, its unchanged predecessor `docs/plans/RFC-0010-unattended-agent-secret-infrastructure.md`, and the accepted shared RFC at `agent-skills/amp/docs/rfcs/rfc-0010-shared-local-agent-and-bot-secrets.md`.
- Keep the shared service-account bootstrap token at `~/.local/share/agent-secrets/op-service-account-token`, with mode `0600` inside a current-user-owned `0700` directory. Access it only through `agent-secrets`; never print or inspect its value.
- Keep shared bundle files under `~/.credentials/agent-secrets/` as `op://Agent Secrets/...` references only, with directory mode `0700` and file mode `0600`.
- For launchd and independent unattended checks, set `AGENT_SECRET_AUTH=service-account`. Service-account mode may retry the complete operation through the interactive account only after an operational `op` failure. It must not fall back after a policy, manifest, file-safety, command-class or vault-scope failure.
- Keep `LOGSEQ_REPORT_AUTH` and the legacy Logseq vault, bootstrap and reference file only for migration rollback until their separately approved retirement. Do not add them to new commands.
- `lelouvincx-bot` may access only `lelouvincx/second-brain-logseq` and `lelouvincx/agent-skills`, with write but not admin permission and no organisation membership. Add future repositories to the Logseq repository's `AGENT_BOT_GITHUB_REPOSITORY_ALLOWLIST` before granting access.
- Verify the shared lane with `AGENT_SECRET_AUTH=service-account ./automation/weekly-report.sh --doctor` from the Logseq repository.
