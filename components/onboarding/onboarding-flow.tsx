"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

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
  NO_MINORS_PROGRAM_ID,
  RERANK_BATCH_SIZE,
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
import { StepCoursework } from "./step-coursework";
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
import { StepFeed } from "./step-feed";
import { StepInterests } from "./step-interests";
import { StepLove } from "./step-love";

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
 * with a session. The effect below notices the session, flushes the guest state
 * through one RPC, and only clears local storage once the server confirms —
 * clearing on failure is the single bug that would lose a student's whole
 * session.
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

  if (degreeQuestions.includes("major") && !hasSelectedMajor(state.programIds, programOptions)) {
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
): string {
  const index = degreeQuestions.indexOf(from);
  const next = index >= 0 ? degreeQuestions[index + 1] : undefined;
  if (next === "major") return "Continue to major";
  if (next === "minors") return "Continue to minors";
  return "Continue to coursework";
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
   * Warm course listings as soon as the flow is up. The coursework search used
   * to cold-load the full catalog-with-sections dump on the first keystroke.
   */
  useEffect(() => {
    if (!isHydrated) return;
    void warmCourseSearchAction();
  }, [isHydrated]);

  /*
   * Warm the guess deck and feed preview while the student finishes degree
   * questions, coursework, and interests — both screens should open warm.
   */
  useEffect(() => {
    if (!isHydrated) return;
    const current = getOnboardingSnapshot().state;
    const majorsOffered =
      electableMajorsFor(current.school, programOptions, current.programIds).length > 0;
    const hasMajor = hasSelectedMajor(current.programIds, programOptions);
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

  const toggleProgram = (programId: string) =>
    updateOnboardingState((current) => ({
      ...current,
      programIds: current.programIds.includes(programId)
        ? current.programIds.filter((id) => id !== programId)
        : [...current.programIds, programId],
      updatedAt: new Date().toISOString(),
    }));

  const toggleMinor = (programId: string) =>
    updateOnboardingState((current) => {
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
    updateOnboardingState((current) => {
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
    !majorsOffered || hasSelectedMajor(state.programIds, programOptions);

  const patch = (fields: Partial<GuestOnboardingState>) =>
    updateOnboardingState((current) => ({
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
   * "which school?" after pressing back from the coursework screen would read
   * as having lost the two answers in between.
   */
  const back = () => {
    setDirection(-1);
    if (state.step === "school") {
      if (degreeIndex > 0) setVisitedQuestion(degreeQuestions[degreeIndex - 1]);
      return;
    }
    if (state.step === "coursework")
      setVisitedQuestion(degreeQuestions[degreeQuestions.length - 1]);
    updateOnboardingState((current) => goBack(current));
  };

  /** True on the very first screen, where there is nothing behind. */
  const isFirstScreen = state.step === "school" && degreeIndex === 0;

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

  if (state.step === "school") {
    if (degreeQuestion === "school") {
      return (
        <OnboardingScreen
          {...chrome}
          question="Which school are you in?"
          canAdvance={canAdvance(state)}
          nextLabel="Continue to class year"
          hue="roseBlue"
        >
          <SchoolQuestion
            school={state.school}
            coveredSchools={coveredSchools}
            onChange={(school: School | null) => answerDegree("school", { school })}
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
        nextLabel={nextDegreeLabel(degreeQuestions, "classYear")}
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
          nextLabel={nextDegreeLabel(degreeQuestions, "major")}
        >
          <MajorsQuestion
            school={state.school}
            programIds={state.programIds}
            programOptions={programOptions}
            onToggleProgram={toggleProgram}
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
        nextLabel="Continue to coursework"
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

  if (state.step === "coursework") {
    return (
      <OnboardingScreen
        {...chrome}
        question="Here's what we think you've taken."
        wide
        nextLabel="Continue to what you liked"
        hue="violetRose"
        // The only screen that raises the transcript toast, and so the only one
        // whose advance arrow would otherwise end up underneath it.
        hasPinnedToast
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

  if (state.step === "love") {
    return (
      <OnboardingScreen
        {...chrome}
        question="Which of these did you like?"
        wide
        hue="tealViolet"
        nextLabel="Continue to your interests"
      >
        <StepLove courses={state.courses} onSetLiked={setLiked} />
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
   * The last screen advances by leaving the flow, so it has no arrow — its two
   * ways out are the sign-in button and "take me to the catalog", both of which
   * live inside the card.
   */
  return (
    <OnboardingScreen
      onBack={back}
      direction={direction}
      question="Here's your first feed."
      wide
      hue="cyanViolet"
      lockViewport={session.account === null}
    >
      <StepFeed
        state={state}
        signedIn={session.account !== null}
        migration={migration}
        onFinish={finish}
      />
    </OnboardingScreen>
  );
}
