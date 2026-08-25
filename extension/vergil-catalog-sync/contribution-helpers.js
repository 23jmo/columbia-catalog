(function installContributionHelpers(root) {
  "use strict";

  const SOURCE = "Vergil course search via Columbia Catalog Chrome extension";
  const TERM_CODE = /^\d{5}$/;
  const captureSchema = root.ColumbiaCatalogCaptureSchema;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isPublishedLocation(value) {
    return typeof value === "string" && value.trim() !== "" && value !== "To be announced";
  }

  function completedScan(state) {
    const scan = isObject(state?.scan) ? state.scan : null;
    if (!scan || scan.status !== "complete" || !TERM_CODE.test(scan.termCode)) return null;
    if (!Number.isInteger(scan.page) || !Number.isInteger(scan.pages) || scan.page !== scan.pages) {
      return null;
    }
    if (
      !Number.isInteger(scan.scannedCourses) ||
      !Number.isInteger(scan.totalCourses) ||
      scan.scannedCourses !== scan.totalCourses ||
      scan.totalCourses <= 0
    ) {
      return null;
    }
    if (typeof scan.completedAt !== "string" || Number.isNaN(Date.parse(scan.completedAt))) return null;
    if (scan.error !== null) return null;
    return scan;
  }

  function normalizedScanSections(state, scan) {
    if (!isObject(state?.sections) || !captureSchema) return null;
    const sections = [];
    for (const value of Object.values(state.sections)) {
      if (value?.termCode !== scan.termCode) continue;
      const section = captureSchema.normalizeSection(value);
      if (!section) return null;
      sections.push(section);
    }
    return sections.sort((a, b) => a.sectionKey.localeCompare(b.sectionKey));
  }

  function contributionSummary(state) {
    const scan = completedScan(state);
    if (!scan) {
      return {
        ready: false,
        reason: "Run a complete full-term refresh before contributing.",
        termCode: null,
        sections: 0,
        meetings: 0,
        locations: 0,
        observedFrom: null,
        observedTo: null,
      };
    }

    const sections = normalizedScanSections(state, scan);
    if (!sections || sections.length === 0) {
      return {
        ready: false,
        reason: "The completed refresh has no valid sections to contribute.",
        termCode: scan.termCode,
        sections: 0,
        meetings: 0,
        locations: 0,
        observedFrom: null,
        observedTo: null,
      };
    }

    if (!Number.isInteger(scan.sectionsCaptured) || scan.sectionsCaptured !== sections.length) {
      return {
        ready: false,
        reason: "The local section set no longer matches the completed full-term refresh.",
        termCode: scan.termCode,
        sections: sections.length,
        meetings: 0,
        locations: 0,
        observedFrom: null,
        observedTo: null,
      };
    }

    const meetings = sections.flatMap((section) => section.meetings);
    const observations = sections.map((section) => section.observedAt).sort();
    return {
      ready: true,
      reason: null,
      termCode: scan.termCode,
      sections: sections.length,
      meetings: meetings.length,
      locations: meetings.filter(
        (meeting) =>
          isPublishedLocation(meeting.buildingName) || isPublishedLocation(meeting.room),
      ).length,
      observedFrom: observations[0],
      observedTo: observations.at(-1),
    };
  }

  function contributionPayload(state, exportedAt = new Date().toISOString()) {
    const scan = completedScan(state);
    const summary = contributionSummary(state);
    if (!scan || !summary.ready) return null;

    const sections = normalizedScanSections(state, scan);
    if (!sections) return null;
    return {
      schemaVersion: 1,
      exportedAt,
      source: SOURCE,
      scan,
      sections,
    };
  }

  root.ColumbiaCatalogContributionHelpers = Object.freeze({
    contributionPayload,
    contributionSummary,
  });
})(globalThis);
