---
description: Operates native desktop apps through accessibility trees with agent-desktop. Use for native-app buttons, forms, menus, windows, screenshots, and desktop automation on macOS, Windows or Linux. For websites and browser-page automation, use the existing browser workflow instead.
---

## Local workflow

Use `agent-desktop` for native desktop apps. For websites, use the existing browser skills and `{AMP_CONFIG_DIR:~/.config/amp}/conventions/agent-browser.md`.

On this Mac, install the CLI with `brew install agent-desktop`. The remote skill is pinned to v1.3.1; when using another CLI version, run `agent-desktop skills get desktop` for version-matched instructions. Platform and command references come from the installed binary, not companion files in this skill.

Run `agent-desktop status` before desktop work. If macOS Accessibility permission is missing, run `agent-desktop permissions --guide` and ask Chinh to grant the reported executable access in System Settings. Do not change permissions on Chinh's behalf.

Keep snapshots, clipboard content and screenshots out of public logs. Save review captures under `.amp/in/artifacts/` in the current workspace.
