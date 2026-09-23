# Browser visual annotations implementation plan

Status: paused after real-site QA on 23 September 2026

Oracle consultation: architecture and 2 challenge reviews completed on 22 September 2026

Fixture evidence: Chinh created one element comment and one region comment. Collection wrote and acknowledged revision 2 with 2 annotations, `stop` removed the overlay without discards, normal page clicking resumed, and start/stop succeeded again after reload.

Real-site result: the overlay rendered on a Holistics dashboard and element selection, text entry, and nested-scroll tracking worked. Saving an element comment did not work reliably. Neither a direct `click` handler nor committing on `pointerup` resolved the failure. The likely boundary is interference from the application's global event handling, but runtime evidence did not isolate the exact handler. Work is paused rather than treating fixture acceptance as production acceptance. A future attempt should start by prototyping a stronger interaction boundary, such as an isolated iframe or browser extension, before adding more event-handler workarounds.

Holistics follow-up: real-dashboard QA found deeply nested chart elements could exceed the root-relative path limit. The implementation now stops at the nearest allowlisted stable ancestor and stores the bounded descendant path from that anchor.

The same QA found Holistics scrolls dashboard content inside nested containers. The overlay now captures document-level scroll events as well as window scrolling so element geometry and pins refresh in nested panes.

Closed Shadow DOM controls can retarget pointer events to the overlay host before document-level selection handlers run. The own-event guard now recognizes both the host target and composed path so composer actions remain clickable in applications with global pointer handlers.

## Outcome

Let the current Amp agent turn visual annotation mode on and off in one tab of an existing headed managed Chrome session.

While annotation mode is active, Chinh can select an element or drag a rectangular region and write a comment. The Amp agent can collect the comments into private workspace artifacts, turn annotation mode off, change the code, reload the page and verify the result.

The implementation must not change Amp, enable Agent Browser streaming, attach to an unmanaged browser or broaden the approved Agent Browser plugin configuration.

## Accepted direction

Extend the existing `agent-browser-lifecycle` command with annotation subcommands. Each subcommand injects or calls a trusted page overlay through the existing managed `eval` action.

The existing command will provide this interface:

```text
agent-browser-lifecycle annotate start \
  --session-id <session> \
  --actor-thread-id <thread> \
  --tab-id <stable-tab-id>

agent-browser-lifecycle annotate collect \
  --session-id <session> \
  --actor-thread-id <thread> \
  --tab-id <stable-tab-id>

agent-browser-lifecycle annotate stop \
  --session-id <session> \
  --actor-thread-id <thread> \
  --tab-id <stable-tab-id> \
  [--discard-uncollected]
```

The annotation subcommands must:

- accept no raw JavaScript or arbitrary Agent Browser arguments
- use the recorded managed session, actor authorization and stable tab ID
- share `command_exec`'s managed preflight and hold the existing per-session operation lock through each page operation
- use only the existing managed `eval` action
- fail closed when lifecycle integrity checks fail
- never start, recover, replace or stop Chrome or the Agent Browser daemon
- invoke the Agent Browser wrapper inside the lifecycle command so wrapper failures retain existing recovery behavior
- treat annotation-level errors as typed successful wrapper results so they do not mark the managed session `cleanup-pending`

This keeps the command surface inside the existing lifecycle tool without adding page-content records to its journal. The lifecycle controller remains the authority for browser ownership, command serialization, payload pinning and artifact writes.

## Why this boundary

### Injected page overlay

The current managed workflow already permits tab-scoped `eval`. A document-scoped overlay needs no Agent Browser patch, Chrome extension, stream or Amp UI change.

The limitation is explicit: annotation mode belongs to one document in one tab. Navigation, reload and tab closure destroy the overlay and any comments that the agent has not collected.

### Rejected: streaming companion UI

RFC-0012 requires streaming to remain disabled from daemon creation. The managed controller rejects stream overrides. A companion review UI would also add another server, protocol, input path and authorization boundary.

### Rejected: Chrome extension or init script

Managed sessions attach to lifecycle-launched Chrome through CDP. The current configuration permits only the approved 1Password plugin and does not permit arbitrary extensions or launch-time scripts. Expanding that boundary is unnecessary for the first useful version.

### Rejected: direct `exec -- eval` instructions

The Amp agent can call `agent-browser-lifecycle exec -- eval` today. Asking each agent to construct or load the payload directly would move payload pinning, envelope validation and artifact writing into model-authored shell commands. The lifecycle subcommands keep those responsibilities in one tested implementation and prevent accidental execution of page-provided JavaScript.

## Ownership and files

Repository source will own:

- `bin/agent-browser-lifecycle`: annotation subcommands, shared managed preflight, output validation and atomic artifact writes
- `amp/agent-browser-annotations/toolkit.js`: trusted browser-side overlay and interaction code
- `amp/agent-browser-annotations/toolkit-core.js`: dependency-free data validation, anchor and geometry functions shared with tests
- `amp/agent-browser-annotations/annotation.schema.json`: collected artifact schema
- `amp/agent-browser-annotations/README.md`: command and data contract
- `amp/conventions/agent-browser.md`: entry point that tells agents when to load the annotation workflow
- `amp/conventions/agent-browser-lifecycle.md`: collect-before-navigation and per-tab rules
- `amp/agent-browser-lifecycle/reference.md`: exact operator procedure
- `scripts/test_agent_browser_annotations.py`: browser-free annotation command and artifact tests
- `scripts/test_agent_browser_annotations.mjs`: browser-free Node tests for the pure toolkit core
- `scripts/check-agent-browser-annotations`: browser-free integration check
- `README.md`, `.pre-commit-config.yaml` and `.github/workflows/ci.yml`: validation registration
- `sync-skills.sh`: runtime projection for the toolkit

Do not modify the managed lifecycle schema, Agent Browser configuration defaults, plugin allowlist, reserved flags or allowed managed actions unless implementation evidence proves the existing `eval` path cannot meet this contract.

The annotation subcommands resolve toolkit files through `bin/agent-browser-lifecycle`'s existing `repo_root()` boundary. They accept no toolkit path override. `amp/conventions/agent-browser.md` remains the discovery entry point, so `amp/AGENTS.md` and the remote `skills/agent-browser/SKILL.md` need no annotation-specific instructions.

## Browser-side design

### Installation

`start` evaluates the versioned toolkit in the selected document. The toolkit stores one non-enumerable controller under `Symbol.for("amp.browserAnnotations.v1")`.

`start` is idempotent:

- if the matching controller exists, activate it and return its status
- if another toolkit version exists, refuse replacement until `stop` removes it
- if no controller exists, install and activate one controller

The controller creates one host under `document.documentElement`. The host contains a Shadow DOM tree with inline styles. The overlay uses a fixed viewport layer, the maximum practical z-index and explicit pointer-event rules. It must not add global CSS classes, stylesheets or page event handlers.

The controller owns its listeners through one `AbortController`. `stop` aborts the listeners, removes the host and deletes the controller symbol.

Every evaluated entry point catches its own exceptions and returns one serialized envelope. No annotation exception may escape from `eval`:

```json
{"ok":true,"complete":true,"payload":{},"terminator":"AMP_ANNOTATION_END_v1"}
```

```json
{"ok":false,"complete":true,"error":{"code":"annotation_error","message":"short safe message"},"terminator":"AMP_ANNOTATION_END_v1"}
```

The annotation handler treats `ok: false` as a typed annotation error while the managed session remains ready. A non-zero Agent Browser wrapper result remains a lifecycle failure and follows the existing recovery procedure.

### Interaction

Annotation mode supports 2 targets:

1. Element target: Chinh points at an element and selects it.
2. Region target: Chinh drags a rectangle over the rendered page.

After target selection, the overlay opens a comment composer outside the selected area when space permits. Chinh can save or cancel the comment. Saved comments appear as numbered pins and in a compact review list.

The overlay must provide visible controls for:

- element mode
- region mode
- hide or show pins
- discard one pending comment
- exit annotation mode without deleting saved comments

Page interaction remains blocked only while annotation mode is active. `stop` restores normal page interaction.

### Page interference

The overlay will:

- isolate its styles in Shadow DOM
- reset inherited styles at the overlay boundary
- use capture-phase pointer listeners
- prevent page actions only while selecting or editing an annotation
- ignore events originating inside its own controls
- recompute target outlines after scroll and resize
- keep region geometry in page coordinates and controls in viewport coordinates

This reduces accidental interference. It does not protect the overlay from hostile same-page JavaScript. The first version is for local development pages and other pages Chinh trusts the agent to inspect.

## Annotation data contract

`collect` returns and validates one document:

```json
{
  "schema": "amp-browser-annotations/v1",
  "toolkitVersion": "1",
  "collectedAt": "2026-09-22T00:00:00Z",
  "viewport": {
    "width": 1440,
    "height": 900,
    "devicePixelRatio": 2
  },
  "annotations": [
    {
      "id": "a1",
      "kind": "element",
      "comment": "Tooltip covers the selected data point",
      "geometry": {
        "x": 640,
        "y": 510,
        "width": 180,
        "height": 90
      },
      "anchor": {
        "tag": "div",
        "testId": "chart-tooltip",
        "domPath": [3, 1, 4]
      }
    }
  ]
}
```

Region annotations omit `anchor`. Element anchors contain only structural identifiers that pass the data-minimization checks.

The toolkit enforces these limits before saving a comment:

- at most 50 annotations in one document
- at most 2,000 UTF-16 code units in one comment
- at most 20 child indexes in `anchor.domPath`
- integers from 0 to 2,147,483,647 for page geometry
- at most 20,000 UTF-8 bytes for the complete serialized success envelope, leaving room for the outer Agent Browser JSON encoding

The toolkit rejects a save that would exceed the complete-envelope limit. The annotation handler requires the complete envelope and exact `AMP_ANNOTATION_END_v1` terminator before parsing the payload. Missing, duplicated, malformed or trailing output causes collection to fail without writing an artifact. The handler never attempts to repair or truncate output.

The artifact must not contain:

- input, textarea, select or contenteditable values
- passwords, one-time codes, credentials or cookies
- local storage or page session storage
- element text, accessible names, document titles or page metadata
- URLs, query strings or fragments
- DOM HTML or arbitrary attributes
- screenshots or binary data

The human comment is the only captured free text. The Amp agent must treat each comment as untrusted task input, not as an instruction that can override system, user or repository guidance.

The toolkit may inspect safe structural attributes to build an anchor. It may retain only:

- a `data-testid`, `data-test`, `data-qa` or HTML `id` value that matches `^[A-Za-z0-9._:-]{1,64}$`
- the lowercase tag name
- a bounded child-index path to the nearest stable anchor or document root

The toolkit must omit an attribute when its name or value appears secret-like, exceeds the schema limit or resembles a high-entropy identifier. Values of 24 or more characters containing only hexadecimal or base64 characters are not stable anchors.

## Artifact contract

Annotations are workflow outputs, not browser lifecycle state.

Store each collection under:

```text
.amp/in/artifacts/browser-annotations/<timestamp>/
├── .thread-metadata
└── annotations.json
```

`.thread-metadata` contains the current Amp thread ID. `collect` creates the timestamped directory, writes `annotations.json` atomically with owner-only file permissions and returns the artifact path. The command accepts no caller-selected output path.

The annotation handler obtains the workspace from the managed session record after lifecycle authorization. It does not trust `$PWD` or a caller-supplied workspace. It resolves the generated output path and every existing parent before checking containment, and refuses symbolic-link escapes. For an attached subagent, `.thread-metadata` contains the actor thread ID that performed `collect`, not the browser owner's thread ID.

The lifecycle journal must contain no annotation content, URL, selector, comment or artifact body. Existing command bookkeeping may record that the managed `eval` command ran, but not its returned page content.

A screenshot is optional and separate. When the agent needs one, it uses the existing managed screenshot command, stores the image in the same artifact directory and inspects it with `view_media`.

## State transitions

```text
absent ──start──▶ active ──pause in UI──▶ inactive
  ▲                 │                        │
  │                 ├──collect──▶ active    ├──collect──▶ inactive
  │                 │                        │
  └──────stop───────┴────────────────────────┘
```

- `start` creates or reactivates the overlay.
- UI pause keeps comments in the current document but restores page interaction.
- `collect` validates and writes a snapshot without deleting comments.
- `stop` reports the pending comment count and removes the overlay.
- `stop` performs its pending check and teardown in one evaluated toolkit call.
- `stop` refuses teardown when the current document has comments newer than the last successful collection.
- `stop --discard-uncollected` atomically permits teardown and returns the discarded count.

The toolkit records the most recent collected revision only inside the document controller. It does not persist controller state outside the page.

## Navigation, reload and recovery

Before `goto`, `navigate`, `back`, `forward`, `reload`, tab closure or session shutdown, the Amp agent must:

1. run `agent-browser-lifecycle annotate collect`
2. confirm that the lifecycle command wrote and validated the artifact
3. run `agent-browser-lifecycle annotate stop`, unless the document is about to be destroyed
4. perform the browser action

The first version does not use page `sessionStorage` or `localStorage`. This avoids mixing annotation data with application storage and keeps annotation persistence explicit.

If Chinh manually reloads, navigates or closes the tab before collection, uncollected comments are lost. The overlay should show a visible warning while uncollected comments exist and may use `beforeunload` only to trigger the browser's standard leave-page confirmation for Chinh's manual browser actions. Managed CDP navigation can bypass this handler, so the agent must always complete the explicit collect step before its own navigation commands. The overlay must not attempt background transfer or storage.

After navigation or reload, the agent runs `start` again. After managed session recovery, the owner opens or selects a new tab under the normal lifecycle rules and runs `start` again. Previously collected artifacts remain available to the Amp thread.

Subagents retain their existing per-tab ownership. A child may annotate only its own attached tab. The owner remains responsible for browser shutdown.

## Amp-agent workflow

The agent will follow this procedure:

1. Load the Agent Browser skill and browser conventions.
2. Reuse or start a headed managed session with a named profile when login reuse is needed.
3. Open a dedicated tab and retain its stable tab ID.
4. Run `agent-browser-lifecycle annotate start` for that tab.
5. Tell Chinh that annotation mode is ready and ask Chinh to finish the comments without reloading or navigating.
6. When Chinh confirms completion, run `agent-browser-lifecycle annotate collect` and inspect `annotations.json`.
7. Run `agent-browser-lifecycle annotate stop`.
8. Change the code.
9. Reload the page through the managed lifecycle command.
10. Reproduce each annotated state and verify the result.
11. Capture and inspect a representative screenshot when the change affects appearance.

The agent does not need a new Amp tool or plugin. It uses shell commands already available to the current Amp agent.

## Implementation stages

### Stage 1: Freeze the contract

Before implementation:

- confirm the pinned Agent Browser `eval` result format and command-size limit
- confirm that the lifecycle subprocess output path does not persist returned annotation content in its journal
- prove that all expected toolkit failures resolve to a complete `ok: false` envelope while the Agent Browser wrapper exits 0
- measure the largest schema-valid collection against the pinned 50,000-character output limit and reduce the annotation or comment cap if required

Completion: the plan has no unresolved security or ownership decision.

### Stage 2: Build the browser toolkit

Implement the versioned controller, Shadow DOM overlay, element selection, region selection, composer, pins, review list, pause and teardown.

Keep the toolkit dependency-free and suitable for one `eval` payload. Do not add a bundler unless the source cannot remain maintainable without one.

Separate pure anchor, geometry, limit, envelope and data-minimization functions into `toolkit-core.js`. Test that file with Node's built-in test runner and synthetic data. This adds no browser, Chromium substitute, jsdom or package dependency. Cover pointer interaction, scroll behavior, Shadow DOM isolation and teardown only in the live acceptance check, and label that evidence as live rather than mock coverage.

Completion: browser-free pure-data tests pass, and the toolkit source contains no external runtime dependency.

### Stage 3: Add lifecycle annotation subcommands

Add `annotate start`, `annotate collect` and `annotate stop` to `bin/agent-browser-lifecycle`. Extract a shared managed preflight from `command_exec` only if the refactor preserves existing behavior; otherwise keep the small preflight sequence explicit in the annotation handler.

The annotation handler must use the same session lock, actor authorization, tab selection, repository identity and installed runtime checks as `command_exec`. It must reject arbitrary payloads and reserved browser overrides. `collect` resolves the workspace from the managed session and creates the fixed timestamped artifact path. A typed `ok: false` annotation envelope must not append `cleanup_pending`; a wrapper failure must retain the existing recovery behavior.

Completion: browser-free tests prove that all annotation commands preserve the supplied session, actor and tab IDs, cannot bypass managed execution, write artifacts only in the managed workspace and do not poison a ready session for a typed annotation error.

### Stage 4: Document and project the workflow

Update the browser convention, lifecycle reference, projection and validation table. Keep the short convention as an entry point and place operational detail in the lifecycle reference and annotation README.

Completion: isolated projection installs the updated lifecycle command and toolkit without changing live runtime paths, and a second projection is byte-stable.

### Stage 5: Run a live acceptance check

Use a disposable local fixture and disposable headed managed session.

Verify:

1. start annotation mode
2. add one element comment and one region comment
3. pause and resume annotation mode
4. collect to the required workspace artifact path
5. inspect the JSON and a screenshot
6. stop without page interaction remaining blocked
7. reload and start a clean overlay
8. stop and close the managed session through the normal lifecycle flow

Completion: the evidence records the commands and outcomes without retaining sensitive page data, and the managed session reaches `closed`.

## Verification

### Browser-free checks

Test these competing failure cases:

- a region mixes viewport and page coordinates
- anchor generation captures input values, text or arbitrary attributes
- a URL, title or page metadata enters the result
- an invalid annotation envelope bypasses schema validation
- a symlink escapes `.amp/in/artifacts/`
- collection truncation produces a valid-looking partial artifact
- a toolkit exception escapes and marks the managed session `cleanup-pending`
- a collection exceeds the annotation, comment or output envelope limit
- a caller substitutes another session, actor or tab after validation
- stop silently discards comments that were never collected
- the annotation handler resolves artifacts from `$PWD` instead of the managed session workspace
- a typed annotation-error envelope appends `cleanup_pending` or changes the managed session from `ready`

Run:

```bash
python3 -m unittest scripts/test_agent_browser_annotations.py
node --test scripts/test_agent_browser_annotations.mjs
scripts/check-agent-browser-annotations
uvx --with jsonschema==4.25.1 python -B -m unittest \
  scripts/test_agent_browser_lifecycle.py \
  scripts/test_agent_browser_lifecycle_managed.py \
  scripts/test_agent_browser_process_identity.py \
  scripts/test_agent_browser_lifecycle_sharing.py \
  scripts/test_agent_browser_retired_cleanup.py \
  scripts/test_agent_browser_lifecycle_sweep.py
scripts/check-projection
pre-commit run
pre-commit run --hook-stage pre-push --all-files
```

### Live check

Repository policy keeps routine automated tests browser-free. Run one manual acceptance check after the browser-free suite passes. Store its concise evidence under the existing RFC evidence area or the implementation pull request, not as a routine test transcript.

The live check must distinguish behavior that synthetic pure-data tests cannot prove:

- a second `start` does not create duplicate listeners or overlays
- `stop` leaves no invisible click blocker
- hostile page CSS does not restyle or cover the annotation controls
- page capture listeners do not trigger the underlying action during selection
- scrolling and resizing keep an element outline on its target
- pointer selection, comment editing, pause and teardown work in headed Chrome

## Known limitations

- annotation mode is available only in headed managed Chrome
- annotations belong to one document and one tab
- uncollected comments do not survive navigation, reload, tab closure or browser failure
- cross-origin iframe content supports only a region annotation over the iframe rectangle
- canvas and WebGL content support region annotations, not semantic element anchors
- a page's JavaScript can inspect or disrupt an injected overlay
- structural anchors can drift after a large DOM rewrite
- the workflow requires Chinh to tell the agent when comments are ready to collect

## Deferred work

Do not include these features in the first implementation:

- live comment events sent to Amp
- automatic reinjection after navigation
- shared annotations across tabs or threads
- annotation history or collaboration
- streaming dashboard integration
- Chrome extension packaging
- full CDP developer-mode access
- automatic screenshots for every comment
- long-term annotation storage outside the current fix and verification loop

Revisit automatic reinjection or an out-of-page review surface only after repeated use shows that explicit start and collect steps are the main source of failure.

## Oracle consultation record

The first Oracle pass compared the injected overlay, streaming companion UI and Chrome extension boundaries. It recommended the injected overlay because the current lifecycle already authorizes tab-scoped `eval`, while streaming and extensions would expand settled runtime boundaries. It also recommended workspace artifacts instead of lifecycle records.

The second Oracle pass challenged this draft against the lifecycle implementation. It confirmed that a lifecycle-owned annotation path inherits the existing session lock, actor authorization, tab selection and runtime integrity checks. It required these corrections, now incorporated above:

- catch toolkit errors inside `eval` because any non-zero managed command marks the session `cleanup-pending`
- bound and frame output so the lifecycle command cannot persist a truncated collection
- use dependency-free pure-data tests instead of claiming browser-free interaction coverage
- make the uncollected check and teardown one atomic toolkit call
- limit `beforeunload` to manual browser actions
- resolve artifacts from the authorized managed-session workspace
- pin toolkit source resolution and structural-anchor filters

Oracle's final verdict was: ready after these edits; no different architecture is required.

After Chinh rejected a separate annotation executable, the third Oracle pass compared direct `exec -- eval` calls with annotation subcommands on the existing lifecycle command. It recommended `agent-browser-lifecycle annotate start|collect|stop`. This keeps payload pinning, envelope validation, operation locking and artifact writes inside the existing trusted command without creating another tool.
