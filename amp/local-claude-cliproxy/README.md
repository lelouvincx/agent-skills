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
