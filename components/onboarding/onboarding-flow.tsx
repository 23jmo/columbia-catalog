"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { RiUploadCloud2Line } from "@remixicon/react";

import { useSessionAccount } from "@/hooks/use-session-account";
import {
  completeOnboardingAction,
  guessDeckAction,
  migrateGuestStateAction,
  onboardingFeedPreviewAction,
  warmCourseSearchAction,
} from "@/app/onboarding/actions";
import {
  advance,
  canAdvance,
  declaredProgramIds,
  goBack,
  hasDeclinedMinors,
  hasTranscriptCourses,
  plannedCourses,
  setPlannedSection,
  takenCourses,
  NO_MINORS_PROGRAM_ID,
  RERANK_BATCH_SIZE,
  reconcileDegreeChange,
  removeCourse as removeCourseFrom,
  setLiked as setLikedIn,
  upsertCourse,
  type GuestCourse,
  type GuestOnboardingState,
} from "@/lib/onboarding/state";
import { canPrefetchGuessDeck, prefetchGuessDeck } from "@/lib/onboarding/guess-cache";
import {
  canPrefetchFeedPreview,
  peekCachedFeedPreview,
  prefetchFeedPreview,
} from "@/lib/onboarding/feed-preview-cache";
import { writeOnboardingHandoff } from "@/lib/onboarding/handoff";
import { toGuestCourses } from "@/lib/onboarding/transcript";
import { planStore } from "@/lib/schedule/plans";
import { CURRENT_TERM } from "@/lib/constants";
import { haptic } from "@/lib/haptics";
import type { FeedCard } from "@/lib/recommend/feed";
import {
  ensureOnboardingHydrated,
  getOnboardingServerSnapshot,
  getOnboardingSnapshot,
  markOnboardingMigrated,
  subscribeOnboarding,
  updateOnboardingState,
} from "@/lib/onboarding/store";
import type { School } from "@/lib/requirements/types";

import { OrnamentAvatar } from "@/components/ornament/ornament-avatar";

import { OnboardingScreen } from "./screen";
import { useFeedPreview } from "./use-feed-preview";
import { FeedPreviewCardSkeleton } from "./feed-teaser-cards";
import {
  ClassYearQuestion,
  MajorsQuestion,
  MinorsQuestion,
  SchoolQuestion,
  electableMajorsFor,
  electableMinorsFor,
  hasSelectedMajor,
  hasSelectedMinor,
  schoolsWithPrograms,
  type ProgramOption,
} from "./step-degree";

/* ==========================================================================
 * The steps after the degree questions, split out of the first load
 * ========================================================================== */

/**
 * Only the degree questions are imported outright. Everything after them is
 * behind `dynamic`, and the reason is a bandwidth argument rather than a
 * parse-time one.
 *
 * This route's document is render-blocked by one stylesheet, and that
 * stylesheet shares an HTTP/2 connection with every script tag Next emits.
 * Statically importing all seven screens put the transcript importer, the
 * course search box, the feed card and everything the feed card reaches —
 * bookmark controls, the week strip, instructor links, enrolment chips — into
 * the entry chunk, so 2.1 MB of JavaScript competed with a 36 KB stylesheet for
 * a throttled connection and first paint waited on the loser. Splitting the
 * later screens out does not make the parse cheaper for a student who walks the
 * whole flow; it takes their bytes off the wire during the seconds that decide
 * when the first question appears.
 *
 * `ssr` stays on. These chunks still render on the server for whoever they
 * belong to, and a student who resumes mid-flow gets their screen's markup in
 * the document rather than a hole.
 *
 * The trade — a chunk fetch at the moment the student advances — is paid off by
 * `useWarmStepChunks` below, which fetches them on an idle callback once the
 * first question is up and the connection is quiet.
 */
const StepChoices = dynamic(() => import("./step-choices").then((m) => m.StepChoices));
const StepCoursework = dynamic(() => import("./step-coursework").then((m) => m.StepCoursework));
const StepPlanned = dynamic(() => import("./step-planned").then((m) => m.StepPlanned));
const StepLove = dynamic(() => import("./step-love").then((m) => m.StepLove));
const StepInterests = dynamic(() => import("./step-interests").then((m) => m.StepInterests));
const StepFeed = dynamic(() => import("./step-feed").then((m) => m.StepFeed));
/*
 * The transcript panel is offered on the FIRST screen, and it is still behind
 * `dynamic` — more so than anything above. It pulls the PDF text extractor and
 * the OCR module's entry, none of which may enter the chunk that decides when
 * the first question paints. It mounts only once the offer is pressed, so the
 * fetch is paid by the press and by nobody else.
 */
const TranscriptImport = dynamic(() =>
  import("./transcript-import").then((m) => m.TranscriptImport),
);

/**
 * Pull the later screens' chunks down once the page has finished loading.
 *
 * Ordered the way the flow is walked, so the screen the student reaches next is
 * the one already in cache.
 *
 * ── Why `load` and not an idle callback ────────────────────────────────────
 *
 * An idle callback was the first attempt and it undid the split. The main
 * thread goes idle constantly while a page is still fetching — it is idle every
 * time it is waiting on the network, which on a throttled connection is most of
 * the first two seconds — so `requestIdleCallback` fired long before the entry
 * chunk had landed and put all five chunks back into contention with it.
 * Measured on this route it cancelled the entire gain: the same 580 KB crossed
 * the wire before first paint, just in a different order.
 *
 * `load` is the event that actually means "the things that decide first paint
 * are done". Idle is still the right moment *after* that, so the two are used
 * together rather than one instead of the other.
 */
function useWarmStepChunks(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;

    const warm = () => {
      if (cancelled) return;
      void import("./step-choices");
      void import("./step-coursework");
      void import("./step-planned");
      void import("./step-love");
      void import("./step-interests");
      void import("./step-feed");
    };

    const scheduleWarm = () => {
      if (cancelled) return;
      // Safari has no `requestIdleCallback`. A short timeout is the same
      // intent: not in this frame, but soon.
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(warm, { timeout: 2000 });
      } else {
        timeoutHandle = window.setTimeout(warm, 300);
      }
    };

    if (document.readyState === "complete") {
      scheduleWarm();
    } else {
      window.addEventListener("load", scheduleWarm, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleWarm);
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
    };
  }, [enabled]);
}

/**
 * The onboarding wizard.
 *
 * ── One question per screen, five steps in the state ────────────────────────
 *
 * The persisted step machine has five steps; the flow has seven screens,
 * because the first step asks three separate questions. That split is
 * deliberately NOT in `lib/onboarding/state.ts`: the step machine is what the
 * guest state persists and what the migration and the tests are written
 * against, so turning one step into three would be a data change wearing a
 * layout change's clothes. The sub-question is local state here, seeded from
 * what has already been answered so a reload lands on the first UNANSWERED
 * question rather than back at the top.
 *
 * The back arrow walks the sub-questions first and only then hands off to
 * `goBack`, so "everything is reversible" holds at screen granularity, not just
 * at step granularity.
 *
 * ── One state object, one storage key, one owner ────────────────────────────
 *
 * Every answer lives in a single `GuestOnboardingState`, persisted to
 * `columbia-catalog:onboarding:v1` on every change. That is what makes the flow
 * survive a refresh, a closed tab, and a sign-in redirect to Google and back —
 * and it is what gets flushed into the database in one transaction when an
 * account appears. Splitting the state across components would have meant
 * splitting the flush, and a half-migrated student is worse off than one who
 * has to start over.
 *
 * ── Hydration ───────────────────────────────────────────────────────────────
 *
 * The state itself lives in `lib/onboarding/store.ts` and is read here through
 * `useSyncExternalStore`. Reading `localStorage` during render would make the
 * server and client disagree about what to draw and produce a hydration
 * mismatch on the one screen a student sees first; reading it in an effect and
 * calling `setState` would commit the empty state before the real one. The
 * store is the third option: React takes the server snapshot for the hydration
 * pass and the live snapshot immediately after, in one hydration rather than a
 * state update chasing a commit. The store's long header has the full argument.
 *
 * ── The sign-in migration ───────────────────────────────────────────────────
 *
 * `signIn()` sends the browser to Google with `redirectTo` pointing back at the
 * current path, so a student who signs in from the last step lands back HERE
 * with a session. The first-screen Log in control does the same — they stay in
 * the wizard, now showing their photo instead of "Log in".
 *
 * The effect below notices the session, flushes the guest state through one
 * RPC, and only clears local storage once the server confirms — clearing on
 * failure is the single bug that would lose a student's whole session.
 *
 * It runs at most once per mount (`migrationRef`), because `useSessionAccount`
 * re-fires on every token refresh and a flush per refresh would be a write
 * storm on a screen nobody is looking at.
 */

export interface OnboardingFlowProps {
  programOptions: ProgramOption[];
}

type MigrationStatus = "idle" | "running" | "done" | "failed";

/** The four questions inside the `school` step, in order. */
const DEGREE_QUESTIONS = ["school", "classYear", "major", "minors"] as const;
type DegreeQuestion = (typeof DEGREE_QUESTIONS)[number];

/**
 * Where a student resumes the degree questions: the first one they have not
 * answered.
 *
 * Derived from the answers rather than persisted, so it needs no field in the
 * guest state and no migration. The trade is that answering a question would
 * otherwise move the screen — see `answerDegree` below, which pins it.
 */
function resumeQuestion(
  state: GuestOnboardingState,
  degreeQuestions: readonly DegreeQuestion[],
  programOptions: readonly ProgramOption[],
): DegreeQuestion {
  if (!state.school) return "school";

  const pastClassYear = state.classYear !== null || state.programIds.length > 0;
  if (!pastClassYear) return "classYear";

  if (
    degreeQuestions.includes("major") &&
    !hasSelectedMajor(state.programIds, programOptions, state.school) &&
    !state.customMajor?.trim()
  ) {
    return "major";
  }
  if (
    degreeQuestions.includes("minors") &&
    !hasDeclinedMinors(state.programIds) &&
    !hasSelectedMinor(state.programIds, programOptions)
  ) {
    return "minors";
  }

  return degreeQuestions[degreeQuestions.length - 1];
}

/** Same test as `hasAnythingToMigrate`, kept local so this file does not import the migration module. */
function hasAnswersToFlush(state: GuestOnboardingState): boolean {
  return (
    state.school !== null ||
    state.programIds.length > 0 ||
    state.courses.length > 0 ||
    state.interestTags.length > 0
  );
}

function nextDegreeLabel(
  degreeQuestions: readonly DegreeQuestion[],
  from: DegreeQuestion,
  skipsCoursework: boolean,
): string {
  const index = degreeQuestions.indexOf(from);
  const next = index >= 0 ? degreeQuestions[index + 1] : undefined;
  if (next === "major") return "Continue to major";
  if (next === "minors") return "Continue to minors";
  // Where the arrow actually goes once a transcript is on the record: see
  // `hasTranscriptCourses` in the state module.
  return skipsCoursework ? "Continue to this term" : "Continue to coursework";
}

export function OnboardingFlow({ programOptions }: OnboardingFlowProps) {
  const router = useRouter();
  const session = useSessionAccount();

  const { state, isHydrated } = useSyncExternalStore(
    subscribeOnboarding,
    getOnboardingSnapshot,
    getOnboardingServerSnapshot,
  );
  const [migration, setMigration] = useState<{ status: MigrationStatus; message?: string }>({
    status: "idle",
  });
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);

  /*
   * Which of the four degree questions is on screen.
   *
   * `null` means "wherever the answers say", which is what a returning student
   * gets on their first render — including the one after hydration, without an
   * effect having to reach in and correct it. Any deliberate move writes a
   * value and from then on the student is where they put themselves.
   */
  /*
   * The degree questions that actually have an answer to give, for this
   * student.
   *
   * "What's your major?" and "Any minors?" are dropped when the registry has
   * nothing to offer for that kind — a General Studies or Barnard student,
   * today, or a school with majors but no transcribed minors yet. Asking a
   * question whose only honest answer is an apology is worse than not asking
   * it: it costs a screen, it reads as a dead end, and the student cannot tell
   * whether they have done something wrong. The limitation is stated on the
   * school screen instead, where the choice that caused it was made.
   *
   * Derived from the same electable lists the screens themselves render, so
   * the question we skip is by construction the question that would have been
   * empty — and it comes back on its own the day someone transcribes a GS
   * program.
   */
  const degreeQuestions = useMemo<readonly DegreeQuestion[]>(() => {
    const questions: DegreeQuestion[] = ["school", "classYear"];
    const majors = electableMajorsFor(state.school, programOptions, state.programIds);
    const minors = electableMinorsFor(state.school, programOptions, state.programIds);
    if (majors.length > 0) questions.push("major");
    if (minors.length > 0) questions.push("minors");
    return questions;
  }, [state.school, state.programIds, programOptions]);

  const coveredSchools = useMemo(() => schoolsWithPrograms(programOptions), [programOptions]);

  const [visitedQuestion, setVisitedQuestion] = useState<DegreeQuestion | null>(null);

  /*
   * Clamped to a question that still exists. A student can pick Columbia
   * College, walk to "what are you studying?", then step back and switch to
   * General Studies — at which point the question they are standing on is gone.
   * Falling back to the last surviving question keeps them on a real screen
   * instead of rendering nothing.
   */
  const resumed = visitedQuestion ?? resumeQuestion(state, degreeQuestions, programOptions);
  const degreeQuestion = degreeQuestions.includes(resumed)
    ? resumed
    : degreeQuestions[degreeQuestions.length - 1];

  // Consulting storage is a store operation, not a state update, so it is safe
  // in an effect: the store notifies its subscribers and React re-reads the
  // snapshot rather than scheduling a second render of stale state.
  useEffect(() => {
    ensureOnboardingHydrated();
  }, []);

  /*
   * Warm course listings once the flow is up. The coursework search used to
   * cold-load the full catalog-with-sections dump on the first keystroke.
   *
   * After `load` rather than straight out of the effect. This is a server
   * action, so it is a POST that carries an RSC render of the route back with
   * it, and it used to fire the instant hydration finished — which is the same
   * instant the first question finally paints. Priming a cache the student
   * cannot reach for another three screens is not worth contending with that.
   */
  useEffect(() => {
    if (!isHydrated) return;
    let cancelled = false;
    const warm = () => {
      if (!cancelled) void warmCourseSearchAction();
    };
    if (document.readyState === "complete") {
      const handle = window.setTimeout(warm, 300);
      return () => {
        cancelled = true;
        window.clearTimeout(handle);
      };
    }
    window.addEventListener("load", warm, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", warm);
    };
  }, [isHydrated]);

  // The screens after the degree questions, fetched while the connection is
  // quiet so advancing never waits on a chunk. See `useWarmStepChunks`.
  useWarmStepChunks(isHydrated);

  /*
   * Warm the guess deck and feed preview while the student finishes degree
   * questions, coursework, and interests — both screens should open warm.
   */
  useEffect(() => {
    if (!isHydrated) return;
    const current = getOnboardingSnapshot().state;
    const majorsOffered =
      electableMajorsFor(current.school, programOptions, current.programIds).length > 0;
    const hasMajor =
      hasSelectedMajor(current.programIds, programOptions, current.school) ||
      Boolean(current.customMajor?.trim());
    if (
      !canPrefetchGuessDeck(
        current,
        majorsOffered,
        hasMajor,
      )
    ) {
      return;
    }
    prefetchGuessDeck(current, guessDeckAction);
    if (canPrefetchFeedPreview(current, majorsOffered, hasMajor)) {
      prefetchFeedPreview(current, onboardingFeedPreviewAction);
    }
  }, [
    isHydrated,
    state.school,
    state.classYear,
    state.programIds,
    state.courses,
    state.interestTags,
    programOptions,
  ]);

  /*
   * The last screen's cards, ranked here rather than inside the gate.
   *
   * `enabled` is what keeps this from firing a rank on the school question:
   * the hook mounts with the flow and does nothing until the student is
   * actually on the last step. The prefetch above usually means the answer is
   * already sitting in the cache by then, and this resolves in the same frame.
   */
  const feedPreview = useFeedPreview(state, isHydrated && state.step === "feed");

  /* ── Guest → account ──────────────────────────────────────────────────── */

  const migrationRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || session.isLoading || !session.account) return;
    if (migrationRef.current) return;
    /*
     * A signed-in redo starts empty. Flushing that would call
     * `markOnboardingMigrated` and stop persisting the answers they are
     * about to give. Skip until there is something to move; `finish`
     * flushes whatever they confirm.
     */
    if (!hasAnswersToFlush(getOnboardingSnapshot().state)) return;
    migrationRef.current = true;

    setMigration({ status: "running" });

    void (async () => {
      /*
       * Read the store directly rather than closing over `state`. The flush is
       * asynchronous and the student can keep typing while it is in flight; the
       * snapshot at the moment the request is built is the one that must go, and
       * depending on `state` here would re-run the effect on every keystroke.
       */
      const result = await migrateGuestStateAction(getOnboardingSnapshot().state);

      if (!result.ok) {
        // Local state is deliberately NOT cleared. The student can retry by
        // signing in again or reloading, and nothing they entered is gone.
        setMigration({
          status: "failed",
          message:
            result.error ?? "We could not save your answers. They are still here — reload to retry.",
        });
        return;
      }

      markOnboardingMigrated();
      setMigration({
        status: "done",
        message: result.empty
          ? "There was nothing to move across."
          : `We saved ${result.courses ?? 0} ${result.courses === 1 ? "course" : "courses"} and your degree setup.`,
      });
    })();
  }, [isHydrated, session.isLoading, session.account]);

  /* ── State helpers ────────────────────────────────────────────────────── */

  const addCourse = useCallback((course: GuestCourse) => {
    updateOnboardingState((current) => upsertCourse(current, course));
  }, []);

  const addCourses = useCallback((courses: GuestCourse[]) => {
    updateOnboardingState((current) => courses.reduce(upsertCourse, current));
  }, []);

  const removeCourse = useCallback((courseId: string) => {
    updateOnboardingState((current) => removeCourseFrom(current, courseId));
  }, []);

  const setLiked = useCallback((courseId: string, liked: boolean | null) => {
    updateOnboardingState((current) => setLikedIn(current, courseId, liked));
  }, []);

  const setSection = useCallback((courseId: string, sectionId: string | null) => {
    updateOnboardingState((current) => setPlannedSection(current, courseId, sectionId));
  }, []);

  /**
   * One student confirmation, for the re-rank counter.
   *
   * The coursework screen applies implications locally and debounces the
   * server re-rank; this counter still ticks so stepping back cannot lose
   * the cadence.
   */
  const onConfirmationBatch = useCallback(() => {
    updateOnboardingState((current) => {
      const pending = current.confirmationsSinceRerank + 1;
      return {
        ...current,
        confirmationsSinceRerank: pending >= RERANK_BATCH_SIZE ? 0 : pending,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  /**
   * Every write that can change school, class year, or programs.
   *
   * Routed through `reconcileDegreeChange` rather than straight into the store,
   * because changing one of those three answers retires the guesses that were
   * made from the old ones — see the long note on that function. Four call
   * sites, one funnel: a fifth degree control added later that calls
   * `updateOnboardingState` directly would silently reintroduce the stale
   * "here's what we think you've taken" screen, so there is deliberately no
   * other way to write these fields from this component.
   */
  const updateDegree = (
    produce: (current: GuestOnboardingState) => GuestOnboardingState,
  ) => updateOnboardingState((current) => reconcileDegreeChange(current, produce(current)));

  const toggleProgram = (programId: string) =>
    updateDegree((current) => ({
      ...current,
      programIds: current.programIds.includes(programId)
        ? current.programIds.filter((id) => id !== programId)
        : [...current.programIds, programId],
      updatedAt: new Date().toISOString(),
    }));

  const toggleMinor = (programId: string) =>
    updateDegree((current) => {
      const withoutNone = current.programIds.filter((id) => id !== NO_MINORS_PROGRAM_ID);
      if (withoutNone.includes(programId)) {
        return {
          ...current,
          programIds: withoutNone.filter((id) => id !== programId),
          updatedAt: new Date().toISOString(),
        };
      }
      return {
        ...current,
        programIds: [...withoutNone, programId],
        updatedAt: new Date().toISOString(),
      };
    });

  const toggleNoMinors = () =>
    updateDegree((current) => {
      if (hasDeclinedMinors(current.programIds)) {
        return {
          ...current,
          programIds: current.programIds.filter((id) => id !== NO_MINORS_PROGRAM_ID),
          updatedAt: new Date().toISOString(),
        };
      }
      const withoutMinors = current.programIds.filter((id) => {
        const option = programOptions.find((candidate) => candidate.id === id);
        return option?.kind !== "minor";
      });
      return {
        ...current,
        programIds: [...withoutMinors, NO_MINORS_PROGRAM_ID],
        updatedAt: new Date().toISOString(),
      };
    });

  const canAdvanceMinors =
    hasDeclinedMinors(state.programIds) || hasSelectedMinor(state.programIds, programOptions);

  const majorsOffered =
    electableMajorsFor(state.school, programOptions, state.programIds).length > 0;
  const canAdvanceMajor =
    !majorsOffered ||
    hasSelectedMajor(state.programIds, programOptions, state.school) ||
    Boolean(state.customMajor?.trim());

  const patch = (fields: Partial<GuestOnboardingState>) =>
    updateDegree((current) => ({
      ...current,
      ...fields,
      updatedAt: new Date().toISOString(),
    }));

  /**
   * Answer one of the degree questions.
   *
   * Pins the sub-question BEFORE the answer lands. `resumeQuestion` derives the
   * screen from the answers, so without the pin the act of picking a school
   * would satisfy the resume rule and advance the screen out from under the
   * student's finger — no arrow pressed, no way to tell what happened.
   */
  const answerDegree = (question: DegreeQuestion, fields: Partial<GuestOnboardingState>) => {
    setVisitedQuestion(question);
    patch(fields);
  };

  /* ── Navigation ───────────────────────────────────────────────────────── */

  const degreeIndex = degreeQuestions.indexOf(degreeQuestion);

  /*
   * Which way the flow last moved, so the screen transition can reverse itself
   * on `back`. State rather than a ref: it is read during render to build the
   * screen's props, and reading a ref there is both a lint error here and the
   * kind of thing that silently fails to update. It is always set in the same
   * handler as the step change, so React batches the two into one render.
   */
  const [direction, setDirection] = useState<1 | -1>(1);

  /**
   * Forward: through the degree questions first, then through the step machine.
   */
  const forward = () => {
    setDirection(1);
    if (state.step === "school" && degreeIndex < degreeQuestions.length - 1) {
      setVisitedQuestion(degreeQuestions[degreeIndex + 1]);
      return;
    }
    updateOnboardingState((current) => advance(current));
  };

  /**
   * Back: the mirror image, and it never destroys an answer.
   *
   * Stepping back INTO the degree step lands on its last question rather than
   * its first, because that is the one the student just came from — arriving at
   * "which school?" after pressing back through the coursework screen would
   * read as having lost the two answers in between.
   */
  const back = () => {
    setDirection(-1);
    if (state.step === "school") {
      if (degreeIndex > 0) setVisitedQuestion(degreeQuestions[degreeIndex - 1]);
      return;
    }
    // `choices` is what sits directly after the degree questions now, so it is
    // the step whose back button re-enters them — and it re-enters at the LAST
    // one, which is the question the student actually just came from.
    // `love` is the step directly after them for a student who handed over a
    // transcript on the first screen — `goBack` skips the same two steps
    // `advance` did, and this pins the same sub-question.
    if (state.step === "choices" || (state.step === "planned" && hasTranscriptCourses(state)))
      setVisitedQuestion(degreeQuestions[degreeQuestions.length - 1]);
    updateOnboardingState((current) => goBack(current));
  };

  /** True on the very first screen, where there is nothing behind. */
  const isFirstScreen = state.step === "school" && degreeIndex === 0;

  /**
   * Returning accounts skip the wizard from the first question.
   *
   * Hidden while the session is still loading so a signed-in redo does not
   * flash "Log in" for a frame. Hidden once they have an account, because
   * they are already in.
   */
  const showSignIn = isFirstScreen && !session.isLoading && session.account === null;

  const startFirstPageSignIn = async () => {
    setSignInError(null);
    /*
     * `signIn` is reached through `import()` rather than a static import for
     * the same reason `use-session-account.ts` defers its client: the module
     * behind it is the whole Supabase SDK, and a static import here would put
     * it back in this route's entry chunk — in front of hydration, and so in
     * front of the first question — to serve a control most students never
     * press. Here it is loaded by the press itself, which is already a
     * navigation away from the page.
     */
    const { signIn } = await import("@/lib/db/auth");
    // Stay on this path so a returning student who is not done with setup
    // keeps walking the wizard, now with their photo in the corner.
    const { error } = await signIn({ next: "/onboarding" });
    if (error) setSignInError(error);
  };

  /**
   * Leave onboarding for good.
   *
   * Sets the completion cookie server-side so a returning visitor is not
   * marched through the flow again, then navigates. `refresh()` after the push
   * is what makes the new cookie visible to the server components on the
   * destination — without it the next render still sees the old request's
   * cookies.
   *
   * A signed-in redo never hit the mount-time flush (that effect skips an
   * empty guest state), so the answers only exist locally until this writes
   * them. First-time guests who signed in on the last screen already flushed
   * there; a second call is an idempotent upsert and is skipped when the
   * mount-time pass already finished.
   */
  const finish = async (cards: FeedCard[] = []) => {
    const guest = getOnboardingSnapshot().state;
    const preview = cards.length > 0 ? cards : peekCachedFeedPreview(guest);
    if (preview && preview.length > 0) writeOnboardingHandoff(preview);
    putPlannedSectionsOnSchedule(guest);

    if (
      session.account &&
      migration.status !== "done" &&
      migration.status !== "running" &&
      hasAnswersToFlush(guest)
    ) {
      const result = await migrateGuestStateAction(guest);
      if (!result.ok) {
        setMigration({
          status: "failed",
          message:
            result.error ?? "We could not save your answers. They are still here — try again.",
        });
        return;
      }
      markOnboardingMigrated();
    }
    await completeOnboardingAction();
    // Query keeps the home-click listener from wiping the seeded thread on
    // arrival (`search === ""` is what clears). The thread is the point.
    router.push("/?from=onboarding");
    router.refresh();
  };

  /* ── Render ───────────────────────────────────────────────────────────── */

  const chrome = {
    onBack: isFirstScreen ? undefined : back,
    onNext: forward,
    direction,
    account: session.account,
  };

  /*
   * Hold the empty ground until storage has been read. The server snapshot is
   * always step one; painting that question and then jumping to the feed is
   * the flash after Google SSO. Same ornament, no copy, until we know.
   */
  if (!isHydrated) {
    return (
      <div className="relative flex min-h-dvh w-full flex-col bg-background-secondary-default">
        <div className="mx-auto flex w-full flex-1 flex-col items-center px-5 pt-[13vh] sm:pt-[15vh]">
          <OrnamentAvatar hue="roseBlue" mood="thinking" />
        </div>
      </div>
    );
  }

  const skipsCoursework = hasTranscriptCourses(state);
  // Both rows a transcript writes: finished courses and the in-progress ones
  // that go to this term's screen. The count is the whole import, or a
  // three-row transcript with one "Planned" line would report two.
  const transcriptCount = state.courses.filter(
    (c) => c.source === "transcript_pdf" || c.source === "plan",
  ).length;

  if (state.step === "school") {
    if (degreeQuestion === "school") {
      return (
        <OnboardingScreen
          {...chrome}
          question="Which school are you in?"
          canAdvance={canAdvance(state)}
          nextLabel="Continue to class year"
          hue="roseBlue"
          // The panel is a card with a file drop and a review list; the
          // narrow measure the chips sit in folds its rows over.
          wide={isTranscriptOpen}
          onSignIn={showSignIn ? startFirstPageSignIn : undefined}
          signInError={signInError}
        >
          {/*
            ── The transcript, before anything else ─────────────────────────

            First on the first screen, on purpose. The coursework screens are
            the long part of the flow, and a student with a transcript to hand
            can answer all of them in one file. Offering it three screens in,
            as a footnote under a guessed deck, told that student to confirm
            our guess at a document they were holding. Here it is the first
            thing they can do, and doing it takes the deck and the fork
            questions off their path — see `hasTranscriptCourses`.

            Quiet styling still. It is an offer, not the gate: the school
            question below is what the arrow actually waits on.
          */}
          <div className="mb-6 flex flex-col items-center gap-3">
            {transcriptCount > 0 ? (
              <p
                role="status"
                className="text-center text-caption-1-regular text-text-secondary"
              >
                {`${transcriptCount} ${transcriptCount === 1 ? "course" : "courses"} imported. We'll skip the coursework questions.`}
              </p>
            ) : (
              <p className="text-center text-caption-1-regular text-text-tertiary">
                Have your transcript? Import it and skip the coursework questions.
              </p>
            )}
            {isTranscriptOpen ? null : (
              <button
                type="button"
                onClick={() => {
                  haptic("selection");
                  setIsTranscriptOpen(true);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-border-button-default px-4 py-2 text-body-medium text-text-secondary transition-colors outline-none hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring pointer-coarse:py-2.5"
              >
                <RiUploadCloud2Line className="size-4 shrink-0" aria-hidden />
                {transcriptCount > 0 ? "Import another" : "Import transcript"}
              </button>
            )}
            {isTranscriptOpen ? (
              <div className="w-full text-left">
                <TranscriptImport
                  onClose={() => setIsTranscriptOpen(false)}
                  onImport={(courses, candidates) =>
                    addCourses(toGuestCourses(courses, candidates))
                  }
                />
              </div>
            ) : null}
          </div>

          <SchoolQuestion
            school={state.school}
            coveredSchools={coveredSchools}
            onChange={(school: School | null) =>
              answerDegree("school", {
                school,
                // A major picked for Columbia College is not an answer for
                // SEAS. Clearing here, not "keep it labelled foreign", is
                // what makes backing up and switching school start the
                // major question over.
                programIds: [],
                customMajor: null,
              })
            }
          />
        </OnboardingScreen>
      );
    }

    if (degreeQuestion === "classYear") {
      return (
        <OnboardingScreen
        {...chrome}
        question="When do you graduate?"
        hue="roseCyan"
        /* Where the arrow actually goes — which is not always the program
           question, since that one is skipped for uncovered schools. */
        nextLabel={nextDegreeLabel(degreeQuestions, "classYear", skipsCoursework)}
      >
          <ClassYearQuestion
            classYear={state.classYear}
            onChange={(classYear) => answerDegree("classYear", { classYear })}
          />
        </OnboardingScreen>
      );
    }

    if (degreeQuestion === "major") {
      return (
        <OnboardingScreen
          {...chrome}
          question="What's your major?"
          wide
          hue="cyanRose"
          canAdvance={canAdvanceMajor}
          nextLabel={nextDegreeLabel(degreeQuestions, "major", skipsCoursework)}
        >
          <MajorsQuestion
            school={state.school}
            programIds={state.programIds}
            programOptions={programOptions}
            customMajor={state.customMajor}
            onToggleProgram={toggleProgram}
            onCustomMajorChange={(customMajor) => answerDegree("major", { customMajor })}
          />
        </OnboardingScreen>
      );
    }

    return (
      <OnboardingScreen
        {...chrome}
        question="Any minors?"
        wide
        hue="cyanRose"
        canAdvance={canAdvanceMinors}
        nextLabel={skipsCoursework ? "Continue to this term" : "Continue to coursework"}
      >
        <MinorsQuestion
          school={state.school}
          programIds={state.programIds}
          programOptions={programOptions}
          noneSelected={hasDeclinedMinors(state.programIds)}
          onSelectNone={toggleNoMinors}
          onToggleMinor={toggleMinor}
        />
      </OnboardingScreen>
    );
  }

  if (state.step === "choices") {
    return (
      <OnboardingScreen
        {...chrome}
        question="Which of these classes have you already taken?"
        wide
        nextLabel="Continue"
        // Not `cyanRose` (the degree question before) or `violetRose` (the
        // coursework screen after): the ornament changes hue per screen so
        // the flow reads as moving, and a repeat next to its own neighbour is
        // the one place that stops working.
        hue="blueRose"
      >
        <StepChoices
          state={state}
          addCourses={addCourses}
          removeCourse={removeCourse}
          /*
            Nothing to ask — a first-year, most often, whose deck carries no
            choose-one questions at all. Skip in whatever direction the student
            was already travelling, so a back press from the coursework screen
            does not bounce off an empty screen straight back forward again.
          */
          onNothingToAsk={direction === 1 ? forward : back}
        />
      </OnboardingScreen>
    );
  }

  if (state.step === "coursework") {
    return (
      <OnboardingScreen
        {...chrome}
        question="Here's what we think you've taken."
        wide
        nextLabel="Continue to this term"
        hue="violetRose"
      >
        <StepCoursework
          state={state}
          addCourse={addCourse}
          addCourses={addCourses}
          removeCourse={removeCourse}
          onConfirmationBatch={onConfirmationBatch}
        />
      </OnboardingScreen>
    );
  }

  if (state.step === "planned") {
    return (
      <OnboardingScreen
        {...chrome}
        question="What are you taking this term?"
        wide
        hue="roseCyan"
        nextLabel="Continue to what you liked"
      >
        <StepPlanned
          state={state}
          addCourse={addCourse}
          removeCourse={removeCourse}
          setSection={setSection}
        />
      </OnboardingScreen>
    );
  }

  if (state.step === "love") {
    return (
      <OnboardingScreen
        {...chrome}
        question="Which of these did you like?"
        wide
        hue="tealViolet"
        nextLabel="Continue to your interests"
      >
        {/* Only what has been taken. Nobody can say whether they liked a
            course they are three weeks into. */}
        <StepLove courses={takenCourses(state)} onSetLiked={setLiked} />
      </OnboardingScreen>
    );
  }

  if (state.step === "interests") {
    return (
      <OnboardingScreen {...chrome} question="What are you into?" wide hue="blueRose" nextLabel="See my feed">
        <StepInterests
          programIds={declaredProgramIds(state.programIds)}
          selected={state.interestTags}
          onToggle={(tagId) =>
            updateOnboardingState((current) => ({
              ...current,
              interestTags: current.interestTags.includes(tagId)
                ? current.interestTags.filter((tag) => tag !== tagId)
                : [...current.interestTags, tagId],
              updatedAt: new Date().toISOString(),
            }))
          }
        />
      </OnboardingScreen>
    );
  }

  /*
   * ── The beat before the feed ───────────────────────────────────────────
   *
   * Ranking a cold feed pages the active catalog and builds a prerequisite
   * graph over every course in it, which is measured in seconds. Rendering the
   * final screen through that wait meant the headline announced "Here's your
   * first feed." above four pulsing placeholders — the app claiming a thing it
   * did not have, on the one screen the whole flow has been building toward.
   *
   * So the wait gets its own question. The ornament switches to `thinking`,
   * which is the mood written for exactly this (it reads as work happening
   * rather than as a progress bar lying about progress), and the placeholders
   * stay, because they are the shape of what is coming and an empty ground
   * would be a worse wait than a busy one.
   *
   * The transition needs no new motion. `OnboardingScreen` keys its
   * `AnimatePresence` on the question, so changing the question IS the reveal
   * — the same 240ms crossfade every other step gets, followed by the cards'
   * own stagger underneath it. Two beats the student watches instead of one
   * they miss.
   *
   * A warm cache skips this screen entirely rather than flashing it; see
   * `useFeedPreview`.
   */
  if (feedPreview.status === "loading") {
    return (
      <OnboardingScreen
        onBack={back}
        direction={direction}
        question="Building your first feed."
        wide
        hue="cyanViolet"
        mood="thinking"
        lockViewport={session.account === null}
        account={session.account}
      >
        <FeedPreviewWorking />
      </OnboardingScreen>
    );
  }

  /*
   * The last screen advances by leaving the flow, so it has no arrow. Guests
   * sign in; signed-in students take the catalog button. There is no guest
   * browse exit — unsigned visitors stay here until they have an account.
   */
  return (
    <OnboardingScreen
      onBack={back}
      direction={direction}
      question="Here's your first feed."
      wide
      hue="cyanViolet"
      lockViewport={session.account === null}
      account={session.account}
    >
      <StepFeed
        preview={feedPreview}
        signedIn={session.account !== null}
        migration={migration}
        onFinish={finish}
      />
    </OnboardingScreen>
  );
}

/**
 * What the last screen looks like while its cards are still being ranked.
 *
 * The same four placeholders and the same column the gate uses, so the swap
 * into the real feed changes what is in the cards and not where they are.
 * `aria-busy` and a live label carry the same information to a screen reader
 * that the ornament carries visually; the placeholders themselves are
 * `aria-hidden` and say nothing.
 */
function FeedPreviewWorking() {
  return (
    <div
      className="relative flex w-full min-w-0 max-w-full flex-col gap-3.5 pt-2"
      aria-busy="true"
      aria-label="Ranking your first recommendations"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <FeedPreviewCardSkeleton key={index} />
      ))}
    </div>
  );
}

/**
 * Put every planned section onto the schedule for this term.
 *
 * The plan store is local-first: this writes to `localStorage`, and
 * `lib/db/plan-sync.ts` claims an anonymous plan under the real account on
 * first sign-in. So a guest who finishes onboarding, signs in, and lands on
 * the feed has their planned sections on the same schedule the feed's clash
 * check and the chat's schedule tools read.
 *
 * One known gap: a signed-in student who already has plans on the server
 * and redoes onboarding gets the server's plans back on the next reconcile,
 * because remote wins over local there. Their planned COURSES still land in
 * `student_courses` through the migration; only the section-level schedule
 * entry is lost in that case.
 */
function putPlannedSectionsOnSchedule(state: GuestOnboardingState): void {
  const sectionIds = plannedCourses(state)
    .map((course) => course.sectionId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (sectionIds.length === 0) return;

  try {
    const primary =
      planStore.getPrimaryPlan(CURRENT_TERM) ??
      planStore.createPlan({ name: "My schedule", termCode: CURRENT_TERM });
    for (const sectionId of sectionIds) {
      if (!primary.sectionIds.includes(sectionId)) planStore.addSection(primary.planId, sectionId);
    }
  } catch (cause) {
    // The schedule is the bonus, not the record. Never let it block finishing.
    console.error("onboarding: could not write planned sections to the schedule", cause);
  }
}
