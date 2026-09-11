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

import { RiUploadCloud2Line } from "@remixicon/react";
import { cx } from "@/utils/cx";
import { guessDeckAction } from "@/app/onboarding/actions";
import type {
  GuessCandidate,
  GuessDeck,
  GuessFacts,
} from "@/lib/onboarding/guess";
import {
  loadGuessDeckCached,
  peekCachedGuessDeck,
} from "@/lib/onboarding/guess-cache";
import type { CourseHit } from "@/lib/onboarding/server";
import { toGuestCourses } from "@/lib/onboarding/transcript";
import {
  degreeSignature,
  RERANK_BATCH_SIZE,
  type GuestCourse,
  type GuestOnboardingState,
  type OnboardingCourseSource,
} from "@/lib/onboarding/state";
import { sameIds, stabilizeStrip } from "@/lib/onboarding/stable-strip";

import { AddChip, ChipWrap, RemovableChip, courseChipLines } from "./chip";
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
 * Maybe-taken chips under the pre-checked set. Eight, not twenty-four: the
 * search box is the way to add anything we missed, and a long strip pushed it
 * off the first screen. Must stay at or below the guess deck's own cap.
 */
const STRIP_LIMIT = 8;


/** Coalesce rapid taps into one re-rank so the strip does not shuffle mid-aim. */
const RERANK_DEBOUNCE_MS = 180;

export function StepCoursework({
  state,
  addCourse,
  addCourses,
  removeCourse,
  onConfirmationBatch,
}: StepCourseworkProps) {
  const [deck, setDeck] = useState<GuessDeck | null>(() =>
    peekCachedGuessDeck(state),
  );
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
   * How many candidates are left in the local reserve. Read by
   * `dismissSuggestion` to decide whether a dismissal needs the server at
   * all; written in an effect below, alongside the other render-lagging refs.
   */
  const poolSizeRef = useRef(0);

  /**
   * True once the warm deck has been painted on this mount. The token-0 fetch
   * then skips — otherwise adding tier 1 would change the cache key and we
   * would immediately block on a second ranking pass.
   */
  const paintedWarmDeckRef = useRef(false);

  /**
   * The degree the deck on screen was built for.
   *
   * `null` until a deck lands. After that it is the answer to "is what the
   * student is looking at still a claim we would make?", and the effect below
   * rebuilds when it stops being one.
   *
   * Recorded from the client's own state rather than stamped onto the deck by
   * the server, because the two can only disagree if the server forgets — and a
   * guard that silently stops guarding is worse than no guard. `applyDeck`
   * reads the same `stateRef` the request was built from, so this is the degree
   * the deck actually answers.
   */
  const deckSignatureRef = useRef<string | null>(null);

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

  /**
   * Write tier 1 onto the record. Same filter the async path uses, so a warm
   * deck and a fetched deck cannot disagree about what gets pre-checked.
   */
  const applyDeck = useCallback((next: GuessDeck) => {
    setError(null);
    setDeck(next);
    deckSignatureRef.current = degreeSignature(stateRef.current);

    const alreadyConfirmed = new Set(
      stateRef.current.courses.map((course) => course.courseId),
    );
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
    if (fresh.length > 0) {
      // Our claim, not theirs: nobody has looked at this screen yet.
      addCoursesRef.current(fresh.map((c) => toGuestCourse(c, "onboarding_guess")));
    }
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
      const result = await loadGuessDeckCached(
        stateRef.current,
        guessDeckAction,
      );
      if (!active) return;

      if (!result.ok || !result.deck) {
        setError(
          result.error ?? "We could not work out what you have probably taken.",
        );
        return;
      }

      applyDeck(result.deck);
    });

    return () => {
      active = false;
    };
  }, [applyDeck, rerankToken]);

  /**
   * Rebuild when the deck on screen answers a degree the student no longer has.
   *
   * `updateDegree` in the flow already funnels every degree write through
   * `reconcileDegreeChange`, and stepping back to a degree question unmounts
   * this screen — so on today's routes this effect does not fire. It is here
   * for the route that does not exist yet.
   *
   * The funnel's own comment warns that "a fifth degree control added later
   * that calls `updateOnboardingState` directly would silently reintroduce the
   * stale 'here's what we think you've taken' screen". That is a real hazard
   * with no compiler behind it: the failure is silent, it looks like nothing
   * happened, and it is the exact bug this file was last fixed for. Comparing
   * signatures is the check that does not depend on remembering the rule.
   *
   * It keys on the DEGREE, never on the record, so confirming a course cannot
   * trip it — that path is paced by `RERANK_BATCH_SIZE` and must stay that way.
   */
  useEffect(() => {
    const applied = deckSignatureRef.current;
    if (applied === null || applied === degreeSignature(state)) return;
    // Stale. Take it off screen before the rebuild lands: continuing to show a
    // list built from the old major, with the old major's chips pre-checked, is
    // what made this look like nothing had happened.
    deckSignatureRef.current = null;
    paintedWarmDeckRef.current = false;
    setRerankToken((token) => token + 1);
  }, [state]);

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
      const implied = collectImplied(
        course.courseId,
        skip,
        deckRef.current?.impliesTaken,
      );
      for (const facts of implied) seenRef.current.add(facts.courseId);
      if (implied.length > 0)
        addCoursesRef.current(implied.map(toGuestCourseFromFacts));

      onConfirmationBatch();
      confirmsRef.current += 1;
      if (confirmsRef.current >= RERANK_BATCH_SIZE) {
        confirmsRef.current = 0;
        scheduleRerank();
      }
    },
    [addCourse, onConfirmationBatch, scheduleRerank],
  );

  /**
   * "I have not taken this." The chip leaves immediately and the id is
   * remembered so the next deck cannot resurrect it.
   *
   * No re-rank, in the ordinary case. `DEFAULT_TIER_LIMIT` is 48 against a
   * strip of 8 precisely so a dismissal refills from the reserve already in
   * memory — `stabilizeStrip` drops the dismissed id and appends the next
   * candidate in the same render. Asking the server as well bought nothing
   * and cost the student a SECOND layout shift a fifth of a second after the
   * first, which reads as the screen twitching rather than as an answer to
   * the tap. The round trip is worth making only once the reserve is nearly
   * spent, which is what the test below is.
   *
   * `+ 1` because `poolSizeRef` is a render behind: it holds the pool as it
   * was before this dismissal removed one from it.
   */
  const dismissSuggestion = useCallback(
    (courseId: string) => {
      seenRef.current.add(courseId);
      removeCourse(courseId);
      if (poolSizeRef.current <= STRIP_LIMIT + 1) scheduleRerank();
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
      (candidate) =>
        !confirmed.has(candidate.courseId) &&
        !dismissed.has(candidate.courseId),
    );
  }, [deck, state.courses, state.dismissedCourseIds]);

  const suggestions = useMemo(
    () => stabilizeStrip(pinnedIds, pool, STRIP_LIMIT),
    [pinnedIds, pool],
  );

  useEffect(() => {
    poolSizeRef.current = pool.length;
  }, [pool]);

  useEffect(() => {
    const next = suggestions.map((candidate) => candidate.courseId);
    setPinnedIds((current) => (sameIds(current, next) ? current : next));
  }, [suggestions]);

  const showSkeleton =
    !error &&
    (!deck ||
      (state.courses.length === 0 &&
        (deck.tier1.some(
          (candidate) => !state.dismissedCourseIds.includes(candidate.courseId),
        ) ??
          false)));

  return (
    <div className="flex flex-col gap-5">
      <p aria-live="polite" className="sr-only">
        {isPending
          ? "Updating our suggestions"
          : showSkeleton
            ? "Loading course suggestions"
            : "Suggestions up to date"}
      </p>

      <section className="flex flex-col gap-4">
        {showSkeleton ? <CourseworkSkeleton /> : null}

        {/*
          ── Why this list is NOT capped ──────────────────────────────────

          It sits above the search box and the maybe-strip, so every row it
          gains pushes both down the page — and a student confirming their way
          through a junior year adds twenty-odd chips, roughly every third one
          starting a new row. That is a real cost, and it is why this block
          spent a while inside a fixed-height scroller.

          The scroller was the wrong trade. This is the student's own record on
          a screen whose entire job is asking them to check it, and a record
          you have to scroll a nested box to read is one you will not read. It
          hid most of the answer to the question the heading asks, to buy
          stability in a strip further down. Seeing everything is the product;
          the strip staying still is a nicety.

          So it renders at its natural height and the PAGE scrolls, which is
          the scroll a phone user already expects. A long record is long — that
          is what a long record looks like.

          Moving the block below the strip would fix the push by construction
          and is still not taken: "what we think you have taken" is the claim
          the screen is making, and burying the claim under the things that ask
          for more inverts the screen.
        */}
        {!showSkeleton && state.courses.length > 0 ? (
          <ChipWrap className="gap-1.5 overflow-visible px-2.5 pt-2 sm:gap-2">
            {state.courses.map((course) => {
              const lines = courseChipLines(course.code, course.title);
              return (
                <RemovableChip
                  key={course.courseId}
                  sublabel={lines.sublabel}
                  /*
                    The one place "we do not have this course" is stated. It is
                    a label, never a rejection: `student_courses.course_id` is
                    deliberately not a foreign key so transfer credit, AP credit
                    and archived terms are storable, and such rows are simply
                    excluded from similarity and requirement matching downstream.
                  */
                  note={course.inCatalog ? undefined : "not in our catalog"}
                  onRemove={() => removeCourse(course.courseId)}
                  removeLabel={`Remove ${lines.label}${
                    lines.sublabel ? ` — ${lines.sublabel}` : ""
                  }`}
                >
                  {lines.label}
                </RemovableChip>
              );
            })}
          </ChipWrap>
        ) : null}

        {error ? (
          <p className="text-center text-body-regular text-text-secondary">
            {error}
          </p>
        ) : null}

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

        {!showSkeleton && suggestions.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="text-center text-caption-2-medium tracking-[0.08em] text-text-tertiary uppercase">
              Students with these usually have these too
            </h2>
            <ChipWrap className="gap-1.5 overflow-visible px-2.5 pt-2 sm:gap-2">
              {suggestions.map((candidate) => {
                const lines = courseChipLines(candidate.code, candidate.title);
                return (
                  <AddChip
                    key={candidate.courseId}
                    onPress={() => confirm(toGuestCourse(candidate, "onboarding_confirm"))}
                    onDismiss={() => dismissSuggestion(candidate.courseId)}
                    sublabel={lines.sublabel}
                    label={`Add ${lines.label}${
                      lines.sublabel ? ` — ${lines.sublabel}` : ""
                    }`}
                    dismissLabel={`I have not taken ${lines.label}${
                      lines.sublabel ? ` — ${lines.sublabel}` : ""
                    }`}
                  >
                    {lines.label}
                  </AddChip>
                );
              })}
            </ChipWrap>
          </div>
        ) : null}
        {/*
          ── The transcript entrance ─────────────────────────────────────

          Transcript upload is the SECONDARY path by design — guess-and-confirm
          is the base one — and it spent a while as a pinned toast to say so.
          Two things were wrong with that. A pinned toast holds the bottom of
          the viewport, so on the one screen long enough to scroll it sat over
          a row of the strip for as long as it was up. And it RETIRED itself
          the moment a student added a course by hand, on the theory that
          someone correcting our guesses had found their own way and was being
          nagged.

          That theory had it backwards. Adding one course by hand is the moment
          a student discovers how much we missed, which is exactly when they
          want the transcript — and it was the moment the offer disappeared. A
          student who then remembers eight more courses has no way back to it
          short of reloading the screen.

          So it lives in the column instead: always present, never covering
          anything, at the end of the two things it is an alternative to. Quiet
          styling rather than a primary button, because it is still the
          secondary path — perpetually available is not the same as loud.
        */}
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <p className="text-caption-1-regular text-text-tertiary">
            Took something we missed?
          </p>
          <button
            type="button"
            onClick={() => setIsTranscriptOpen(true)}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-border-button-default px-4 py-2 text-body-medium text-text-secondary transition-colors outline-none hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring pointer-coarse:py-2.5"
          >
            <RiUploadCloud2Line className="size-4 shrink-0" aria-hidden />
            Import transcript
          </button>
        </div>
      </section>

      {isTranscriptOpen ? (
        <TranscriptImport
          onClose={() => setIsTranscriptOpen(false)}
          onImport={(courses, candidates) => addCourses(toGuestCourses(courses, candidates))}
        />
      ) : null}
    </div>
  );
}

/* ==========================================================================
 * Helpers
 * ========================================================================== */

/**
 * A deck candidate as a record row.
 *
 * `source` is a parameter rather than a constant because the same candidate
 * means two different things depending on who put it on the record. Arriving
 * pre-checked is `onboarding_guess` — our claim, retired when the degree
 * answers it was made from change. Being pressed in the strip is
 * `onboarding_confirm` — the student's claim, which survives. See
 * `ONBOARDING_COURSE_SOURCES` and migration 0036.
 */
function toGuestCourse(
  candidate: GuessCandidate,
  source: OnboardingCourseSource,
): GuestCourse {
  return {
    courseId: candidate.courseId,
    code: candidate.code,
    title: candidate.title,
    termLabel: null,
    points: candidate.points,
    liked: null,
    source,
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
