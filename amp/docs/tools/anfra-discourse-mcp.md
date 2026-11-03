---
doc_schema: "amp-artifact/v2"
title: "Anfra Discourse MCP"
slug: "anfra-discourse-mcp"
status: "active"
summary: "Runs the official Discourse MCP for community.anfra.ai with Chinh's account-scoped read/write access."
artifact:
  id: "anfra-discourse-mcp"
  type: "local_cli"
  surface: "shell"
  invocation: "cli"
  api_stability: "stable"
source:
  kind: "script"
  file: "mcp-servers/anfra-discourse.mts"
  scope: "system"
  install_source: "local"
  registration_api: null
  metadata_comments: []
amp:
  docs_sources:
    api_docs: "https://github.com/discourse/discourse-mcp"
    agent_options: null
  last_verified: "2026-11-02"
contract:
  input_kind: "mcp_stdio"
  output_kind: "mcp_stdio"
  trigger: "cli"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
runtime:
  uses:
    - "bin/anfra-discourse-mcp shell entry point"
    - "Node native TypeScript execution"
    - "agent-secrets run --bundle anfra-discourse"
    - "@discourse/mcp@0.3.1"
    - "anonymous profile pipe and inherited MCP stdin"
  dependencies:
    - "Node 24 or newer, npm and npx"
    - "POSIX shell, cat and /dev/fd"
    - "1Password CLI and access to the referenced item"
    - "projected agent-secrets policy and anfra-discourse bundle"
    - "Bun for regression tests only"
  env:
    - "AMP_CONFIG_DIR"
    - "AGENT_SECRET_AUTH"
    - "DISCOURSE_USER_API_KEY (resolved at runtime)"
  reads:
    - "~/.credentials/agent-secrets/anfra-discourse.env"
    - "op://Agent Secrets/Anfra Discourse MCP/credential"
    - "MCP client requests on stdin"
  writes:
    - "npm package cache"
    - "forum topics, posts and user data when mutation tools are called"
  network:
    - "1Password for credential resolution"
    - "npm registry for pinned package installation"
    - "https://community.anfra.ai"
  logs:
    - "launcher, package and MCP diagnostics on stderr"
safety:
  permission_level: "account-scoped-read-write"
  user_gate: "explicit integration authorization and user-requested forum actions"
  constraints:
    - "Use a User API key with read,write scopes, not an admin API key."
    - "Tether the server to community.anfra.ai."
    - "Keep credential values out of disk profiles, process arguments and output."
    - "Remove the resolved key from npm and MCP child environments; pass authentication through the profile pipe."
    - "Do not publish a forum post or reply just to test setup."
  risks:
    - "Write tools mutate the live forum under Chinh's account."
    - "Toolset selection controls discovery, not authorization; the upstream catalog includes additional mutations."
    - "Tool responses can contain private forum data visible to the account."
related: []
tags:
  - "mcp"
  - "discourse"
  - "anfra"
  - "1password"
---

# Anfra Discourse MCP

## Summary

`anfra-discourse-mcp` connects Amp to https://community.anfra.ai through the official `@discourse/mcp@0.3.1`. It reads and writes as Chinh, not as an administrator. This document is the capability contract for the local launcher and its MCP surface.

## Invocation

- shell entry point: `bin/anfra-discourse-mcp`, projected to `~/.local/bin/anfra-discourse-mcp`
- TypeScript implementation: `amp/mcp-servers/anfra-discourse.mts`, projected under `$AMP_CONFIG_DIR/mcp-servers/`
- Amp workspace server name: `anfra-discourse`
- transport: MCP over stdio, without an HTTP listener

Run `./sync-skills.sh`, then register and approve the server in the intended workspace:

```bash copy Copy MCP Setup
amp mcp add anfra-discourse --workspace -- anfra-discourse-mcp
amp mcp approve anfra-discourse
amp mcp doctor anfra-discourse
```

Reload Amp's MCP connections after registration or implementation changes. `.amp/settings.json` is local runtime state, not a globally projected configuration. Setting up one orb does not install the server in another orb.

## Contract

The public command accepts no arguments. `--resolved` is the internal re-entry mode used by `agent-secrets`; it requires a resolved `DISCOURSE_USER_API_KEY`. Other arguments fail with exit code 2. Missing credentials or startup failures fail with a nonzero exit code. Stdout belongs to MCP; diagnostics go to stderr.

The launch configuration is fixed:

| Setting | Value |
| --- | --- |
| Package | `@discourse/mcp@0.3.1` |
| Site | `https://community.anfra.ai` |
| Writes | `--allow_writes` |
| Tool discovery | `--tools_mode discourse_api_only` |
| Toolsets | `search,topics,users` |
| User API client ID | `chinh-amp-anfra` |
| Secret bundle | `anfra-discourse` |
| Key reference | `op://Agent Secrets/Anfra Discourse MCP/credential` |

The verified catalog contains 16 tools:

- reads: `discourse_search`, `discourse_filter_topics`, `discourse_read_topic`, `discourse_read_post`, `discourse_read_topic_posts`, `discourse_search_posts`, `discourse_get_user`, `discourse_list_user_posts`, `discourse_list_users`
- mutations: `discourse_create_post`, `discourse_create_user`, `discourse_create_category`, `discourse_create_topic`, `discourse_update_topic`, `discourse_update_post`, `discourse_update_user`

`discourse_create_topic` accepts `title`, `raw` and optional `category_id` and `tags`. `discourse_create_post` replies to an existing `topic_id` with `raw` Markdown. Both expose an upstream optional `author_username`; this setup does not grant impersonation rights. Discover current schemas before calling a tool.

Toolsets are not an authorization boundary. Their shared upstream memberships include category and user mutations. Discourse enforces account permissions and credential requirements for each request. Chinh's verified account is `chinh` (ID 5), with `admin: false` and `moderator: false`.

## Behavior

The shell entry point executes the TypeScript implementation with Node's built-in TypeScript support. The implementation re-enters through `agent-secrets`, which resolves the reference-only bundle at runtime.

The launcher removes the resolved key from the environment passed to npm and the MCP child. It locates the pinned npm binary, then starts the official server. A shell pipeline turns the profile stream into a real anonymous pipe on fd 3; fd 4 preserves the MCP client's stdin. This avoids Node's extra-stdio socket limitation when the official server reopens its profile path with `readFile`. The profile contains the User API key and client ID, never an admin API key.

## Permissions and side effects

Authorize the official `generate-user-api-key` device flow using the saved work browser profile and request only `read,write` scopes. Store the resulting key in the 1Password item before starting the server. Do not use the generator's plaintext profile output as persistent configuration. The bundle file contains only the `op://` reference and is projected with mode `0600`.

User-requested mutation calls can publish or edit live content. Enabling the integration does not authorize an arbitrary test post. Tool availability alone does not prove a successful publication.

Revoke access through the forum's Preferences → Apps page. Rotate the credential in 1Password and reload MCP connections when replacing a key.

## Examples

Read-only checks through the registered MCP:

```json
{"tool":"discourse_get_user","arguments":{"username":"chinh"}}
{"tool":"discourse_search","arguments":{"query":"Welcome","max_results":1}}
```

For a user-requested publication, use `discourse_create_topic` for a new topic or `discourse_create_post` for a reply. Confirm the intended category or topic and the content from the user's request before invoking either tool.

## Troubleshooting

- awaiting approval: run `amp mcp approve anfra-discourse`, then reload MCP.
- credential resolution fails: check access to the 1Password item and the projected reference-only bundle. Never print the resolved value to diagnose it.
- source changes are missing: run `./sync-skills.sh`, then reload MCP connections.
- write tools are absent: inspect `amp mcp doctor anfra-discourse` and the fixed launcher configuration. Do not bypass account permissions with an admin key.
- `/session/current.json` is denied: `session_info` is a separate Discourse scope; use an authenticated read within `read` rather than broadening access for a test.

## Maintenance notes

Update this contract before changing the launcher, key scopes, selected site, package version, toolsets or secret boundary. Keep the shell entry point, bundle policy, reference file and test aligned. The directory index at `amp/mcp-servers/README.md` maps implementations to their capability documents. The existing plugin-build check also runs this MCP regression test; its CI job uses Node 24 for the launcher's native TypeScript execution.

Run the checks in the root README, including:

```bash copy Copy MCP Checks
bun test scripts/anfra-discourse-mcp.test.ts
python3 -m unittest amp/scripts/test_validate_plugin_docs.py
python3 amp/scripts/validate-plugin-docs.py
scripts/check-projection
```

On 2 November 2026, the launcher regression test and strict TypeScript check passed. The live server connected with 16 tools; user lookup and search succeeded. An authenticated `/bookmarks.json` read returned 200 versus anonymous 403. Post and reply schemas were available, but no publication was attempted.

Upstream references: [official MCP](https://github.com/discourse/discourse-mcp) and [User API key specification](https://meta.discourse.org/t/user-api-keys-specification/48536).
