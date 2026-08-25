(function installVergilBridge() {
  "use strict";

  const CAPTURE_EVENT = "columbia-catalog:vergil-capture:v1";
  const BRIDGE_READY_EVENT = "columbia-catalog:vergil-bridge-ready:v1";
  const OBSERVER_READY_EVENT = "columbia-catalog:vergil-observer-ready:v1";
  const MAX_BATCH_SIZE = 500;
  const captureSchema = globalThis.LionPlanCaptureSchema;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function announceReady() {
    window.dispatchEvent(new CustomEvent(BRIDGE_READY_EVENT));
  }

  window.addEventListener(CAPTURE_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!isObject(detail) || detail.version !== 1 || !Array.isArray(detail.sections)) return;
    const sections = captureSchema?.normalizeSections(detail.sections, MAX_BATCH_SIZE);
    if (!sections) return;

    chrome.runtime.sendMessage({ type: "CAPTURE_SECTIONS", sections }).catch(() => {
      // The extension may have been reloaded while this tab remained open.
    });
  });

  window.addEventListener(OBSERVER_READY_EVENT, announceReady);
  announceReady();
})();
