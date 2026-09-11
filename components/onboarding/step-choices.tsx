"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { guessDeckAction } from "@/app/onboarding/actions";
import type {
  GuessChoice,
  GuessDeck,
  GuessFacts,
} from "@/lib/onboarding/guess";
import {
  loadGuessDeckCached,
  peekCachedGuessDeck,
} from "@/lib/onboarding/guess-cache";
import type { GuestCourse, GuestOnboardingState } from "@/lib/onboarding/state";

import { CourseChoices, choiceCourses, type AnsweredChoice } from "./course-choices";
import { CourseworkSkeleton } from "./coursework-skeleton";

/**
 * "Which of these classes have you already taken?"
 *
 * ── Why this is a screen of its own, and why it comes first ─────────────────
 *
 * These questions used to sit above the suggestion strip on the coursework
 * screen. Moving them to their own step ahead of it is not a layout
 * preference; it changes what the guess deck is able to compute.
 *
 * An answer here is worth far more than the chips it adds. It settles a
 * requirement group, so nothing downstream keeps offering the rails not taken.
 * It satisfies prerequisites, so courses the engine was
 * withholding as "you cannot have taken this yet" become reachable. And it
 * moves the level ceiling, because confirming a course is the evidence
 * `levelCeilingFor` uses. Asked on the same screen as the guesses, every one
 * of those effects arrived a beat too late: the deck the student was looking
 * at had already been built without the answer.
 *
 * Asked here, the coursework screen behind it is built from a record that
 * already knows which physics sequence they did — which is the difference
 * between guessing at a fork and reasoning past one.
 *
 * ── No re-rank, deliberately ───────────────────────────────────────────────
 *
 * The deck is fetched once. Answering a question filters it out of the list
 * locally, and nothing else on this screen depends on the ranking — there is
 * no strip to refill and no score to update, because the set of choose-one
 * groups is fixed by the student's declared programs and can only ever
 * SHRINK as they answer. Re-fetching between taps would buy nothing and
 * reintroduce exactly the mid-tap churn the strip had to be fixed for.
 */
export interface StepChoicesProps {
  state: GuestOnboardingState;
  addCourses: (courses: GuestCourse[]) => void;
  removeCourse: (courseId: string) => void;
  /**
   * There is nothing to ask this student. Fired once, after the deck has
   * landed — see the effect below for why "once" and "after" both matter.
   */
  onNothingToAsk: () => void;
}

export function StepChoices({
  state,
  addCourses,
  removeCourse,
  onNothingToAsk,
}: StepChoicesProps) {
  const [deck, setDeck] = useState<GuessDeck | null>(() =>
    peekCachedGuessDeck(state),
  );
  const [error, setError] = useState<string | null>(null);

  /*
   * `stateRef` rather than a dependency, matching `StepCoursework`: the deck
   * request needs the current state, and re-running it on every confirmation
   * is the churn this screen is written to avoid.
   */
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /*
   * The degree questions prefetch the deck, so in the common path it is
   * already in the cache and this screen paints answered rather than
   * skeletal. Same trick, and same reason, as the coursework screen.
   */
  const paintedWarmDeckRef = useRef(false);
  useLayoutEffect(() => {
    const cached = peekCachedGuessDeck(stateRef.current);
    if (!cached) return;
    paintedWarmDeckRef.current = true;
    setDeck(cached);
  }, []);

  useEffect(() => {
    if (paintedWarmDeckRef.current) return;
    let active = true;

    void (async () => {
      const result = await loadGuessDeckCached(
        stateRef.current,
        guessDeckAction,
      );
      if (!active) return;
      if (!result.ok || !result.deck) {
        setError(
          result.error ?? "We could not work out which of these you took.",
        );
        return;
      }
      setDeck(result.deck);
    })();

    return () => {
      active = false;
    };
  }, []);

  /*
   * Every group the deck asked about, annotated with what has been said.
   *
   * Nothing is filtered out. An answered question stays on the screen showing
   * its answer, so the student can see what they told us and change it — see
   * `CourseChoices` for why that is worth the extra height.
   *
   * This is why the deck is fetched once and never refreshed. `buildGuessDeck`
   * drops a group as soon as any of its courses is on the record, which is
   * right at BUILD time — a question already answered before the student got
   * here should not be asked — but re-running it after a tap would delete the
   * group the moment it was answered, taking the answer and the ability to
   * change it with it. The deck is the set of questions; this memo is the
   * set of answers.
   *
   * A course counts as ticked wherever it is on the record, not only when this
   * screen put it there. A student who found Lit Hum I through the search box
   * on a previous visit has already told us that, and showing the chip blank
   * would invite them to answer it twice.
   */
  const choices = useMemo<AnsweredChoice[]>(() => {
    const confirmed = new Set(state.courses.map((course) => course.courseId));
    const dismissed = new Set(state.dismissedCourseIds);
    return (deck?.choices ?? []).map((choice) => {
      const courses = choiceCourses(choice);
      const selectedCourseIds = courses
        .filter((facts) => confirmed.has(facts.courseId))
        .map((facts) => facts.courseId);
      return {
        choice,
        selectedCourseIds,
        // Declining is only the current answer while nothing is picked; a
        // course they ticked is the newer statement and outranks it.
        isDeclined:
          selectedCourseIds.length === 0 &&
          courses.length > 0 &&
          courses.every((facts) => dismissed.has(facts.courseId)),
      };
    });
  }, [deck, state.courses, state.dismissedCourseIds]);

  /**
   * Put one course on the record, or take it back off.
   *
   * `picker`, not `onboarding_guess`: they chose this one themselves, and the
   * profile screen shows the difference between our guess and their answer.
   *
   * ── Why nothing else is cleared ─────────────────────────────────────────
   *
   * The groups these come from are choose-ONE, and an earlier version of this
   * screen enforced that: picking a route wiped every sibling route first, so
   * tapping Contemporary Civilization after Literature Humanities read as a
   * correction rather than a second claim.
   *
   * That was the right behaviour for a button meaning "I did this whole
   * sequence", and the wrong one now that a button means "I took this class".
   * A student who took one term of Lit Hum and then switched to CC took those
   * courses; a screen that silently un-ticked the first one when they ticked
   * the second would be deleting a fact they had just reported. The choose-one
   * constraint belongs to the requirement, and `sequence_choice` still enforces
   * it in the audit — where the answer is "this requirement is not satisfied",
   * not "you did not take that class".
   *
   * Tapping a ticked course removes it, which is what the pressed state
   * promises. `removeCourse` files it under `dismissedCourseIds`, so the deck
   * on the next screen does not offer straight back what was just un-ticked.
   *
   * Implied prerequisites are NOT collected here, and that is not an omission.
   * The coursework screen rebuilds the deck from this new record, and
   * `impliedPrerequisites` runs inside `buildGuessDeck` — so anything this
   * answer implies arrives on the very next screen as tier 1, computed
   * server-side against the full prerequisite graph rather than against the
   * partial map this screen happens to be holding.
   */
  const toggleCourse = useCallback(
    (facts: GuessFacts) => {
      const confirmed = new Set(
        stateRef.current.courses.map((course) => course.courseId),
      );
      if (confirmed.has(facts.courseId)) {
        removeCourse(facts.courseId);
        return;
      }
      addCourses([
        {
          courseId: facts.courseId,
          code: facts.code,
          title: facts.title,
          termLabel: null,
          points: facts.points,
          liked: null,
          source: "picker" as const,
          inCatalog: true,
        },
      ]);
    },
    [addCourses, removeCourse],
  );

  /**
   * "None yet" — dismiss every course in the group, not just one.
   *
   * A student saying they have not done the Physics requirement has ruled out
   * all six of its courses, and recording one would leave the rest to come
   * back as suggestion chips on the screen after this one.
   */
  const declineChoice = useCallback(
    (choice: GuessChoice) => {
      for (const facts of choiceCourses(choice)) removeCourse(facts.courseId);
    },
    [removeCourse],
  );

  /*
   * Students with nothing to answer here must not see this screen at all.
   *
   * First-years are the whole population: `buildGuessDeck` will not ask a
   * student in week five which physics sequence they finished, so their deck
   * carries no choices and this screen would be a blank wall between two real
   * ones. The flow is told, and skips past in whichever direction the student
   * was already travelling.
   *
   * "Empty" needs no qualifying any more. Answering a question no longer
   * removes it, so the list only reaches zero by never having had anything in
   * it — an earlier version filtered answered groups out and had to latch on
   * "was it empty when it ARRIVED", or answering the last question would
   * auto-advance out from under the tap that answered it.
   */
  const hasAnnouncedRef = useRef(false);

  useEffect(() => {
    if (hasAnnouncedRef.current || choices.length > 0) return;
    // An error is not an empty deck. Skipping on a failed fetch would silently
    // drop questions the student did have, so the error is shown instead.
    if (!deck || error) return;
    hasAnnouncedRef.current = true;
    onNothingToAsk();
  }, [choices.length, deck, error, onNothingToAsk]);

  if (error) {
    return (
      <p className="text-center text-body-regular text-text-secondary">
        {error}
      </p>
    );
  }

  if (!deck) return <CourseworkSkeleton />;

  return (
    <div className="flex flex-col gap-5">
      <CourseChoices
        choices={choices}
        onToggle={toggleCourse}
        onDecline={declineChoice}
      />
    </div>
  );
}
