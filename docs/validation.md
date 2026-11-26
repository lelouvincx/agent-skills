# Validation

Use [pre-commit](https://pre-commit.com) to run this repository's checks.

## Set up once

```bash
pre-commit install
pre-commit install --hook-type pre-push
```

## Run checks

Run fast checks on staged files while you work:

```bash
pre-commit run
```

Run all integration checks before you push:

```bash
pre-commit run --hook-stage pre-push --all-files
```

Full pre-push validation needs `uv`/`uvx`, `rsync`, Bun 1.3.14 or newer, and npm. The SDK check uses `npm ci` and the committed lockfile.

## Debug a failed check

Run the matching command directly:

| Check | Command |
| --- | --- |
| Test the Amp documentation validator | `python3 -m unittest amp/scripts/test_validate_plugin_docs.py` |
| Validate Amp capability, issue and experiment docs | `python3 amp/scripts/validate-plugin-docs.py` |
| Validate Amp RFCs | `python3 amp/scripts/validate-rfcs.py` |
| Test the agent secret resolver | `uvx --with jsonschema==4.25.1 python -m unittest amp/scripts/test_validate_agent_secrets.py amp/scripts/test_agent_secrets.py amp/scripts/test_agent_secrets_good_outcomes.py` |
| Test shared agent helper contracts | `amp/scripts/test-agent-secrets-lib.sh` |
| Test bot publishing controls | `bash amp/scripts/test-agent-bot-pr.sh` |
| Test shared Orb lifecycle and development sync | `bash scripts/test-orb-setup.sh` |
| Validate agent secret policy | `uvx --with jsonschema==4.25.1 python amp/scripts/validate-agent-secrets.py` |
| Test the Anfra Discourse MCP launcher | `bun test scripts/anfra-discourse-mcp.test.ts` |
| Test the GitHub thread event validator | `python3 -m unittest amp/scripts/test_validate_github_thread_events.py` |
| Validate GitHub thread event configuration | `python3 amp/scripts/validate-github-thread-events.py` |
| Validate the project registry | `scripts/check-project-registry` |
| Test the project resolver | `scripts/check-project-resolver` |
| Test the Amp runner launcher | `scripts/check-amp-runner` |
| Test Amp runner log maintenance | `scripts/check-amp-runner-logs` |
| Test Amp ChatGPT subscription selection | `scripts/check-amp-chatgpt-subscription-selector` |
| Test local Claude subscription selection | `scripts/check-amp-claude-subscription-selector` |
| Validate runtime projection | `scripts/check-projection` |
| Build Amp plugins | `scripts/check-plugin-builds` |
| Validate SDK dependencies | `npm ci --prefix sdk` |
| Test the Slack events Worker | `npm ci --prefix workers/slack-events && (cd workers/slack-events && bun test && npx cf build)` |
