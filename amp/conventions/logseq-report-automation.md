# Logseq report automation conventions

- Before changing or operating unattended report automation in the `logseq` project, read its `AGENTS.md` and `docs/plans/RFC-0010-unattended-agent-secret-infrastructure.md`.
- The Logseq report bootstrap token is the only plaintext-file exception: keep it at `~/.local/share/weekly-report/op-service-account-token`, with mode `0600` inside a current-user-owned `0700` directory. Access it only through the repository helpers; never print or inspect its value.
- For launchd, remote runs and independent unattended checks, set `LOGSEQ_REPORT_AUTH=service-account`; use the repository helpers so the service-account token remains scoped to 1Password calls.
- The service-account lane must not trigger a 1Password biometric prompt; if a prompt appears, stop because the command entered the wrong authentication lane.
- `GH_WORK_TOKEN` in `~/.credentials/weekly-report.env` must reference `op://Logseq Reports/GitHub GH_TOKEN_WORK/credential`; the expected GitHub owner is `chinh-dm-holistics`.
- `lelouvincx-bot` may access only `lelouvincx/second-brain-logseq` and `lelouvincx/agent-skills`, with write but not admin permission and no organisation membership. Add future repositories to the Logseq repository's `AGENT_BOT_GITHUB_REPOSITORY_ALLOWLIST` before granting access.
- Verify this lane with `LOGSEQ_REPORT_AUTH=service-account ./automation/weekly-report.sh --doctor` from the Logseq repository.
