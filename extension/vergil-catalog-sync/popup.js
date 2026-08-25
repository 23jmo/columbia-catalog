"use strict";

const sectionCount = document.querySelector("#section-count");
const meetingCount = document.querySelector("#meeting-count");
const locationCount = document.querySelector("#location-count");
const termCode = document.querySelector("#term-code");
const status = document.querySelector("#status");
const progressBar = document.querySelector("#progress-bar");
const scanButton = document.querySelector("#scan");
const cancelScanButton = document.querySelector("#cancel-scan");
const contributionEnabled = document.querySelector("#contribution-enabled");
const contributeButton = document.querySelector("#contribute");
const exportButton = document.querySelector("#export");
const clearButton = document.querySelector("#clear");

let currentSections = [];
let currentState = null;

function isPublishedLocation(value) {
  return typeof value === "string" && value.trim() !== "" && value !== "To be announced";
}

function scanIsActive(scan) {
  return scan && ["opening", "preparing", "scanning"].includes(scan.status);
}

function scanStatus(scan, fallback) {
  if (!scan) return fallback;
  if (scan.status === "opening") return "Opening the complete Vergil course list…";
  if (scan.status === "preparing") return "Switching Vergil to 100 courses per page…";
  if (scan.status === "scanning") {
    return `Refreshing page ${scan.page} of ${scan.pages} · ${scan.scannedCourses.toLocaleString()} of ${scan.totalCourses.toLocaleString()} courses`;
  }
  if (scan.status === "complete") {
    return `Complete · ${scan.totalCourses.toLocaleString()} courses checked at ${new Date(scan.completedAt).toLocaleTimeString()}.`;
  }
  if (scan.status === "cancelled") return "Refresh stopped. Captured pages remain available locally.";
  if (scan.status === "quarantined") return scan.error || "The smaller refresh was quarantined.";
  if (scan.status === "error") return scan.error || "The refresh stopped unexpectedly.";
  return fallback;
}

function render(state) {
  currentState = state;
  currentSections = Object.values(state?.sections ?? {}).sort((a, b) =>
    a.sectionKey.localeCompare(b.sectionKey),
  );
  const selectedTerm = state?.scan?.termCode ?? state?.lastTermCode ?? null;
  const displayedSections = selectedTerm
    ? currentSections.filter((section) => section.termCode === selectedTerm)
    : currentSections;
  const meetings = displayedSections.flatMap((section) => section.meetings);
  const locations = meetings.filter(
    (meeting) => isPublishedLocation(meeting.buildingName) || isPublishedLocation(meeting.room),
  ).length;
  const active = scanIsActive(state?.scan);
  const contributionReady = state?.contributionSummary?.ready === true;

  sectionCount.textContent = displayedSections.length.toLocaleString();
  meetingCount.textContent = meetings.length.toLocaleString();
  locationCount.textContent = locations.toLocaleString();
  termCode.textContent = selectedTerm ?? "—";
  contributionEnabled.checked = state?.contribution?.enabled === true;
  contributeButton.disabled = !contributionReady || !contributionEnabled.checked;
  exportButton.disabled = currentSections.length === 0;
  clearButton.disabled = currentSections.length === 0;
  scanButton.disabled = !selectedTerm || active;
  scanButton.hidden = active;
  cancelScanButton.hidden = !active;

  const progress = state?.scan?.totalCourses
    ? Math.min(100, (state.scan.scannedCourses / state.scan.totalCourses) * 100)
    : 0;
  progressBar.style.width = `${progress}%`;

  let fallback = "Open or refresh a Vergil course search to begin.";
  if (currentSections.length > 0) {
    const captured = state.lastCapturedAt ? new Date(state.lastCapturedAt).toLocaleTimeString() : "now";
    fallback = `${state.batches ?? 0} response batches captured · last updated ${captured}.`;
    if (meetings.length > 0 && locations === 0) {
      fallback += " Vergil currently labels every captured location To be announced.";
    }
  }
  status.textContent = scanStatus(state?.scan, fallback);
}

async function refresh() {
  render(await chrome.runtime.sendMessage({ type: "GET_CAPTURE_STATE" }));
}

scanButton.addEventListener("click", async () => {
  scanButton.disabled = true;
  const result = await chrome.runtime.sendMessage({
    type: "START_SCAN",
    termCode: currentState?.lastTermCode,
  });
  if (!result?.started) status.textContent = result?.reason ?? "Open a Vergil course search first.";
  await refresh();
});

cancelScanButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CANCEL_SCAN" });
  await refresh();
});

contributionEnabled.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "SET_CONTRIBUTION_ENABLED",
    enabled: contributionEnabled.checked,
  });
  await refresh();
});

contributeButton.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://lionplan.org/contribute/vergil", active: true });
});

exportButton.addEventListener("click", () => {
  if (currentSections.length === 0) return;
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: "Vergil course search via Columbia Catalog Chrome extension",
    scan: currentState?.scan ?? null,
    sections: currentSections,
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vergil-schedule-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  status.textContent = `Exported ${currentSections.length.toLocaleString()} sanitized sections.`;
});

clearButton.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_CAPTURE_STATE" });
  await refresh();
});

refresh().catch(() => {
  status.textContent = "Capture state is unavailable. Reload the extension and the Vergil tab.";
});
setInterval(() => {
  if (scanIsActive(currentState?.scan)) refresh().catch(() => undefined);
}, 750);
