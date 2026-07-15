## Local Chrome workflow

1. Launch the installed system Google Chrome in visible, headed mode with CDP enabled and the persistent profile at `~/.local/state/agent-browser/profiles/local`.
2. Connect agent-browser to Chrome over CDP and bring the Chrome window to the foreground.
3. Verify the current URL and page title before continuing with the task.

Use this local profile to preserve authentication and treat it as sensitive browser auth state. Use the installed system Google Chrome—not headless Chrome or Chrome for Testing. If authentication is required, pause and ask the user to complete the login before continuing.
