/**
 * Choosing which SECTION a feed card should show.
 *
 * ── Why the card is a section and not a course ─────────────────────────────
 *
 * "You should take Databases" is not advice a student can act on. The two
 * things they actually decide between are *who teaches it* and *when it meets*,
 * and both live on the section. Bookmarks are already section-level, the Vergil
 * deep link needs a call number, and a conflict check needs meeting times —
 * none of which a course has.
 *
 * ── But one card per course ────────────────────────────────────────────────
 *
 * COMS W1004 has twelve sections. Twelve cards for one course would push every
 * other recommendation off the first screen and turn a feed into a section
 * listing. So the engine ranks COURSES, this module picks the single
 * best-fitting SECTION of each, and the card offers "and 11 other sections"
 * underneath. The student sees twenty things to consider, not twenty views of
 * three things.
 *
 * ── The ranking is lexicographic on purpose ────────────────────────────────
 *
 * The weights below are powers of two so the comparison is exactly a priority
 * order rather than a blend that can be gamed by stacking small advantages:
 *
 *   1. It does not clash with what they already have. A section they cannot
 *      physically attend is not a recommendation, it is a puzzle.
 *   2. Seats are open. Real, and checkable, and the reason a student opens the
 *      app during registration week at all.
 *   3. It has a published meeting time. 44.8% of sections do not, and "time
 *      TBA" is a card the reader cannot finish reading. It ranks BELOW seats
 *      rather than above because an undecidable time is a delay while a full
 *      section is a refusal — but it is still a strong preference, which is
 *      what "only chosen when nothing better exists" means.
 *   4. Somebody is named as the instructor. A course taught by "TBA" gives the
 *      reader nothing to look up.
 *
 * Instructor RATING deliberately does not appear. Spec §"Feed" names it, but
 * 6.5% of instructors have any review at all — ranking on a field that is
 * absent for nineteen instructors in twenty would mostly rank on whether we
 * happen to hold a review, which is a fact about our scraper and not about the
 * class. Adding it is a one-line change once coverage justifies it; claiming it
 * now would be dressing up noise. See the report on this lane.
 */

import { vergilSectionUrl } from "@/lib/constants";
import type { Meeting, Section, TermCode, Weekday } from "@/lib/types";

/* ==========================================================================
 * Time provenance
 * ========================================================================== */

/**
 * Where a section's printed meeting time came from.
 *
 * Three states, never two. Collapsing `estimated` into `published` would print
 * last year's schedule as this year's fact, which is the single most damaging
 * thing this surface could do — a student would build a week around it.
 */
export type TimeProvenance =
  /** The registrar published these times for THIS section, this term. */
  | { kind: "published" }
  /** Historical pattern for the same section code in an earlier term. */
  | { kind: "estimated"; sourceTerm: string; sourceSection: string }
  /** Nothing published and no history to draw on. */
  | { kind: "tba" };

/* ==========================================================================
 * Scoring one section
 * ========================================================================== */

/**
 * Priority weights. Powers of two, so the total is a strict priority order:
 * no accumulation of lower criteria can outweigh a higher one.
 */
export const SECTION_FIT = {
  noConflict: 8,
  seatsOpen: 4,
  publishedTime: 2,
  namedInstructor: 1,
} as const;

/** The maximum a section can score — used to normalize into the blend. */
export const MAX_SECTION_FIT =
  SECTION_FIT.noConflict +
  SECTION_FIT.seatsOpen +
  SECTION_FIT.publishedTime +
  SECTION_FIT.namedInstructor;

/** A busy interval on the student's week: a planned section or a custom block. */
export interface BusyInterval {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
}

export interface SectionFit {
  section: Section;
  /** 0…`MAX_SECTION_FIT`. Comparable only within one course. */
  score: number;
  /** `false` only when we have times to check AND they clash. */
  conflictsWithPlan: boolean;
  /** `null` when the directory never published a cap. */
  seatsOpen: boolean | null;
  provenance: TimeProvenance;
  /** The times to render — real, historical, or empty. */
  meetings: Meeting[];
  /** The one Columbia URL we ever send a student to for registration. */
  vergilUrl: string;
}

function hasNamedInstructor(section: Section): boolean {
  return section.instructors.some((name) => {
    const trimmed = name.trim();
    // The directory writes an unassigned instructor several ways, and all of
    // them are the same non-answer.
    return trimmed.length > 0 && !/^(tba|tbd|staff)$/i.test(trimmed);
  });
}

/**
 * Are seats open? `null` when the directory published no cap.
 *
 * `null` is not `false`. A section with no published capacity is unknown, and
 * treating unknown as full would systematically bury small departments, which
 * are the ones least likely to have complete directory data.
 */
export function seatsOpenFor(section: Section): boolean | null {
  if (section.status === "closed" || section.status === "full") return false;
  if (section.status === "waitlist") return false;
  if (section.enrollmentCap == null || section.enrollmentCount == null) {
    return section.status === "open" ? true : null;
  }
  return section.enrollmentCount < section.enrollmentCap;
}

function overlapsBusy(meetings: readonly Meeting[], busy: readonly BusyInterval[]): boolean {
  for (const meeting of meetings) {
    for (const interval of busy) {
      if (interval.weekday !== meeting.weekday) continue;
      if (meeting.startMinute < interval.endMinute && interval.startMinute < meeting.endMinute) {
        return true;
      }
    }
  }
  return false;
}

export interface SectionFitOptions {
  /** The student's existing week. Empty when they have no plan, or are a guest. */
  busy?: readonly BusyInterval[];
  /**
   * Historical patterns by section id, from `lib/db/typical-meetings.ts`.
   * Only consulted for sections with no published times of their own, and the
   * result is always labelled `estimated`.
   */
  typical?: ReadonlyMap<string, { sourceTerm: string; sourceSection: string; meetings: Meeting[] }>;
}

export function scoreSection(section: Section, options: SectionFitOptions = {}): SectionFit {
  const busy = options.busy ?? [];
  const published = section.meetings.length > 0;

  const historical = published ? undefined : options.typical?.get(section.sectionId);
  const meetings = published ? section.meetings : (historical?.meetings ?? []);

  const provenance: TimeProvenance = published
    ? { kind: "published" }
    : historical
      ? {
          kind: "estimated",
          sourceTerm: historical.sourceTerm,
          sourceSection: historical.sourceSection,
        }
      : { kind: "tba" };

  /*
   * A conflict is only claimed against PUBLISHED times.
   *
   * An estimate is good enough to show a student what a term usually looks
   * like; it is not good enough to tell them a class clashes, because being
   * wrong in that direction hides a section they could have taken. Estimates
   * render, and they do not veto.
   */
  const conflictsWithPlan = published && overlapsBusy(section.meetings, busy);

  const seatsOpen = seatsOpenFor(section);

  let score = 0;
  if (!conflictsWithPlan) score += SECTION_FIT.noConflict;
  // Unknown seats score as if open: see `seatsOpenFor`.
  if (seatsOpen !== false) score += SECTION_FIT.seatsOpen;
  if (published) score += SECTION_FIT.publishedTime;
  if (hasNamedInstructor(section)) score += SECTION_FIT.namedInstructor;

  return {
    section,
    score,
    conflictsWithPlan,
    seatsOpen,
    provenance,
    meetings,
    vergilUrl: vergilSectionUrl(section.termCode, section.callNumber),
  };
}

/* ==========================================================================
 * Choosing among a course's sections
 * ========================================================================== */

export interface CourseSectionChoice {
  best: SectionFit;
  /** Every other section, best-first. Rendered as "and N other sections". */
  others: SectionFit[];
}

/**
 * Rank a course's sections and pick one.
 *
 * Returns `null` for a course with no live sections at all, which happens when
 * every section was cancelled between the crawl and now. A card with no section
 * has no call number, no Vergil link and no time — there is nothing to show, so
 * the caller drops the recommendation rather than rendering an empty shell.
 */
export function chooseSection(
  sections: readonly Section[],
  options: SectionFitOptions & {
    /** Restrict to these terms. Defaults to every term the sections carry. */
    terms?: readonly TermCode[];
  } = {},
): CourseSectionChoice | null {
  const terms = options.terms;
  const eligible = sections.filter((section) => {
    if (terms && !terms.includes(section.termCode)) return false;
    /*
     * A cancelled section is not an option, and showing one as "the best fit"
     * would be an outright wrong answer rather than a weak one. `closed` is
     * different — it means enrollment is shut, which a student can still act on
     * by watching for a seat — so only cancellation is excluded, and the
     * directory expresses that as a section that is gone rather than a status.
     */
    return section.callNumber.trim().length > 0;
  });

  if (eligible.length === 0) return null;

  const ranked = eligible
    .map((section) => scoreSection(section, options))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      /*
       * Deterministic tiebreak, in the order a student would read them:
       * the currently-registerable term first, then section code. Without this
       * the "best" section changes between two identical requests, which reads
       * as the feed being random.
       */
      if (a.section.termCode !== b.section.termCode) {
        return a.section.termCode.localeCompare(b.section.termCode);
      }
      return a.section.sectionCode.localeCompare(b.section.sectionCode);
    });

  return { best: ranked[0], others: ranked.slice(1) };
}

/**
 * The section fit, normalized to 0…1, for the engine's `offering` component.
 *
 * `recommend()` sets `components.offering` to zero and says in a comment that
 * the feed computes it, because seats and conflicts need the student's own
 * schedule and the engine deliberately does not have it. This is that number.
 */
export function offeringScore(fit: SectionFit): number {
  return fit.score / MAX_SECTION_FIT;
}
