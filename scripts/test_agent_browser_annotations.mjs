import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const core = require("../amp/agent-browser-annotations/toolkit-core.js");
const toolkitSource = readFileSync(new URL("../amp/agent-browser-annotations/toolkit.js", import.meta.url), "utf8");

function geometry(overrides = {}) {
  return { x: 10, y: 20, width: 30, height: 40, ...overrides };
}

function documentWith(annotations = []) {
  return {
    schema: core.SCHEMA,
    toolkitVersion: core.VERSION,
    collectedAt: "2026-09-22T00:00:00.000Z",
    viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
    annotations,
  };
}

function region(overrides = {}) {
  return {
    id: "a1",
    kind: "region",
    comment: "Move this control",
    geometry: geometry(),
    ...overrides,
  };
}

test("viewport points become page coordinates exactly once", () => {
  const start = core.pagePoint(10, 20, 100, 200);
  const end = core.pagePoint(60, 80, 100, 200);
  assert.deepEqual(start, { x: 110, y: 220 });
  assert.deepEqual(core.rectangleFromPagePoints(start, end), {
    x: 110,
    y: 220,
    width: 50,
    height: 60,
  });
  assert.deepEqual(core.rectangleFromPagePoints(end, start), {
    x: 110,
    y: 220,
    width: 50,
    height: 60,
  });
});

test("client rectangles add scroll and clamp geometry", () => {
  assert.deepEqual(
    core.geometryFromClientRect({ left: 5.4, top: 9.6, width: 20.2, height: 30.8 }, 100, 200),
    { x: 105, y: 210, width: 20, height: 31 },
  );
  assert.deepEqual(core.pagePoint(-50, -20, 0, 0), { x: 0, y: 0 });
  assert.equal(core.boundedInteger(Number.MAX_SAFE_INTEGER), core.MAX_INTEGER);
});

test("anchors retain only one allowlisted structural identifier", () => {
  const anchor = core.buildAnchor({
    tagName: "DIV",
    attributes: {
      "data-testid": "chart-tooltip",
      "data-test": "ignored-second-value",
      class: "private page class",
      value: "input value",
      href: "https://example.test/private?token=x",
      title: "page title",
      textContent: "page text",
    },
    domPath: [3, 1, 4],
  });
  assert.deepEqual(anchor, { tag: "div", testId: "chart-tooltip", domPath: [3, 1, 4] });
  assert.doesNotMatch(JSON.stringify(anchor), /private|https|page text|input value/);
});

test("anchors omit secret-like and high-entropy identifiers", () => {
  assert.equal(core.isSafeStructuralIdentifier("data-testid", "session-token"), false);
  assert.equal(core.isSafeStructuralIdentifier("id", "0123456789abcdef01234567"), false);
  assert.equal(core.isSafeStructuralIdentifier("data-qa", "YWJjZGVmZ2hpamtsbW5vcHFyc3R1"), false);
  assert.deepEqual(
    core.buildAnchor({
      tagName: "button",
      attributes: { id: "0123456789abcdef01234567", "aria-label": "Do not capture" },
      domPath: [0],
    }),
    { tag: "button", domPath: [0] },
  );
});

test("anchors reject invalid tags and paths over the limit", () => {
  assert.equal(core.buildAnchor({ tagName: "div", domPath: Array(21).fill(0) }), null);
  assert.equal(core.buildAnchor({ tagName: "not valid", domPath: [] }), null);
  assert.equal(core.buildAnchor({ tagName: "div", domPath: [0, -1] }), null);
  assert.equal(core.buildAnchor({ tagName: "div", domPath: [0, 1.5] }), null);
});

test("deep targets anchor to the nearest stable ancestor", () => {
  const lineage = Array.from({ length: 30 }, (_, index) => ({
    attributes: index === 5 ? { "data-testid": "dashboard-card" } : {},
    childIndex: index,
    root: false,
  }));
  lineage.push({ attributes: {}, childIndex: null, root: true });
  assert.deepEqual(core.buildNearestAnchor({ tagName: "span", lineage }), {
    tag: "span",
    testId: "dashboard-card",
    domPath: [4, 3, 2, 1, 0],
  });
  assert.equal(
    core.buildNearestAnchor({
      tagName: "span",
      lineage: Array.from({ length: 22 }, (_, childIndex) => ({
        attributes: {},
        childIndex,
        root: false,
      })),
    }),
    null,
  );
});

test("nested document scrolling refreshes element geometry", () => {
  assert.match(
    toolkitSource,
    /on\(document, "scroll", refreshGeometry, \{ capture: true, passive: true \}\)/,
  );
});

test("closed shadow events are recognized after host retargeting", () => {
  assert.match(toolkitSource, /event\.target === host/);
});

test("save button commits before page handlers can suppress click", () => {
  assert.match(toolkitSource, /on\(ui\.saveButton, "pointerup", saveComment\)/);
});

test("documents distinguish element and region targets", () => {
  const element = {
    id: "a1",
    kind: "element",
    comment: "Tooltip overlaps this point",
    geometry: geometry(),
    anchor: { tag: "div", testId: "chart-tooltip", domPath: [3, 1, 4] },
  };
  assert.equal(core.validDocument(documentWith([element])), true);
  assert.equal(core.validDocument(documentWith([region()])), true);
  assert.equal(core.validDocument(documentWith([{ ...region(), anchor: element.anchor }])), false);
  const { anchor: _anchor, ...withoutAnchor } = element;
  assert.equal(core.validDocument(documentWith([withoutAnchor])), false);
});

test("validation rejects extra metadata, URLs, and arbitrary fields", () => {
  assert.equal(core.validDocument({ ...documentWith(), url: "https://example.test" }), false);
  assert.equal(core.validDocument({ ...documentWith(), title: "Private title" }), false);
  assert.equal(core.validDocument(documentWith([{ ...region(), html: "<input value=secret>" }])), false);
  assert.equal(core.validDocument(documentWith([{ ...region(), geometry: { ...geometry(), scrollX: 100 } }])), false);
});

test("validation enforces annotation, comment, path, and integer limits", () => {
  assert.equal(core.validDocument(documentWith(Array.from({ length: 51 }, (_, index) => region({ id: `a${index + 1}` })))), false);
  assert.equal(core.validDocument(documentWith([region({ comment: "x".repeat(2001) })])), false);
  assert.equal(core.validDocument(documentWith([region({ geometry: geometry({ x: -1 }) })])), false);
  assert.equal(core.validDocument(documentWith([region({ geometry: geometry({ width: core.MAX_INTEGER + 1 }) })])), false);
  assert.equal(
    core.validDocument(documentWith([{
      id: "a1",
      kind: "element",
      comment: "Deep target",
      geometry: geometry(),
      anchor: { tag: "div", domPath: Array(21).fill(0) },
    }])),
    false,
  );
});

test("success and error envelopes are complete and terminated", () => {
  const success = JSON.parse(core.envelope({ state: "active" }));
  assert.deepEqual(success, {
    ok: true,
    complete: true,
    payload: { state: "active" },
    terminator: core.TERMINATOR,
  });
  const failure = JSON.parse(core.errorEnvelope("uncollected_comments", "Collect first\nunsafe detail"));
  assert.equal(failure.ok, false);
  assert.equal(failure.complete, true);
  assert.equal(failure.error.code, "uncollected_comments");
  assert.equal(failure.error.message, "Collect first unsafe detail");
  assert.equal(failure.terminator, core.TERMINATOR);
});

test("collection envelope can carry a revision and validated document", () => {
  const document = documentWith([region()]);
  const framed = JSON.parse(core.envelope({ revision: 3, document }));
  assert.equal(framed.ok, true);
  assert.equal(framed.payload.revision, 3);
  assert.equal(core.validDocument(framed.payload.document), true);
});

test("envelopes never throw and refuse the UTF-8 byte limit", () => {
  const circular = {};
  circular.self = circular;
  assert.doesNotThrow(() => core.envelope(circular));
  assert.equal(JSON.parse(core.envelope(circular)).ok, false);

  const oversized = documentWith(
    Array.from({ length: 50 }, (_, index) => region({ id: `a${index + 1}`, comment: "é".repeat(2000) })),
  );
  assert.equal(core.validDocument(oversized), true);
  const result = JSON.parse(core.envelope(oversized));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "limit_exceeded");
  assert.ok(core.utf8Bytes(core.envelope(oversized)) < core.MAX_ENVELOPE_BYTES);
});

test("core API is installed on a non-enumerable versioned symbol", () => {
  const symbol = Symbol.for("amp.browserAnnotations.core.v1");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, symbol);
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.value.VERSION, "1");
});
