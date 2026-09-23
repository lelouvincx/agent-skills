# Browser visual annotation toolkit

This directory contains the dependency-free page toolkit used by the managed
`agent-browser-lifecycle annotate` commands. It is designed for evaluation in
the current document of an existing headed Chrome tab. It does not start,
attach to, navigate, or recover a browser.

The lifecycle integration exposes the fixed command surface below. These
commands accept no JavaScript, toolkit path, output path, or arbitrary browser
arguments:

```text
agent-browser-lifecycle annotate start --session-id ID --actor-thread-id ID --tab-id ID
agent-browser-lifecycle annotate collect --session-id ID --actor-thread-id ID --tab-id ID
agent-browser-lifecycle annotate stop --session-id ID --actor-thread-id ID --tab-id ID [--discard-uncollected]
```

## Evaluation contract

The lifecycle caller must read and concatenate `toolkit-core.js` followed by
`toolkit.js` inside one trusted eval payload. It then invokes the controller
without accepting caller-authored JavaScript:

```js
globalThis[Symbol.for("amp.browserAnnotations.v1")].start()
globalThis[Symbol.for("amp.browserAnnotations.v1")].collect()
globalThis[Symbol.for("amp.browserAnnotations.v1")].acknowledge({ revision: 1 })
globalThis[Symbol.for("amp.browserAnnotations.v1")].stop({ discardUncollected: false })
```

Evaluate the sources again before each invocation. Re-evaluation is
idempotent while the v1 controller exists. The controller and its family
marker are non-enumerable, configurable symbol properties. `stop` removes
both controller properties; the pure core may remain cached in the document.

Each method returns one JSON string and catches annotation exceptions. A
successful result has this shape:

```json
{"ok":true,"complete":true,"payload":{},"terminator":"AMP_ANNOTATION_END_v1"}
```

A refused or failed operation returns `ok: false`, a stable error code, and a
short safe message in the same complete frame. The lifecycle caller must
require exactly one parsed JSON value, `complete: true`, and the exact
terminator. It must reject malformed, duplicated, truncated, or trailing
output rather than repair it.

`start` creates or resumes the overlay and returns status. `collect` returns a
revision and validated `amp-browser-annotations/v1` document without changing
collection state. After the lifecycle command atomically writes the artifact,
it calls `acknowledge` with that exact revision. A stale acknowledgement fails
and leaves the page dirty. `stop` performs its pending revision check and
teardown atomically. It returns `uncollected_comments` without changing the
page when comments changed since acknowledgement, unless `discardUncollected`
is exactly `true`.

## User interaction

The closed Shadow DOM overlay provides element and region modes, a comment
composer, numbered pins, a review list, per-comment discard controls, and a
Pause/Resume control. Pause restores page pointer interaction without deleting
saved comments. Region drag uses pointer capture. All listeners belong to one
`AbortController`, which `stop` aborts before removing the host.

This capability is experimental. A closed Shadow DOM isolates markup and
styles, but it cannot stop an application from intercepting events earlier in
the document path. Complex applications with global event handling may prevent
composer controls from working. Stop annotation mode rather than repeatedly
retrying when that happens.

Element geometry and pins are refreshed after window or nested-container
scrolling and resize. Region
coordinates are converted from viewport coordinates to page coordinates when
the drag occurs. Element anchors use only a lowercase tag, a bounded path of
element-child indexes from the nearest stable ancestor, and at most one
filtered structural identifier. If no stable ancestor exists within the path
limit, the path may start at the document root.

## Limits and privacy boundary

The toolkit enforces:

- 50 annotations per document
- 2,000 UTF-16 code units per human comment
- 20 child indexes per DOM path
- page geometry integers from 0 through 2,147,483,647
- 20,000 UTF-8 bytes for a complete successful envelope, leaving room for the
  outer Agent Browser JSON encoding under its 50,000-character output limit

The human comment is the only captured free text. The toolkit never reads or
returns page text, accessible names, titles, metadata, URLs, HTML, arbitrary
attributes, form values, cookies, or browser storage. It considers only
`data-testid`, `data-test`, `data-qa`, and `id`; invalid, secret-like, long, or
high-entropy values are omitted. Consumers must still treat comments as
untrusted task input.

## Artifact and lifecycle assumptions

The toolkit only returns data. The lifecycle integration owns authorization,
session locking, stable-tab selection, exact envelope validation, schema
validation, and atomic owner-only artifact writes. It must collect before any
managed navigation, reload, tab close, or session shutdown. The overlay is
document-scoped; manual navigation, reload, tab closure, or browser failure can
destroy uncollected comments.

Cross-origin iframe internals and canvas/WebGL content require region targets.
Same-page script can inspect or disrupt the injected host. Browser-free tests
cover only the pure core; pointer behavior, Shadow DOM isolation, scrolling,
and teardown require headed-Chrome acceptance checks on representative sites.
