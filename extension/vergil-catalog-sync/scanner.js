(function installVergilScanner() {
  "use strict";

  const helpers = globalThis.ColumbiaCatalogScanHelpers;
  if (!helpers) return;

  let running = false;
  let cancelled = false;

  function report(status, details = {}) {
    return chrome.runtime
      .sendMessage({ type: "SCAN_PROGRESS", status, ...details })
      .catch(() => undefined);
  }

  function waitFor(read, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let observer;
      let timer;

      function finish(value, error) {
        observer?.disconnect();
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      }

      async function check() {
        let value;
        try {
          value = await read();
        } catch (error) {
          finish(null, error);
          return;
        }
        if (value) {
          finish(value);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          finish(null, new Error("Vergil did not finish updating the results in time."));
        }
      }

      observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      timer = setTimeout(check, timeoutMs);
      check();
    });
  }

  function paginator() {
    return document.querySelector("mat-paginator");
  }

  function currentRange() {
    return helpers.parsePaginatorRange(paginator()?.textContent ?? "");
  }

  async function waitForBatchAfter(batchCount) {
    return waitFor(async () => {
      const state = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" });
      return Number(state?.batches ?? 0) > batchCount ? state : null;
    }).catch(() => null);
  }

  async function chooseHundredPerPage() {
    const select = await waitFor(() => document.querySelector('[aria-label="Items per page:"]'));
    if (/\b100\b/.test(select.textContent ?? "")) return;

    const before = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" });
    select.click();
    const option = await waitFor(() =>
      [...document.querySelectorAll('[role="option"], mat-option')].find(
        (candidate) => candidate.textContent?.trim() === "100",
      ),
    );
    option.click();
    await waitFor(() => {
      const range = currentRange();
      return range && (range.end >= 100 || range.end === range.total) ? range : null;
    });
    await waitForBatchAfter(Number(before?.batches ?? 0));
  }

  async function run(termValue) {
    const termCode = helpers.normalizeTermCode(termValue);
    const targetUrl = helpers.fullScanUrl(termCode);
    if (!termCode || !targetUrl || running) return;

    const here = new URL(location.href);
    if (
      here.origin !== "https://vergil.columbia.edu" ||
      here.pathname !== "/vergil/search" ||
      here.searchParams.get("term") !== termCode ||
      here.searchParams.get("hc") !== "true"
    ) {
      await report("opening", { termCode });
      location.assign(targetUrl);
      return;
    }

    running = true;
    cancelled = false;
    try {
      await report("preparing", { termCode });
      await waitFor(() => currentRange());
      await chooseHundredPerPage();

      while (!cancelled) {
        const range = currentRange();
        if (!range) throw new Error("Vergil's result count is unavailable.");
        const page = Math.ceil(range.end / 100);
        const pages = Math.ceil(range.total / 100);
        await report("scanning", {
          termCode,
          page,
          pages,
          scannedCourses: range.end,
          totalCourses: range.total,
        });

        if (range.end >= range.total) {
          await report("complete", {
            termCode,
            page,
            pages,
            scannedCourses: range.total,
            totalCourses: range.total,
          });
          return;
        }

        const next = document.querySelector('button[aria-label="Next page"]');
        if (!next || next.disabled || next.getAttribute("aria-disabled") === "true") {
          throw new Error("Vergil stopped before the final result page.");
        }
        const before = await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" });
        const previousEnd = range.end;
        next.click();
        await waitFor(() => {
          const updated = currentRange();
          return updated && updated.end > previousEnd ? updated : null;
        });
        await waitForBatchAfter(Number(before?.batches ?? 0));
      }

      await report("cancelled", { termCode });
    } catch (error) {
      await report("error", {
        termCode,
        error: error instanceof Error ? error.message.slice(0, 200) : "The refresh stopped unexpectedly.",
      });
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "START_FULL_SCAN") run(message.termCode);
    if (message?.type === "CANCEL_FULL_SCAN") cancelled = true;
  });

  const currentTerm = new URL(location.href).searchParams.get("term");
  chrome.runtime
    .sendMessage({ type: "SCAN_CONTENT_READY", termCode: currentTerm })
    .catch(() => undefined);
})();
