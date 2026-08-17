# Agent Browser conventions

- Start a new, separate instance of the installed system Google Chrome in headed mode with the persistent local profile at `~/.local/state/agent-browser/profiles/local`.
- Give that instance an unused CDP port dedicated to the current agent-browser session. Connect agent-browser to that port rather than attaching to another Chrome instance or reusing another session's CDP endpoint.
- Bring Chrome to the foreground and verify the current URL and page title before continuing.
- Treat the local profile as sensitive authentication state. When authentication is required, ask the user to sign in and tell you when they have finished, then continue in the same browser session.
