/**
 * The onboarding state a GUEST accumulates, and the storage it lives in.
 *
 * ── Why the guest state is a first-class type ───────────────────────────────
 *
 * Onboarding is allowed to run to completion without an account (spec:
 * "Guest-allowed through the first feed; gated after"). That means every answer
 * a student gives — school, majors, twenty confirmed courses, which ones they
 * liked, their interest tags — exists only in their browser until they sign in.
 * If any of it is dropped or coerced on the way into the database, the student
 * has done the work twice and there is no way for them to tell which half
 * survived.
 *
 * So the shape below is the contract for both ends: `serialize`/`deserialize`
 * round-trip it through `localStorage`, and `toMigrationPayload`
 * (`./migrate.ts`) turns exactly these fields into rows. `onboarding.test.ts`
 * asserts the round trip is lossless, because "lossless" is the requirement and
 * an assertion is the only thing that keeps it true after the next field is
 * added.
 *
 * ── Why the key is versioned ────────────────────────────────────────────────
 *
 * `columbia-catalog:onboarding:v1`. A student who starts onboarding, closes the
 * tab, and comes back after a deploy that changed this shape must not have the
 * new code read the old object and half-understand it. `deserialize` therefore
 * validates rather than casts, and returns `null` on anything it does not
 * recognise — which restarts onboarding, the only safe answer. When the shape
 * changes incompatibly, bump the key; the old value is then simply never read.
 *
 * ── This module is isomorphic on purpose ────────────────────────────────────
 *
 * The reducer and the step machine are pure and have no DOM dependency, so the
 * server actions can validate a state the client sends with the same code that
 * produced it. Only `readGuestState`/`writeGuestState` touch `window`, and both
 * are defensive: Safari in private mode throws on `localStorage.setItem`, and
 * losing onboarding progress is not worth an unhandled exception.
 */

import { z } from "zod";

import type { CourseId } from "@/lib/requirements/code";
import { declaredProgramIds } from "./program-ids";
import type { School } from "@/lib/requirements/types";

/** Bump the suffix, never the contents, when the shape changes incompatibly. */
export const GUEST_STATE_KEY = "columbia-catalog:onboarding:v1";

/**
 * Set once the student reaches the first feed. Read by the server so a
 * returning visitor is not marched through onboarding again.
 *
 * A cookie rather than `localStorage` because the decision "do we redirect this
 * request to /onboarding" has to be made on the server, before any JavaScript
 * runs — making it in the browser would show the destination page and then yank
 * it away, which reads as a bug.
 */
export const ONBOARDING_COOKIE = "cc_onboarded";
export const ONBOARDING_COOKIE_VALUE = "1";
/** A year. Onboarding is a once-per-student event, not a session. */
export const ONBOARDING_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Drop the "has finished the wizard" flag in the browser.
 *
 * `httpOnly` is false on purpose (see `completeOnboardingAction`), so the
 * client can clear it when the student deletes their account or chooses
 * Redo. Leaving it set is what made a re-sign-in after delete skip the
 * first feed: the auth callback treated them as already done.
 */
export function clearOnboardingCompleteCookie(): void {
  if (typeof document === "undefined") return;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  try {
    document.cookie =
      `${ONBOARDING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax` + secure;
  } catch {
    /* Private mode: the next `completeOnboardingAction` will overwrite it. */
  }
}

/* ==========================================================================
 * Re-rank cadence
 * ========================================================================== */

/**
 * Confirmations between guess-grid re-ranks.
 *
 * Confirming a chip applies its implications instantly on the client. The
 * server re-rank waits until a few taps have landed, so two courses a student
 * can see at once are not replaced when they hit the first. The strip itself
 * also keeps pinned chips in place (`stabilizeStrip`) — this cadence is the
 * other half of that: even the appended tail should not reshuffle mid-aim.
 *
 * It lives in THIS module rather than in `./guess.ts` for a bundling reason
 * that is easy to undo by accident: `guess.ts` imports the recommendation
 * engine, which imports the database client and a filesystem-backed vector
 * loader. A client component that imported the constant from there would drag
 * all of it into the browser. This module imports nothing but `zod` and types.
 */
export const RERANK_BATCH_SIZE = 3;

export function shouldRerank(confirmationsSinceRerank: number): boolean {
  return confirmationsSinceRerank >= RERANK_BATCH_SIZE;
}

/* ==========================================================================
 * Steps
 * ========================================================================== */

/**
 * The steps, in order.
 *
 * `feed` is the last one and it is still part of onboarding: the spec's step 5
 * is "first feed, rendered for a guest", and the sign-in gate (step 6) is a
 * condition ON that screen rather than a screen of its own — there is nothing
 * to look at on a gate.
 *
 * `choices` comes BEFORE `coursework`, and the order is the point. It asks the
 * questions with definite answers — which physics sequence, Lit Hum or CC —
 * and everything the guess deck does afterwards is better for having them.
 * A choose-one answer is not just two more chips on the record: it unblocks
 * prerequisite chains, retires whole requirement groups, and changes what the
 * engine ranks. Asking it on the same screen as the guesses meant the guesses
 * were computed without it, so the student answered a question whose whole
 * value was in what came before.
 */
export const ONBOARDING_STEPS = [
  "school",
  "choices",
  "coursework",
  "love",
  "interests",
  "feed",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export const STEP_TITLE: Record<OnboardingStepId, string> = {
  school: "Your degree",
  choices: "Which ones you took",
  coursework: "What you've taken",
  love: "What you liked",
  interests: "What you're into",
  feed: "Your first feed",
};

export function stepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEPS.indexOf(step);
}

/** The step before this one, or `null` on the first. Drives the back button. */
export function previousStep(step: OnboardingStepId): OnboardingStepId | null {
  const index = stepIndex(step);
  return index <= 0 ? null : ONBOARDING_STEPS[index - 1];
}

/** The step after this one, or `null` on the last. */
export function nextStep(step: OnboardingStepId): OnboardingStepId | null {
  const index = stepIndex(step);
  return index < 0 || index >= ONBOARDING_STEPS.length - 1
    ? null
    : ONBOARDING_STEPS[index + 1];
}

/* ==========================================================================
 * Courses
 * ========================================================================== */

/**
 * How a course got onto the guest record.
 *
 * `onboarding_guess` is its own provenance and matches the value migration 0032
 * added to `student_courses.source`: a row the student ticked off a list we
 * generated is weaker evidence than one they searched for by name, and the
 * profile screen displays the difference.
 *
 * ── Why `onboarding_confirm` is separate from `onboarding_guess` ────────────
 *
 * They come off the same screen and they are not the same claim.
 * `onboarding_guess` is written by `applyDeck` the instant a deck lands, before
 * the student has looked at it — our claim about their transcript.
 * `onboarding_confirm` is a chip in the "usually taken too" strip that they
 * read and pressed — their claim, and the only thing separating it from
 * `picker` is that they found the course in a list instead of a search box.
 *
 * The distinction is load-bearing rather than cosmetic: `isStudentAsserted`
 * reads it to decide what survives a change of degree. While both were spelled
 * `onboarding_guess`, switching major silently deleted every chip the student
 * had personally tapped — no notice, no undo, and no way for them to tell it
 * had happened. Migration 0036 has the longer argument.
 *
 * Deliberately NOT imported from `lib/profile/types.ts`. That module's
 * `CourseSource` union does not yet include either onboarding value, and
 * widening it would mean editing a file another lane owns. The database
 * constraint is the real contract and both unions answer to it.
 */
export const ONBOARDING_COURSE_SOURCES = [
  "onboarding_guess",
  "onboarding_confirm",
  "picker",
  "transcript_paste",
  "transcript_pdf",
] as const;

export type OnboardingCourseSource = (typeof ONBOARDING_COURSE_SOURCES)[number];

/**
 * One course on the guest record.
 *
 * ── `inCatalog: false` is data, not an error ────────────────────────────────
 *
 * `student_courses.course_id` is deliberately not a foreign key (migration
 * 0028) so transfer credit, AP credit, study-abroad and un-backfilled archived
 * terms are storable. A student who took Linear Algebra at another university
 * and cannot record it has been handed a degree audit that is wrong and no way
 * to fix it.
 *
 * So an unmatched course is accepted, flagged here, shown as "not in our
 * catalog", and excluded from similarity and requirement matching downstream —
 * never rejected at the door. `title` is `null` for these, because we have
 * nothing to put in it and inventing one from the code would be a fabrication.
 */
export interface GuestCourse {
  courseId: CourseId;
  /** Display spelling: `"COMS W3134"`. */
  code: string;
  /** From the catalog. `null` when we hold no record — see `inCatalog`. */
  title: string | null;
  /** As printed on a transcript, when imported: `"Fall 2024"`. */
  termLabel: string | null;
  points: number | null;
  /**
   * The love screen's answer. `null` means "not asked", which is the state
   * every course starts in and must never be read as "disliked" — the taste
   * vector weights a disliked course DOWN.
   */
  liked: boolean | null;
  source: OnboardingCourseSource;
  /**
   * False when the course resolved to no catalog row. Kept on the record and
   * marked, never dropped.
   */
  inCatalog: boolean;
}

/* ==========================================================================
 * The state
 * ========================================================================== */

export interface GuestOnboardingState {
  /** Matches the `:v1` in the key. Validated, not trusted. */
  version: 1;
  school: School | null;
  /** Four digits, e.g. `"2028"`. Free text; used for display and for guessing. */
  classYear: string | null;
  /** Program ids from `lib/requirements/programs`. Majors, minors, concentrations. */
  programIds: string[];
  /**
   * Free-text major from the "Other" chip. Null when that chip is off.
   * An empty string means they opened Other but have not typed yet.
   */
  customMajor: string | null;
  courses: GuestCourse[];
  interestTags: string[];
  /** Where the student is now. */
  step: OnboardingStepId;
  /**
   * The furthest step they have reached, so the stepper can offer forward
   * navigation as well as back. Without it a student who steps back to fix
   * their major has to re-answer everything to return.
   */
  furthestStep: OnboardingStepId;
  /**
   * Confirmations since the guess grid last re-ranked.
   *
   * The re-rank is BATCHED — every third to fifth confirmation, not every one —
   * and this counter is what makes that possible. Re-ranking per tick would
   * reshuffle the grid under the student's finger between the moment they aim
   * at a card and the moment they hit it, which is the single most effective
   * way to make a grid feel broken.
   */
  confirmationsSinceRerank: number;
  /**
   * Courses the student explicitly took OFF their record.
   *
   * The guess grid pre-checks tier 1 and writes it straight into `courses`, and
   * it rebuilds the deck every time the coursework step mounts. Without a
   * record of refusals, a student who unticks Calculus II, walks forward to the
   * love screen and steps back finds Calculus II ticked again — the flow
   * silently undoing a correction they made on purpose. That is precisely the
   * one-way door the spec forbids, and it is worse than a one-way door because
   * it looks like nothing happened.
   *
   * Only auto-confirmation consults this. A student who searches the course up
   * and adds it back clears the refusal (see `upsertCourse`), because an
   * explicit add is a newer statement than an earlier untick.
   */
  dismissedCourseIds: string[];
  /** ISO. Only for diagnostics; nothing branches on it. */
  updatedAt: string;
}

export {
  NO_MINORS_PROGRAM_ID,
  declaredProgramIds,
  hasDeclinedMinors,
} from "./program-ids";

const SCHOOLS = ["CC", "SEAS", "GS", "BC"] as const;

const guestCourseSchema = z.object({
  courseId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().nullable(),
  termLabel: z.string().nullable(),
  points: z.number().nullable(),
  liked: z.boolean().nullable(),
  source: z.enum(ONBOARDING_COURSE_SOURCES),
  inCatalog: z.boolean(),
});

/**
 * The validator for anything claiming to be onboarding state.
 *
 * Used in three places, and it is the same object in all three on purpose: the
 * browser reading `localStorage`, a server action receiving a POST body, and
 * the test. A server action is a public endpoint with a generated name, so the
 * state arriving at `migrateGuestStateAction` is exactly as untrusted as the
 * value in a storage key a user can edit in devtools.
 */
export const guestOnboardingStateSchema = z.object({
  version: z.literal(1),
  school: z.enum(SCHOOLS).nullable(),
  classYear: z.string().nullable(),
  programIds: z.array(z.string()).max(8),
  /*
   * `.default(null)` so a state written before "Other" still reads. Same
   * reason `dismissedCourseIds` defaults: the key stays at `:v1`.
   */
  customMajor: z.string().max(80).nullable().default(null),
  // A transcript is tens of rows. Four hundred is the same cap
  // `addCoursesAction` uses, and for the same reason.
  courses: z.array(guestCourseSchema).max(400),
  // 24 is the database's own check constraint on `interest_tags`.
  interestTags: z.array(z.string()).max(24),
  step: z.enum(ONBOARDING_STEPS),
  furthestStep: z.enum(ONBOARDING_STEPS),
  confirmationsSinceRerank: z.number().int().min(0),
  /*
   * `.default([])` rather than a required field, and that is what lets the key
   * stay at `:v1`. A state written before this field existed is still fully
   * understood — nothing about it is ambiguous, the refusal list was simply
   * empty — so bumping the key and restarting those students' onboarding would
   * be a cost paid for no safety at all. The key bumps when an old value cannot
   * be read correctly, not merely when the shape grows.
   */
  dismissedCourseIds: z.array(z.string()).max(400).default([]),
  updatedAt: z.string(),
});

export function emptyGuestState(): GuestOnboardingState {
  return {
    version: 1,
    school: null,
    classYear: null,
    programIds: [],
    customMajor: null,
    courses: [],
    interestTags: [],
    step: "school",
    furthestStep: "school",
    confirmationsSinceRerank: 0,
    dismissedCourseIds: [],
    updatedAt: new Date(0).toISOString(),
  };
}

/* ==========================================================================
 * Transitions
 * ========================================================================== */

/**
 * Whether the student may leave this step.
 *
 * Only the first step gates, and it gates on the one answer nothing downstream
 * can proceed without: the guess grid needs a program to guess from. Every
 * other step is skippable, deliberately — a student who confirms no coursework
 * and picks no interests still gets a feed, it is just a worse one, and forcing
 * an answer to get a recommendation is how a funnel loses the people it was
 * built for.
 */
export function canAdvance(state: GuestOnboardingState): boolean {
  if (state.step === "school") return state.school !== null;
  return true;
}

/**
 * Move forward, remembering how far the student has been.
 *
 * `furthestStep` only ever grows. Stepping back to change a major and forward
 * again must not erase the fact that the love screen was already answered.
 */
export function advance(state: GuestOnboardingState): GuestOnboardingState {
  const target = nextStep(state.step);
  if (!target || !canAdvance(state)) return state;
  return goToStep(state, target);
}

/** Move back one step. A no-op on the first, which is where the button hides. */
export function goBack(state: GuestOnboardingState): GuestOnboardingState {
  const target = previousStep(state.step);
  if (!target) return state;
  // Note this does NOT lower `furthestStep`, and does not clear any answer.
  // "Everything is reversible" means a student can go back and look; it does
  // not mean going back destroys what they already told us.
  return { ...state, step: target, updatedAt: new Date().toISOString() };
}

/**
 * Jump to a step directly, for the stepper's own controls.
 *
 * Bounded by `furthestStep`: a student can revisit anything they have seen and
 * cannot skip ahead past the answers later steps are built from. The love
 * screen with no confirmed coursework is an empty screen, and an empty screen
 * is indistinguishable from a broken one.
 */
export function goToStep(
  state: GuestOnboardingState,
  target: OnboardingStepId,
): GuestOnboardingState {
  const furthest = Math.max(stepIndex(state.furthestStep), stepIndex(target));
  return {
    ...state,
    step: target,
    furthestStep: ONBOARDING_STEPS[furthest],
    updatedAt: new Date().toISOString(),
  };
}

export function canJumpTo(state: GuestOnboardingState, target: OnboardingStepId): boolean {
  return stepIndex(target) <= stepIndex(state.furthestStep);
}

/**
 * Add or replace a course on the record, keyed by course id.
 *
 * Replace rather than reject on a duplicate: the second sighting is usually the
 * better one — a course guessed by the grid and then found by name in the
 * search box arrives with a real title and a stronger `source`.
 */
export function upsertCourse(
  state: GuestOnboardingState,
  course: GuestCourse,
): GuestOnboardingState {
  const existing = state.courses.findIndex((row) => row.courseId === course.courseId);
  const courses = [...state.courses];

  if (existing === -1) courses.push(course);
  else {
    // `liked` survives a re-add. A student who answered the love screen and
    // then re-confirmed the course in the grid has not withdrawn their opinion.
    courses[existing] = { ...course, liked: course.liked ?? courses[existing].liked };
  }

  return {
    ...state,
    courses,
    // An explicit add overrides an earlier refusal — it is the newer statement.
    dismissedCourseIds: state.dismissedCourseIds.filter((id) => id !== course.courseId),
    updatedAt: new Date().toISOString(),
  };
}

export function removeCourse(
  state: GuestOnboardingState,
  courseId: CourseId,
): GuestOnboardingState {
  return {
    ...state,
    courses: state.courses.filter((row) => row.courseId !== courseId),
    // Remembered so the next deck does not re-tick what was just unticked.
    dismissedCourseIds: state.dismissedCourseIds.includes(courseId)
      ? state.dismissedCourseIds
      : [...state.dismissedCourseIds, courseId],
    updatedAt: new Date().toISOString(),
  };
}

export function setLiked(
  state: GuestOnboardingState,
  courseId: CourseId,
  liked: boolean | null,
): GuestOnboardingState {
  return {
    ...state,
    courses: state.courses.map((row) =>
      row.courseId === courseId ? { ...row, liked } : row,
    ),
    updatedAt: new Date().toISOString(),
  };
}

/* ==========================================================================
 * Degree changes
 * ========================================================================== */

/**
 * The answers the guess engine reads, as a comparable string.
 *
 * School, class year and declared programs are the entire input to
 * `lib/onboarding/guess.ts` — everything else on the record is either an output
 * of it or a student's own statement. So this is exactly the set whose change
 * makes an earlier guess a claim we would no longer make, and comparing it is
 * how `reconcileDegreeChange` tells "they fixed a typo in their major" apart
 * from "they answered a different question".
 *
 * The sentinel is stripped and the ids are sorted so declining minors, or
 * picking the same two minors in the other order, is not read as a change.
 */
export function degreeSignature(state: GuestOnboardingState): string {
  return JSON.stringify({
    school: state.school,
    classYear: state.classYear,
    programIds: [...declaredProgramIds(state.programIds)].sort(),
    customMajor: state.customMajor?.trim() || null,
  });
}

/**
 * True for a course the STUDENT put on the record, rather than one we guessed.
 *
 * Two ways to qualify, and the second one matters as much as the first:
 *
 *  - the source is anything but `onboarding_guess` — they searched it up, it
 *    came off a transcript, or they pressed the chip themselves
 *    (`onboarding_confirm`). That is their statement about their own history
 *    and no answer they give about their degree can make it untrue.
 *  - `liked !== null` — we guessed it, but they then told the love screen how
 *    they felt about it. Answering a question about a course is an implicit
 *    confirmation that they took it, and it is a stronger signal than the guess
 *    that put it there. Dropping it would also silently discard the opinion.
 *
 * `onboarding_guess` is therefore the ONLY source this function retires, and
 * the exclusion is written as a negation on purpose: a source added later is
 * kept by default. Retiring a student's answer is unrecoverable and silent,
 * while keeping one guess too many costs a glance at a chip with an × on it, so
 * the default has to fall on the side that is visible when it is wrong.
 */
function isStudentAsserted(course: GuestCourse): boolean {
  return course.source !== "onboarding_guess" || course.liked !== null;
}

/**
 * Fold a degree answer in, retiring guesses it invalidates.
 *
 * ── The bug this exists to close ────────────────────────────────────────────
 *
 * The coursework screen opens ANSWERED: tier 1 is written straight into
 * `courses` the moment the deck lands, because a chip that looks confirmed but
 * has saved nothing is a lie. That write is correct and it is also permanent —
 * so a student who walked the flow as a 2028 CS major, stepped back, and
 * switched to a 2026 Econ major arrived at "here's what we think you've taken"
 * still holding a screenful of CS courses. The heading is a claim we make on
 * their behalf, and it was a claim about a degree they had just told us they do
 * not have.
 *
 * Worse than the display: `guessDeckCacheKey` feeds `courses` back into the
 * next ranking pass, so the stale guesses were being treated as confirmed
 * prerequisites and biasing the new deck toward the major they had left.
 *
 * ── What survives, and why ──────────────────────────────────────────────────
 *
 * Only OUR claims are retired — see `isStudentAsserted`. Anything the student
 * searched for, imported from a transcript, or expressed an opinion about stays
 * exactly where it is. The asymmetry is the whole point: we are allowed to
 * withdraw a guess we made, and we are not allowed to erase an answer they
 * gave.
 *
 * `dismissedCourseIds` also survives untouched. "I did not take Calculus II" is
 * a fact about the student, not about their major, and it stays true across a
 * change of major — the next deck must not re-tick it.
 *
 * The known cost: a guess that happened to be RIGHT, that the student left
 * standing without ever opening the love screen, is dropped and only comes back
 * if the new deck guesses it again. That is the correct trade. Passive
 * acceptance of a pre-filled chip is the weakest evidence on the record, and
 * over-stating someone's transcript is worse than under-stating it — an extra
 * course silently satisfies a requirement they still owe.
 *
 * A no-op when the signature is unchanged, so re-picking the same school or
 * toggling a minor off and back on costs nothing.
 */
export function reconcileDegreeChange(
  before: GuestOnboardingState,
  after: GuestOnboardingState,
): GuestOnboardingState {
  if (degreeSignature(before) === degreeSignature(after)) return after;

  const courses = after.courses.filter(isStudentAsserted);
  if (courses.length === after.courses.length) return after;

  return {
    ...after,
    courses,
    // The deck this counter was pacing no longer exists. Starting the new one
    // at zero means the first confirmation on the rebuilt screen re-ranks.
    confirmationsSinceRerank: 0,
    updatedAt: new Date().toISOString(),
  };
}

/* ==========================================================================
 * Storage
 * ========================================================================== */

export function serialize(state: GuestOnboardingState): string {
  return JSON.stringify(state);
}

/**
 * Parse stored state, or `null`.
 *
 * Validates every field rather than casting. The value lives in a storage key
 * the user can edit, survives deploys that change this file, and is fed
 * straight into a database write on sign-in — three independent reasons why a
 * cast would eventually put a malformed row in front of a student.
 */
export function deserialize(raw: string | null | undefined): GuestOnboardingState | null {
  if (!raw) return null;
  try {
    const parsed = guestOnboardingStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Not JSON at all. Same answer as invalid JSON: start over.
    return null;
  }
}

/** Browser only. Returns `null` on the server, in private mode, and on garbage. */
export function readGuestState(): GuestOnboardingState | null {
  if (typeof window === "undefined") return null;
  try {
    return deserialize(window.localStorage.getItem(GUEST_STATE_KEY));
  } catch {
    return null;
  }
}

/** Browser only. Silent on failure — Safari private mode throws on write. */
export function writeGuestState(state: GuestOnboardingState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_STATE_KEY, serialize(state));
  } catch {
    /* Storage is full or blocked. The in-memory state still drives the flow. */
  }
}

/**
 * Forget the guest record.
 *
 * Called after a successful sign-in migration and nowhere else. Clearing it on
 * a FAILED migration would be the one bug that loses a student's whole session,
 * so `migrate.ts` only calls this once the server has confirmed the write.
 */
export function clearGuestState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_STATE_KEY);
  } catch {
    /* Nothing we can do, and nothing depends on it. */
  }
}
