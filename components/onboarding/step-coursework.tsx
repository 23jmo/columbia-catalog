"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { RiLoader4Line } from "@remixicon/react";

import { guessDeckAction } from "@/app/onboarding/actions";
/*
 * Type-only imports from `guess.ts` and `server.ts`, and a VALUE import only
 * from `state.ts`.
 *
 * That split is load-bearing, not stylistic. `guess.ts` imports the
 * recommendation engine and `server.ts` imports the Supabase client and the
 * catalog; a value import of either from this client component would pull both
 * into the browser bundle. `import type` is erased entirely, and the one
 * constant this file genuinely needs at runtime — the re-rank batch size —
 * lives in `state.ts`, which imports nothing heavier than `zod`.
 */
import type { GuessCandidate, GuessDeck } from "@/lib/onboarding/guess";
import type { CourseHit, ResolvedCourse } from "@/lib/onboarding/server";
import type { GuestCourse, GuestOnboardingState } from "@/lib/onboarding/state";
import { displayCourseTitle } from "@/lib/onboarding/course-title";
import { shouldRerank } from "@/lib/onboarding/state";
import { dismiss, toast } from "@/lib/toast/store";

import { AddChip, ChipWrap, RemovableChip } from "./chip";
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
 * student almost certainly taken" — prerequisite implications and requirement
 * fit, not the general feed. It re-ranks as courses are added, from either the
 * strip or the search box.
 *
 * ── Why re-ranking is batched ───────────────────────────────────────────────
 *
 * Every fourth confirmation (`RERANK_BATCH_SIZE`), never on every tap.
 * Re-ranking per tap reshuffles the strip between the moment a student aims at
 * a chip and the moment their finger lands, so they add the wrong course — and
 * after that happens twice they stop trusting the screen. The counter lives in
 * the guest state, so it survives stepping back.
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

/** Enough to fill the strip without turning it into a wall of pills. */
const STRIP_LIMIT = 12;

export function StepCoursework({
  state,
  addCourse,
  addCourses,
  removeCourse,
  onConfirmationBatch,
}: StepCourseworkProps) {
  const [deck, setDeck] = useState<GuessDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  /*
   * The re-rank trigger. Incremented on a batch boundary and on first mount;
   * the deck effect depends on it and on nothing else, so a confirmation
   * between boundaries cannot trigger a fetch.
   */
  const [rerankToken, setRerankToken] = useState(0);

  /** Candidates already offered once, so auto-confirmation cannot loop. */
  const seenRef = useRef<Set<string>>(new Set());

  const confirmedIds = new Set(state.courses.map((course) => course.courseId));

  /*
   * `stateRef` rather than a dependency: the deck request needs the CURRENT
   * state, but re-running the effect whenever the state changes would defeat
   * the batching this whole screen is built around.
   */
  const stateRef = useRef(state);
  const addCoursesRef = useRef(addCourses);

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
  }, [state, addCourses]);

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

  useEffect(() => {
    let active = true;

    startTransition(async () => {
      const result = await guessDeckAction(stateRef.current);
      if (!active) return;

      if (!result.ok || !result.deck) {
        setError(result.error ?? "We could not work out what you have probably taken.");
        return;
      }

      setError(null);
      setDeck(result.deck);

      /*
       * Pre-fill tier 1 by actually recording it — but only candidates that are
       * new to this deck AND have not been removed.
       *
       * `seenRef` is per-mount, so it alone only stops a re-rank inside one
       * visit from resurrecting a removal. `dismissedCourseIds` lives in the
       * guest state and so survives stepping forward and back, which is the
       * case that actually bites: this screen remounts, builds a fresh deck,
       * and would otherwise re-add every correction the student made.
       */
      const alreadyConfirmed = new Set(
        stateRef.current.courses.map((course) => course.courseId),
      );
      const dismissed = new Set(stateRef.current.dismissedCourseIds);
      const fresh = result.deck.tier1.filter(
        (candidate) =>
          !seenRef.current.has(candidate.courseId) &&
          !alreadyConfirmed.has(candidate.courseId) &&
          !dismissed.has(candidate.courseId),
      );
      for (const candidate of [...result.deck.tier1, ...result.deck.tier2]) {
        seenRef.current.add(candidate.courseId);
      }
      if (fresh.length > 0) addCoursesRef.current(fresh.map(toGuestCourse));
    });

    return () => {
      active = false;
    };
  }, [rerankToken]);

  /**
   * Add one course from the strip or the search box.
   *
   * The batch counter advances only on an ADDITION. Removing is a correction,
   * and making a correction bring the re-rank forward would mean the strip
   * reshuffles hardest exactly when the student is telling us we got it wrong.
   */
  const confirm = useCallback(
    (course: GuestCourse) => {
      retireTranscriptOffer();
      addCourse(course);
      onConfirmationBatch();
      if (shouldRerank(stateRef.current.confirmationsSinceRerank + 1)) {
        setRerankToken((token) => token + 1);
      }
    },
    [addCourse, onConfirmationBatch, retireTranscriptOffer],
  );

  /**
   * The strip: tier 2, minus anything already on the record.
   *
   * Tier 1 is deliberately absent — it is already up top as chips, and offering
   * it here as well would ask the same question twice on one screen.
   */
  const suggestions = (deck?.tier2 ?? [])
    .filter((candidate) => !confirmedIds.has(candidate.courseId))
    .slice(0, STRIP_LIMIT);

  return (
    <div className="flex flex-col gap-9">
      <p aria-live="polite" className="sr-only">
        {isPending ? "Updating our suggestions" : "Suggestions up to date"}
      </p>

      {/* ── On your record ──────────────────────────────────────────────── */}
      {state.courses.length > 0 ? (
        <ChipWrap>
          {state.courses.map((course) => (
            <RemovableChip
              key={course.courseId}
              /*
                The one place "we do not have this course" is stated. It is a
                label, never a rejection: `student_courses.course_id` is
                deliberately not a foreign key so transfer credit, AP credit and
                archived terms are storable, and such rows are simply excluded
                from similarity and requirement matching downstream.
              */
              note={course.inCatalog ? undefined : "not in our catalog"}
              onRemove={() => removeCourse(course.courseId)}
              removeLabel={`Remove ${course.code}`}
            >
              {course.code}
            </RemovableChip>
          ))}
        </ChipWrap>
      ) : null}

      {!deck && !error ? (
        <p className="flex items-center justify-center gap-2 text-body-regular text-text-secondary">
          <RiLoader4Line className="size-4 animate-spin" aria-hidden />
          Working out what you have probably taken…
        </p>
      ) : null}

      {error ? <p className="text-center text-body-regular text-text-secondary">{error}</p> : null}

      {/* ── And probably these ──────────────────────────────────────────── */}
      {suggestions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-center text-caption-2-medium tracking-[0.08em] text-text-tertiary uppercase">
            Students with these usually have these too
          </h2>
          <ChipWrap>
            {suggestions.map((candidate) => (
              <AddChip
                key={candidate.courseId}
                onPress={() => confirm(toGuestCourse(candidate))}
                sublabel={candidate.title ? displayCourseTitle(candidate.title) : undefined}
                label={`Add ${candidate.code}${
                  candidate.title ? ` — ${displayCourseTitle(candidate.title)}` : ""
                }`}
              >
                {candidate.code}
              </AddChip>
            ))}
          </ChipWrap>
        </section>
      ) : null}

      {/* ── The secondary path ──────────────────────────────────────────── */}
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
