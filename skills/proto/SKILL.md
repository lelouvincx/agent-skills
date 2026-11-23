---
name: proto
description: Deploys and takes down Holistics prototypes with the `proto` CLI. Use when deploying a static folder, single HTML file, SPA or prebuilt image with `proto`, taking a prototype down, or reporting a Proto problem.
---

# Proto deployments

Each `proto deploy` opens or updates a pull request on `holistics/prototypes-deploy`. That open pull request is the deployment:

- the site goes live about 2 minutes after the deploy
- the site stays up while the pull request is open
- nobody needs to merge the pull request
- `proto destroy` closes the pull request and takes the site down

Take commands and flags from `proto --help` and `proto <command> --help`. The installed CLI is the source of truth for its interface.

## Install and log in

If `proto` is not installed, run:

```sh
curl -fsSL https://docs.pages.holistics.dev/install.sh | sh
```

Before the first deploy, run:

```sh
proto login
```

## Before you deploy

1. Confirm the repository, branch, commit, app name and input you will deploy. For a prebuilt image, use its immutable digest.
2. Check `git status`. Deploy from the intended branch and keep unrelated work intact.
3. Tell the user that the deploy goes live at the app's URL when the rollout finishes. Proto has no separate production step.
4. Agree on the checks that show the deploy works, and how long to wait for the rollout.
5. Run `proto deploy --takeover` on another person's app, or `proto destroy`, only when the user explicitly asks for that action.

## Report a Proto problem

When a deploy exposes a Proto problem, keep what you observed separate from what Proto could improve:

1. State the problem in one or two lines.
2. Give the raw evidence: commands, output, deployment and pull-request events, and the relevant configuration with secret values redacted.
3. Name the cause only when the evidence shows it. Otherwise call it a hypothesis and say what evidence is missing.
4. Add a product suggestion only when the user asks for one. Say which part of the problem it would prevent and which parts it would not.

Label each suggestion as a suggestion until the installed CLI or the product documentation confirms support.
