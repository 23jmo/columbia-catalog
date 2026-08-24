/**
 * Recommended courses.
 *
 * The claim this module makes is narrow on purpose: **"this course is offered
 * next term and it satisfies a requirement you have not finished."** That is a
 * fact about the catalog and the audit, and it is verifiable. It is not a
 * prediction about whether the student will enjoy it.
 *
 * ── Why not a taste model ───────────────────────────────────────────────────
 *
 * The obvious next step is to rank by embedding similarity to courses the
 * student liked. Two things stop that from being v1:
 *
 *   1. **We do not know what they liked.** The profile holds courses taken, not
 *      courses rated. Similarity to a course someone was *required* to take is
 *      not a signal of preference — a student who suffered through Frontiers of
 *      Science does not want more Frontiers of Science.
 *   2. **Reputation is not loaded yet.** Spec §12's dimensions come from CULPA
 *      and Reddit, and the CULPA feed is an open partnership question (§22).
 *      `ReputationSummary` is null for essentially every course today.
 *
 * So ranking uses only signals that exist and mean something now: does it fit
 * the schedule, can you actually get a seat, and how much of your remaining
 * requirement does it clear. When reputation lands, `score` is the one function
 * to change.
 *
 * ── Everything here is a pure function over data the caller supplies ────────
 *
 * No I/O, no database. The caller passes the candidate offerings; this ranks
 * them. That keeps it usable from the MCP `check_requirements` tool as well as
 * from the profile screen.
 */

import type { CourseId } from "@/lib/requirements/code";
import type { Verification } from "@/lib/requirements/types";
import type { RemainingRequirement } from "./audit";

/**
 * A course being offered, reduced to what ranking needs.
 *
 * A local interface rather than `CourseWithSections` from `@/lib/types`, so
 * this module does not care where the offering came from and stays testable
 * with three lines of fixture.
 */
export interface Offering {
  courseId: CourseId;
  code: string;
  title: string;
  points: number | null;
  /** Across all sections. Null when the directory has not published seats. */
  seatsOpen: number | null;
  seatsTotal: number | null;
  /** True when every section collides with the student's primary plan. */
  conflictsWithPlan: boolean;
  /** True when at least one section triggers a cross-campus commute warning. */
  commuteWarning: boolean;
  /** The directory's own "as of" for the seat numbers. Travels to the UI. */
  seatsAsOf: string | null;
}

export interface Recommendation {
  offering: Offering;
  /** The requirement this clears. */
  requirement: {
    programId: string;
    programName: string;
    groupId: string;
    label: string;
    verification: Verification;
  };
  score: number;
  /** Human-readable, shown on the card. Never a bare number. */
  reasons: string[];
}

export interface RecommendOptions {
  remaining: RemainingRequirement[];
  offerings: Offering[];
  /** Course ids already taken or planned — never recommend one of these. */
  excludeCourseIds: Iterable<CourseId>;
  limit?: number;
}

/**
 * Score one candidate.
 *
 * Weights are deliberately coarse. This is a ranking over a handful of courses
 * a student will read individually, not a retrieval problem, and a finely tuned
 * score would imply a precision the inputs do not have.
 */
function score(offering: Offering, requirement: RemainingRequirement): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let value = 0;

  /*
   * The whole point: it clears something. No reason string — the card prints
   * the requirement it would clear, and its program, on its own line directly
   * under the title. "Counts toward Probability / Statistics" three millimetres
   * above "Probability / Statistics · Computer Science" is the same sentence
   * twice, and it pushed the reasons row past the point where anyone reads it.
   */
  value += 100;

  /*
   * A named candidate outranks a flag match.
   *
   * "The Bulletin lists this exact course" is a stronger claim than "this
   * course carries the Global Core flag", and the ordering should reflect which
   * claim we are making — see the verification tiers in
   * `lib/requirements/types.ts`.
   */
  // No reason string: the verification chip on the card already says this, in
  // the same words, two lines up.
  if (requirement.verification === "exact") {
    value += 30;
  }

  // A requirement one course from done is worth more than one five courses out.
  if (requirement.outstanding === 1) {
    value += 25;
    reasons.push("Finishes the requirement");
  }

  if (offering.conflictsWithPlan) {
    // Not excluded — a student may well drop something for this. But it goes
    // below everything that fits, and the card says why.
    value -= 60;
    reasons.push("Clashes with your current schedule");
  }

  if (offering.commuteWarning) {
    value -= 15;
    reasons.push("Cross-campus travel between classes");
  }

  /*
   * Seats affect the ranking, and the reason says which way — but never with a
   * number in it.
   *
   * Two reasons. The card already prints the count once, with the directory's
   * own "as of" beside it (spec §3, AGENTS.md), and printing it twice made the
   * qualified copy look like the redundant one. And a bare "200 seats open" in
   * a reasons list is a seat number rendered without provenance, which is the
   * one thing that rule exists to forbid — the reasons row has no room for a
   * timestamp and should not be carrying figures that need one.
   */
  if (offering.seatsOpen != null) {
    if (offering.seatsOpen <= 0) {
      value -= 40;
      reasons.push("Full right now");
    } else if (offering.seatsTotal && offering.seatsOpen / offering.seatsTotal > 0.25) {
      value += 10;
      reasons.push("Room at the moment");
    } else {
      reasons.push("Filling up");
    }
  }

  return { score: value, reasons };
}

export function recommend({
  remaining,
  offerings,
  excludeCourseIds,
  limit = 12,
}: RecommendOptions): Recommendation[] {
  const excluded = new Set(excludeCourseIds);
  const byCourseId = new Map<CourseId, Offering>();
  for (const offering of offerings) byCourseId.set(offering.courseId, offering);

  /*
   * Best requirement per course, not one row per (course, requirement) pair.
   *
   * A course that satisfies two outstanding requirements should appear once,
   * attributed to the one it helps most — showing it twice reads as two
   * different recommendations and inflates a short list into a fake-looking
   * long one.
   */
  const best = new Map<CourseId, Recommendation>();

  for (const requirement of remaining) {
    // `attested` requirements have no courses to recommend — they are a tick
    // box. Recommending anything for them would be an invention.
    if (requirement.verification === "attested") continue;

    const candidates = requirement.candidates
      .map((courseId) => byCourseId.get(courseId))
      .filter((offering): offering is Offering => offering != null);

    for (const offering of candidates) {
      if (excluded.has(offering.courseId)) continue;
      const scored = score(offering, requirement);
      const existing = best.get(offering.courseId);
      if (existing && existing.score >= scored.score) continue;

      best.set(offering.courseId, {
        offering,
        requirement: {
          programId: requirement.programId,
          programName: requirement.programName,
          groupId: requirement.groupId,
          label: requirement.label,
          verification: requirement.verification,
        },
        score: scored.score,
        reasons: scored.reasons,
      });
    }
  }

  return [...best.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.offering.code.localeCompare(b.offering.code);
    })
    .slice(0, limit);
}
