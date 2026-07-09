# Personal profile shortcuts

## Local persistent browser profile

Use this profile when the user asks for the existing `local` agent-browser profile:

```bash
agent-browser --profile /Users/lelouvincx/.local/state/agent-browser/profiles/local <command>
```

Known persisted auth in this profile:

- `https://demo4.holistics.io` is logged in and restores to the Holistics home page.
- `https://mail.google.com/mail/u/0/` is logged in as the work Gmail account.

Treat this profile directory as sensitive because it contains browser auth state. Do not copy, commit, print, or share files from it.
