(() => {
  "use strict";

  const CONTROLLER_SYMBOL = Symbol.for("amp.browserAnnotations.v1");
  const FAMILY_SYMBOL = Symbol.for("amp.browserAnnotations.controller");
  const CORE_SYMBOL = Symbol.for("amp.browserAnnotations.core.v1");
  const core = globalThis[CORE_SYMBOL];

  if (!core || Object.hasOwn(globalThis, CONTROLLER_SYMBOL)) return;

  const safeFailure = (code, message) => core.errorEnvelope(code, message);
  const current = globalThis[FAMILY_SYMBOL];
  if (current && current.version === core.VERSION) {
    Object.defineProperty(globalThis, CONTROLLER_SYMBOL, { value: current, configurable: true });
    return;
  }
  if (current) {
    const conflict = Object.freeze({
      version: core.VERSION,
      start: () => {
        const installed = globalThis[FAMILY_SYMBOL];
        if (installed && installed.version !== core.VERSION) {
          return safeFailure("version_conflict", "Another annotation toolkit version is installed");
        }
        delete globalThis[CONTROLLER_SYMBOL];
        const controller = installController();
        return controller.start();
      },
      collect: () => safeFailure("version_conflict", "Another annotation toolkit version is installed"),
      stop: () => safeFailure("version_conflict", "Another annotation toolkit version is installed"),
      status: () => safeFailure("version_conflict", "Another annotation toolkit version is installed"),
    });
    Object.defineProperty(globalThis, CONTROLLER_SYMBOL, { value: conflict, configurable: true });
    return;
  }

  function createController() {
    const listeners = new AbortController();
    const annotations = [];
    const elementTargets = new Map();
    let host = null;
    let shadow = null;
    let active = false;
    let mode = "element";
    let pinsVisible = true;
    let revision = 0;
    let collectedRevision = 0;
    let collectedIds = new Set();
    let nextId = 1;
    let hoverTarget = null;
    let pendingTarget = null;
    let dragStart = null;
    let dragPointerId = null;
    let previousFocus = null;

    const ui = {};

    function run(operation) {
      try {
        return operation();
      } catch (_) {
        return safeFailure("annotation_error", "Annotation operation failed");
      }
    }

    function uncollectedCount() {
      const addedCount = annotations.reduce(
        (count, annotation) => count + (collectedIds.has(annotation.id) ? 0 : 1),
        0,
      );
      return revision === collectedRevision ? 0 : Math.max(1, addedCount);
    }

    function statusPayload() {
      return {
        schema: core.SCHEMA,
        toolkitVersion: core.VERSION,
        state: active ? "active" : "inactive",
        mode,
        annotationCount: annotations.length,
        uncollectedCount: uncollectedCount(),
      };
    }

    function make(tagName, attributes = {}, text = "") {
      const element = document.createElement(tagName);
      for (const [name, value] of Object.entries(attributes)) {
        if (name === "class") element.className = value;
        else element.setAttribute(name, value);
      }
      if (text) element.textContent = text;
      return element;
    }

    function installOverlay() {
      if (host?.isConnected) return;
      if (!document.documentElement) throw new Error("Document root is unavailable");

      host = document.createElement("div");
      host.style.setProperty("all", "initial", "important");
      host.style.setProperty("display", "block", "important");
      host.style.setProperty("position", "static", "important");
      shadow = host.attachShadow({ mode: "closed" });
      const style = make("style");
      style.textContent = `
        :host { all: initial; color-scheme: light dark; }
        *, *::before, *::after { box-sizing: border-box; }
        .layer { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;
          font: 500 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #f8fafc; direction: ltr; text-align: left; }
        .toolbar, .review, .composer { pointer-events: auto; background: #111827; color: #f8fafc;
          border: 1px solid #94a3b8; border-radius: 10px; box-shadow: 0 8px 30px #0008; }
        .toolbar { position: fixed; top: 12px; left: 12px; display: flex; flex-wrap: wrap;
          align-items: center; gap: 6px; max-width: min(680px, calc(100vw - 24px)); padding: 8px; }
        button { all: unset; box-sizing: border-box; cursor: pointer; padding: 7px 10px; border-radius: 6px;
          border: 1px solid #64748b; background: #1e293b; color: #f8fafc; }
        button:hover { background: #334155; }
        button:focus-visible, textarea:focus-visible { outline: 3px solid #facc15; outline-offset: 2px; }
        button[aria-pressed="true"] { background: #075985; border-color: #7dd3fc; }
        button:disabled { cursor: not-allowed; opacity: .55; }
        .status { padding-inline: 4px; }
        .warning { color: #fde68a; font-weight: 700; }
        .outline, .draft { position: fixed; border: 3px solid #facc15; background: #facc1522;
          border-radius: 3px; pointer-events: none; }
        .draft { border-color: #38bdf8; background: #38bdf822; }
        .region-surface { position: fixed; inset: 0; pointer-events: none; touch-action: none; cursor: crosshair; }
        .region-surface.enabled { pointer-events: auto; }
        .pins { position: fixed; inset: 0; pointer-events: none; }
        .pin { position: fixed; display: grid; place-items: center; width: 28px; height: 28px;
          border-radius: 50%; background: #dc2626; color: white; border: 2px solid white; font-weight: 800;
          box-shadow: 0 2px 8px #0009; transform: translate(-50%, -50%); }
        .review { position: fixed; right: 12px; top: 12px; width: min(360px, calc(100vw - 24px));
          max-height: calc(100vh - 24px); overflow: auto; padding: 10px; }
        .review h2 { all: unset; display: block; font: 700 16px/1.3 system-ui, sans-serif; margin-bottom: 8px; }
        .review ol { margin: 0; padding-left: 26px; }
        .review li { margin: 0 0 10px; overflow-wrap: anywhere; }
        .review li button { margin-top: 4px; display: block; font-size: 12px; }
        .empty { color: #cbd5e1; }
        .composer { position: fixed; width: min(360px, calc(100vw - 24px)); padding: 12px; }
        .composer label { display: block; margin-bottom: 6px; font-weight: 700; }
        textarea { display: block; width: 100%; min-height: 100px; resize: vertical; padding: 8px;
          border-radius: 6px; border: 1px solid #94a3b8; background: #fff; color: #111827;
          font: 400 14px/1.4 system-ui, sans-serif; }
        .composer-actions { display: flex; gap: 6px; margin-top: 8px; }
        .message { min-height: 1.35em; margin-top: 6px; color: #fde68a; }
        [hidden] { display: none !important; }
        @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
      `;

      ui.layer = make("div", { class: "layer" });
      ui.toolbar = make("nav", { class: "toolbar", "aria-label": "Visual annotation controls" });
      ui.elementButton = make("button", { type: "button", "aria-pressed": "true" }, "Element");
      ui.regionButton = make("button", { type: "button", "aria-pressed": "false" }, "Region");
      ui.pinsButton = make("button", { type: "button", "aria-pressed": "true" }, "Hide pins");
      ui.pauseButton = make("button", { type: "button" }, "Pause");
      ui.status = make("span", { class: "status", "aria-live": "polite" });
      ui.toolbar.append(ui.elementButton, ui.regionButton, ui.pinsButton, ui.pauseButton, ui.status);

      ui.outline = make("div", { class: "outline", hidden: "" });
      ui.draft = make("div", { class: "draft", hidden: "" });
      ui.regionSurface = make("div", { class: "region-surface", "aria-hidden": "true" });
      ui.pins = make("div", { class: "pins", "aria-hidden": "true" });

      ui.review = make("aside", { class: "review", "aria-label": "Saved annotations" });
      ui.reviewHeading = make("h2", {}, "Saved annotations");
      ui.reviewList = make("ol");
      ui.review.append(ui.reviewHeading, ui.reviewList);

      ui.composer = make("form", { class: "composer", hidden: "" });
      const label = make("label", { for: "amp-annotation-comment" }, "Comment");
      ui.comment = make("textarea", {
        id: "amp-annotation-comment",
        maxlength: String(core.MAX_COMMENT_CODE_UNITS),
        required: "",
      });
      const actions = make("div", { class: "composer-actions" });
      ui.saveButton = make("button", { type: "submit" }, "Save comment");
      ui.cancelButton = make("button", { type: "button" }, "Cancel");
      ui.message = make("div", { class: "message", "aria-live": "polite" });
      actions.append(ui.saveButton, ui.cancelButton);
      ui.composer.append(label, ui.comment, actions, ui.message);

      ui.layer.append(ui.outline, ui.draft, ui.regionSurface, ui.pins, ui.toolbar, ui.review, ui.composer);
      shadow.append(style, ui.layer);
      document.documentElement.append(host);
      bindListeners();
      render();
    }

    function on(element, type, handler, options = {}) {
      element.addEventListener(type, handler, { ...options, signal: listeners.signal });
    }

    function bindListeners() {
      on(ui.elementButton, "click", () => setMode("element"));
      on(ui.regionButton, "click", () => setMode("region"));
      on(ui.pinsButton, "click", () => {
        pinsVisible = !pinsVisible;
        render();
      });
      on(ui.pauseButton, "click", () => (active ? pause() : activate()));
      on(ui.cancelButton, "click", cancelComposer);
      on(ui.saveButton, "pointerup", saveComment);
      on(ui.composer, "submit", saveComment);
      on(ui.reviewList, "click", (event) => {
        const button = event.target.closest("button[data-annotation-id]");
        if (button) discard(button.dataset.annotationId);
      });
      on(ui.regionSurface, "pointerdown", beginRegion);
      on(ui.regionSurface, "pointermove", moveRegion);
      on(ui.regionSurface, "pointerup", endRegion);
      on(ui.regionSurface, "pointercancel", cancelRegion);
      on(document, "pointermove", hoverElement, { capture: true });
      on(document, "pointerdown", beginElement, { capture: true });
      on(document, "pointerup", endElement, { capture: true });
      on(document, "keydown", handleKey, { capture: true });
      on(document, "scroll", refreshGeometry, { capture: true, passive: true });
      on(window, "scroll", refreshGeometry, { capture: true, passive: true });
      on(window, "resize", refreshGeometry, { passive: true });
      on(window, "beforeunload", warnBeforeUnload, { capture: true });
    }

    function isOwnEvent(event) {
      return event.target === host || event.composedPath().includes(host);
    }

    function blockPageEvent(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function setMode(nextMode) {
      if (!active || pendingTarget) return;
      mode = nextMode;
      hoverTarget = null;
      ui.outline.hidden = true;
      render();
    }

    function activate() {
      installOverlay();
      const wasActive = active;
      if (!wasActive && document.activeElement !== host) previousFocus = document.activeElement;
      active = true;
      render();
      if (!wasActive) ui.elementButton.focus();
      return core.envelope(statusPayload());
    }

    function pause() {
      active = false;
      cancelComposer();
      cancelRegion();
      hoverTarget = null;
      ui.outline.hidden = true;
      render();
      if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus();
      previousFocus = null;
      return core.envelope(statusPayload());
    }

    function hoverElement(event) {
      if (!active || mode !== "element" || pendingTarget || isOwnEvent(event)) return;
      const target = event.target;
      if (!(target instanceof Element) || target === document.documentElement || target === document.body) {
        hoverTarget = null;
        ui.outline.hidden = true;
        return;
      }
      hoverTarget = target;
      showClientRect(ui.outline, target.getBoundingClientRect());
    }

    function beginElement(event) {
      if (!active || mode !== "element" || pendingTarget || isOwnEvent(event) || event.button !== 0) return;
      if (!(event.target instanceof Element)) return;
      hoverTarget = event.target;
      blockPageEvent(event);
    }

    function endElement(event) {
      if (!active || mode !== "element" || pendingTarget || isOwnEvent(event) || event.button !== 0) return;
      blockPageEvent(event);
      if (hoverTarget && hoverTarget.isConnected) openComposer({ kind: "element", element: hoverTarget });
    }

    function beginRegion(event) {
      if (!active || mode !== "region" || pendingTarget || event.button !== 0) return;
      blockPageEvent(event);
      dragPointerId = event.pointerId;
      ui.regionSurface.setPointerCapture(event.pointerId);
      dragStart = core.pagePoint(event.clientX, event.clientY, scrollX, scrollY);
      showPageGeometry(ui.draft, { ...dragStart, width: 0, height: 0 });
    }

    function moveRegion(event) {
      if (event.pointerId !== dragPointerId || !dragStart) return;
      blockPageEvent(event);
      const end = core.pagePoint(event.clientX, event.clientY, scrollX, scrollY);
      showPageGeometry(ui.draft, core.rectangleFromPagePoints(dragStart, end));
    }

    function endRegion(event) {
      if (event.pointerId !== dragPointerId || !dragStart) return;
      blockPageEvent(event);
      const geometry = core.rectangleFromPagePoints(
        dragStart,
        core.pagePoint(event.clientX, event.clientY, scrollX, scrollY),
      );
      cancelRegion();
      if (geometry.width >= 4 && geometry.height >= 4) openComposer({ kind: "region", geometry });
    }

    function cancelRegion() {
      if (dragPointerId !== null && ui.regionSurface?.hasPointerCapture(dragPointerId)) {
        ui.regionSurface.releasePointerCapture(dragPointerId);
      }
      dragPointerId = null;
      dragStart = null;
      if (ui.draft) ui.draft.hidden = true;
    }

    function openComposer(target) {
      pendingTarget = target;
      ui.comment.value = "";
      ui.message.textContent = "";
      ui.composer.hidden = false;
      positionComposer(target);
      ui.comment.focus();
      render();
    }

    function cancelComposer() {
      pendingTarget = null;
      if (ui.composer) ui.composer.hidden = true;
      if (ui.comment) ui.comment.value = "";
      render();
    }

    function positionComposer(target) {
      const geometry = target.kind === "element"
        ? core.geometryFromClientRect(target.element.getBoundingClientRect(), scrollX, scrollY)
        : target.geometry;
      const viewportX = geometry.x - scrollX;
      const viewportY = geometry.y - scrollY;
      const panelWidth = Math.min(360, innerWidth - 24);
      const panelHeight = 190;
      let left = viewportX + geometry.width + 12;
      if (left + panelWidth > innerWidth - 12) left = Math.max(12, viewportX - panelWidth - 12);
      let top = viewportY;
      if (top + panelHeight > innerHeight - 12) top = Math.max(12, innerHeight - panelHeight - 12);
      ui.composer.style.left = `${Math.max(12, left)}px`;
      ui.composer.style.top = `${Math.max(12, top)}px`;
    }

    function safeAnchor(element) {
      const lineage = [];
      let cursor = element;
      while (cursor) {
        const attributes = {};
        for (const name of core.SAFE_ATTRIBUTE_NAMES) {
          if (cursor.hasAttribute(name)) attributes[name] = cursor.getAttribute(name);
        }
        if (cursor === document.documentElement) {
          lineage.push({ attributes, childIndex: null, root: true });
          break;
        }
        const parent = cursor.parentElement;
        if (!parent) return null;
        lineage.push({
          attributes,
          childIndex: Array.prototype.indexOf.call(parent.children, cursor),
          root: false,
        });
        cursor = parent;
      }
      return core.buildNearestAnchor({ tagName: element.localName, lineage });
    }

    function prospectiveDocument(candidate) {
      return {
        schema: core.SCHEMA,
        toolkitVersion: core.VERSION,
        collectedAt: new Date().toISOString(),
        viewport: {
          width: core.boundedInteger(innerWidth),
          height: core.boundedInteger(innerHeight),
          devicePixelRatio: Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1,
        },
        annotations: candidate,
      };
    }

    function saveComment(event) {
      event.preventDefault();
      if (!pendingTarget) return;
      const comment = ui.comment.value.trim();
      if (!comment) {
        ui.message.textContent = "Enter a comment.";
        return;
      }
      if (comment.length > core.MAX_COMMENT_CODE_UNITS) {
        ui.message.textContent = "Comments are limited to 2000 characters.";
        return;
      }
      if (annotations.length >= core.MAX_ANNOTATIONS) {
        ui.message.textContent = "This document already has 50 annotations.";
        return;
      }

      const target = pendingTarget;
      const annotation = {
        id: `a${nextId}`,
        kind: target.kind,
        comment,
        geometry: target.kind === "element"
          ? core.geometryFromClientRect(target.element.getBoundingClientRect(), scrollX, scrollY)
          : target.geometry,
      };
      if (target.kind === "element") {
        annotation.anchor = safeAnchor(target.element);
        if (!annotation.anchor) {
          ui.message.textContent = "This element is too deeply nested to anchor safely. Use region mode.";
          return;
        }
      }
      const candidate = [...annotations, annotation];
      if (!core.validDocument(prospectiveDocument(candidate))) {
        ui.message.textContent = "The annotation could not be represented safely.";
        return;
      }
      const serialized = core.envelope(prospectiveDocument(candidate));
      if (!JSON.parse(serialized).ok) {
        ui.message.textContent = "This comment would exceed the collection size limit.";
        return;
      }

      annotations.push(annotation);
      if (target.kind === "element") elementTargets.set(annotation.id, target.element);
      nextId += 1;
      revision += 1;
      cancelComposer();
      render();
    }

    function discard(id) {
      const index = annotations.findIndex((annotation) => annotation.id === id);
      if (index < 0) return;
      annotations.splice(index, 1);
      elementTargets.delete(id);
      revision += 1;
      render();
    }

    function refreshElementGeometries() {
      for (const annotation of annotations) {
        const element = elementTargets.get(annotation.id);
        if (element?.isConnected) {
          annotation.geometry = core.geometryFromClientRect(element.getBoundingClientRect(), scrollX, scrollY);
        }
      }
    }

    function refreshGeometry() {
      refreshElementGeometries();
      if (hoverTarget?.isConnected && active && mode === "element" && !pendingTarget) {
        showClientRect(ui.outline, hoverTarget.getBoundingClientRect());
      }
      if (pendingTarget) positionComposer(pendingTarget);
      renderPins();
    }

    function showClientRect(element, rect) {
      element.hidden = false;
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
      element.style.width = `${Math.max(0, rect.width)}px`;
      element.style.height = `${Math.max(0, rect.height)}px`;
    }

    function showPageGeometry(element, geometry) {
      showClientRect(element, {
        left: geometry.x - scrollX,
        top: geometry.y - scrollY,
        width: geometry.width,
        height: geometry.height,
      });
    }

    function renderPins() {
      ui.pins.replaceChildren();
      ui.pins.hidden = !pinsVisible;
      if (!pinsVisible) return;
      annotations.forEach((annotation, index) => {
        const pin = make("span", { class: "pin" }, String(index + 1));
        pin.style.left = `${annotation.geometry.x - scrollX}px`;
        pin.style.top = `${annotation.geometry.y - scrollY}px`;
        ui.pins.append(pin);
      });
    }

    function renderReview() {
      ui.reviewList.replaceChildren();
      if (annotations.length === 0) {
        ui.reviewList.append(make("li", { class: "empty" }, "No comments yet"));
        return;
      }
      annotations.forEach((annotation, index) => {
        const item = make("li");
        const comment = make("span", {}, `${index + 1}. ${annotation.comment}`);
        const button = make("button", {
          type: "button",
          "data-annotation-id": annotation.id,
        }, "Discard this comment");
        item.append(comment, button);
        ui.reviewList.append(item);
      });
    }

    function render() {
      if (!host?.isConnected) return;
      ui.elementButton.setAttribute("aria-pressed", String(mode === "element"));
      ui.regionButton.setAttribute("aria-pressed", String(mode === "region"));
      ui.pinsButton.setAttribute("aria-pressed", String(pinsVisible));
      ui.pinsButton.textContent = pinsVisible ? "Hide pins" : "Show pins";
      ui.pauseButton.textContent = active ? "Pause" : "Resume";
      ui.elementButton.disabled = !active || Boolean(pendingTarget);
      ui.regionButton.disabled = !active || Boolean(pendingTarget);
      ui.regionSurface.classList.toggle("enabled", active && mode === "region" && !pendingTarget);
      const pending = uncollectedCount() > 0;
      ui.status.className = pending ? "status warning" : "status";
      ui.status.textContent = `${active ? "Active" : "Paused"} · ${annotations.length} comment${annotations.length === 1 ? "" : "s"}${pending ? " · not collected" : ""}`;
      renderPins();
      renderReview();
    }

    function handleKey(event) {
      if (!host?.isConnected) return;
      if (isOwnEvent(event)) {
        if (event.key === "Tab" && active) {
          const focusable = [...shadow.querySelectorAll("button:not(:disabled), textarea")]
            .filter((element) => !element.closest("[hidden]"));
          const currentIndex = focusable.indexOf(shadow.activeElement);
          const leavingEnd = !event.shiftKey && currentIndex === focusable.length - 1;
          const leavingStart = event.shiftKey && currentIndex <= 0;
          if (focusable.length > 0 && (leavingEnd || leavingStart)) {
            event.preventDefault();
            focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
          }
        }
        if (event.key === "Escape" && pendingTarget) {
          event.preventDefault();
          cancelComposer();
        }
        return;
      }
      if (!active) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        if (pendingTarget) cancelComposer();
        else pause();
      }
    }

    function warnBeforeUnload(event) {
      if (uncollectedCount() === 0) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function collect() {
      return run(() => {
        refreshElementGeometries();
        const document = prospectiveDocument(annotations.map((annotation) => structuredClone(annotation)));
        if (!core.validDocument(document)) return safeFailure("invalid_annotations", "Annotations failed validation");
        return core.envelope({ revision, document });
      });
    }

    function acknowledge(options = {}) {
      return run(() => {
        if (!Number.isInteger(options?.revision) || options.revision < 0) {
          return safeFailure("invalid_revision", "Collected revision is invalid");
        }
        if (options.revision !== revision) {
          return safeFailure("revision_changed", "Annotations changed before collection was saved");
        }
        collectedRevision = revision;
        collectedIds = new Set(annotations.map((annotation) => annotation.id));
        render();
        return core.envelope(statusPayload());
      });
    }

    function stop(options = {}) {
      return run(() => {
        const discardUncollected = options?.discardUncollected === true;
        const pendingCount = uncollectedCount();
        if (pendingCount > 0 && !discardUncollected) {
          return safeFailure("uncollected_comments", `${pendingCount} comment${pendingCount === 1 ? " is" : "s are"} not collected`);
        }
        const discardedCount = discardUncollected ? pendingCount : 0;
        active = false;
        listeners.abort();
        host?.remove();
        host = null;
        delete globalThis[CONTROLLER_SYMBOL];
        delete globalThis[FAMILY_SYMBOL];
        return core.envelope({ stopped: true, discardedCount });
      });
    }

    return Object.freeze({
      version: core.VERSION,
      start: () => run(activate),
      collect,
      acknowledge,
      stop,
      status: () => run(() => core.envelope(statusPayload())),
    });
  }

  function installController() {
    const controller = createController();
    Object.defineProperty(globalThis, CONTROLLER_SYMBOL, { value: controller, configurable: true });
    Object.defineProperty(globalThis, FAMILY_SYMBOL, { value: controller, configurable: true });
    return controller;
  }

  installController();
})();
