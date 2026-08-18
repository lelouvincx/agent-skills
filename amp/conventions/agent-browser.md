# Agent Browser conventions

- Start a new, separate instance of the installed system Google Chrome in headed mode with the persistent local profile at `~/.local/state/agent-browser/profiles/local`.
- Give that instance an unused CDP port dedicated to the current Amp thread. Connect agent-browser to that port only from this thread; never attach to a Chrome instance or reuse a CDP endpoint belonging to another Amp thread.
- Bring Chrome to the foreground and verify the current URL and page title before continuing.
- Treat the local profile as sensitive authentication state. When authentication is required, ask the user to sign in and tell you when they have finished, then continue in the same browser session.
