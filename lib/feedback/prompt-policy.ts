/**
 * When to ask a reader for feedback, and when to shut up.
 *
 * Everything here is pure — no `window`, no clock of its own. The browser
 * half lives in `./store.ts`. The split is what makes the interesting part
 * testable in the repo's node-environment vitest setup without a DOM.
 *
 * ── The shape of "occasionally" ────────────────────────────────────────────
 *
 * A feedback prompt is a tax on someone who came here to find a class. It is
 * worth levying at most a handful of times, and only on people who have
 * actually used the thing enough to have an opinion. Four gates, in order of
 * how much they matter:
 *
 *   settled     They already answered — or told us no by clicking through.
 *               This is permanent and nothing overrides it.
 *   shownCount  Three asks, ever. Someone who has ignored it three times has
 *               communicated something, and a fourth card is just noise.
 *   visits      Three browser sessions before the first ask. A first-time
 *               visitor has nothing useful to say about a catalog they have
 *               been inside for ninety seconds, and asking anyway is the
 *               single fastest way to read as spam.
 *   snooze      Three weeks between asks. Long enough that the second one
 *               lands in a different registration mood than the first.
 *
 * The dwell delay is separate and is not a gate — see `DWELL_MS`.
 */

/**
 * The form itself.
 *
 * The `?usp=publish-editor` the URL arrived with is the editor's own preview
 * parameter. It is meaningless to a respondent and this is the canonical
 * share URL without it.
 */
export const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdJUoXNrPBrGpZP-0GNxBer2CJOzuN4OSY0xGSx8mSta_plKQ/viewform";

export interface FeedbackPromptState {
  /** Browser sessions in which this reader loaded a non-quiet screen. */
  visits: number;
  /** Epoch ms of the last ask. `null` means it has never been raised. */
  lastShownAt: number | null;
  /** Asks so far, ever. */
  shownCount: number;
  /** They opened the form. Never ask again, on any device this browser owns. */
  settled: boolean;
}

export const EMPTY_FEEDBACK_STATE: FeedbackPromptState = {
  visits: 0,
  lastShownAt: null,
  shownCount: 0,
  settled: false,
};

/** Sessions of real use before the first ask. */
export const VISITS_BEFORE_FIRST_ASK = 3;

/** Hard lifetime cap on asks. */
export const MAX_ASKS = 3;

/** Three weeks between asks. */
export const SNOOZE_MS = 21 * 24 * 60 * 60 * 1000;

/**
 * How long into a session the card waits before appearing.
 *
 * Not a gate — eligibility is already decided by the time this is consulted.
 * It exists so the card never lands *during* the first paint of a page the
 * reader is still parsing. Forty-five seconds is past "I am orienting" and
 * inside "I am using this".
 *
 * Measured from the start of the browser session rather than from mount,
 * because `AppShell` is rendered by each page rather than by a layout: every
 * navigation remounts this tree, and a mount-scoped timer would restart on
 * each one and therefore never fire for anyone who browses normally.
 */
export const DWELL_MS = 45_000;

/**
 * Screens the card never appears on.
 *
 * `/onboarding` is a flow with its own next-step affordance and a card in the
 * corner competes with it. `/auth` is a redirect waypoint. `/support` is
 * already an ask — stacking a second one on top of the donate page is the
 * kind of thing that makes people close the tab.
 */
export const QUIET_ROUTE_PREFIXES = ["/onboarding", "/auth", "/support"] as const;

export function isQuietRoute(pathname: string): boolean {
  return QUIET_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Whether this reader may be asked right now. Order is cheapest-first. */
export function isEligible(state: FeedbackPromptState, now: number): boolean {
  if (state.settled) return false;
  if (state.shownCount >= MAX_ASKS) return false;
  if (state.visits < VISITS_BEFORE_FIRST_ASK) return false;
  if (state.lastShownAt !== null && now - state.lastShownAt < SNOOZE_MS) return false;
  return true;
}

/** The state after the card has been put on screen. */
export function withShown(
  state: FeedbackPromptState,
  now: number,
): FeedbackPromptState {
  return { ...state, lastShownAt: now, shownCount: state.shownCount + 1 };
}

/** The state after they opened the form. Terminal. */
export function withSettled(state: FeedbackPromptState): FeedbackPromptState {
  return { ...state, settled: true };
}

/**
 * Coerce whatever `localStorage` handed back into a usable state.
 *
 * Hand-edited storage, a half-written value, or a future version of this
 * record all arrive here. None of them are worth an error — the cost of
 * getting it wrong is one extra feedback card — so anything unrecognisable
 * degrades to a field default rather than throwing or discarding the record
 * wholesale. A reader whose `visits` went missing should not also lose the
 * `settled` flag that is the one field it would be rude to forget.
 */
export function normalizeFeedbackState(raw: unknown): FeedbackPromptState {
  if (typeof raw !== "object" || raw === null) return EMPTY_FEEDBACK_STATE;
  const record = raw as Record<string, unknown>;

  return {
    visits: countOrZero(record.visits),
    shownCount: countOrZero(record.shownCount),
    lastShownAt:
      typeof record.lastShownAt === "number" && Number.isFinite(record.lastShownAt)
        ? record.lastShownAt
        : null,
    settled: record.settled === true,
  };
}

function countOrZero(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}
