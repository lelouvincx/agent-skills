---
doc_schema: "amp-artifact/v2"
title: "Shipping personal projects"
slug: "shipping-personal-projects"
status: "active"
summary: "Orchestrates approved personal-repository shipping through the hardened bot publisher and repository release gates."
artifact:
  id: "shipping-personal-projects"
  type: "skill"
  surface: "agent_context"
  invocation: "skill_load"
  api_stability: "stable"
source:
  kind: "skill"
  file: "skills/shipping-personal-projects/SKILL.md"
  scope: "system"
  install_source: "local"
  registration_api: null
  metadata_comments: []
amp:
  docs_sources:
    api_docs: null
    agent_options: null
  last_verified: "2026-11-01"
contract:
  input_kind: "natural_language"
  output_kind: "instructions"
  trigger: "description_match_or_explicit_load"
  allowed_tools: []
  event: null
  command_id: null
  agent_mode_key: null
runtime:
  uses: ["agent-bot-pr", "Git", "GitHub event subscriptions"]
  dependencies: ["approved bot publisher", "repository release instructions"]
  env: []
  reads: ["requested scope", "repository instructions", "working tree", "PR template", "checks and feedback"]
  writes: ["approved repository changes", "bot branches and pull requests", "thread-owned temporary resources"]
  network: ["GitHub", "repository-specific deployment verification"]
  logs: ["redacted validation and delivery evidence"]
safety:
  permission_level: "guidance-only"
  user_gate: "explicit shipping authorization"
  constraints:
    - "The skill orchestrates; agent-bot-pr remains the approved executable interface."
    - "Preserve user restrictions, repository release gates and unrelated work."
    - "Never substitute a personal publisher or expose credential values."
    - "Bot policy authorization and effective GitHub access are separate requirements."
  risks:
    - "A trusted-runtime publisher and skill do not isolate credentials from other processes with equivalent access."
    - "A successful PR merge does not establish default-branch or deployment success."
related: []
tags: ["skill", "shipping", "github", "personal-projects"]
---

# Shipping personal projects

## Summary

The skill owns the shipping procedure. `agent-bot-pr` owns bounded publishing operations through the approved bot credential path.
Chinh chose to retain and harden that executable rather than replace it during RFC-0015.

## Invocation

Load `shipping-personal-projects` for authorized personal-repository shipping or to continue that workflow after CI or feedback arrives.

## Contract

Load the skill for authorized shipping work in approved personal repositories. Keep the short project Ship prompt in `skills/shipping-personal-projects/ship.txt` beside the procedure.
Repository instructions define validation, changelog sequencing, release gates and production verification. The shared procedure supplies only the common orchestration.

Successful shipping means the approved changes are merged, default-branch checks pass and applicable deployment verification passes. Cleanup must preserve unrelated work.
An explicit restriction such as no merge or no deployment narrows that outcome and must be reported.

## Behavior

1. Bind the requested work to the repository, base branch and exact diff.
2. Verify bot authorization and access before publishing. Stop on publisher failures rather than rebuilding credential commands.
3. Validate and publish only approved paths, following the repository's PR template and changelog policy.
4. Follow exact-head CI and PR feedback, then merge only after checks and release gates pass.
5. Verify the default branch and applicable deployment, clean up thread-owned resources and report the actual delivery state.

## Permissions and side effects

The helper's checks are trusted-runtime guardrails, not an adversarial-agent sandbox. The resolver still permits other registered callers; this skill does not turn those capabilities into restricted operations.
Shipping can create commits, branches and PRs, merge authorized changes and trigger repository deployment workflows. User restrictions and repository release gates remain authoritative.

## Examples

The common project Ship prompt loads this skill. A request limited to opening a PR stops before merge, even if the project normally ships through deployment.

## Troubleshooting

When publishing is denied, distinguish policy authorization, effective GitHub access and credential availability. Stop at the failed boundary instead of substituting a personal publisher.

## Maintenance notes

Use isolated Git fixtures and mocked GitHub responses for denial paths. Exercise the actual publishing path on an authorized infrastructure PR carrying requested changes, not by deploying application changes solely as a test.
Require explicit scope, identity and access evidence; include failed checks and limitations in the delivery report.
