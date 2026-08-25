"use strict";

importScripts("capture-schema.js", "scan-helpers.js", "contribution-helpers.js");

const SESSION_KEY = "vergilScheduleCaptureV1";
const CONTRIBUTION_PREFS_KEY = "vergilContributionPrefsV1";
const MAX_SECTION_COUNT = 25000;
const MAX_BATCH_SIZE = 500;
const CATALOG_ORIGIN = "https://www.lionplan.org";
const captureSchema = globalThis.LionPlanCaptureSchema;
const scanHelpers = globalThis.LionPlanScanHelpers;
const contributionHelpers = globalThis.LionPlanContributionHelpers;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function emptyState() {
  return {
    sections: {},
    batches: 0,
    lastCapturedAt: null,
    lastTermCode: null,
    lastVergilTabId: null,
    scan: null,
    scanSeenSections: {},
  };
}

async function readState() {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  const value = stored[SESSION_KEY];
  if (!isObject(value) || !isObject(value.sections)) return emptyState();
  return { ...emptyState(), ...value };
}

async function writeState(state) {
  await chrome.storage.session.set({ [SESSION_KEY]: state });
  const count = Object.keys(state.sections).length;
  await chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 999)) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#1d4ed8" });
}

async function readContributionPrefs() {
  const stored = await chrome.storage.local.get(CONTRIBUTION_PREFS_KEY);
  const value = stored[CONTRIBUTION_PREFS_KEY];
  if (!isObject(value) || typeof value.enabled !== "boolean") {
    return { enabled: false, updatedAt: null };
  }
  return value;
}

async function writeContributionPrefs(enabled) {
  const prefs = { enabled, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [CONTRIBUTION_PREFS_KEY]: prefs });
  return prefs;
}

function sectionQuality(section) {
  return section.meetings.reduce(
    (score, meeting) =>
      score +
      10 +
      (meeting.buildingName && meeting.buildingName !== "To be announced" ? 2 : 0) +
      (meeting.room && meeting.room !== "To be announced" ? 1 : 0),
    0,
  );
}

async function mergeSections(incoming, senderTab) {
  const state = await readState();
  const normalized = captureSchema?.normalizeSections(incoming, MAX_BATCH_SIZE);
  if (!normalized) return { accepted: 0, total: Object.keys(state.sections).length };
  let accepted = 0;

  for (const section of normalized) {
    const existing = state.sections[section.sectionKey];
    if (
      state.scan &&
      ["opening", "preparing", "scanning"].includes(state.scan.status) &&
      state.scan.termCode === section.termCode
    ) {
      state.scanSeenSections[section.sectionKey] = true;
    }
    if (existing && sectionQuality(section) < sectionQuality(existing)) continue;
    if (!existing && Object.keys(state.sections).length >= MAX_SECTION_COUNT) break;

    state.sections[section.sectionKey] = section;
    state.lastTermCode = section.termCode;
    accepted += 1;
  }

  if (Number.isInteger(senderTab?.id)) state.lastVergilTabId = senderTab.id;
  if (accepted > 0) {
    state.batches += 1;
    state.lastCapturedAt = new Date().toISOString();
  }
  await writeState(state);
  return { accepted, total: Object.keys(state.sections).length };
}

async function startScan(termValue) {
  const state = await readState();
  const termCode = scanHelpers.normalizeTermCode(termValue) ?? state.lastTermCode;
  const url = scanHelpers.fullScanUrl(termCode);
  if (!termCode || !url) return { started: false, reason: "Open a Vergil course search first." };

  const baselineSectionCount = Object.values(state.sections).filter(
    (section) => section.termCode === termCode,
  ).length;
  state.scan = {
    status: "opening",
    termCode,
    page: 0,
    pages: null,
    scannedCourses: 0,
    totalCourses: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    baselineSectionCount,
    sectionsCaptured: 0,
  };
  state.scanSeenSections = {};
  await writeState(state);

  let tab;
  if (Number.isInteger(state.lastVergilTabId)) {
    try {
      tab = await chrome.tabs.update(state.lastVergilTabId, { url, active: true });
    } catch {
      tab = null;
    }
  }
  if (!tab) tab = await chrome.tabs.create({ url, active: true });

  state.lastVergilTabId = tab.id ?? null;
  await writeState(state);
  return { started: true, termCode };
}

async function updateScan(message, senderTab) {
  const state = await readState();
  if (!state.scan || state.scan.termCode !== message.termCode) return;
  if (Number.isInteger(senderTab?.id)) state.lastVergilTabId = senderTab.id;
  let finalStatus = message.status;
  let finalError = typeof message.error === "string" ? message.error : null;
  let sectionsCaptured = state.scan.sectionsCaptured ?? 0;

  if (message.status === "complete") {
    const seenKeys = Object.keys(state.scanSeenSections);
    sectionsCaptured = seenKeys.length;
    const baseline = Number(state.scan.baselineSectionCount ?? 0);
    if (baseline > 0 && sectionsCaptured < baseline * 0.8) {
      finalStatus = "quarantined";
      finalError = `Refresh captured only ${sectionsCaptured} sections versus a ${baseline}-section baseline. Existing data was preserved.`;
    } else {
      const seen = new Set(seenKeys);
      for (const [sectionKey, section] of Object.entries(state.sections)) {
        if (section.termCode === state.scan.termCode && !seen.has(sectionKey)) {
          delete state.sections[sectionKey];
        }
      }
    }
  }

  state.scan = {
    ...state.scan,
    status: finalStatus,
    page: Number.isInteger(message.page) ? message.page : state.scan.page,
    pages: Number.isInteger(message.pages) ? message.pages : state.scan.pages,
    scannedCourses: Number.isInteger(message.scannedCourses)
      ? message.scannedCourses
      : state.scan.scannedCourses,
    totalCourses: Number.isInteger(message.totalCourses)
      ? message.totalCourses
      : state.scan.totalCourses,
    completedAt: ["complete", "cancelled", "error", "quarantined"].includes(finalStatus)
      ? new Date().toISOString()
      : null,
    error: finalError,
    sectionsCaptured,
  };
  if (["complete", "cancelled", "error", "quarantined"].includes(finalStatus)) {
    state.scanSeenSections = {};
  }
  await writeState(state);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#1d4ed8" }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const fromVergil = sender.tab?.url?.startsWith("https://vergil.columbia.edu/vergil/") ?? false;

  if (message?.type === "CAPTURE_SECTIONS") {
    if (!fromVergil || !Array.isArray(message.sections) || message.sections.length > MAX_BATCH_SIZE) return;
    mergeSections(message.sections, sender.tab)
      .then(sendResponse)
      .catch(() => sendResponse({ accepted: 0 }));
    return true;
  }

  if (message?.type === "GET_CAPTURE_STATE") {
    Promise.all([readState(), readContributionPrefs()])
      .then(([state, contribution]) =>
        sendResponse({
          ...state,
          contribution,
          contributionSummary: contributionHelpers.contributionSummary(state),
        }),
      )
      .catch(() => sendResponse(emptyState()));
    return true;
  }

  if (message?.type === "CLEAR_CAPTURE_STATE") {
    chrome.storage.session
      .remove(SESSION_KEY)
      .then(() => chrome.action.setBadgeText({ text: "" }))
      .then(() => sendResponse({ cleared: true }))
      .catch(() => sendResponse({ cleared: false }));
    return true;
  }

  if (message?.type === "SET_CONTRIBUTION_ENABLED") {
    writeContributionPrefs(message.enabled === true)
      .then(sendResponse)
      .catch(() => sendResponse({ enabled: false, updatedAt: null }));
    return true;
  }

  if (message?.type === "START_SCAN") {
    startScan(message.termCode).then(sendResponse).catch(() => sendResponse({ started: false }));
    return true;
  }

  if (message?.type === "CANCEL_SCAN") {
    readState()
      .then(async (state) => {
        if (Number.isInteger(state.lastVergilTabId)) {
          await chrome.tabs
            .sendMessage(state.lastVergilTabId, { type: "CANCEL_FULL_SCAN" })
            .catch(() => undefined);
        }
        if (state.scan) {
          state.scan.status = "cancelled";
          state.scan.completedAt = new Date().toISOString();
          state.scanSeenSections = {};
          await writeState(state);
        }
        sendResponse({ cancelled: true });
      })
      .catch(() => sendResponse({ cancelled: false }));
    return true;
  }

  if (message?.type === "SCAN_CONTENT_READY" && fromVergil) {
    readState().then((state) => {
      if (state.scan && ["opening", "preparing", "scanning"].includes(state.scan.status)) {
        chrome.tabs
          .sendMessage(sender.tab.id, { type: "START_FULL_SCAN", termCode: state.scan.termCode })
          .catch(() => undefined);
      }
    });
  }

  if (message?.type === "SCAN_PROGRESS" && fromVergil) {
    updateScan(message, sender.tab).catch(() => undefined);
  }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  let senderOrigin;
  try {
    senderOrigin = new URL(sender.url).origin;
  } catch {
    return;
  }
  if (senderOrigin !== CATALOG_ORIGIN) return;

  if (message?.type === "GET_VERGIL_CONTRIBUTION_SUMMARY") {
    Promise.all([readState(), readContributionPrefs()]).then(([state, prefs]) =>
      sendResponse({
        enabled: prefs.enabled,
        lastCapturedAt: state.lastCapturedAt,
        scan: state.scan,
        ...contributionHelpers.contributionSummary(state),
      }),
    );
    return true;
  }

  if (message?.type === "GET_VERGIL_CONTRIBUTION") {
    Promise.all([readState(), readContributionPrefs()]).then(([state, prefs]) => {
      if (!prefs.enabled) {
        sendResponse({ error: "Contribution sharing is disabled in the extension." });
        return;
      }
      const payload = contributionHelpers.contributionPayload(state);
      if (!payload) {
        sendResponse({ error: "Run a complete full-term refresh before contributing." });
        return;
      }
      sendResponse(payload);
    });
    return true;
  }
});
