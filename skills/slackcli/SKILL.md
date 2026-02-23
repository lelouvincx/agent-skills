---
name: slackcli
description: Interact with Slack workspaces via the slackcli CLI. Use when the user asks to send messages, read channels, list conversations, or manage Slack auth.
---

# slackcli – Slack Workspace CLI

You have access to `slackcli`, a CLI tool installed at `/Users/lelouvincx/.local/bin/slackcli` for interacting with Slack workspaces.

## Authentication

The user already has authenticated workspaces. Before performing any action, verify auth is working:

```bash
slackcli auth list
```

If no workspaces are configured, guide the user through the easiest login flow:

1. **Browser token extraction (recommended):**
   - Open Slack in a browser → DevTools (Cmd+Option+I) → Network tab
   - Right-click any Slack API request → Copy → Copy as cURL
   - Run: `slackcli auth parse-curl --from-clipboard --login`

2. **Standard token login (currently using):** `slackcli auth login-browser --xoxd <xoxd-token> --xoxc <xoxc-token> --workspace-url <url>`

**NEVER log, echo, or expose tokens in output.** Pass them directly to the CLI.

## Reading Messages (Primary Command)

This is the most frequently used command. Master it first.

```
slackcli conversations read <channel-id> [options]
```

### Parsing Slack URLs (Most Common Flow)

Users will often paste a Slack message URL. You must parse it into a channel ID and thread timestamp.

**URL format:**

```
https://<workspace>.slack.com/archives/<channel-id>/p<timestamp-without-dot>
```

**Parsing rule:** The `p`-prefixed timestamp has no dot. Insert a dot before the last 6 digits to get the `--thread-ts` value.

**Example:**

URL: `https://holistics.slack.com/archives/C02RC5RG4AD/p1771556130161929`

- Channel ID: `C02RC5RG4AD`
- Raw timestamp: `1771556130161929` → insert dot → `1771556130.161929`

```bash
slackcli conversations read C02RC5RG4AD --thread-ts "1771556130.161929"
```

When the URL has no `p`-timestamp suffix (e.g., `.../archives/C02RC5RG4AD`), just read the channel without `--thread-ts`.

### Read the conversation

**Basic read — recent messages:**

```bash
slackcli conversations read <channel-id> --limit 30
```

**Read a specific thread** (when the user pastes a URL, asks about a discussion, or says "that conversation"):

```bash
slackcli conversations read <channel-id> --thread-ts <parent-message-timestamp>
```

**Top-level messages only** (skip threaded replies, useful for scanning/summarizing):

```bash
slackcli conversations read <channel-id> --exclude-replies --limit 50
```

**Time-bounded reads** (catch up on a specific window):

```bash
slackcli conversations read <channel-id> --oldest <timestamp> --latest <timestamp>
```

**JSON output** (required when you need message timestamps for replying or reacting):

```bash
slackcli conversations read <channel-id> --json --limit 30
```

### Option Reference

| Option                   | Description                                 | Default |
| ------------------------ | ------------------------------------------- | ------- |
| `--limit <n>`            | Number of messages to return                | `100`   |
| `--thread-ts <ts>`       | Read a specific thread by parent timestamp  | —       |
| `--exclude-replies`      | Only top-level messages                     | `false` |
| `--oldest <ts>`          | Start of time range (Unix timestamp)        | —       |
| `--latest <ts>`          | End of time range (Unix timestamp)          | —       |
| `--json`                 | JSON output with full metadata & timestamps | `false` |
| `--workspace <id\|name>` | Override default workspace                  | default |

### Decision Guide

| User intent                          | Flags to use                                                       |
| ------------------------------------ | ------------------------------------------------------------------ |
| "What's happening in #channel?"      | `--exclude-replies --limit 50`                                     |
| "Summarize #channel today"           | `--exclude-replies --limit 100` (then summarize)                   |
| "Read that thread"                   | `--thread-ts <ts>`                                                 |
| "I want to reply to a message"       | `--json` (to capture timestamps), then `messages send --thread-ts` |
| "What did X say yesterday?"          | `--oldest <yesterday-start> --latest <yesterday-end>`              |
| "Catch me up on the last 5 messages" | `--limit 5`                                                        |

### Tips

- Default `--limit` is 100, which is often too many. Use `--limit 20-50` for summaries.
- Always use `--json` when the next step is replying or reacting — you need the `ts` field.
- When summarizing, use `--exclude-replies` first for a high-level scan, then drill into interesting threads with `--thread-ts`.

## Finding Channels & Conversations

```bash
# List all conversations (channels, DMs, groups)
slackcli conversations list --limit 100

# Filter by type
slackcli conversations list --types public_channel
slackcli conversations list --types private_channel
slackcli conversations list --types im
slackcli conversations list --types mpim

# Exclude archived
slackcli conversations list --exclude-archived
```

When the user refers to a channel by name (e.g., "#general"), list conversations and find the matching channel ID from the output before proceeding.

## Sending Messages

```bash
# Send to a channel
slackcli messages send --recipient-id <channel-id> --message "Hello team"

# Reply in a thread
slackcli messages send --recipient-id <channel-id> --thread-ts <timestamp> --message "Thread reply"

# Send to a specific user (use their user ID from a DM conversation)
slackcli messages send --recipient-id <user-id> --message "Direct message"
```

**Always confirm with the user before sending a message.** Show them the recipient and message content, then ask for approval.

## Reacting to Messages

```bash
slackcli messages react --channel-id <channel-id> --timestamp <message-ts> --emoji thumbsup
```

Common emoji names: `thumbsup`, `heart`, `fire`, `eyes`, `white_check_mark`, `rocket`, `tada`.

## Multi-Workspace

If the user has multiple workspaces, specify which one with `--workspace`:

```bash
slackcli conversations list --workspace "Holistics"
slackcli messages send --workspace "Holistics" --recipient-id <id> --message "hi"
```

## Workflow: Summarize a Channel

When asked to summarize or catch up on a channel:

1. `slackcli conversations list` → find the channel ID by name
2. `slackcli conversations read <channel-id> --limit 50` → fetch recent messages
3. Summarize the content, grouping by topic or thread

## Workflow: Reply to a Conversation

When asked to reply to a specific message:

1. `slackcli conversations read <channel-id> --json --limit 20` → find the message timestamp
2. Show the user the target message and your proposed reply
3. After user confirms: `slackcli messages send --recipient-id <channel-id> --thread-ts <ts> --message "..."`
