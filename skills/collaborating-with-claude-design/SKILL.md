---
name: collaborating-with-claude-design
description: Claude Design orchestration for explicit requests to create, inspect, or refine a cloud design. Coordinates bounded cloud work, Present → Fullscreen visual QA, evidence-based iteration, and machine-readable handoff.
compatibility: Requires Amp with the claude_design_subagent tool and the agent-browser skill.
---

# Collaborating with Claude Design

Treat Claude Design as the designer and Amp as the orchestrator and visual reviewer. A project URL or prose success report is an intermediate result; a rendered, reviewed deliverable is the completion gate.

## Workflow

### 1. Establish the design contract

Confirm whether the request targets a new or existing project. Build a brief containing:

- intended user and outcome
- screen, state, and target viewport
- source design language and target design system
- content and interaction requirements
- non-goals
- visual acceptance criteria
- obviously fictional people and organizations with `example.com` contact details, unless the user explicitly requires real identities

When a website or image is a style reference, inspect it before briefing Claude. Classify each style claim as:

- `Evidence`: an observed fact with its source URL, artifact path, source location, or DOM selector
- `Interpretation`: the design direction inferred from that evidence

Exact colors, fonts, and dimensions count as evidence only when read from source or DOM. Keep screenshot-only observations qualitative. When combining 2 systems, name which owns product identity and which contributes compositional influence.

Complete this step when every style claim is classified, every exact value cites its source, and Claude can act without inventing the screen's purpose, design-system identity, or viewport behavior.

### 2. Perform one bounded Claude Design operation

Before the operation, classify Claude subscription login, Design consent, and browser access separately as `ready`, `blocked`, or `unknown`. Resolve a known blocker through its matching recovery branch. Do not treat one ready state as evidence for another.

Call `claude_design_subagent` only after the user explicitly requests Claude Design. Give it the design contract and relevant local read scope. Keep an inspection request read-only. For creation or refinement, apply exactly one user-authorized bounded mutation.

Ask Claude to return:

- project name, ID, and project URL
- deliverable name and URL
- design-system name and ID when one is bound
- intended viewport
- concise change summary
- anything it could not render or verify

Record the returned `sessionId` and audit path. Reuse the session ID for subsequent work on the same direction. Keep the project ID or URL in every iteration prompt; conversation continuity does not replace project identity.

Complete this step when the returned project and deliverable identities match the intended target. Claude's prose report does not verify the rendered design.

### 3. Run the render gate

Load `agent-browser`, then follow this convention:

- start a new, separate instance of the installed system Google Chrome in headed mode with the persistent local profile at `~/.local/state/agent-browser/profiles/local`
- assign an unused CDP port to the current Amp thread, connect `agent-browser` only to that port, and never attach to or reuse another thread's Chrome or CDP endpoint
- bring Chrome to the foreground and verify the current URL and page title before continuing
- treat the profile as sensitive authentication state; when sign-in is required, ask the user to sign in and tell you when they have finished, then continue in the same browser session

Open the deliverable URL at the intended viewport.

Claude Design's editor iframe can appear blank in browser screenshots even when its accessibility tree contains the design. Open **Present → Fullscreen** before capturing verification evidence. Save screenshots under `.amp/in/artifacts/`.

Review the screenshot for:

- real design content rather than an empty editor canvas
- horizontal overflow, clipping, overlap, and truncated controls
- typography, spacing, hierarchy, and design-system identity
- requested content, states, and interactions
- legibility and obvious contrast problems
- personal or sensitive information, including identities copied from references instead of using fictional examples

Complete this step only after Amp opens Present → Fullscreen and inspects a current, non-blank screenshot captured at the exact intended viewport. Record its path and viewport in the handoff manifest. A successful tool response without rendered evidence leaves the design unverified.

### 4. Iterate on evidence

When the render gate finds defects, send Claude a narrow correction containing:

- the same project ID or URL and prior `sessionId`
- the viewport used
- each visible defect and its location
- what must remain unchanged
- the expected observable result

Ask Claude to reopen the identified project and apply only that delta. Repeat the render gate after every mutation. If the subagent cannot receive the screenshot itself, translate the screenshot into concrete visual evidence rather than asking for a general polish pass.

Complete this step only when every recorded defect is either fixed and rechecked through a new render gate or explicitly accepted by the user.

### 5. Deliver the reviewable result

Write `.amp/in/artifacts/claude-design-handoff.json` with this versioned contract. Use real JSON values, the listed enum values, and `null` for unavailable fields.

```json
{
  "schemaVersion": 1,
  "project": {
    "name": "Example analytics workspace",
    "id": "project_example",
    "url": "https://claude.ai/design/project/project_example"
  },
  "deliverable": {
    "name": "Example dashboard",
    "id": null,
    "url": "https://claude.ai/design/project/project_example/example-dashboard"
  },
  "designSystem": { "name": null, "id": null },
  "claude": { "sessionId": null, "auditLogPath": null },
  "viewport": { "width": 1440, "height": 900, "deviceScaleFactor": 1 },
  "auth": {
    "claudeSubscription": "ready",
    "designConsent": "ready",
    "browserAccess": "ready"
  },
  "approval": {
    "state": "pending",
    "decisions": [],
    "unresolvedFeedback": []
  },
  "evidence": {
    "screenshotPath": ".amp/in/artifacts/example.png",
    "capturedAt": "2026-08-21T12:00:00Z",
    "mode": "present-fullscreen",
    "reviewStatus": "passed",
    "defects": []
  }
}
```

Use `ready`, `blocked`, or `unknown` for each auth state. Record state only, never credentials or browser data. Use `pending`, `accepted`, or `accepted-with-limitations` for approval. Use `passed` or `failed` for review status. Each defect has a description, location, and `open`, `fixed`, or `accepted` status.

Return the deliverable link, manifest, and latest verified screenshot. State any remaining unverified behavior or accepted limitation. Keep the Chrome profile local; share rendered artifacts, never browser state.

Complete this step when the user has the deliverable URL, handoff manifest, and latest screenshot that passed the render gate.

## Recovery

- **Claude subscription:** restore Claude CLI subscription login without ambient API-key authentication. Preserve the session ID and audit path, then inspect the project before retrying an ambiguous mutation.
- **Design access:** confirm account or organization enablement and grant `/design consent`.
- **Browser access:** ask the user to sign in in the dedicated Chrome window, then continue through the same CDP session.
- **Blank screenshot:** verify the project title and URL, then use Present → Fullscreen. Treat a still-blank capture as a failed render gate.
- **Unexpected design value:** ask Claude to inspect the project source without modifying it, or inspect the rendered DOM. Correct prior assumptions explicitly.
- **Responsive clipping:** report the exact edge, affected labels or controls, and viewport. Ask for a bounded layout correction, then recapture at the same viewport.
- **New Amp thread:** attach the handoff manifest and its referenced evidence. The project URL recovers canvas identity. Only the session ID resumes the prior Claude Code conversation.
