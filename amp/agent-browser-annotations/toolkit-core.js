(() => {
  "use strict";

  const VERSION = "1";
  const SCHEMA = "amp-browser-annotations/v1";
  const TERMINATOR = "AMP_ANNOTATION_END_v1";
  const MAX_ANNOTATIONS = 50;
  const MAX_COMMENT_CODE_UNITS = 2000;
  const MAX_DOM_PATH = 20;
  const MAX_INTEGER = 2147483647;
  // Eval returns this string inside agent-browser's JSON response. Leave room
  // for JSON escaping under the managed 50,000-character output limit.
  const MAX_ENVELOPE_BYTES = 20000;
  const SAFE_ATTRIBUTE_NAMES = Object.freeze([
    "data-testid",
    "data-test",
    "data-qa",
    "id",
  ]);
  const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,64}$/;
  const SECRET_LIKE = /(?:auth|bearer|cookie|credential|csrf|jwt|nonce|otp|pass|secret|session|token)/i;
  const HIGH_ENTROPY = /^(?:[A-Fa-f0-9]{24,}|[A-Za-z0-9+/]{24,}={0,2})$/;
  const CORE_SYMBOL = Symbol.for("amp.browserAnnotations.core.v1");

  function utf8Bytes(value) {
    return new TextEncoder().encode(String(value)).byteLength;
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasExactKeys(value, required, optional = []) {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    const allowed = new Set([...required, ...optional]);
    return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
  }

  function boundedInteger(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(MAX_INTEGER, Math.max(0, Math.round(value)));
  }

  function pagePoint(clientX, clientY, scrollX, scrollY) {
    return {
      x: boundedInteger(Number(clientX) + Number(scrollX)),
      y: boundedInteger(Number(clientY) + Number(scrollY)),
    };
  }

  function rectangleFromPagePoints(first, second) {
    const left = Math.min(Number(first.x), Number(second.x));
    const top = Math.min(Number(first.y), Number(second.y));
    const right = Math.max(Number(first.x), Number(second.x));
    const bottom = Math.max(Number(first.y), Number(second.y));
    return {
      x: boundedInteger(left),
      y: boundedInteger(top),
      width: boundedInteger(right - left),
      height: boundedInteger(bottom - top),
    };
  }

  function geometryFromClientRect(rect, scrollX, scrollY) {
    const origin = pagePoint(rect.left, rect.top, scrollX, scrollY);
    return {
      x: origin.x,
      y: origin.y,
      width: boundedInteger(rect.width),
      height: boundedInteger(rect.height),
    };
  }

  function isSafeStructuralIdentifier(name, value) {
    return (
      SAFE_ATTRIBUTE_NAMES.includes(name) &&
      typeof value === "string" &&
      SAFE_IDENTIFIER.test(value) &&
      !SECRET_LIKE.test(name) &&
      !SECRET_LIKE.test(value) &&
      !HIGH_ENTROPY.test(value)
    );
  }

  function sanitizeDomPath(path) {
    if (!Array.isArray(path) || path.length > MAX_DOM_PATH) return null;
    const clean = path.map((index) => boundedInteger(index));
    return clean.every((index, position) => Number.isInteger(path[position]) && index === path[position])
      ? clean
      : null;
  }

  function buildAnchor({ tagName, attributes = {}, domPath = [] }) {
    const path = sanitizeDomPath(domPath);
    if (typeof tagName !== "string" || !/^[A-Za-z][A-Za-z0-9-]*$/.test(tagName) || path === null) {
      return null;
    }
    const anchor = { tag: tagName.toLowerCase(), domPath: path };
    for (const name of SAFE_ATTRIBUTE_NAMES) {
      const value = attributes[name];
      if (isSafeStructuralIdentifier(name, value)) {
        anchor[name === "data-testid" ? "testId" : name === "data-test" ? "test" : name === "data-qa" ? "qa" : "id"] = value;
        break;
      }
    }
    return anchor;
  }

  function buildNearestAnchor({ tagName, lineage }) {
    if (!Array.isArray(lineage) || lineage.length === 0) return null;
    const path = [];
    for (const level of lineage) {
      if (!isPlainObject(level) || !isPlainObject(level.attributes)) return null;
      const candidate = buildAnchor({ tagName, attributes: level.attributes, domPath: path });
      if (candidate && ["testId", "test", "qa", "id"].some((key) => Object.hasOwn(candidate, key))) {
        return candidate;
      }
      if (level.root === true) return candidate;
      if (!Number.isInteger(level.childIndex) || level.childIndex < 0) return null;
      path.unshift(level.childIndex);
      if (path.length > MAX_DOM_PATH) return null;
    }
    return null;
  }

  function validGeometry(value) {
    return (
      hasExactKeys(value, ["x", "y", "width", "height"]) &&
      [value.x, value.y, value.width, value.height].every(
        (part) => Number.isInteger(part) && part >= 0 && part <= MAX_INTEGER,
      )
    );
  }

  function validAnchor(value) {
    if (!hasExactKeys(value, ["tag", "domPath"], ["testId", "test", "qa", "id"])) return false;
    if (typeof value.tag !== "string" || !/^[a-z][a-z0-9-]*$/.test(value.tag)) return false;
    if (sanitizeDomPath(value.domPath) === null) return false;
    const identifiers = ["testId", "test", "qa", "id"].filter((key) => Object.hasOwn(value, key));
    if (identifiers.length > 1) return false;
    const sourceNames = { testId: "data-testid", test: "data-test", qa: "data-qa", id: "id" };
    return identifiers.every((key) => isSafeStructuralIdentifier(sourceNames[key], value[key]));
  }

  function validAnnotation(value) {
    if (!hasExactKeys(value, ["id", "kind", "comment", "geometry"], ["anchor"])) return false;
    if (!/^a[1-9][0-9]*$/.test(value.id)) return false;
    if (!['element', 'region'].includes(value.kind)) return false;
    if (typeof value.comment !== "string" || value.comment.length < 1 || value.comment.length > MAX_COMMENT_CODE_UNITS) return false;
    if (!validGeometry(value.geometry)) return false;
    return value.kind === "element" ? validAnchor(value.anchor) : !Object.hasOwn(value, "anchor");
  }

  function validDocument(value) {
    if (!hasExactKeys(value, ["schema", "toolkitVersion", "collectedAt", "viewport", "annotations"])) return false;
    if (value.schema !== SCHEMA || value.toolkitVersion !== VERSION) return false;
    if (typeof value.collectedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.collectedAt)) return false;
    if (!hasExactKeys(value.viewport, ["width", "height", "devicePixelRatio"])) return false;
    if (![value.viewport.width, value.viewport.height].every((part) => Number.isInteger(part) && part >= 0 && part <= MAX_INTEGER)) return false;
    if (typeof value.viewport.devicePixelRatio !== "number" || !Number.isFinite(value.viewport.devicePixelRatio) || value.viewport.devicePixelRatio <= 0) return false;
    return Array.isArray(value.annotations) && value.annotations.length <= MAX_ANNOTATIONS && value.annotations.every(validAnnotation);
  }

  function errorMessage(value) {
    const message = value instanceof Error ? value.message : String(value || "Annotation operation failed");
    return message.replace(/[\r\n\t]+/g, " ").slice(0, 160) || "Annotation operation failed";
  }

  function envelope(payload) {
    try {
      const value = { ok: true, complete: true, payload, terminator: TERMINATOR };
      const serialized = JSON.stringify(value);
      if (utf8Bytes(serialized) > MAX_ENVELOPE_BYTES) return errorEnvelope("limit_exceeded", "Annotation output exceeds 20000 bytes");
      return serialized;
    } catch (error) {
      return errorEnvelope("annotation_error", "Annotation output could not be serialized");
    }
  }

  function errorEnvelope(code, message) {
    try {
      return JSON.stringify({
        ok: false,
        complete: true,
        error: {
          code: typeof code === "string" && /^[a-z0-9_]{1,40}$/.test(code) ? code : "annotation_error",
          message: errorMessage(message),
        },
        terminator: TERMINATOR,
      });
    } catch (_) {
      return '{"ok":false,"complete":true,"error":{"code":"annotation_error","message":"Annotation operation failed"},"terminator":"AMP_ANNOTATION_END_v1"}';
    }
  }

  const api = Object.freeze({
    VERSION,
    SCHEMA,
    TERMINATOR,
    MAX_ANNOTATIONS,
    MAX_COMMENT_CODE_UNITS,
    MAX_DOM_PATH,
    MAX_INTEGER,
    MAX_ENVELOPE_BYTES,
    SAFE_ATTRIBUTE_NAMES,
    utf8Bytes,
    boundedInteger,
    pagePoint,
    rectangleFromPagePoints,
    geometryFromClientRect,
    isSafeStructuralIdentifier,
    sanitizeDomPath,
    buildAnchor,
    buildNearestAnchor,
    validGeometry,
    validAnchor,
    validAnnotation,
    validDocument,
    envelope,
    errorEnvelope,
    errorMessage,
  });

  if (!Object.hasOwn(globalThis, CORE_SYMBOL)) {
    Object.defineProperty(globalThis, CORE_SYMBOL, { value: api, configurable: true });
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
