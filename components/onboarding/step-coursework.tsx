"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { guessDeckAction } from "@/app/onboarding/actions";
import type { GuessCandidate, GuessDeck, GuessFacts } from "@/lib/onboarding/guess";
import { loadGuessDeckCached, peekCachedGuessDeck } from "@/lib/onboarding/guess-cache";
import type { CourseHit, ResolvedCourse } from "@/lib/onboarding/server";
import {
  RERANK_BATCH_SIZE,
  type GuestCourse,
  type GuestOnboardingState,
} from "@/lib/onboarding/state";
import { sameIds, stabilizeStrip } from "@/lib/onboarding/stable-strip";
import { displayCourseTitle } from "@/lib/onboarding/course-title";
import { dismiss, toast } from "@/lib/toast/store";

import { AddChip, ChipWrap, RemovableChip } from "./chip";
import { CourseworkSkeleton } from "./coursework-skeleton";
import { CourseSearch } from "./course-search";
import { TranscriptImport } from "./transcript-import";

/**
 * "Here's what we think you've taken."
 *
 * ── The screen opens ANSWERED, not empty ────────────────────────────────────
 *
 * This is the one behavioural difference from every other screen in the flow.
 * A student arriving here does not build a list from nothing; they arrive with
 * our guesses already on their record as chips, and their job is to remove what
 * is wrong. Editing a wrong answer is a far cheaper act than producing a right
 * one from a blank field, and it is the difference between a student confirming
 * nine courses and a student confirming two and giving up.
 *
 * The pre-filled set is tier 1 from `lib/onboarding/guess.ts`: required by a
 * declared program, prerequisites satisfied by what is already confirmed, and
 * at or below the level their class year implies. Tier 1 is kept narrow
 * precisely because arriving pre-filled is a claim about someone's transcript
 * made on their behalf.
 *
 * ── The strip below is "and probably these too" ─────────────────────────────
 *
 * Tier 2 is the engine's answer to "given what is confirmed, what else has this
 * student almost certainly taken" — typical first-year schedules, prerequisite
 * implications, and requirement fit, not the general feed. Confirming a course
 * immediately adds its unambiguous prerequisites ("you took Intro if you took
 * Data Structures") from the deck payload. The strip itself stays pinned: a
 * tap removes that chip and appends a replacement at the end, rather than
 * reshuffling the row the student was still reading. A full re-rank waits
 * until a few confirmations have landed.
 *
 * ── Pre-filled means on the record, and removing removes ────────────────────
 *
 * Tier-1 chips are written into the guest state as soon as the deck lands,
 * because a chip that looks confirmed but has saved nothing is a lie that only
 * surfaces after the student walks away. `seenRef` stops that write from
 * looping within a visit; `dismissedCourseIds` stops a rebuilt deck from
 * resurrecting a removal across one.
 */

export interface StepCourseworkProps {
  state: GuestOnboardingState;
  /** `upsertCourse`, threaded in so this component holds no state logic. */
  addCourse: (course: GuestCourse) => void;
  addCourses: (courses: GuestCourse[]) => void;
  removeCourse: (courseId: string) => void;
  /** Bumped by the parent so the counter and the deck stay in step. */
  onConfirmationBatch: () => void;
}

/**
 * Maybe-taken chips under the pre-checked set. 24, not 12: a rising senior's
 * optional list is long, and a dozen looked like we ran out of ideas. Must stay
 * at or below the guess deck's own cap, or the extra slots are empty by
 * construction. 24 is the display ceiling; importing the cap from guess.ts
 * would pull the recommendation engine (and node:fs) into this client module.
 */
const STRIP_LIMIT = 24;

/** Coalesce rapid taps into one re-rank so the strip does not shuffle mid-aim. */
const RERANK_DEBOUNCE_MS = 180;

export function StepCoursework({
  state,
  addCourse,
  addCourses,
  removeCourse,
  onConfirmationBatch,
}: StepCourseworkProps) {
  const [deck, setDeck] = useState<GuessDeck | null>(() => peekCachedGuessDeck(state));
  const [error, setError] = useState<string | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  /*
   * The re-rank trigger. Incremented on first mount and after confirmations
   * (debounced). Implications of a tap apply locally and do not wait for this.
   */
  const [rerankToken, setRerankToken] = useState(0);
  const rerankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The chips currently on the maybe-strip, in the order the student last
   * saw them. Re-ranks append; they do not reorder. Empty until the first
   * deck lands, at which point `stabilizeStrip` fills from the pool.
   */
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  /**
   * Local copy of `confirmationsSinceRerank`. The store update is async and
   * rapid taps would otherwise all read `0` off `stateRef` and never trip
   * the batch.
   */
  const confirmsRef = useRef(state.confirmationsSinceRerank);

  /** Candidates already offered once, so auto-confirmation cannot loop. */
  const seenRef = useRef<Set<string>>(new Set());

  /**
   * True once the warm deck has been painted on this mount. The token-0 fetch
   * then skips — otherwise adding tier 1 would change the cache key and we
   * would immediately block on a second ranking pass.
   */
  const paintedWarmDeckRef = useRef(false);

  const confirmedIds = new Set(state.courses.map((course) => course.courseId));

  /*
   * `stateRef` rather than a dependency: the deck request needs the CURRENT
   * state, and the debounce below is what stops every tap from launching its
   * own fetch.
   */
  const stateRef = useRef(state);
  const addCoursesRef = useRef(addCourses);
  const deckRef = useRef(deck);

  /*
   * Both refs are written in an effect, not during render. A ref assigned
   * during render is a React rule violation — a discarded concurrent render
   * would leave the ref holding state that was never committed — and this
   * effect runs before the deck effect below on every commit, so the deck
   * request always sees the state that was just painted.
   */
  useEffect(() => {
    stateRef.current = state;
    addCoursesRef.current = addCourses;
    deckRef.current = deck;
  }, [state, addCourses, deck]);

  /* ── The transcript entrance ──────────────────────────────────────────────
   *
   * A toast rather than a tab or a step. Transcript upload is the SECONDARY
   * path by design — the guess-and-confirm flow is the base one — and giving it
   * equal billing as a third tab told every student that the real way to do
   * this was to go and find a PDF. As a toast it is an aside: offered once,
   * dismissible, and gone the moment they step off this screen.
   *
   * `dedupeKey` keeps a remount from stacking a second one; `duration: null`
   * pins it, because a student reading a list of course codes is not watching
   * for a five-second offer in the corner.
   */
  const transcriptToastRef = useRef<string | null>(null);

  useEffect(() => {
    const id = toast.info({
      title: "Took something we missed?",
      description: "Import your transcript and we'll read the course list off it.",
      duration: null,
      dedupeKey: "onboarding-transcript",
      action: { label: "Import transcript", onPress: () => setIsTranscriptOpen(true) },
    });
    transcriptToastRef.current = id;
    return () => {
      dismiss(id);
      transcriptToastRef.current = null;
    };
  }, []);

  /**
   * Retire the offer the moment the student adds a course by hand.
   *
   * A pinned toast is not a transient one: it holds the bottom of the viewport
   * for as long as it is up, and on this screen — the one screen long enough to
   * scroll — that means it sits over a row of the recommendation strip the
   * whole time. Reserving space below the column (`hasPinnedToast`) keeps the
   * advance arrow reachable, but padding cannot uncover content that is under
   * the card mid-scroll; only taking the card away can.
   *
   * Adding a course is the signal to take it away. A student who has just
   * added something from the strip or the search box has demonstrably found a
   * way to correct our guesses, which is the entire thing the toast was
   * offering to help with. Leaving it up after that is nagging, and it costs
   * them a row of suggestions to do it.
   */
  const retireTranscriptOffer = useCallback(() => {
    if (!transcriptToastRef.current) return;
    dismiss(transcriptToastRef.current);
    transcriptToastRef.current = null;
  }, []);

  /**
   * Write tier 1 onto the record. Same filter the async path uses, so a warm
   * deck and a fetched deck cannot disagree about what gets pre-checked.
   */
  const applyDeck = useCallback((next: GuessDeck) => {
    setError(null);
    setDeck(next);

    const alreadyConfirmed = new Set(stateRef.current.courses.map((course) => course.courseId));
    const dismissed = new Set(stateRef.current.dismissedCourseIds);
    const fresh = next.tier1.filter(
      (candidate) =>
        !seenRef.current.has(candidate.courseId) &&
        !alreadyConfirmed.has(candidate.courseId) &&
        !dismissed.has(candidate.courseId),
    );
    for (const candidate of [...next.tier1, ...next.tier2]) {
      seenRef.current.add(candidate.courseId);
    }
    if (fresh.length > 0) addCoursesRef.current(fresh.map(toGuestCourse));
  }, []);

  /*
   * Prefetch finishes during degree questions. Applying it here — before
   * paint — is why this screen should not sit on the skeleton after a
   * student who already answered school / major / year.
   */
  useLayoutEffect(() => {
    const cached = peekCachedGuessDeck(stateRef.current);
    if (!cached) return;
    paintedWarmDeckRef.current = true;
    applyDeck(cached);
  }, [applyDeck]);

  useEffect(() => {
    let active = true;
    if (rerankToken === 0 && paintedWarmDeckRef.current) return;

    startTransition(async () => {
      const result = await loadGuessDeckCached(stateRef.current, guessDeckAction);
      if (!active) return;

      if (!result.ok || !result.deck) {
        setError(result.error ?? "We could not work out what you have probably taken.");
        return;
      }

      applyDeck(result.deck);
    });

    return () => {
      active = false;
    };
  }, [applyDeck, rerankToken]);

  useEffect(() => {
    return () => {
      if (rerankTimer.current) clearTimeout(rerankTimer.current);
    };
  }, []);

  const scheduleRerank = useCallback(() => {
    if (rerankTimer.current) clearTimeout(rerankTimer.current);
    rerankTimer.current = setTimeout(() => {
      setRerankToken((token) => token + 1);
    }, RERANK_DEBOUNCE_MS);
  }, []);

  /**
   * Add one course from the strip or the search box.
   *
   * Unambiguous prerequisites land immediately — that is the "you took Intro
   * too" chip, and it does not need the engine. The remaining chips stay
   * where they are; a full re-rank waits until a few taps have landed so
   * the second course a student was aiming at is still there.
   */
  const confirm = useCallback(
    (course: GuestCourse) => {
      retireTranscriptOffer();
      addCourse(course);
      seenRef.current.add(course.courseId);

      const skip = new Set(stateRef.current.courses.map((row) => row.courseId));
      skip.add(course.courseId);
      for (const id of stateRef.current.dismissedCourseIds) skip.add(id);

      /*
       * `seenRef` is "already offered as a chip", not "already taken". Intro
       * often sits in the strip; confirming Data Structures should still
       * promote it onto the record immediately.
       */
      const implied = collectImplied(course.courseId, skip, deckRef.current?.impliesTaken);
      for (const facts of implied) seenRef.current.add(facts.courseId);
      if (implied.length > 0) addCoursesRef.current(implied.map(toGuestCourseFromFacts));

      onConfirmationBatch();
      confirmsRef.current += 1;
      if (confirmsRef.current >= RERANK_BATCH_SIZE) {
        confirmsRef.current = 0;
        scheduleRerank();
      }
    },
    [addCourse, onConfirmationBatch, retireTranscriptOffer, scheduleRerank],
  );

  /**
   * "I have not taken this." The chip leaves immediately, the id is
   * remembered so the next deck cannot resurrect it, and a replacement
   * is requested so the strip does not shrink.
   */
  const dismissSuggestion = useCallback(
    (courseId: string) => {
      seenRef.current.add(courseId);
      removeCourse(courseId);
      scheduleRerank();
    },
    [removeCourse, scheduleRerank],
  );

  /**
   * The strip: tier 2, minus anything already on the record or dismissed,
   * with currently-visible chips held in place. New ids append at the end.
   *
   * Tier 1 is deliberately absent — it is already up top as chips, and offering
   * it here as well would ask the same question twice on one screen.
   */
  const pool = useMemo(() => {
    const confirmed = new Set(state.courses.map((course) => course.courseId));
    const dismissed = new Set(state.dismissedCourseIds);
    return (deck?.tier2 ?? []).filter(
      (candidate) => !confirmed.has(candidate.courseId) && !dismissed.has(candidate.courseId),
    );
  }, [deck, state.courses, state.dismissedCourseIds]);

  const suggestions = useMemo(
    () => stabilizeStrip(pinnedIds, pool, STRIP_LIMIT),
    [pinnedIds, pool],
  );

  useEffect(() => {
    const next = suggestions.map((candidate) => candidate.courseId);
    setPinnedIds((current) => (sameIds(current, next) ? current : next));
  }, [suggestions]);

  const showSkeleton =
    !error &&
    (!deck ||
      (state.courses.length === 0 &&
        (deck.tier1.some((candidate) => !state.dismissedCourseIds.includes(candidate.courseId)) ??
          false)));

  return (
    <div className="flex flex-col gap-5">
      <p aria-live="polite" className="sr-only">
        {isPending ? "Updating our suggestions" : showSkeleton ? "Loading course suggestions" : "Suggestions up to date"}
      </p>

      <section className="flex flex-col gap-4">
        {showSkeleton ? <CourseworkSkeleton /> : null}

        {!showSkeleton && state.courses.length > 0 ? (
          <ChipWrap className="gap-1.5 sm:gap-2">
            {state.courses.map((course) => (
              <RemovableChip
                key={course.courseId}
                sublabel={course.title ? displayCourseTitle(course.title) : undefined}
                /*
                  The one place "we do not have this course" is stated. It is a
                  label, never a rejection: `student_courses.course_id` is
                  deliberately not a foreign key so transfer credit, AP credit and
                  archived terms are storable, and such rows are simply excluded
                  from similarity and requirement matching downstream.
                */
                note={course.inCatalog ? undefined : "not in our catalog"}
                onRemove={() => removeCourse(course.courseId)}
                removeLabel={`Remove ${course.code}${
                  course.title ? ` — ${displayCourseTitle(course.title)}` : ""
                }`}
              >
                {course.code}
              </RemovableChip>
            ))}
          </ChipWrap>
        ) : null}

        {error ? <p className="text-center text-body-regular text-text-secondary">{error}</p> : null}

        {!showSkeleton && suggestions.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-center text-caption-2-medium tracking-[0.08em] text-text-tertiary uppercase">
              Students with these usually have these too
            </h2>
            <ChipWrap className="gap-1.5 overflow-visible px-2.5 pt-2 sm:gap-2">
              {suggestions.map((candidate) => (
                <AddChip
                  key={candidate.courseId}
                  onPress={() => confirm(toGuestCourse(candidate))}
                  onDismiss={() => dismissSuggestion(candidate.courseId)}
                  sublabel={candidate.title ? displayCourseTitle(candidate.title) : undefined}
                  label={`Add ${candidate.code}${
                    candidate.title ? ` — ${displayCourseTitle(candidate.title)}` : ""
                  }`}
                  dismissLabel={`I have not taken ${candidate.code}${
                    candidate.title ? ` — ${displayCourseTitle(candidate.title)}` : ""
                  }`}
                >
                  {candidate.code}
                </AddChip>
              ))}
            </ChipWrap>
          </div>
        ) : null}
      </section>

      <CourseSearch
        confirmedIds={confirmedIds}
        onAdd={(hit: CourseHit) =>
          confirm({
            courseId: hit.courseId,
            code: hit.code,
            title: hit.title,
            termLabel: null,
            points: hit.points,
            liked: null,
            // Searched for by name — stronger evidence than a guess we made,
            // and the profile screen displays the difference.
            source: "picker",
            inCatalog: true,
          })
        }
      />

      {isTranscriptOpen ? (
        <TranscriptImport
          onClose={() => setIsTranscriptOpen(false)}
          onImport={(courses: ResolvedCourse[], candidates) => {
            const termByCourse = new Map(
              candidates.map((candidate) => [candidate.courseId, candidate.termLabel]),
            );
            addCourses(
              courses.map((course) => ({
                courseId: course.courseId,
                code: course.code,
                title: course.title,
                termLabel: termByCourse.get(course.courseId) ?? null,
                points: course.points,
                liked: null,
                source: "transcript_pdf" as const,
                // Carried through, never used to reject. A course our catalog
                // does not hold is transfer credit, AP credit or an archived
                // term — the coursework a student most needs recorded.
                inCatalog: course.inCatalog,
              })),
            );
          }}
        />
      ) : null}
    </div>
  );
}

/* ==========================================================================
 * Helpers
 * ========================================================================== */

function toGuestCourse(candidate: GuessCandidate): GuestCourse {
  return {
    courseId: candidate.courseId,
    code: candidate.code,
    title: candidate.title,
    termLabel: null,
    points: candidate.points,
    liked: null,
    source: "onboarding_guess",
    // Every deck candidate came out of the catalog or a program the catalog
    // resolves, so this is true by construction. Transcript rows are where
    // `false` actually happens.
    inCatalog: true,
  };
}

/**
 * Walk `impliesTaken` from the course they just ticked.
 *
 * The deck stores the full unambiguous chain on each key, but walking still
 * picks up hops that only live on a successor's own entry. Skip confirmed
 * and dismissed ids; do not skip "already shown in the strip".
 */
function collectImplied(
  courseId: string,
  skip: ReadonlySet<string>,
  impliesTaken: GuessDeck["impliesTaken"] | undefined,
): GuessFacts[] {
  if (!impliesTaken) return [];

  const out: GuessFacts[] = [];
  const seen = new Set(skip);
  const queue = [courseId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const facts of impliesTaken[current] ?? []) {
      if (seen.has(facts.courseId)) continue;
      seen.add(facts.courseId);
      out.push(facts);
      queue.push(facts.courseId);
    }
  }

  return out;
}

function toGuestCourseFromFacts(facts: GuessFacts): GuestCourse {
  return {
    courseId: facts.courseId,
    code: facts.code,
    title: facts.title,
    termLabel: null,
    points: facts.points,
    liked: null,
    source: "onboarding_guess",
    inCatalog: true,
  };
}
