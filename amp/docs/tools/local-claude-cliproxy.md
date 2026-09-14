---
doc_schema: "amp-artifact/v2"
title: "Local Claude CLIProxyAPI Runtime"
slug: "local-claude-cliproxy"
status: "active"
summary: "Documents and surfaces the local Docker CLIProxyAPI runtime used for Amp custom-url Claude model routing."
artifact:
  id: "local-claude-proxy-open-runtime"
  type: "command"
  surface: "command_palette"
  invocation: "command_palette"
  api_stability: "stable"
source:
  kind: "plugin"
  file: "plugins/local-claude-cliproxy.ts"
  scope: "system"
  install_source: "local"
  registration_api: "amp.registerCommand"
  metadata_comments:
    - "@i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now"
amp:
  docs_sources:
    api_docs: "amp plugins show-docs"
    agent_options: "amp plugins show-agent-options --json"
  last_verified: "2026-09-15"
contract:
  input_kind: "manual_command"
  output_kind: "runtime_directory_opened"
  trigger: "command_palette"
  allowed_tools: []
  event: null
  command_id: "local-claude-proxy-open-runtime"
  agent_mode_key: null
runtime:
  uses:
    - "amp.registerCommand"
    - "ctx.ui.notify"
    - "node:child_process spawn"
    - "sync-skills.sh local share projection"
  dependencies:
    - "Docker with Compose v2"
    - "cloudflared for a public HTTPS tunnel"
    - "CLIProxyAPI Docker image eceasy/cli-proxy-api"
    - "Amp custom-url model provider with anthropic-messages format"
    - "local Claude OAuth account"
  env: []
  reads:
    - "~/.local/share/amp-cliproxy runtime directory"
  writes:
    - "Finder open request for ~/.local/share/amp-cliproxy"
    - "non-secret runtime templates projected to ~/.local/share/amp-cliproxy by sync-skills.sh"
    - "local generated API key and config.yaml only when missing during projection"
  network:
    - "Cloudflare tunnel when the runtime is started manually"
    - "Claude account through CLIProxyAPI when requests are routed manually"
  logs:
    - "plugin load log"
    - "command status notification"
safety:
  permission_level: "manual-local-runtime-helper"
  user_gate: "manual command palette invocation"
  constraints:
    - "The command only opens the projected runtime directory and reports the expected path."
    - "It does not start Docker, run OAuth, create tunnels, or change Amp model-provider settings."
    - "Projection must not overwrite an existing local api-key.txt, config.yaml, or auth directory."
    - "Source-controlled files must not contain Claude OAuth credentials or plaintext runtime API keys."
    - "Amp model mappings remain narrow and explicit."
  risks:
    - "When manually activated, routed model calls use the local Claude account behind CLIProxyAPI."
    - "A temporary trycloudflare URL is not durable and breaks when cloudflared exits."
    - "A named public tunnel exposes the proxy endpoint and relies on the local API key for access."
related: []
tags:
  - "command"
  - "custom-url"
  - "docker"
  - "local-runtime"
  - "model-routing"
---

# Local Claude CLIProxyAPI Runtime

## Summary

`local-claude-proxy-open-runtime` adds the command-palette action `Local Claude Proxy: Open Runtime Directory`.

The capability documents the local runtime used to route selected Amp Claude models through a local Docker CLIProxyAPI service and a public HTTPS tunnel. The repository owns only non-secret templates and helper documentation. `sync-skills.sh` projects those files into `~/.local/share/amp-cliproxy` and initializes local secret-bearing files only when they are absent.

## Invocation

- Surface: command palette
- Registered with: `amp.registerCommand`
- Command ID: `local-claude-proxy-open-runtime`
- Palette label: `Local Claude Proxy: Open Runtime Directory`
- Plugin file: `plugins/local-claude-cliproxy.ts`
- Runtime directory: `~/.local/share/amp-cliproxy`

Run the command when you want to inspect the projected runtime files before starting, testing, or changing the local proxy setup.

## Contract

The command opens the projected runtime directory in Finder on macOS and notifies the user of the path. It does not mutate the runtime, start processes, or edit Amp provider settings.

The projected runtime contract is:

| File | Source | Purpose |
| --- | --- | --- |
| `README.md` | `amp/local-claude-cliproxy/README.md` | local setup, verification, and rollback notes |
| `docker-compose.yml` | `amp/local-claude-cliproxy/docker-compose.yml` | starts `eceasy/cli-proxy-api` on `127.0.0.1:8317` |
| `config.example.yaml` | `amp/local-claude-cliproxy/config.example.yaml` | reviewed non-secret config template |
| `ensure-runtime.sh` | `amp/local-claude-cliproxy/ensure-runtime.sh` | creates `auth/`, `api-key.txt`, and `config.yaml` only when missing |

Local generated files are intentionally not source-controlled:

- `~/.local/share/amp-cliproxy/auth/`
- `~/.local/share/amp-cliproxy/api-key.txt`
- `~/.local/share/amp-cliproxy/config.yaml`

## Behavior

### Projection

`sync-skills.sh` copies the source-controlled runtime files from `amp/local-claude-cliproxy/` into `~/.local/share/amp-cliproxy/`, then runs the projected `ensure-runtime.sh`.

`ensure-runtime.sh` is idempotent:

1. Create the runtime and `auth/` directories with user-only permissions.
2. Generate `api-key.txt` only when the file is absent.
3. Create `config.yaml` from `config.example.yaml` only when the file is absent.
4. Leave existing API keys, config, and Claude OAuth files unchanged.

### Runtime topology

The intended runtime is:

```text
Amp backend
  → public HTTPS tunnel
  → local cloudflared
  → 127.0.0.1:8317
  → Docker CLIProxyAPI
  → local Claude OAuth account
```

The Docker config must use `host: ""` inside the container. Binding CLIProxyAPI to `127.0.0.1` inside Docker would bind to the container loopback and break host port publishing.

The initial validated Amp mappings are narrow and explicit:

```text
anthropic/claude-opus-4-7  -> claude-opus-4-7
anthropic/claude-fable-5-1 -> claude-fable-5-1
```

### Manual operation

The helper files document these manual actions:

1. Start CLIProxyAPI with Docker Compose.
2. Run Claude OAuth with `--claude-login` and the projected `auth/` directory.
3. Expose `127.0.0.1:8317` through Cloudflare Tunnel or another HTTPS endpoint.
4. Add or edit the Amp custom-url provider with `--api-format anthropic-messages`.
5. Run `amp config model-providers test` and `check-access` for each mapped model.

## Permissions and side effects

The plugin command opens Finder and shows a notification only.

The projection writes non-secret runtime files to `~/.local/share/amp-cliproxy`. On first projection only, it also creates a local API key and config file with user-only permissions. It never writes Claude OAuth credentials from the repository. OAuth credentials are created only by the manual CLIProxyAPI login command.

When the runtime is manually started and activated in Amp, inference traffic for the mapped models leaves Amp's normal provider route and uses the local Claude account.

## Examples

Start the projected runtime:

```bash
docker compose -f ~/.local/share/amp-cliproxy/docker-compose.yml up -d
```

Run Claude OAuth into the projected auth directory:

```bash
docker run --rm -p 127.0.0.1:54545:54545 \
  -v "$HOME/.local/share/amp-cliproxy/config.yaml:/CLIProxyAPI/config.yaml:ro" \
  -v "$HOME/.local/share/amp-cliproxy/auth:/root/.cli-proxy-api" \
  eceasy/cli-proxy-api:latest \
  /CLIProxyAPI/CLIProxyAPI --no-browser --claude-login
```

Test local models without printing the API key:

```bash
api_key="$(cat ~/.local/share/amp-cliproxy/api-key.txt)"
curl -sS -H "Authorization: Bearer $api_key" \
  http://127.0.0.1:8317/v1/models | jq -r '.data[]?.id'
```

## Troubleshooting

- No runtime directory: run `./sync-skills.sh` from the repository root.
- Docker container starts but host port fails: confirm `config.yaml` has `host: ""`, not `127.0.0.1`.
- Amp provider test fails from a public URL: confirm the tunnel can reach `http://127.0.0.1:8317/v1/models` and the API key file matches the provider.
- Claude models are missing: rerun Claude OAuth and check that `auth/` contains a Claude auth JSON file without printing its contents.
- Temporary URL stopped working: start a new quick tunnel or configure a named Cloudflare tunnel and update the Amp custom-url base URL.

## Maintenance notes

Keep this document aligned with `plugins/local-claude-cliproxy.ts`, `amp/local-claude-cliproxy/`, and the projection block in `sync-skills.sh`.

Do not commit `api-key.txt`, `config.yaml`, or files from the projected `auth/` directory. Do not broaden Amp model mappings unless the user explicitly chooses the additional models.
