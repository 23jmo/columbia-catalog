"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { useSessionAccount } from "@/hooks/use-session-account";
import {
  completeOnboardingAction,
  migrateGuestStateAction,
} from "@/app/onboarding/actions";
import {
  advance,
  canAdvance,
  goBack,
  RERANK_BATCH_SIZE,
  removeCourse as removeCourseFrom,
  setLiked as setLikedIn,
  upsertCourse,
  type GuestCourse,
  type GuestOnboardingState,
} from "@/lib/onboarding/state";
import {
  ensureOnboardingHydrated,
  getOnboardingServerSnapshot,
  getOnboardingSnapshot,
  markOnboardingMigrated,
  subscribeOnboarding,
  updateOnboardingState,
} from "@/lib/onboarding/store";
import type { School } from "@/lib/requirements/types";

import { OnboardingScreen } from "./screen";
import { StepCoursework } from "./step-coursework";
import {
  ClassYearQuestion,
  ProgramsQuestion,
  SchoolQuestion,
  electableProgramsFor,
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

/** The three questions inside the `school` step, in order. */
const DEGREE_QUESTIONS = ["school", "classYear", "programs"] as const;
type DegreeQuestion = (typeof DEGREE_QUESTIONS)[number];

/**
 * Where a student resumes the degree questions: the first one they have not
 * answered.
 *
 * Derived from the answers rather than persisted, so it needs no field in the
 * guest state and no migration. The trade is that answering a question would
 * otherwise move the screen — see `answerDegree` below, which pins it.
 */
function resumeQuestion(state: GuestOnboardingState): DegreeQuestion {
  if (state.programIds.length > 0 || state.classYear) return "programs";
  if (state.school) return "classYear";
  return "school";
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
   * Which of the three degree questions is on screen.
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
   * "What are you studying?" is dropped entirely when the registry has nothing
   * to offer — a General Studies or Barnard student, today. Asking a question
   * whose only honest answer is an apology is worse than not asking it: it
   * costs a screen, it reads as a dead end, and the student cannot tell whether
   * they have done something wrong. The limitation is stated on the school
   * screen instead, where the choice that caused it was made.
   *
   * Derived from the same `electableProgramsFor` the screen itself renders, so
   * the question we skip is by construction the question that would have been
   * empty — and it comes back on its own the day someone transcribes a GS
   * program.
   */
  const degreeQuestions = useMemo<readonly DegreeQuestion[]>(() => {
    const hasProgramsToOffer =
      electableProgramsFor(state.school, programOptions, state.programIds).length > 0;
    return hasProgramsToOffer
      ? DEGREE_QUESTIONS
      : DEGREE_QUESTIONS.filter((question) => question !== "programs");
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
  const resumed = visitedQuestion ?? resumeQuestion(state);
  const degreeQuestion = degreeQuestions.includes(resumed)
    ? resumed
    : degreeQuestions[degreeQuestions.length - 1];

  // Consulting storage is a store operation, not a state update, so it is safe
  // in an effect: the store notifies its subscribers and React re-reads the
  // snapshot rather than scheduling a second render of stale state.
  useEffect(() => {
    ensureOnboardingHydrated();
  }, []);

  /* ── Guest → account ──────────────────────────────────────────────────── */

  const migrationRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || session.isLoading || !session.account) return;
    if (migrationRef.current) return;
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
   * One student confirmation, for the re-rank batch counter.
   *
   * Rolls over to zero on a batch boundary. The coursework screen reads the
   * same constant and fires its re-rank on the same tick, so the counter and
   * the strip cannot drift apart.
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

  /**
   * Forward: through the degree questions first, then through the step machine.
   */
  const forward = () => {
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
   */
  const finish = async () => {
    await completeOnboardingAction();
    router.push("/");
    router.refresh();
  };

  /* ── Render ───────────────────────────────────────────────────────────── */

  const chrome = { onBack: isFirstScreen ? undefined : back, onNext: forward };

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
        nextLabel={
          degreeQuestions.includes("programs") ? "Continue to programs" : "Continue to coursework"
        }
      >
          <ClassYearQuestion
            classYear={state.classYear}
            onChange={(classYear) => answerDegree("classYear", { classYear })}
          />
        </OnboardingScreen>
      );
    }

    return (
      <OnboardingScreen
        {...chrome}
        question="What are you studying?"
        wide
        hue="cyanRose"
        nextLabel="Continue to coursework"
      >
        <ProgramsQuestion
          school={state.school}
          programIds={state.programIds}
          programOptions={programOptions}
          onToggleProgram={(programId) =>
            updateOnboardingState((current) => ({
              ...current,
              programIds: current.programIds.includes(programId)
                ? current.programIds.filter((id) => id !== programId)
                : [...current.programIds, programId],
              updatedAt: new Date().toISOString(),
            }))
          }
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
          programIds={state.programIds}
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
    <OnboardingScreen onBack={back} question="Here's your first feed." wide hue="cyanViolet">
      <StepFeed
        state={state}
        signedIn={session.account !== null}
        migration={migration}
        onFinish={finish}
      />
    </OnboardingScreen>
  );
}
