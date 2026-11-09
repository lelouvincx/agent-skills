# Local Claude CLIProxyAPI runtime

This directory is projected by `sync-skills.sh` to `~/.local/share/amp-cliproxy`.

It supports local Amp custom-url model routing through:

```text
Amp backend → public HTTPS tunnel → local CLIProxyAPI Docker → local Claude account
```

## Files

- `docker-compose.yml` starts `eceasy/cli-proxy-api` on `127.0.0.1:8317`.
- `config.example.yaml` is the reviewed non-secret template.
- `ensure-runtime.sh` creates local-only `api-key.txt`, `config.yaml`, and `auth/` when missing.

Do not commit or paste the generated API key, `config.yaml`, or Claude OAuth files from `auth/`.

## Start

```bash
docker compose -f ~/.local/share/amp-cliproxy/docker-compose.yml up -d
```

## Claude OAuth

```bash
docker run --rm -p 127.0.0.1:54545:54545 \
  -v "$HOME/.local/share/amp-cliproxy/config.yaml:/CLIProxyAPI/config.yaml:ro" \
  -v "$HOME/.local/share/amp-cliproxy/auth:/root/.cli-proxy-api" \
  eceasy/cli-proxy-api:latest \
  /CLIProxyAPI/CLIProxyAPI --no-browser --claude-login
```

Open the printed Claude OAuth URL in a local browser. If the browser reaches `localhost:54545/callback` but the command keeps waiting, paste the callback URL into the command prompt.

## Company and personal account selection

`amp-claude-selector` follows the ChatGPT selector's macOS LaunchAgent pattern.
It targets the CLIProxyAPI v7 Management API, verified against v7.3.15. Review compatibility before upgrading to v8.

Defaults: company preferred, personal fallback, weekly quota at 40% remaining, checked every hour.
At or below 40% remaining on the company account, the selector chooses personal regardless of personal's remaining quota.
The threshold applies only to the company account.
The selector switches back when the preferred account recovers above the threshold.

### Set up management access

Create a dedicated random password in the `Agent Secrets` vault in 1Password.
Register its reference in `~/.credentials/agent-secrets/amp-claude-selector.env`:

```text
CLIPROXY_MANAGEMENT_KEY=op://Agent Secrets/YOUR_ITEM/password
```

Keep the bundle directory at mode `0700` and the file at mode `0600`.
Run `./sync-skills.sh` to project the bundle policy.
The selector automatically invokes `agent-secrets run --strict-service-account --bundle amp-claude-selector` for commands that need management access.
The existing service account must have read access to this item. There is no interactive authentication fallback.
Only the registered selector executable can receive this bundle; the service-account token never reaches the selector.
Status, policy configuration, pause, resume and uninstall do not resolve the management key.

```bash
amp-claude-selector setup-management

docker compose -f ~/.local/share/amp-cliproxy/docker-compose.yml up -d --force-recreate
```

`setup-management` writes only a bcrypt hash into the existing runtime config and preserves other settings.
Recreating the container is necessary because the config is bind-mounted and the helper replaces it atomically.
Keep `remote-management.allow-remote: false`. Do not set `MANAGEMENT_PASSWORD`, which overrides that protection.
The selector makes management calls from a short-lived `curlimages/curl:8.12.1` container sharing the proxy's network namespace.
Agent-secrets injects the management key into the selector's environment for that process only.
The selector removes the key from subprocess environments and passes it to curl on stdin, not in process arguments or logs.
Docker downloads the helper image on first use. No new host Python package is required.

### Rotate the management key

Pause automation before changing the password. Proxy recreation briefly interrupts inference traffic for all clients.

1. Run `amp-claude-selector pause`.
2. Change the password value in the existing 1Password item.
3. Run `amp-claude-selector setup-management` to write the new bcrypt hash.
4. Run `docker compose -f ~/.local/share/amp-cliproxy/docker-compose.yml up -d --force-recreate`.
5. Run `amp-claude-selector accounts` to verify management authentication.
6. Run `amp-claude-selector resume`, then inspect `amp-claude-selector status` after the initial check.

If the item and field stay the same, no bundle, selector configuration or LaunchAgent change is needed.
If the reference changes, update `amp-claude-selector.env` before step 3. Keep the item in the `Agent Secrets` vault.
Changing only the 1Password value leaves the proxy accepting the old key, so selector authentication fails until steps 3 and 4 finish.
This key is separate from the inference API key and Claude OAuth tokens; rotation does not require Claude login or Amp provider changes.

### Log into both accounts

Run the Claude OAuth command above once for each account on the Mac hosting Docker.
Choose the correct account in the browser. Complete each callback locally; do not paste OAuth URLs or tokens into an agent conversation.
Use separate browser profiles if the browser keeps selecting the same account.
Both credentials are saved in `auth/`. When both are enabled, the proxy can route across both accounts before the selector runs.
Avoid inference traffic during initial setup. Account selection affects every client using this proxy, not one thread.

List the saved credential names:

```bash
amp-claude-selector accounts
```

Install with the actual names from the list:

```bash
amp-claude-selector install \
  --preferred 'COMPANY_AUTH_FILE.json' \
  --fallback 'PERSONAL_AUTH_FILE.json'

amp-claude-selector run
amp-claude-selector status
```

Installation validates both accounts' quota responses before starting automation.
Exactly two file-backed Claude credentials are supported. Unexpected additional Claude credentials cause selection to fail rather than silently leave another account eligible.

### Change the policy or select manually

```bash
# Each option can be changed independently. Threshold means percentage remaining.
amp-claude-selector configure --window weekly --threshold 40 --interval 3600
amp-claude-selector configure --window either --threshold 5 --interval 300

amp-claude-selector pause
amp-claude-selector use company
amp-claude-selector use personal
amp-claude-selector resume
amp-claude-selector uninstall
```

Window choices are `weekly`, `five-hour`, and `either`. `either` requires both company windows to be above the threshold to select company.
A weekly-only policy deliberately ignores five-hour exhaustion and model-specific limits.
Unknown quota leaves the selection unchanged.
Manual selection requires paused automation so the next hourly check cannot undo it.
Pause and uninstall do not change credential eligibility. Resume reevaluates the policy.

### Keep native Amp Claude accounts in sync

Bind the native work and personal Claude Subscription connections to the same policy:

```bash
amp config model-providers list
amp-claude-selector configure \
  --amp-preferred 'WORK_CLAUDE_CONNECTION_UUID' \
  --amp-fallback 'PERSONAL_CLAUDE_CONNECTION_UUID'
amp-claude-selector run
```

Use stable connection UUIDs, not list indexes. Both options are also available on
`install`. Existing proxy-only installations stay proxy-only until configured.
The selector validates both connections as native Claude subscriptions before
changing proxy eligibility. Each successful automatic or paused manual selection
then verifies that the same account is selected in both systems. An unchanged
proxy selection still repairs native account drift on the next successful check.
Unknown quota leaves both systems unchanged.

The switch is not atomic across systems: proxy selection happens first. If native
activation or verification fails, `run` reports failure, not synchronized success.
Retry `run`, or `use company` / `use personal` while paused, to reconcile them.
No rollback silently selects a different account. Avoid concurrent changes from
other clients; the selector lock protects only this selector.

This does not change the custom URL connection's activation, model mappings or
priority. Amp can still route through that higher-priority proxy connection.

`status` uses the ChatGPT selector's 12-field plain-text report and field order.
With native sync configured, it appends an `Amp connections` line with both UUIDs.
It formats intervals as hours, minutes or seconds and shows last/next check times in UTC+7.
Account labels are `company (<credential-name>)` and `personal (<credential-name>)`.
Quota and selection values come from the last check; status does not resolve secrets or query Claude.
Use `accounts` to inspect current credential eligibility.
For `either`, each remaining-quota line includes both five-hour and weekly values.

Switching disables the old account before enabling the new account. If enabling fails, there may be no eligible account.
The selector reports the failure instead of silently restoring another account. It verifies runtime eligibility after each switch.
CLIProxyAPI v7 can acknowledge status changes even when auth-file persistence fails; check persisted `disabled` fields without exposing tokens during live setup.
Do not toggle credentials concurrently in another management client. The selector's lock coordinates only its own commands.

State and logs are under `~/.local/state/amp-claude-subscription-selector/`, with user-only permissions.
Configuration stores credential names and policy, never the resolved management password.
The 1Password reference belongs only in the private agent-secrets bundle file.
Existing installed configuration and LaunchAgents continue working; a later `configure` drops the obsolete `management_key_ref` field.
The LaunchAgent is `~/Library/LaunchAgents/com.ampcode.claude-subscription-selector.plist`.
The state directory and LaunchAgent label retain their existing names so the command rename does not reset installed configuration.
Changes apply to new requests. Existing requests are not migrated, and subsequent conversation context can be sent through the newly selected account.

## Durable work-only token history

CLIProxyAPI v7.3.15 exposes a destructive, in-memory `/v0/management/usage-queue`,
not a durable usage export. Enabling `usage-statistics-enabled` alone is insufficient.
The selector can drain this queue into a local SQLite history without making inference requests.

After approval to restart the shared proxy, run:

```bash
amp-claude-selector usage-install
amp-claude-selector usage-report
amp-claude-selector usage-report --details
```

Installation verifies the preferred credential against the Management API's file-backed
Claude account entry, including its `@holistics.io` email, filename and `auth_index`.
It pins that identity in `work-usage-account.json`. Each collection revalidates the binding
before draining the queue. A changed identity stops collection rather than guessing from
the currently selected account. This verifies the proxy's credential attribution, not
the business purpose of individual requests made with that credential.

Installation enables statistics, sets queue retention to 3600 seconds, restarts only the
existing container and installs `com.ampcode.claude-work-usage` as a macOS LaunchAgent.
It runs `usage-collect` every 15 seconds while the user is logged in, independently of
the account selector's pause state. Account routing and personal fallback remain unchanged.
Collection shares the selector lock and existing registered agent-secrets boundary.
It does not introduce another secret consumer or expose remote management.

The state directory `~/.local/state/amp-claude-subscription-selector/` contains:

- `work-usage.sqlite`: committed work records, with mode `0600` inside the mode `0700` state directory;
- `work-usage-account.json`: the verified work credential binding;
- `work-usage-last.json`: the latest collection timestamp and stored, excluded and rejected counts.

Each work record retains the original timestamp, model, request ID, verified account,
failure flag and non-overlapping v2 token counters: uncached input, output, cache read
and cache write. Incomplete or malformed work counters are rejected, not estimated.
Identical records deduplicate. Totals include recorded failed attempts when they have
valid counters. They represent provider usage events, not necessarily one event per
client request. Personal, unknown-account and non-Claude events are discarded before
storage. API keys, OAuth tokens, response headers, prompts and raw queue payloads are
never stored in the history. `usage-report` reads the database without resolving secrets.
An old `last_collection` timestamp indicates missing or failed collection.

For planned restarts, stop client traffic and let in-flight requests finish, then run:

```bash
amp-claude-selector usage-restart
```

This drains the queue before restarting and checks collection after startup. Stored
history survives container restarts and recreation because it lives on the host.
There is no historical backfill and no zero-loss guarantee: a crash, direct Docker
restart, competing queue consumer, WebSocket usage subscriber, collector outage beyond
retention, or failure between queue removal and SQLite commit can lose uncollected
records. The upstream queue gives no acknowledgement or replay facility. Avoid other
usage consumers. Keep this limitation when interpreting reported totals.

To stop collection without changing account routing or deleting history:

```bash
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.ampcode.claude-work-usage.plist"
rm "$HOME/Library/LaunchAgents/com.ampcode.claude-work-usage.plist"
```

Statistics remain enabled after stopping collection; the queue expires in memory.
Do not run inference examples or provider tests as part of tracking verification
without separate approval, because those requests can be billed.

## Local verification

```bash
api_key="$(cat ~/.local/share/amp-cliproxy/api-key.txt)"

curl -sS -H "Authorization: Bearer $api_key" \
  http://127.0.0.1:8317/v1/models | jq -r '.data[]?.id'

curl -sS -X POST http://127.0.0.1:8317/v1/messages \
  -H "Authorization: Bearer $api_key" \
  -H 'Content-Type: application/json' \
  -d '{"model":"claude-fable-5-1","max_tokens":8,"messages":[{"role":"user","content":"Reply exactly: OK"}]}'
```

## Amp custom-url mapping

Use a public HTTPS URL that forwards to `http://127.0.0.1:8317`.

```bash
amp config model-providers add-router custom-url \
  --personal \
  --api-format anthropic-messages \
  --base-url 'https://your-public-url.example' \
  --api-key-file "$HOME/.local/share/amp-cliproxy/api-key.txt" \
  --model-mapping 'anthropic/claude-opus-4-7 -> claude-opus-4-7,anthropic/claude-fable-5-1 -> claude-fable-5-1,anthropic/claude-opus-5 -> claude-opus-5'
```

Verify each mapped model:

```bash
amp config model-providers test <provider-id>
amp config model-providers check-access --provider-model anthropic/claude-fable-5-1 --thread <thread-url>
amp config model-providers check-access --provider-model anthropic/claude-opus-4-7 --thread <thread-url>
amp config model-providers check-access --provider-model anthropic/claude-opus-5 --thread <thread-url>
```

## Rollback

```bash
amp config model-providers deactivate <provider-id>
docker compose -f ~/.local/share/amp-cliproxy/docker-compose.yml down
```

Stop the Cloudflare tunnel process or remove the named tunnel route if one was configured.
