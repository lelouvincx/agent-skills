---
name: slackcli
description: Interact with Slack workspaces via the slackcli CLI. Use when the user asks to send messages, read channels, list conversations, or manage Slack auth.
---

# slackcli – Slack Workspace CLI

`slackcli` is on `PATH`. Verify auth before any action:

```bash
slackcli auth list
```

If empty, prefer browser-token extraction: open Slack in browser → DevTools → Network → right-click any Slack API request → Copy as cURL → `slackcli auth parse-curl --from-clipboard --login`. **Never log or echo tokens.**

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
slackcli conversations list --types public_channel|private_channel|im|mpim
```

When user says "#general", list first to resolve the ID.

## Sending messages

```bash
slackcli messages send --recipient-id <channel-or-user-id> --message "..."
slackcli messages send --recipient-id <channel-id> --thread-ts <ts> --message "..."
```

**Always confirm recipient + content with the user before sending.**

## Reacting

```bash
slackcli messages react --channel-id <channel-id> --timestamp <ts> --emoji thumbsup
```

Common: `thumbsup`, `heart`, `fire`, `eyes`, `white_check_mark`, `rocket`, `tada`.

## Multi-workspace

Add `--workspace "<name|id>"` to any command if more than one workspace is configured.
