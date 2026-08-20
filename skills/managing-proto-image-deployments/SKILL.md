---
name: managing-proto-image-deployments
description: Guides safe, bounded `proto deploy --image` workflows. Use when an agent prepares or reviews a proto image deployment, configures its 1Password-backed secrets, verifies preview or live behavior, or explains deployment elapsed time.
---

# Managing Proto Image Deployments

Treat a proto image deployment as a preview-PR workflow with two gates: verified secret inputs before deployment and explicit approval before merge.

Use the installed `proto --help` and `proto deploy --help` output as the command contract. Do not infer current flags from this skill.

## Establish the contract

Before deploying:

1. Confirm the intended repository, worktree, commit, application, environment, image, and immutable digest.
2. Inspect Git status and preserve unrelated work. Do not deploy from or rewrite an unintended branch.
3. State that `proto deploy` creates or updates a preview pull request; it does not publish production immediately.
4. Record the acceptance checks, separate preview and production rollout deadlines, and who can approve the merge. A request to prepare or verify a deployment is not merge approval.

## Preflight secret provenance

Build a redacted map of each required secret field to its exact vault, existing item, and field. Record only names and verification status, never values.

- Derive required fields from the application contract. Keep ordinary public configuration outside the secret map.
- Treat an item name proposed by an agent, inferred from the application name, or emitted by generated configuration as a convention, not proof that the item exists.
- Distinguish a generated secret reference from an existing user-owned item confirmed through 1Password.
- Verify that the exact vault and item are accessible and that every required field exists. The application and item names may differ.
- Inspect dry-run or generated configuration to ensure it preserves the verified mapping.

If a vault, item, or field is missing, stop before creating a preview and ask one precise correction question. Do not create an item, copy a known-broken preview, open its URL, or poll its rollout unless the user explicitly asks for that recovery path.

## Deploy and verify once

Run the deploy only after preflight passes. Follow one rollout until it becomes healthy, reaches terminal failure, or exceeds its declared deadline. On failure or deadline expiry, capture status once, stop, and require new evidence or approval before retrying.

Always confirm that deployment status is healthy and the preview references the expected immutable image digest. Apply the remaining checks only when the application acceptance contract declares them:

- an HTTP health endpoint succeeds;
- signed payload claims and scopes are correct;
- one deterministic browser pass succeeds for each required identity;
- one screenshot per identity is captured when evidence is required.

Re-snapshot the browser after navigation or page-state changes; stale element references are not evidence. Stop when the declared checks pass. Extra screenshots, registry lookups, repeated dry-runs, and broad source inspection need a specific unresolved question.

Send the evidence and request merge approval immediately after preview acceptance passes. Merge only after explicit approval. After merge, follow one production rollout to health, terminal failure, or its deadline. Confirm the immutable digest and run only the live checks needed to show that the accepted behavior carried over; apply the same stop-and-escalate rule on failure or deadline expiry.

## Give precise proto feedback

Separate an observed incident cause from a product improvement:

- If proto assumes the 1Password item name equals the application name, an item override such as `--secret-item <existing-item>` could avoid a generated-config patch when the two names differ. The override should select and persist a verified existing item; it must not imply that proto created the item.
- An item-level override does not solve keys sourced from multiple items or a wrong vault/store. Per-key item and field references handle multiple-item mappings; a wrong vault/store also requires an explicit vault or secret-store selector. Neither design supplies a field that is genuinely absent.
- Missing required secrets should fail preflight before pull-request creation by default. Continuing should require an explicit override.
- User-facing vault names, generated references, and operator configuration should use the same terminology.

Label suggestions as suggestions until the installed CLI or product documentation confirms support.

## Review elapsed time

Use raw thread timestamps, deployment events, pull-request events, and health transitions to build the timeline. Attribute elapsed intervals separately to:

- platform rollout;
- user input or approval waiting;
- incorrect handoff or configuration;
- agent investigation and verification;
- tooling or model latency.

Report preview and production rollout durations separately from the whole thread. Do not call the platform slow when most elapsed time belongs to another category. Mark intervals as estimates when the evidence does not expose exact timestamps.
