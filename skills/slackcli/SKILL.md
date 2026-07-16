---
name: slackcli
description: Use slackcli to search and read Slack, manage saved items and canvases, send messages or files, create drafts, add reactions, manage authentication and multiple workspaces, or upgrade the CLI.
---

# slackcli – Slack Workspace CLI

`slackcli` is on `PATH`. These examples target v0.7.0. Run `slackcli --version` and `slackcli auth list` first; if the installed version differs, verify affected syntax with `<command> --help`.

```bash
slackcli --version
slackcli auth list
```

If no workspace is configured, prefer a Slack app token for durable automation and use browser-session tokens only for personal access or features that require them, such as drafts. For browser auth: open Slack → DevTools → Network → copy a Slack API request as cURL, then run `slackcli auth parse-curl --from-clipboard --login`. Browser tokens inherit the user’s access and expire with the session. Keep tokens out of arguments, shell history, logs, and output.

Run requested read-only commands without extra confirmation. Before a side effect, show and confirm: workspace; channel/user and message text for sends or drafts; attached file path for uploads; or channel, message timestamp, and emoji for reactions.

## Finding Slack content

Prefer targeted search over listing and scanning:

```bash
slackcli search messages "<query>" --limit 20 --json
slackcli search messages "<query>" --in <channel-name> --from <username> --json
slackcli search channels "<name>" --json
slackcli search people "<name-or-email>" --json
```

Slack message search supports Slack search operators. Use `--page`, `--sort score|timestamp`, and `--sort-dir asc|desc` when needed.

## Reading messages (most common)

```bash
slackcli conversations read <channel-id> [options]
```

### Parsing Slack URLs

`https://<workspace>.slack.com/archives/<channel-id>/p<ts-no-dot>` → insert a dot before the last 6 digits of the timestamp.

Example: `.../C02RC5RG4AD/p1771556130161929` → channel `C02RC5RG4AD`, `--thread-ts 1771556130.161929`. No `p` suffix → omit `--thread-ts`.

### Options

| Option              | Notes                                       |
| ------------------- | ------------------------------------------- |
| `--limit <n>`       | Default `100` — usually too many; use 20–50 |
| `--thread-ts <ts>`  | Read replies in a specific thread           |
| `--exclude-replies` | Top-level only (good for channel scans)     |
| `--oldest/--latest` | Unix timestamp window                       |
| `--json`            | Required for `ts` (replying/reacting)       |
| `--workspace <id>`  | Override default workspace                  |

### ⚠️ Empty `text`? Re-run with `--json`

Bot/integration posts (GitHub, Linear, Jira, Calendly…) often have empty `text`; the real content lives in `attachments[].text` or `blocks`. Default rendering shows a blank message. **Whenever a message looks empty or you need full body, use `--json`.**

### Decision guide

| Intent                          | Flags                                                 |
| ------------------------------- | ----------------------------------------------------- |
| "What's happening in #channel?" | `--exclude-replies --limit 50`                        |
| "Read that thread / URL"        | `--thread-ts <ts>`                                    |
| "Reply to a message"            | `--json` (capture `ts`) → `messages send --thread-ts` |
| "What did X say yesterday?"     | `--oldest <start> --latest <end>`                     |
| Bot/integration message         | `--json` (content is in `attachments`/`blocks`)       |

## Finding channels

```bash
slackcli conversations list --exclude-archived --limit 100
slackcli conversations list --types public_channel,private_channel,im,mpim
```

When the user gives a channel name rather than an ID, prefer `search channels` to resolve it.

## Saved items and canvases

```bash
slackcli saved list --state saved --limit 50 --json
slackcli saved list --state to_do --json

slackcli canvas list --limit 20 --json
slackcli canvas list --channel <channel-id> --json
slackcli canvas read <canvas-id>
slackcli canvas read --channel <channel-id>
```

Canvas reads return markdown by default. Use `--json` for structured output or `--raw` only when the original HTML is required.

## Sending messages

```bash
slackcli messages send --recipient-id <channel-or-user-id> --message "..."
slackcli messages send --recipient-id <channel-id> --thread-ts <ts> --message "..."
slackcli messages send --recipient-id <channel-or-user-id> --message "..." --file <path>
```

File uploads require suitable Slack permissions, such as `files:write` for app tokens.

## Creating drafts

Drafts work only with browser session tokens, not Slack app tokens:

```bash
slackcli messages draft --recipient-id <channel-or-user-id> --message "..."
slackcli messages draft --recipient-id <channel-id> --thread-ts <ts> --message "..."
```

## Reacting

```bash
slackcli messages react --channel-id <channel-id> --timestamp <ts> --emoji thumbsup
```

Common: `thumbsup`, `heart`, `fire`, `eyes`, `white_check_mark`, `rocket`, `tada`.

## Multi-workspace

If more than one workspace is configured, resolve the intended workspace from `slackcli auth list` and pass `--workspace "<name|id>"` to search, conversation, saved, canvas, and message commands. Do not rely on the default workspace when the user’s target is ambiguous.

## Updating the CLI

Check without modifying the installation:

```bash
slackcli update check
```

With user approval, use `brew upgrade slackcli` for a Homebrew installation; otherwise use `slackcli update`. Verify the result with `slackcli --version`.
