# Logseq report automation conventions

- Before changing or operating Logseq report automation, read its `AGENTS.md` and the accepted shared RFC at `agent-skills/amp/docs/rfcs/rfc-0010-shared-local-agent-and-bot-secrets.md`. Read Logseq RFC-0010 only for legacy rollback, retirement or historical rationale.
- Keep the shared service-account bootstrap token at `~/.local/share/agent-secrets/op-service-account-token`, with mode `0600` inside a current-user-owned `0700` directory. Access it only through `agent-secrets`; never print or inspect its value.
- Keep shared bundle files under `~/.credentials/agent-secrets/` as `op://Agent Secrets/...` references only, with directory mode `0700` and file mode `0600`.
- For launchd and independent unattended checks, set `AGENT_SECRET_AUTH=service-account`. Service-account mode may retry the complete operation through the interactive account only after an operational `op` failure. It must not fall back after a policy, manifest, file-safety, command-class or vault-scope failure.
- Keep `LOGSEQ_REPORT_AUTH` and the legacy Logseq vault, bootstrap and reference file only for migration rollback until their separately approved retirement. Do not add them to new commands.
- `lelouvincx-bot` may access only repositories in the Logseq adapter's `AGENT_BOT_GITHUB_REPOSITORY_ALLOWLIST`, with write but not admin permission and no organisation membership.
- Before changing shared agent execution or publishing functions, resolve the `agent-skills` checkout with `project-resolve agent-skills --json`, then edit `amp/agent-secrets/lib-agent.sh` there. Keep Logseq-specific paths, identities and repository authorization in Logseq's `automation/lib-agent.sh` adapter.
- Verify the shared lane with `AGENT_SECRET_AUTH=service-account ./automation/weekly-report.sh --doctor` from the Logseq repository.
