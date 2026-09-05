# RFC-0010 implementation plan

Status: Stages 0 to 6 and the shared-shell rollout are complete. Credential replacement and legacy retirement remain pending. Logseq weekly-report scheduling is retired and is not a rollout stage or verification gate.

RFC: `amp/docs/rfcs/rfc-0010-shared-local-agent-and-bot-secrets.md`

Predecessor: `/Users/lelouvincx/Developer/second-brain-logseq/docs/plans/RFC-0010-unattended-agent-secret-infrastructure.md`

## Outcome

Add one local `agent-secrets` command owned by `lelouvincx/agent-skills`.

The command will resolve approved 1Password references and start one registered child process.

Logseq will use the command without changing its output validation or publishing policy.

The retired weekly-report schedule must remain uninstalled and unloaded.

The migration will keep the legacy Logseq secret path available until replacement credentials pass.

## Accepted decisions

- support local macOS runners only
- keep RFC-0009's Keychain boundary unchanged
- keep the original Logseq RFC as migration history and update its source pointers
- use `interactive` when `AGENT_SECRET_AUTH` is unset
- never let interactive mode fall back to the service account
- let service-account mode fall back to interactive mode after an operational `op` failure
- fail closed without fallback for policy, file-safety, command-class and vault-scope failures
- provide no raw read, print, export, shell-evaluation or clipboard operation
- preserve Logseq's deterministic credential preflight through a registered command class
- register no Claude Code or Pi provider-credential bundle in the first release
- let the deterministic bot wrapper serve only `lelouvincx/second-brain-logseq` and `lelouvincx/agent-skills`
- keep the retired Logseq weekly-report schedule uninstalled and unloaded
- require a new product decision before reintroducing scheduled weekly reports
- require separate approval for every external provisioning, issuance, rotation and revocation action

## Ownership

### Agent-skills

Agent-skills owns:

- capability bundle policy and schema
- shared GitHub bot identity access policy and schema
- manifest and semantic validation
- authentication and fallback
- local reference-file parsing
- child-environment construction
- exact executable-class enforcement
- secret resolution and process launch
- shared agent execution, output validation and deterministic publishing functions
- isolated projection into Amp runtime paths
- shared guidance after cutover

Source files:

- `amp/agent-secrets/bundles.json`
- `amp/agent-secrets/bundles.schema.json`
- `amp/agent-secrets/github-identities.json`
- `amp/agent-secrets/github-identities.schema.json`
- `amp/agent-secrets/lib-agent.sh`
- `amp/scripts/validate-agent-secrets.py`
- `amp/scripts/test_validate_agent_secrets.py`
- `amp/scripts/test_agent_secrets.py`
- `bin/agent-secrets`
- `sync-skills.sh`
- `scripts/check-projection`
- `.github/workflows/ci.yml`
- `.pre-commit-config.yaml`
- `README.md`

### Logseq

Logseq retains:

- duplicate-run stamps and locking
- agent output snapshots and allowlists
- commit-file allowlists
- bot SSH transport and signing
- publishing target, operation and ruleset checks
- pull request titles, bodies, comments, reviewer and assignee policy
- success-stamp ordering
- its local adapter configuration for the shared shell library

Files:

- `automation/weekly-report.sh`
- `automation/1on1-report.sh`
- `automation/knowledge-maintenance.sh`
- `automation/lib-agent.sh` (configuration and projected-library adapter only)
- `automation/validate-agent-credentials`
- `automation/publish-approved-output`
- `automation/test-weekly-report.sh`
- `automation/com.lelouvincx.logseq-weekly-report.plist`
- `.gitconfig-bot`

The existing launchd plist is historical Logseq source. RFC-0010 does not install, load or verify it. Removing the source file is separate Logseq cleanup.

### Local and external state

Repository projection must not create these files:

- `~/.credentials/agent-secrets/<bundle>.env`
- `~/.local/share/agent-secrets/op-service-account-token`

1Password owns:

- the `Agent Secrets` vault
- the `local-agent-secrets` read-only service account
- credential items referenced by local bundle files

## Initial policy

Use these command classes:

| Class | Registered source path |
| --- | --- |
| `amp` | `/Users/lelouvincx/.amp/bin/amp` |
| `claude-code` | `/Users/lelouvincx/.local/share/mise/installs/claude/latest/bin/claude` |
| `pi` | `/Users/lelouvincx/.local/share/mise/installs/pi/latest/pi` |
| `logseq-agent-preflight` | `/Users/lelouvincx/Developer/second-brain-logseq/automation/validate-agent-credentials` |
| `logseq-publisher` | `/Users/lelouvincx/Developer/second-brain-logseq/automation/publish-approved-output` |

The runtime will resolve each registered path and requested target with `realpath`.

It will reject missing, non-executable, unmatched or ambiguously resolved paths before 1Password access.

Use these bundles:

| Bundle | Variables | Compatibility | Classes | Owner |
| --- | --- | --- | --- | --- |
| `amp-runtime` | `AMP_API_KEY` | `work` | `amp`, `logseq-agent-preflight` | `lelouvincx/agent-skills` |
| `work` | `GH_TOKEN`, `GITHUB_TOKEN` | `amp-runtime` | `amp`, `claude-code`, `pi`, `logseq-agent-preflight` | `lelouvincx/agent-skills` |
| `lelouvincx-bot` | `GH_TOKEN` | none | `logseq-publisher` | `lelouvincx/second-brain-logseq` |

`GH_TOKEN` and `GITHUB_TOKEN` in `work` may point to the same reference.

Do not add `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` or a Pi provider credential.

## Resolver design

Implement `bin/agent-secrets` in Python 3.11 or newer with standard-library runtime dependencies only.

Use pinned `jsonschema` only for source validation and its tests.

### Manifest validation

Reject:

- malformed JSON and duplicate JSON object keys
- schema fields outside the closed contract
- unknown classes and compatible bundles
- asymmetric or mixed-audience compatibility
- non-absolute or duplicate executable paths
- invalid bundle, class or variable names
- secret values or 1Password references in versioned policy
- bundle variables that can alter lookup, dynamic loading or shell startup

### Local bundle parsing

Use one file named `<bundle>.env` for each bundle.

Allow blank lines, comments and one simple `NAME=op://Agent Secrets/...` assignment per data line.

Do not source the file.

Reject:

- malformed or duplicate assignments
- an unknown variable
- a plaintext or empty value
- a reference outside `Agent Secrets`
- `OP_SERVICE_ACCOUNT_TOKEN`
- quotes, interpolation and assignment prefixes such as `export`
- unsafe owner, type, symbolic link or mode metadata

Validate selected bundle files during `run` and all bundle files during `doctor`.

### Authentication

Interactive mode will:

1. Remove any inherited service-account token from each `op` subprocess environment.
2. Select `my.1password.com` explicitly.
3. Never read the bootstrap file.
4. Fail without trying the service account.

Service-account mode will:

1. Validate the bootstrap directory and file.
2. Pass the bootstrap value only to required `op` subprocesses.
3. Verify that the service account sees exactly `Agent Secrets`.
4. Resolve all selected references through the service account.
5. If an `op` command fails operationally, discard partial results and retry the complete operation through the interactive account.

Wrong vault scope is a policy failure, not an operational failure.

The resolver must report fallback before retrying.

The diagnostic must not contain a secret or full reference.

### Child environment

Start from the inherited environment.

Remove every variable whose uppercase name contains `TOKEN`, `KEY`, `SECRET`, `PASSWORD`, `CREDENTIAL` or `AUTH`.

Remove these additional process-control variables:

- `BASH_ENV`, `ENV`, `CDPATH` and `FPATH`
- `DYLD_*` and `LD_*`
- `NODE_OPTIONS` and `NODE_PATH`
- `PYTHONHOME` and `PYTHONPATH`
- `RUBYOPT`, `PERL5OPT` and `PERL5LIB`
- `GIT_ASKPASS` and `SSH_ASKPASS`
- `GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS` and `GIT_EXEC_PATH`
- `GIT_CONFIG_KEY_*` and `GIT_CONFIG_VALUE_*`

Retain ordinary operational values such as `HOME`, `PATH`, `TMPDIR` and locale settings.

Add only variables resolved from selected bundles.

Execute the requested absolute path directly with its original argument vector.

Do not construct a shell command.

Do not write a resolved value or full reference to a log, file, argument, terminal control sequence or clipboard API.

## Logseq adapters

### Agent preflight

`automation/validate-agent-credentials` will accept no arbitrary child command.

It will use `AMP_API_KEY`, `GH_TOKEN` and `GITHUB_TOKEN` only to:

- run the fixed Amp authentication check
- verify the company GitHub login
- verify the accepted classic-token contract

It will return status only.

It will not print credential values.

### Bot publisher

`automation/publish-approved-output` will expose only:

- `doctor`, for bot identity, scope, expiry, repository, permission, organisation and ruleset checks
- `publish`, for approved commit, push, pull request and comment operations
- `commit-and-push`, for an approved follow-up commit after pull request creation

Each operation will accept only the 2 existing publishing targets.

The wrapper will validate the repository origin, default branch, approved files and existing SSH contract.

It will reject arbitrary `git`, `gh`, shell and executable forwarding.

Logseq will call `publish` only after output validation.

Agent-skills may use `commit-and-push` for its required changelog pull request number commit.

## Implementation stages

### Stage 0 accept the contract

Status: complete.

Files:

- `amp/docs/rfcs/rfc-0010-shared-local-agent-and-bot-secrets.md`
- `amp/docs/plans/implementation-plan-rfc-0010-shared-local-agent-and-bot-secrets.md`
- `CHANGELOG.md`

Checks:

```bash
python3 amp/scripts/validate-rfcs.py
git diff --check
```

Completion:

- RFC status is `Accepted`
- accepted decisions are explicit
- implementation stages and approvals are stored in this repository

Rollback: revert documentation only.

### Stage 1 add policy and static validation

Depends on Stage 0.

Status: complete.

The final implementation review aligned the manifest with the accepted RFC's integer `version`, `command_classes` and bundle-owner fields. It also made the standalone runtime reject `AGENT_SECRET_AUTH` and `OP_SERVICE_ACCOUNT_TOKEN` as bundle variables before 1Password access.

Files:

- `amp/agent-secrets/bundles.json`
- `amp/agent-secrets/bundles.schema.json`
- `amp/scripts/validate-agent-secrets.py`
- `amp/scripts/test_validate_agent_secrets.py`
- `.github/workflows/ci.yml`
- `.pre-commit-config.yaml`
- `README.md`

Checks:

```bash
uvx --with jsonschema==4.25.1 python amp/scripts/validate-agent-secrets.py
uvx --with jsonschema==4.25.1 python -m unittest amp/scripts/test_validate_agent_secrets.py
```

Approval: none.

Completion: checked-in policy passes schema and semantic tests. Unsafe fixtures fail closed.

Rollback: revert Stage 1. No runtime or external state exists.

### Stage 2 add the interactive resolver

Depends on Stage 1.

Status: complete.

Files:

- `bin/agent-secrets`
- `amp/scripts/test_agent_secrets.py`

Test parsing, permissions, compatibility, realpath matching, command-class intersection, argument preservation, sanitization and child exit status with fake commands.

Approval: none.

Completion: interactive tests pass without live 1Password access.

Rollback: revert Stage 2. Policy remains inert.

### Stage 3 add service-account fallback and doctor

Depends on Stage 2.

Status: complete.

Files:

- `bin/agent-secrets`
- `amp/scripts/test_agent_secrets.py`

Test:

- bootstrap owner, type, symbolic link and mode checks
- exact service-account vault scope
- service-account-first ordering
- operational fallback to interactive
- no reverse fallback
- no fallback for policy failures
- complete retry after discarding partial values
- token and selector non-inheritance
- redacted diagnostics
- absence of clipboard calls

Approval: none. Use fake `op` commands and sentinel values only.

Completion: both lanes and doctor pass isolated tests.

Rollback: revert Stage 3. Interactive mode remains available.

### Stage 4 project and validate runtime files

Depends on Stage 3.

Status: complete. Isolated and live projection passed.

Files:

- `sync-skills.sh`
- `scripts/check-projection`
- `.github/workflows/ci.yml`
- `.pre-commit-config.yaml`

Validate policy before changing `$AMP_CONFIG_DIR/agent-secrets/`.

Project the manifest and schema with stale-file deletion.

Continue projecting `bin/agent-secrets` through the existing `~/.local/bin` symlink loop.

Prove projection does not create a bootstrap token or local bundle file.

Checks:

```bash
tmp_home="$(mktemp -d)"
HOME="$tmp_home" AMP_CONFIG_DIR="$tmp_home/.config/amp" ./sync-skills.sh
scripts/check-projection
```

Approval: none for isolated projection.

Completion: CI and temporary projection pass without live runtime writes.

Rollback: restore the previous source revision and remove only non-secret projected policy and command links.

### Stage 5 provision and copy credentials

Depends on Stage 4.

Status: complete. Chinh separately approved each provisioning and item-copy action before it ran.

Chinh must separately approve:

1. Creating `Agent Secrets`.
2. Creating `local-agent-secrets` and issuing its token.
3. Installing the bootstrap file and reference-only bundle files.
4. Copying the legacy Logseq credential items into `Agent Secrets`.

Prefer the 1Password UI for copying item values so the implementation agent never sees them.

Keep the legacy vault, service account, bootstrap file and references active.

Provisioning record:

- created the `Agent Secrets` vault in the interactive account
- created the read-only `local-agent-secrets` service account with access only to `Agent Secrets`
- installed the service-account bootstrap with directory mode `0700` and file mode `0600`
- installed reference-only `amp-runtime`, `work` and `lelouvincx-bot` bundle files with exact local modes
- copied and verified the Logseq Amp API, company GitHub and bot GitHub credentials
- copied and verified the approved DeepSeek, TikHub, Media Manager, OpenRouter and X credentials
- copied and verified the complete approved `Holistics Demo4` and `holistics-embed-demo` items
- replaced the five corresponding legacy local environment files with reference-only `Agent Secrets` entries at mode `0600`
- left the legacy Logseq vault, service account, bootstrap and weekly-report environment file active for rollback

Checks:

```bash
AGENT_SECRET_AUTH=interactive agent-secrets doctor
AGENT_SECRET_AUTH=service-account agent-secrets doctor
```

Completion: both doctors pass against copied credentials.

Result: both doctors passed in interactive and service-account modes. The service-account doctor did not fall back.

Rollback: continue using the untouched legacy path. Revoking the new service account needs separate approval.

### Stage 6 migrate Logseq behind compatibility

Depends on Stage 5.

Status: complete.

Files:

- `.gitconfig-bot`
- `automation/lib-agent.sh`
- `automation/validate-agent-credentials`
- `automation/publish-approved-output`
- `automation/weekly-report.sh`
- `automation/1on1-report.sh`
- `automation/knowledge-maintenance.sh`
- `automation/test-weekly-report.sh`

Map `LOGSEQ_REPORT_AUTH` to `AGENT_SECRET_AUTH` during migration.

Reject conflicting selectors before credential access.

Keep no-op checks before `agent-secrets`.

Run preflight with `amp-runtime` and `work` before Git side effects.

Run Amp with the same bundles.

Do not add Claude Code provider environment variables.

Run bot publishing with `lelouvincx-bot` only after output validation.

Replace the test that renames the live credentials file with an isolated `HOME` fixture.

Checks:

```bash
bash -n automation/{lib-agent.sh,validate-agent-credentials,publish-approved-output,weekly-report.sh,1on1-report.sh,knowledge-maintenance.sh}
./automation/test-weekly-report.sh
plutil -lint automation/com.lelouvincx.logseq-weekly-report.plist
./automation/weekly-report.sh --mode tuesday --dry-run
./automation/1on1-report.sh --dry-run
./automation/knowledge-maintenance.sh --dry-run
LOGSEQ_REPORT_AUTH=interactive ./automation/weekly-report.sh --doctor
LOGSEQ_REPORT_AUTH=service-account ./automation/weekly-report.sh --doctor
```

Approval: none for code, tests and read-only doctors.

Completion: all Logseq checks pass against copied credentials without changing policy or output.

Result:

- shell syntax and plist validation passed
- 169 isolated Logseq automation tests passed with no failures
- weekly, 1-on-1 and knowledge-maintenance dry-runs passed
- integrated weekly doctors passed through the source resolver in both authentication lanes without fallback
- output validation, repository and file allowlists, bot SSH transport, publishing policy and Amp medium mode remain enforced
- bot commits sign directly with the hardened private key while SSH-agent variables are absent
- pull request create and update operations use exact REST endpoints so the approved `repo`-only bot PAT needs no wider scope
- publisher argument and path policy fails before fixed local-root lookup, including in CI
- the predecessor Logseq RFC remains byte-for-byte unchanged

Rollback: revert Stage 6 while the legacy path remains active.

## Completed rollout record

Shared-shell rollout is complete:

- agent-skills pull request 180 merged the RFC, resolver, policy, validation, tests and projection
- agent-skills pull request 186 moved the reusable Logseq agent implementation into `amp/agent-secrets/lib-agent.sh`
- Logseq pull request 89 reduced its shell adapter to Logseq-owned paths, identities, bundles and policy
- Logseq pull request 90 added deterministic bot GitHub operations without exposing a general-purpose command surface
- agent-skills pull request 187 fixed dash-prefixed path hashing and projected the exact merged source
- the latest 196 Logseq automation tests and all relevant agent-skills checks passed
- the projected library matches the merged source byte for byte
- the complete service-account doctor passed without interactive fallback
- no launchd job or plist symlink is installed or loaded

The earlier launchd trial and 25 August run are historical evidence only. They do not authorize another run or make scheduling a completion gate.

### Stage 7 replace upstream credentials

Depends on Stage 6.

Replace one credential at a time in this order:

1. Amp API credential.
2. Company GitHub credential.
3. Bot classic PAT.

For each credential:

1. Ask Chinh before issuing a replacement.
2. Ask Chinh before changing the `Agent Secrets` item.
3. Run both doctors and the relevant Logseq preflight.
4. Verify the relevant phase or an approved end-to-end run.
5. Ask Chinh separately before revoking the superseded credential.
6. Verify the replacement again after revocation.

Keep the hardened bot SSH key unchanged.

Completion: every new credential passes after its predecessor is revoked.

Rollback before revocation: restore the old value in `Agent Secrets` with approval.

Rollback after revocation: issue another replacement with approval. The old credential cannot be restored.

### Stage 8 retire the legacy path

Depends on Stage 7.

Ask Chinh separately before:

- revoking the legacy `logseq-weekly-report` service account
- removing the legacy bootstrap file
- removing `~/.credentials/weekly-report.env`

Do not delete the `Logseq Reports` vault without another explicit request.

Update:

- `AGENTS.md`
- `amp/AGENTS.md`
- `amp/conventions/logseq-report-automation.md`
- Logseq `AGENTS.md`
- RFC implementation references and status
- `CHANGELOG.md`

Keep the predecessor Logseq RFC unchanged.

Final checks:

- both shared doctors pass
- Logseq automation tests pass
- shared guidance contains no legacy service-account instruction
- no resolved value appears in repositories, logs, arguments, files or the clipboard

Completion: the legacy service account and local files are retired. `Agent Secrets` is the only live 1Password automation boundary for this workflow.

Rollback: create and verify a new service account. The revoked legacy service account cannot be restored.

## Approval register

Approval for one action does not approve another action.

The implementation agent must stop and ask Chinh before each of these actions:

- create or change a 1Password vault
- create a service account or issue its bootstrap token
- copy or change a 1Password item
- issue or rotate an upstream credential
- revoke an upstream credential
- revoke a service account
- remove legacy local credential files
- push a branch, open a pull request or merge it
- force a publishing workflow

The retired Logseq weekly-report schedule must remain uninstalled and unloaded. Reintroducing it needs a separate plan and explicit product decision from Chinh.

## Working-tree rule

The Logseq checkout contains unrelated local journals, pages and untracked files.

Implementation must preserve those changes. The implementation agent must not manually reset, stash or rewrite them.

Do not invoke a Logseq workflow that performs its own stash or branch switch while migration code is uncommitted. After the migration is landed, the workflow may stash the normal journal and page inputs only when Chinh confirms that they are ready to publish. Files outside the report allowlists must remain untouched.

The implementation agent must re-read each Logseq file immediately before editing it.
