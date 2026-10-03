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
At exactly 40% remaining, the preferred account is below the policy boundary. The fallback must have more than 40% remaining.
The selector switches back when the preferred account recovers above the threshold.

### Set up management access

Create a dedicated random password in 1Password. Use its `op://` reference, never the password itself, in commands.
The 1Password CLI must be able to resolve this reference when the hourly job runs. An interactive approval prompt may prevent unattended checks.

```bash
amp-claude-selector setup-management \
  --management-key-ref 'op://YOUR_VAULT/YOUR_ITEM/password'

docker compose -f ~/.local/share/amp-cliproxy/docker-compose.yml up -d --force-recreate
```

`setup-management` writes only a bcrypt hash into the existing runtime config and preserves other settings.
Recreating the container is necessary because the config is bind-mounted and the helper replaces it atomically.
Keep `remote-management.allow-remote: false`. Do not set `MANAGEMENT_PASSWORD`, which overrides that protection.
The selector makes management calls from a short-lived `curlimages/curl:8.12.1` container sharing the proxy's network namespace.
The management password travels on stdin, not in process arguments, environment variables or logs.
Docker downloads the helper image on first use. No new host Python package is required.

### Log into both accounts

Run the Claude OAuth command above once for each account on the Mac hosting Docker.
Choose the correct account in the browser. Complete each callback locally; do not paste OAuth URLs or tokens into an agent conversation.
Use separate browser profiles if the browser keeps selecting the same account.
Both credentials are saved in `auth/`. When both are enabled, the proxy can route across both accounts before the selector runs.
Avoid inference traffic during initial setup. Account selection affects every client using this proxy, not one thread.

List the saved credential names:

```bash
amp-claude-selector accounts \
  --management-key-ref 'op://YOUR_VAULT/YOUR_ITEM/password'
```

Install with the actual names from the list:

```bash
amp-claude-selector install \
  --preferred 'COMPANY_AUTH_FILE.json' \
  --fallback 'PERSONAL_AUTH_FILE.json' \
  --management-key-ref 'op://YOUR_VAULT/YOUR_ITEM/password'

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

Window choices are `weekly`, `five-hour`, and `either`. `either` requires both windows to be above the threshold.
A weekly-only policy deliberately ignores five-hour exhaustion and model-specific limits.
Unknown quota leaves the selection unchanged. If both accounts are at or below threshold, selection also stays unchanged.
Manual selection requires paused automation so the next hourly check cannot undo it.
Pause and uninstall do not change credential eligibility. Resume reevaluates the policy.

`status` uses the ChatGPT selector's 12-field plain-text report and field order.
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
Configuration stores credential names, policy and a 1Password reference, never the resolved management password.
The LaunchAgent is `~/Library/LaunchAgents/com.ampcode.claude-subscription-selector.plist`.
The state directory and LaunchAgent label retain their existing names so the command rename does not reset installed configuration.
Changes apply to new requests. Existing requests are not migrated, and subsequent conversation context can be sent through the newly selected account.

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
