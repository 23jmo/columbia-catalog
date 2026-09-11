/**
 * The browser half of the feedback prompt: two records, two storages.
 *
 * ── Why the split ─────────────────────────────────────────────────────────
 *
 * `localStorage` holds the long memory — how many sessions this reader has
 * had, when they were last asked, whether they already answered. It has to
 * outlive the tab or the whole "occasionally" idea collapses into "every
 * time".
 *
 * `sessionStorage` holds the two facts that are only true of *this* visit:
 * when it started, and whether the card is currently raised. Both exist to
 * survive a navigation rather than a return trip.
 *
 * The second one is the interesting one. `AppShell` is rendered by each page
 * rather than by the root layout, so every navigation unmounts and remounts
 * the prompt. Without a session-scoped `open` flag, a card that appeared two
 * seconds before someone clicked a course would vanish on arrival and burn
 * one of their three lifetime asks having been on screen for two seconds.
 * With it, the card follows them across pages until they actually answer it.
 *
 * ── The visit counter is per tab, on purpose ──────────────────────────────
 *
 * `sessionStorage` is per-tab, so opening the catalog in three tabs counts as
 * three visits rather than one. That is a known and accepted overcount: the
 * counter is a proxy for "has used this enough to have an opinion", and
 * someone with three tabs of it open qualifies on any reading. The fix would
 * be a heartbeat in `localStorage` and it is not worth the machinery.
 *
 * ── Everything swallows ───────────────────────────────────────────────────
 *
 * Both storages throw rather than returning null in a Safari private window
 * and anywhere site data is blocked. Nothing kept here is worth an error
 * boundary; a reader in that mode simply never sees the card, which is the
 * correct failure direction for an unsolicited prompt.
 */

import {
  normalizeFeedbackState,
  withSettled,
  withShown,
  type FeedbackPromptState,
} from "@/lib/feedback/prompt-policy";

const STATE_KEY = "lionplan.feedback.v1";
const SESSION_KEY = "lionplan.feedback.session.v1";

interface SessionMark {
  /** Epoch ms this browser session began, for the dwell delay. */
  startedAt: number;
  /** The card is raised and has not yet been answered or dismissed. */
  open: boolean;
}

export function readFeedbackState(): FeedbackPromptState {
  return normalizeFeedbackState(readJson(safeLocal(), STATE_KEY));
}

/**
 * Count this browser session, once.
 *
 * Idempotent by construction: the session mark's *existence* is the record of
 * having counted, so a remount on the next navigation finds it and does
 * nothing. Returns the state as it stands afterwards, so a caller does not
 * need a second read.
 */
export function countVisit(now: number): FeedbackPromptState {
  const state = readFeedbackState();
  if (readSessionMark() !== null) return state;

  writeSessionMark({ startedAt: now, open: false });
  const next = { ...state, visits: state.visits + 1 };
  writeState(next);
  return next;
}

/**
 * How long this browser session has been running.
 *
 * Zero when the session mark is unreadable, which makes the caller wait the
 * full dwell from mount — the conservative direction.
 */
export function sessionElapsedMs(now: number): number {
  const mark = readSessionMark();
  if (mark === null) return 0;
  return Math.max(0, now - mark.startedAt);
}

/*
 * ── Why the open flag is an external store ────────────────────────────────
 *
 * The obvious shape — `useState(false)` seeded by an effect that reads
 * storage — is the wrong one, and the repo has already been here once with
 * `components/feed/dismissed-store.ts`. React flags the synchronous
 * `setState` in an effect as a cascading render because it is one: a reader
 * whose card was already raised gets a first paint without it and a second
 * with it, which on a slow phone is a card visibly popping in on a page that
 * had finished loading.
 *
 * `useSyncExternalStore` is React's shape for state the server cannot see.
 * The server snapshot is `false`, the client snapshot is whatever this
 * session holds, and React reconciles the two without a render in between.
 */

const listeners = new Set<() => void>();

/**
 * `sessionStorage` is per-tab, so there is no cross-tab `storage` event to
 * listen for and nothing to attach here — every change to this flag comes
 * from a call below. The subscription exists so those calls can notify.
 */
export function subscribePromptOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether the card is raised and still unanswered in this session.
 *
 * A boolean compares by value, so unlike the dismissed-course set this needs
 * no referential-stability cache to keep React from re-rendering forever.
 * The read is cached anyway, because it is consulted on every render of every
 * page and parsing JSON out of storage for it would be silly.
 */
export function getPromptOpenSnapshot(): boolean {
  cachedOpen ??= readSessionMark()?.open === true;
  return cachedOpen;
}

/** No browser storage on the server, so nothing is ever raised there. */
export function getPromptOpenServerSnapshot(): boolean {
  return false;
}

let cachedOpen: boolean | null = null;

/**
 * Raise the card. Spends one of the reader's asks and starts the three-week
 * snooze in the same breath — a card that went on screen has been asked,
 * whether or not it is answered.
 */
export function openPrompt(now: number): void {
  writeState(withShown(readFeedbackState(), now));
  setOpen(true);
}

/**
 * Dismissed. A snooze, not a refusal: `openPrompt` already started the timer,
 * so lowering the card is the whole of what this has to do.
 */
export function closePrompt(): void {
  setOpen(false);
}

/**
 * They opened the form. Terminal — `settled` outranks every other gate, so
 * nothing raises the card on this browser again.
 */
export function settlePrompt(): void {
  writeState(withSettled(readFeedbackState()));
  setOpen(false);
}

function setOpen(open: boolean): void {
  const mark = readSessionMark();
  if (mark !== null) writeSessionMark({ ...mark, open });
  // Set even when the mark is unreadable (private mode, blocked site data):
  // the card should still work for the life of the page it appeared on, it
  // just will not survive a navigation there.
  cachedOpen = open;
  for (const listener of listeners) listener();
}

function writeState(next: FeedbackPromptState): void {
  writeJson(safeLocal(), STATE_KEY, next);
}

function readSessionMark(): SessionMark | null {
  const raw = readJson(safeSession(), SESSION_KEY);
  if (typeof raw !== "object" || raw === null) return null;

  const record = raw as Record<string, unknown>;
  if (typeof record.startedAt !== "number" || !Number.isFinite(record.startedAt)) {
    return null;
  }
  return { startedAt: record.startedAt, open: record.open === true };
}

function writeSessionMark(mark: SessionMark): void {
  writeJson(safeSession(), SESSION_KEY, mark);
}

function safeLocal(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function safeSession(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readJson(storage: Storage | null, key: string): unknown {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    // Unreadable or unparseable. Treat as absent; the defaults are correct.
    return null;
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown): void {
  if (storage === null) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota, private mode, blocked site data. The prompt is not worth a throw.
  }
}
