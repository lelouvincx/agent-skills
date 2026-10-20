# Agent secrets

`bundles.json` is the source of truth for secret capability bundles. Each bundle lists the variables it can resolve and the registered command classes that may receive them. The matching `bundle-references/*.env` files contain only `op://Agent Secrets/...` references, never credential values.

`sync-skills.sh` validates all reference files before installing them as regular
files in `~/.credentials/agent-secrets/`. It sets the directory mode to `0700`
and file modes to `0600`, rejects symlinked destinations, and preserves unrelated
files. Repeated syncs update managed references without resolving any secrets.
The injected service-account token and local bootstrap token are never committed
or copied by sync.

## Runtime and doctor checks

`agent-secrets run` is the hot path. It validates the selected bundle files, command class, child environment and selected 1Password references. In service-account mode, it does not list vaults or run the full posture check.

`agent-secrets doctor` is the broad check. In service-account mode, it validates that the service account can access exactly the `Agent Secrets` vault, reads every registered reference, and probes that authentication variables do not reach child processes.

## Service-account authentication in Amp orbs

Set `AGENT_SECRET_AUTH=service-account`. The helper uses an injected
`OP_SERVICE_ACCOUNT_TOKEN` first. If that variable is absent, it reads the existing
local bootstrap file at `~/.local/share/agent-secrets/op-service-account-token`.
An empty or malformed injected value fails without falling back to the file.
The token is passed only to 1Password CLI, not to the launched command. The helper
does not write injected tokens to disk. This child-environment filtering does not
isolate the token from other processes that already inherit the orb environment.

To create and inject a token:

1. Open the [1Password service-account wizard](https://start.1password.com/developer-tools/infrastructure-secrets/serviceaccount/?source=dev-portal).
2. Create a dedicated account, for example `Amp orbs`. Grant read-only access to
   exactly the `Agent Secrets` vault. Do not enable vault creation or grant access
   to other vaults or Environments.
3. Save the token in 1Password immediately. The wizard shows the token only once.
4. In Amp, open the project's **Secrets & Env Vars** settings and add
   `OP_SERVICE_ACCOUNT_TOKEN` as a **secret**, not a plain environment variable.
   Paste the token through the settings form, never into a thread or shell command.
   Project scope limits its distribution. Use
   [personal settings](https://ampcode.com/settings/environment-variables) only if
   all your orbs need this access. Personal values override project values.
5. Set `AGENT_SECRET_AUTH=service-account` as a non-secret environment variable
   if it is not already configured.
6. Start a new orb. For an existing orb, run `amp orb restart-processes` from its
   Terminal to reload secrets and restart the executor and managed services.

The orb also needs 1Password CLI 2.18.0 or later, the projected capability policy,
and the selected bundle files in `~/.credentials/agent-secrets/`.
`.agents/setup` installs 1Password CLI from its signed APT repository when `op` is
missing, then runs sync to install the reference-only bundle files. It does not
sign in or resolve credentials. `.agents/resume` also refreshes the references
through sync.
Follow the [1Password CLI installation guide](https://developer.1password.com/docs/cli/get-started/)
if `op --version` is unavailable. Bundle files must contain only approved `op://`
references, have mode `0600`, and be in a directory with mode `0700` owned by the
current user. Do not copy plaintext credentials into the orb filesystem.

After installing the updated helper and preparing the bundle files, check:

```bash
op --version
agent-secrets doctor
```

`doctor` checks all registered bundles, not just the bundle needed by one command.
Do not print the token to verify injection. See Amp's
[secret handling guide](https://ampcode.com/docs/orbs/handling-secrets) and
1Password's [service-account guide](https://developer.1password.com/docs/service-accounts/get-started/).
