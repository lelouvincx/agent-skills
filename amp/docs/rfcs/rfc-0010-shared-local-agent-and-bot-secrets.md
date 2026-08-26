---
doc_schema: "amp-rfc/v1"
code: "RFC-0010"
title: "Shared local agent and bot secrets"
slug: "shared-local-agent-and-bot-secrets"
file: "rfc-0010-shared-local-agent-and-bot-secrets.md"
status: "Accepted"
summary: "Provide named 1Password-backed capability bundles to approved local agents and deterministic bot commands without giving child processes the service-account token."
created: "2026-08-22"
updated: "2026-08-26"
amp_thread_id:
  T-01a027f3-f748-745c-99e0-42be89c4e177: "moved the shared successor design from Logseq into agent-skills and generalized access for local agents and bots"
  T-01a02845-76ae-715f-9569-84bba5c6e1d6: "reviewed command-class enforcement, Logseq cutover safety and child-environment construction"
  T-01a02856-b1f8-771e-8cd8-240316b81f1c: "accepted the contract and implementation plan, including asymmetric authentication fallback and deterministic Logseq preflight and publishing"
  T-019f4f39-34b7-7169-9005-a5d36a49c642: "established the original unattended 1Password service-account and publishing boundaries"
  T-01a00a25-4ccc-7188-a1f1-210ad413b2b2: "implemented and verified the original Logseq-specific credential topology"
dependency:
  - type: "external-rfc"
    code: "LOGSEQ-RFC-0010"
    title: "Unattended agent secret infrastructure"
    repository: "lelouvincx/second-brain-logseq"
    url: "https://github.com/lelouvincx/second-brain-logseq/blob/master/docs/plans/RFC-0010-unattended-agent-secret-infrastructure.md"
implementation:
  - path: "../../agent-secrets/bundles.json"
  - path: "../../agent-secrets/bundles.schema.json"
  - path: "../../agent-secrets/lib-agent.sh"
  - path: "../../scripts/validate-agent-secrets.py"
  - path: "../../scripts/test_validate_agent_secrets.py"
  - path: "../../scripts/test_agent_secrets.py"
  - path: "../../../bin/agent-secrets"
inputs:
  - name: "capability bundle request"
    kind: "bundle names and child command"
    purpose: "Select the credentials and command class approved for one process."
  - name: "capability bundle manifest"
    kind: "versioned policy"
    purpose: "Define each bundle's audience, variables, compatible bundles and allowed command classes."
  - name: "local capability bundle file"
    kind: "1Password reference-only env file"
    purpose: "Map approved environment variables to items in the automation vault."
  - name: "1Password authentication lane"
    kind: "interactive account or service account"
    purpose: "Resolve approved references with or without human approval."
outputs:
  - name: "bundle-scoped child process"
    kind: "local process"
    purpose: "Run an agent or deterministic tool with only its approved credential variables."
  - name: "agent-secrets doctor result"
    kind: "validation report"
    purpose: "Verify local files, 1Password scope, bundle policy and token non-inheritance without printing secrets."
supersedes: []
superseded_by: null
related:
  - type: "rfc"
    code: "RFC-0009"
    title: "Durable GitHub events for local Amp threads"
    path: "./rfc-0009-durable-github-events-for-local-amp-threads.md"
  - type: "implementation-plan"
    title: "RFC-0010 implementation plan"
    path: "../plans/implementation-plan-rfc-0010-shared-local-agent-and-bot-secrets.md"
tags:
  - "1password"
  - "agent-runtime"
  - "bot-identity"
  - "local-automation"
  - "secrets"
---

# RFC-0010: Shared local agent and bot secrets

## Summary

Create one local `agent-secrets` command owned by `lelouvincx/agent-skills`.

The command resolves named 1Password-backed capability bundles and starts one approved child process.

It supports interactive and unattended local runs from any repository.

Amp, Claude Code, Pi and deterministic commands acting as `lelouvincx-bot` are initial child targets.

Each child receives credentials only from the bundles approved for its task phase.

No child receives the 1Password service-account token.

Agent-skills owns the shared shell implementation. Automation repositories retain their configuration, authorization and publishing rules.

The original Logseq RFC records the legacy implementation and rollback design.

## Context

### Predecessor

Logseq RFC-0010 implemented unattended 1Password access for weekly reports, 1-on-1 reports and knowledge maintenance.

It uses a dedicated service account, an owner-only bootstrap token file and reference-only local credentials.

It also separates report generation from deterministic bot publishing.

That implementation was deliberately tied to:

- the `Logseq Reports` vault
- `~/.credentials/weekly-report.env`
- a Logseq-specific bootstrap path
- `LOGSEQ_REPORT_AUTH`
- the implementation in `automation/lib-agent.sh`

The problem is that the implemented contract works only for Logseq.

Another local agent, bot or repository cannot reuse it without copying Logseq-specific infrastructure.

### New need

Local agents increasingly need credentials outside Logseq automation.

Examples include Amp API access, Claude Code or Pi provider access, company GitHub enrichment and bot publishing.

Copying Logseq's helpers would make each repository with an automation script own another service-account token, parser, authentication selector and doctor command.

That duplication would increase credential rotation and revocation work.

The copies could also disagree about file safety, vault scope, token inheritance and failure behavior.

Putting every secret in ambient environment variables would expose unrelated credentials to every child process.

Giving Amp the service-account token would turn one approved capability into vault-wide access.

The shared layer must make credentials easier to request without making them ambient or unrestricted.

### Local execution scope

This RFC applies only to processes running on Chinh-controlled local runners.

It does not apply to Amp Orbs.

An Amp Orb is a remote agent sandbox and cannot use local bundle files or the local bootstrap token.

Orb credentials need a separate remote-secret contract and explicit provisioning.

The first implementation supports macOS only.

Portable file metadata checks and support for another operating system require a later design decision.

### Trust boundary

The accepted trust boundary is Chinh's macOS user account.

File permissions and bundle separation reduce accidental disclosure.

They do not isolate a malicious process running as the same user.

Stronger isolation requires a dedicated operating-system user or an external broker.

That stronger boundary is outside this RFC.

### Relationship to RFC-0009

RFC-0009 proposes a separate unattended credential path for the durable GitHub event runner.

It currently selects macOS Keychain for its service-account bootstrap token.

This RFC does not change RFC-0009.

RFC-0009 retains its separate Keychain-backed trust domain.

It must not adopt the owner-only bootstrap file defined by this RFC.

## Decision

### Shared owner

Move reusable secret resolution into `lelouvincx/agent-skills`.

Project repositories consume the shared command instead of copying bootstrap logic.

`sync-skills.sh` projects the command from `bin/` into `~/.local/bin`.

This migration includes the reusable secret setup currently implemented inside the Logseq repository.

After the shared implementation passes its acceptance checks, Logseq replaces its local authentication, reference parsing and bootstrap helpers with `agent-secrets`.

Logseq also loads the projected `amp/agent-secrets/lib-agent.sh` implementation through a small repository-owned adapter.

The credential migration uses copy, verify and rotate rather than an immediate move.

After Chinh approves the external changes, create the shared service-account and local-file topology, then copy the Logseq credential items into `Agent Secrets`.

Keep the legacy `Logseq Reports` vault, service account, bootstrap token and references working while the shared doctor and Logseq automation pass against the copies.

At final cutover, issue replacement upstream credentials and store them only in `Agent Secrets`.

Keep the superseded credentials valid until the replacements pass every shared and Logseq check.

Then revoke the superseded credentials so that the legacy copies stop working, revoke the legacy service account and remove the legacy local files.

This sequence avoids breaking existing `op://Logseq Reports/` references during verification and avoids leaving 2 live copies indefinitely.

Logseq retains its scheduling, output validation, repository allowlist, configuration and publishing policy.

### Capability bundles

A capability bundle is a term defined by this RFC.

It is not a native 1Password object.

1Password provides accounts, vaults, items, fields, service accounts and `op://` references.

`agent-secrets` groups those references into named capability bundles for process-scoped injection.

Each capability bundle has 2 parts:

- versioned policy in `agent-skills`
- a local file containing approved 1Password references

The versioned policy defines:

- its audience
- its permitted environment variable names
- a symmetric list of compatible bundles
- its allowed target command classes
- its policy owner

The local file maps those permitted variables to `op://Agent Secrets/` references.

For example, `amp-runtime` has these 2 parts:

| Part | Concrete value |
| --- | --- |
| versioned policy | audience `agent`; permitted variable `AMP_API_KEY`; compatible with `work`; target command class `amp` |
| local file | `AMP_API_KEY` points to `op://Agent Secrets/Amp API Key/credential` |

When an automation script requests `amp-runtime`, `agent-secrets` resolves that reference and starts Amp with `AMP_API_KEY`.

For this request, the Amp child receives no other bundle and never receives the 1Password service-account token.

Requesting a capability bundle injects every variable defined in that bundle into one child process.

A credential may join a bundle only when every process receiving that bundle may safely receive the credential.

Bundles represent capabilities or trust domains, not projects.

An approved process may combine compatible bundles from one audience.

The resolver rejects a bundle set that mixes agent and publisher audiences.

### Authentication lanes

Use 2 explicit 1Password authentication lanes:

- interactive for manual runs through Chinh's desktop-backed account
- service account for approved unattended local runs

`AGENT_SECRET_AUTH` selects the lane.

It accepts `interactive` and `service-account`.

It defaults to `interactive` when unset.

Invalid values fail immediately.

Interactive mode never falls back to the service account.

Service-account mode tries the service account first.

If a required 1Password command fails for an operational reason, it retries the complete authentication and resolution operation through the interactive account.

The resolver reports that fallback occurred without printing a secret or full reference.

It does not fall back after a manifest, local-file, command-class or vault-scope validation failure.

Interactive fallback may request desktop or biometric approval, including when a supervised process selected service-account mode.

### 1Password topology

Create one dedicated automation vault named `Agent Secrets`.

Create one read-only service account named `local-agent-secrets`.

The service account may read only `Agent Secrets`.

It must not have write, share or vault-creation permission.

The shared vault contains only credentials approved for local automation.

It must not contain Chinh's 1Password credentials, recovery material or unrelated personal secrets.

1Password grants service-account access at vault level.

It does not provide item-level permissions within a vault.

The vault therefore defines the maximum reach of the bootstrap token.

[1Password service-account permissions and vault access are immutable](https://developer.1password.com/docs/service-accounts/get-started/) after creation.

Changing this scope requires creating and verifying a replacement service account, then revoking the old one.

Use another vault and service account when a future automation script needs a separate trust domain.

### Policy ownership

`agent-skills` owns authentication, bundle validation, process-scoped injection and the shared shell implementation.

Each automation repository owns the adapter configuration and permission to request a bundle or use the resulting external identity.

Credential availability does not grant resource authorization.

Logseq continues to own its schedule checks, output allowlists and bot repository allowlist.

## Contract

### Roles

The contract distinguishes 4 roles:

- automation script: local script that selects bundles and a child command for one task phase
- resolver and launcher: `agent-secrets`, which validates bundles, resolves references and starts the child
- agent runtime: Amp, Claude Code, Pi or another process that reasons and uses tools
- external identity: `lelouvincx-bot`, `chinh-dm-holistics` or another account represented by a credential

An automation script is not an agent runtime.

The automation script calls `agent-secrets` and owns the task-specific authorization around that call.

For Logseq report generation, `automation/weekly-report.sh` is the automation script and Amp is the agent runtime.

For Logseq publishing, the same automation script selects the approved publishing command as the child target.

An agent runtime may use an external identity only when automation-script policy connects them.

An external identity does not receive a secret itself.

The resolver injects the external identity's credential into an approved child process.

A direct manual invocation has no automation script.

In that case, Chinh calls `agent-secrets` directly and provides the explicit task authorization.

### Capability bundle manifest

Keep the source manifest at `amp/agent-secrets/bundles.json` and its JSON Schema at `amp/agent-secrets/bundles.schema.json`.

`amp/scripts/validate-agent-secrets.py` validates both files before projection.

`sync-skills.sh` projects the 2 files into `$AMP_CONFIG_DIR/agent-secrets/` for local use.

The manifest is a JSON object with:

- integer `version`, initially `1`
- `command_classes`, an object keyed by class name, where each entry contains a non-empty list of absolute executable paths
- `bundles`, an object keyed by bundle name, where each entry contains the policy fields below

Each bundle key is a unique lowercase kebab-case name.

Each bundle entry contains:

- audience `agent` or `publisher`
- an exact environment variable allowlist
- an exact compatibility list
- an exact target command class allowlist
- an owning repository or shared owner

Compatibility is symmetric.

Every selected pair must list each other as compatible, and the validator rejects an asymmetric declaration.

The validator also rejects an unknown class, an unknown compatible bundle or a compatibility pair with different audiences.

An empty compatibility list means that the bundle may run only by itself.

The manifest contains no secret value and no 1Password reference.

The first manifest contains:

| Bundle | Audience | Contents | Compatible bundles | Allowed command classes |
| --- | --- | --- | --- | --- |
| `amp-runtime` | agent | Amp API credential | `work` | `amp`, `logseq-agent-preflight` |
| `work` | agent | credentials approved for work-scoped agent use | `amp-runtime` | `amp`, `claude-code`, `pi`, `logseq-agent-preflight` |
| `lelouvincx-bot` | publisher | credentials owned by and approved for the bot | none | `logseq-publisher` |

These bundles cover the credentials already used by Logseq and provide the first migration path.

`amp-runtime` separates agent-provider authentication from credentials for external services.

`work` initially contains the accepted company GitHub credential.

It may contain another work credential only when Chinh approves that credential for every work-scoped agent process.

A work credential that needs narrower exposure gets a separate bundle.

`lelouvincx-bot` initially contains the bot's GitHub classic PAT.

It may contain another bot-owned credential only when it is safe for every registered deterministic process acting as that bot.

A bot credential that needs narrower commands or resource access gets a separate publisher bundle.

The bot bundle isolates publishing authority from agent execution and gives the mixed-audience rejection rule a concrete boundary.

The initial set is not a universal identity taxonomy.

Add another bundle when a credential has a different identity, audience or exposure boundary.

The initial implementation does not add provider-credential bundles for Claude Code or Pi.

Those runtimes get separate bundles only when they need credentials managed by this contract.

### Target command classes

A target command class is a manifest name bound to one or more absolute executable paths.

The resolver requires the requested child command to be an absolute path.

It resolves the requested path and every registered path with `realpath`, then requires an exact match.

It does not match a basename and does not search `PATH`.

A child satisfies a selected bundle only when the matching command class appears in that bundle's allowlist.

When a request selects several bundles, the child must satisfy every selected bundle's allowlist.

The intersection rule means that `amp-runtime` and `work` can start the registered `amp` executable together, while `work` by itself can also start registered Claude Code or Pi executables.

The first `logseq-agent-preflight` class points to `automation/validate-agent-credentials` in the Logseq repository.

It lets Logseq validate Amp and the company GitHub identity without returning resolved credentials to the calling shell.

The first `logseq-publisher` class points to one deterministic executable wrapper extracted from the current Logseq publishing functions during migration.

That wrapper, not a general shell or agent runtime, is the only initial command allowed to receive `lelouvincx-bot`.

The wrapper accepts strict high-level operations for `lelouvincx/second-brain-logseq` and `lelouvincx/agent-skills` only.

It enforces Logseq's existing repository allowlist and rejects arbitrary `git`, `gh` or shell forwarding.

A missing, non-executable or unmatched path fails before 1Password access.

### Local capability bundle files

Store local bundle files under `~/.credentials/agent-secrets/`.

Use one env file for each manifest bundle.

The directory must:

- belong to the current user
- have mode `0700`
- be a regular directory
- not be a symbolic link

Each bundle file must:

- belong to the current user
- have mode `0600`
- be a regular file
- not be a symbolic link
- define only variables allowed by its manifest bundle
- contain only references under `op://Agent Secrets/`
- contain no resolved value
- contain no duplicate variable

Several variables may point to the same `op://` reference.

This permits compatibility aliases such as `GH_TOKEN` and `GITHUB_TOKEN` without duplicating the credential item.

The parser reads simple assignments without sourcing the file.

It must not use `eval` or command interpolation.

It rejects the 1Password service-account variable as a bundle key.

It also rejects variables that can alter command lookup, dynamic loading or shell startup.

### Bootstrap token

Store the service-account bootstrap token at `~/.local/share/agent-secrets/op-service-account-token`.

The parent directory must:

- belong to the current user
- have mode `0700`
- be a regular directory
- not be a symbolic link

The token file must:

- belong to the current user
- have mode `0600`
- be a regular file
- not be a symbolic link
- contain one raw non-empty value
- contain no assignment prefix

The bootstrap token must not appear in logs, arguments, temporary files or repository files.

The resolver sets it only around required 1Password CLI calls.

The resolver removes it before starting the target process.

Replacing the bootstrap token means replacing the service account because 1Password service accounts cannot be modified and expose their token only at creation.

Provision and install the replacement, run the service-account doctor successfully, then revoke the old service account.

Never revoke the working service account before its replacement passes verification.

### Command

The public command shape is:

```text
agent-secrets run --bundle <name> [--bundle <name>] -- <command> [arguments]
agent-secrets doctor
```

`run` accepts one or more compatible bundles and one child command.

It passes child arguments directly without constructing a shell command string.

It returns the child's exit status.

It does not provide a raw read, print, export, shell-evaluation or clipboard operation.

It must not send resolved values or full references to `pbcopy`, OSC 52 or another clipboard API.

`doctor` first validates the manifest and every local bundle file without contacting 1Password.

In service-account mode, it also validates the bootstrap file before contacting 1Password.

It then validates the selected authentication lane.

Interactive mode verifies the explicitly selected account.

Service-account mode verifies that the service account can access exactly `Agent Secrets` and no other vault.

The doctor reads every referenced field to prove that it exists, immediately discards each resolved value and reports only the variable name and status.

It also starts a probe child to verify that neither `OP_SERVICE_ACCOUNT_TOKEN` nor `AGENT_SECRET_AUTH` is inherited.

It must not print resolved values or full references.

### Child environment

`agent-secrets`, not the calling automation script, owns child-environment sanitization.

It reads `AGENT_SECRET_AUTH` into internal state before sanitization.

It builds the child base from the inherited environment and retains ordinary operational variables such as `PATH`, `HOME`, `TMPDIR` and locale settings.

It removes every inherited variable whose uppercase name matches `*TOKEN*`, `*KEY*`, `*SECRET*`, `*PASSWORD*`, `*CREDENTIAL*` or `*AUTH*`.

It also removes `OP_SERVICE_ACCOUNT_TOKEN` explicitly.

It removes inherited variables that can alter dynamic loading or shell startup.

The initial denylist includes `BASH_ENV`, `ENV`, `CDPATH`, `FPATH`, `DYLD_*`, `LD_*`, `NODE_OPTIONS`, `NODE_PATH`, `PYTHONHOME`, `PYTHONPATH`, `RUBYOPT`, `PERL5OPT` and `PERL5LIB`.

It also removes `GIT_ASKPASS`, `SSH_ASKPASS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_PARAMETERS`, `GIT_EXEC_PATH`, `GIT_CONFIG_KEY_*` and `GIT_CONFIG_VALUE_*`.

`AGENT_SECRET_AUTH` is available only long enough to select the lane even though its name matches the clearing rules.

The resolver does not forward that selector to the child.

After sanitization, the resolver adds only the resolved variables from the selected bundles.

The same construction applies to automation-script calls and direct manual invocations.

### Automation script contract

An automation script must finish no-op checks before invoking `agent-secrets`.

An automation script must request only bundles approved for the current phase.

An automation script must not combine generation and publishing authority in one process.

An automation script must validate generated output before requesting a publisher bundle.

## Behavior

### Resolution flow

```diagram
┌──────────────────────────────┐
│ Automation script requests  │  Bundle names and target command only
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ agent-secrets resolver       │  Validate lane, manifest, files and bootstrap
│ Resolve approved references │  Hold service-account token only here
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Target child process         │  Approved base and selected credential variables
│ Agent or deterministic tool  │  No service-account token
└──────────────────────────────┘
```

The resolver runs these steps:

1. Parse arguments and read `AGENT_SECRET_AUTH` into internal state.
2. Validate the manifest and reject an unknown bundle or missing target command.
3. Validate bundle audiences and symmetric compatibility.
4. Canonicalize the absolute target path and enforce every selected bundle's command class allowlist.
5. Validate local bundle files without resolving them.
6. Validate the bootstrap file in service-account mode.
7. Build the sanitized non-secret child base environment.
8. Authenticate to 1Password, validating the selected account in interactive mode or exact vault access in service-account mode.
9. Resolve only references from selected bundles.
10. If a service-account `op` command failed for an operational reason, report the fallback and repeat steps 8 and 9 through the interactive account.
11. Add the selected credential variables to the sanitized base environment.
12. Execute the child directly without either authentication variable.
13. Clear resolved values and return the child exit status.

### Failure behavior

Unknown or incompatible bundles fail before 1Password access.

Unsafe local files fail before 1Password access.

Plaintext values and references outside `Agent Secrets` fail before 1Password access.

Service-account access to another vault fails before child execution.

It does not trigger interactive fallback because wrong vault scope is a policy failure.

A failed resolution does not start the child.

The error names the failed stage without printing a secret or full reference.

### Interactive behavior

Interactive mode explicitly selects Chinh's `my.1password.com` account.

It never reads the service-account bootstrap token.

1Password may request desktop or biometric approval.

### Service-account behavior

Service-account mode validates the bootstrap path before 1Password access.

It tries service-account authentication and resolution first.

If a required `op` command fails for an operational reason, it retries through the explicit interactive account.

The fallback may trigger desktop or biometric approval.

The resolver writes a stage-level fallback diagnostic before it retries.

### Logseq migration behavior

Logseq keeps 2 separate phases.

Its generation phase receives `amp-runtime` and `work`.

Before generation, `automation/validate-agent-credentials` receives the same bundles and validates Amp and the company GitHub identity.

Its deterministic publishing phase receives `lelouvincx-bot` only after output validation.

The publishing phase retains explicit bot SSH transport and repository allowlist checks.

The 2 phases never share one child process or environment.

`LOGSEQ_REPORT_AUTH` remains a compatibility selector during migration.

When only `LOGSEQ_REPORT_AUTH` is set, the Logseq automation script maps it to `AGENT_SECRET_AUTH` before calling `agent-secrets`.

When both selectors are set to the same value, Logseq uses that value.

Logseq rejects different values before calling `agent-secrets`.

Remove the compatibility selector after final cutover.

## Permissions and side effects

### Shared resolver

The resolver may:

- read the versioned capability bundle manifest
- inspect bundle and bootstrap file metadata
- read selected local bundle files
- read the bootstrap token in service-account mode
- call the 1Password CLI for identity, vault and item reads
- spawn one approved local child process
- write stage-level diagnostics without secret values

The resolver must not:

- write to 1Password
- create, share or delete a vault
- print a resolved secret or full reference
- modify the automation script's repository
- authorize an external resource operation
- pass the service-account token to a child
- inject a publisher bundle into an agent process
- write a resolved value or full reference to a clipboard

### Agent audience

An agent child receives only selected agent bundles.

Automation-script policy controls which repositories and services it may use.

The initial company GitHub credential in `work` remains broad and explicitly accepted.

Another credential may enter `work` only when it is safe for every process authorized to receive that bundle.

Deterministic bot publishing does not restrict actions performed through that company credential.

### Publisher audience

A publisher child receives only selected publisher bundles.

It must belong to a deterministic command class registered by the bundle manifest.

The automation script validates output and resource scope before invoking it.

For `lelouvincx-bot`, the automation script retains exact GitHub repository and permission checks.

Another credential may enter `lelouvincx-bot` only when every registered bot command may receive it safely.

### External provisioning

Creating or changing a 1Password vault, item, service account or token changes external shared state.

It requires Chinh's explicit approval at implementation time.

Issuing or rotating an upstream credential requires separate explicit approval.

Revoking an upstream credential or service account requires separate explicit approval after its replacement passes.

Copying the legacy Logseq items into `Agent Secrets` also requires explicit approval.

This RFC creates no external state.

## Examples

### Start Amp with runtime and work access

```text
agent-secrets run \
  --bundle amp-runtime \
  --bundle work \
  -- /Users/lelouvincx/.amp/bin/amp
```

The manifest permits the pair because each bundle lists the other and both allow the `amp` class.

The registered `amp` path resolves to the requested executable's exact path.

The Amp child receives ordinary non-secret base variables and the credential variables declared by those bundles.

It does not receive the bot publisher bundle or service-account token.

### Run deterministic bot publishing

```text
agent-secrets run \
  --bundle lelouvincx-bot \
  -- /Users/lelouvincx/Developer/second-brain-logseq/automation/publish-approved-output
```

The automation script validates approved output before this command.

The manifest maps this exact resolved path to `logseq-publisher` and restricts the bundle to that class.

The child receives no agent bundle.

The wrapper accepts only high-level operations for the 2 repositories permitted by Logseq's deterministic publisher. Logseq owns the broader bot access allowlist separately.

### Reject a mixed audience

```text
agent-secrets run \
  --bundle work \
  --bundle lelouvincx-bot \
  -- /Users/lelouvincx/.amp/bin/amp
```

The resolver rejects this request before 1Password access because it mixes `agent` and `publisher` audiences.

### Check an unattended installation

Set `AGENT_SECRET_AUTH` to `service-account` in the supervised process environment.

Then run:

```text
agent-secrets doctor
```

The doctor checks exact vault scope and token non-inheritance through a probe child.

It reports variable names and status only.

If service-account 1Password access fails for an operational reason, it reports the fallback and retries through the interactive account.

## Maintenance notes

### Sources of truth

This RFC owns the shared design.

The implementation plan is `amp/docs/plans/implementation-plan-rfc-0010-shared-local-agent-and-bot-secrets.md`.

`amp/agent-secrets/lib-agent.sh`, `amp/agent-secrets/bundles.json`, its schema, its validator and `bin/agent-secrets` own the executable shared contract.

Automation scripts and their owning repositories own task authorization and publisher policy.

Logseq RFC-0010 remains historical evidence for legacy rollback and retirement.

RFC-0009 remains authoritative for the GitHub event runner and keeps its separate Keychain-backed secret boundary.

### Implementation order

The accepted implementation plan defines 9 stages with dependencies, approval gates, completion criteria and rollback points.

Stage 0 is complete when this RFC is accepted and the plan is stored in the repository.

Stages 1 to 4 build and project the policy, resolver and doctor without live credentials.

Stages 5 and 6 provision copied credentials and migrate Logseq.

The completed rollout record documents live projection and shared-shell verification. It does not require a scheduled run.

Stages 7 and 8 replace upstream credentials and retire the legacy service account only after verification.

### Verification

The implementation must prove:

- RFC validation passes
- `agent-secrets` works outside a Logseq checkout
- interactive mode never reads the bootstrap token
- service-account mode tries the service account before interactive fallback
- interactive mode never falls back to the service account
- service-account operational failures report fallback without a secret or full reference
- manifest, local-file, command-class and vault-scope failures do not trigger fallback
- the service account can read exactly `Agent Secrets`
- unsafe files, plaintext values and out-of-vault references fail before 1Password access
- unknown and mixed-audience bundles fail before 1Password access
- asymmetric compatibility declarations and incompatible bundle pairs fail before 1Password access
- an absolute target must match a manifest-registered resolved path and every selected bundle's command-class allowlist
- child processes retain approved non-secret base variables but receive credential variables only from selected bundles
- child processes do not receive the service-account token
- child processes do not receive `AGENT_SECRET_AUTH`
- resolved values do not enter the caller shell, arguments, files, logs or clipboard
- Logseq credential preflight runs through its registered deterministic command class
- bot publishing uses strict high-level operations for only the 2 repositories permitted by Logseq's deterministic publisher
- conflicting `AGENT_SECRET_AUTH` and `LOGSEQ_REPORT_AUTH` values fail during Logseq migration
- legacy Logseq credentials remain usable until their replacements pass, and legacy copies stop working after revocation
- automation-script policy remains outside the shared resolver
- temporary projection does not write to live runtime paths

## Open questions

None.

The first implementation supports macOS local runners only.
