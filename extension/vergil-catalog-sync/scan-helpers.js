(function installScanHelpers(root) {
  "use strict";

  const TERM_CODE = /^\d{5}$/;

  function normalizeTermCode(value) {
    const termCode = typeof value === "string" ? value.trim() : "";
    return TERM_CODE.test(termCode) ? termCode : null;
  }

  function fullScanUrl(value) {
    const termCode = normalizeTermCode(value);
    if (!termCode) return null;
    const url = new URL("https://vergil.columbia.edu/vergil/search");
    url.searchParams.set("hc", "true");
    url.searchParams.set("term", termCode);
    return url.href;
  }

  function parsePaginatorRange(value) {
    if (typeof value !== "string") return null;
    const match = /(\d[\d,]*)\s*[–-]\s*(\d[\d,]*)\s+of\s+(\d[\d,]*)/i.exec(value);
    if (!match) return null;
    const numbers = match.slice(1).map((part) => Number(part.replace(/,/g, "")));
    const [start, end, total] = numbers;
    if (!numbers.every(Number.isInteger) || start < 1 || end < start || total < end) return null;
    return { start, end, total };
  }

  root.LionPlanScanHelpers = Object.freeze({
    fullScanUrl,
    normalizeTermCode,
    parsePaginatorRange,
  });
})(globalThis);
