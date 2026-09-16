# Fixture GOV-004: agent skill routing and mechanics

## Task

Revise this draft `SKILL.md`.

The skill must be discoverable automatically for dependency upgrades and release preparation. `reference/releasing.md` is authoritative for release-only instructions, and `package.json` is authoritative for command names. Do not invent project requirements.

Expected mode: Agent-facing writing.

## Draft

```markdown
---
name: project-maintenance
description: Helps with project maintenance.
disable-model-invocation: true
---

# Project maintenance

Use this skill for project maintenance.

Be careful and be thorough. Do not skip steps. Make sure everything is correct.

## Dependency upgrades

When upgrading dependencies, run `npm install`, `npm test`, `npm run lint` and `npm run build`.

Update packages and make sure the repo is good.

## Release preparation

Before a release, update the changelog, create the tag, sign the release and publish it. The release must be signed with the release key. Use the release checklist from `reference/releasing.md`.

## Final check

Do not forget validation.
```

## Acceptance checks

- selects Agent-facing writing and applies skill-specific mechanics
- chooses model invocation because autonomous discovery is required
- replaces the vague description with a model-facing pointer covering dependency upgrades and release preparation
- moves release-only detail behind a conditional pointer to `reference/releasing.md`
- removes duplicated release instructions that belong in `reference/releasing.md`
- does not cache package commands that `package.json` already exposes
- replaces vague or negative steps with positive actions and checkable completion criteria
- removes no-op guidance instead of polishing it
- preserves directive structure rather than mechanically applying short-prose rules

## Failure tags

`wrong mode`, `agent reference missed`, `skill mechanics missed`, `wrong invocation`, `weak pointer`, `duplicate meaning`, `no completion bound`, `environment cache`, `no-op retained`
