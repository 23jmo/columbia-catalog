(function installVergilObserver() {
  "use strict";

  const installerKey = Symbol.for("columbia-catalog.vergil-observer.v1");
  if (globalThis[installerKey]) return;
  globalThis[installerKey] = true;

  const sanitizer = globalThis.LionPlanVergilSanitizer;
  if (!sanitizer) return;

  const CAPTURE_EVENT = "columbia-catalog:vergil-capture:v1";
  const BRIDGE_READY_EVENT = "columbia-catalog:vergil-bridge-ready:v1";
  const OBSERVER_READY_EVENT = "columbia-catalog:vergil-observer-ready:v1";
  const TARGET_HOST = "prod2-sas-studentrecords.api.columbia.edu";
  const TARGET_PATH = "/v1/course_and_class_search";
  const MAX_QUEUED_BATCHES = 25;
  const pending = [];
  let bridgeReady = false;

  function targetRequest(input, methodOverride) {
    try {
      const requestUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const requestMethod =
        methodOverride ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
      const url = new URL(requestUrl, location.href);
      const method = String(requestMethod).toUpperCase();
      return method === "GET" && url.hostname === TARGET_HOST && url.pathname === TARGET_PATH;
    } catch {
      return false;
    }
  }

  function emit(sections) {
    if (!Array.isArray(sections) || sections.length === 0) return;
    const detail = { version: 1, sections };
    if (!bridgeReady) {
      pending.push(detail);
      if (pending.length > MAX_QUEUED_BATCHES) pending.shift();
      return;
    }
    window.dispatchEvent(new CustomEvent(CAPTURE_EVENT, { detail }));
  }

  function consumePayload(payload) {
    const capturedAt = new Date().toISOString();
    emit(sanitizer.sanitizeCourseSearchResponse(payload, capturedAt));
  }

  function flush() {
    bridgeReady = true;
    for (const detail of pending.splice(0)) {
      window.dispatchEvent(new CustomEvent(CAPTURE_EVENT, { detail }));
    }
  }

  window.addEventListener(BRIDGE_READY_EVENT, flush);

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch === "function") {
    globalThis.fetch = function observedFetch(input, init) {
      const responsePromise = originalFetch.apply(this, arguments);
      if (targetRequest(input, init?.method)) {
        responsePromise
          .then((response) => {
            if (!response.ok) return;
            return response.clone().json().then(consumePayload).catch(() => undefined);
          })
          .catch(() => undefined);
      }
      return responsePromise;
    };
  }

  const xhrMeta = new WeakMap();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function observedOpen(method, url) {
    xhrMeta.set(this, { method: String(method), url: String(url) });
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function observedSend() {
    const meta = xhrMeta.get(this);
    if (meta && targetRequest(meta.url, meta.method)) {
      this.addEventListener(
        "load",
        () => {
          if (this.status < 200 || this.status >= 300) return;
          try {
            const payload = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
            consumePayload(payload);
          } catch {
            // A malformed or non-JSON response is irrelevant to the observer.
          }
        },
        { once: true },
      );
    }
    return originalSend.apply(this, arguments);
  };

  window.dispatchEvent(new CustomEvent(OBSERVER_READY_EVENT));
})();
