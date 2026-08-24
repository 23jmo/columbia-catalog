/**
 * Guest state → database rows, in one transaction, losslessly.
 *
 * ── The requirement, stated plainly ─────────────────────────────────────────
 *
 * A guest can finish the entire onboarding flow without an account. By the time
 * they sign in they may have declared a school, two majors, a minor, confirmed
 * thirty courses, said which eight of those they loved, and picked six interest
 * tags. All of it lives in one `localStorage` key. Signing in must move every
 * bit of it into `student_profiles` and `student_courses` and lose nothing —
 * and if any part of it fails, none of it may land, because a half-migrated
 * student is worse off than one who has to start over: they cannot tell which
 * half survived, and neither can we.
 *
 * Hence one RPC (`apply_onboarding_state`, migration 0033) rather than an
 * upsert to each table. A plpgsql function body is a single transaction; two
 * client calls are not, and the gap between them is a network round trip on a
 * phone during registration week.
 *
 * ── Why the payload is built here and not in the action ─────────────────────
 *
 * `toMigrationPayload` is a pure function so the losslessness claim is
 * testable. `onboarding.test.ts` round-trips a fully-populated guest state
 * through serialize → deserialize → payload → back, and asserts every field
 * arrives. That test is the only thing that will still be true after the next
 * field is added to `GuestOnboardingState`, so the payload builder must be
 * reachable without a database.
 */

import { knownInterestTagIds } from "@/lib/profile/interest-tags";
import { getProgram } from "@/lib/requirements/programs";

import type { GuestOnboardingState, OnboardingCourseSource } from "./state";

/**
 * One `student_courses` row, in the database's own spelling.
 *
 * snake_case because it is jsonb destined for a plpgsql function that reads
 * these keys by name — translating at the last moment inside SQL would put the
 * mapping somewhere no test can see it.
 */
export interface MigrationCourseRow {
  course_id: string;
  term_label: string | null;
  points: number | null;
  /** Tri-state. `null` means the love screen never asked about this course. */
  liked: boolean | null;
  source: OnboardingCourseSource;
}

export interface MigrationPayload {
  school: string | null;
  class_year: string | null;
  program_ids: string[];
  interest_tags: string[];
  courses: MigrationCourseRow[];
}

/**
 * Build the payload.
 *
 * ── What gets dropped, and why each drop is safe ────────────────────────────
 *
 * Four things do not survive, and none of them is coursework:
 *
 *   `step` / `furthestStep`   Where they were in the wizard. Meaningless once
 *                             onboarding is over; the completion cookie is what
 *                             the app reads afterwards.
 *   `confirmationsSinceRerank` A UI counter.
 *   `dismissedCourseIds`      Courses the student unticked. This IS student
 *                             input, but it is a statement about the guess grid
 *                             rather than about their transcript, and there is
 *                             no column for "explicitly not taken" — an absent
 *                             row already says it. It exists only to stop the
 *                             grid re-ticking a correction within one session,
 *                             and the grid is over by the time this runs.
 *   `inCatalog` / `code` / `title` Derived from the catalog, not stated by the
 *                             student. Re-derived on every read — and storing
 *                             `inCatalog` would freeze a judgement that changes
 *                             the moment an archived term is backfilled.
 *
 * Everything the student actually told us — school, class year, programs, every
 * course id with its term, points and `liked`, and every interest tag — is
 * carried. **Unmatched coursework is carried too.** A course our catalog does
 * not contain is exactly the row a transfer student most needs kept, and
 * `student_courses.course_id` is deliberately not a foreign key so it fits
 * (migration 0028). Filtering on `inCatalog` here would be the single change
 * that makes this product useless for transfers, study-abroad returnees, and
 * anyone with AP credit.
 *
 * Unknown program ids and unknown interest tags ARE dropped, because both are
 * ours rather than the student's: a program id that no longer resolves would
 * make the audit skip a program silently, and a tag nothing maps to is a
 * permanent no-op sitting in a column capped at 24 entries.
 */
export function toMigrationPayload(state: GuestOnboardingState): MigrationPayload {
  const knownTags = knownInterestTagIds();

  return {
    school: state.school,
    class_year: state.classYear,
    program_ids: [...new Set(state.programIds)].filter((id) => getProgram(id) != null),
    interest_tags: [...new Set(state.interestTags)].filter((tag) => knownTags.has(tag)),
    courses: dedupeById(state.courses).map((course) => ({
      course_id: course.courseId,
      term_label: course.termLabel,
      points: course.points,
      liked: course.liked,
      source: course.source,
    })),
  };
}

/**
 * One row per course id.
 *
 * `student_courses` is keyed `(user_id, course_id)`, so two rows for the same
 * course would make the upsert's behaviour depend on array order — which is not
 * a thing anyone should have to reason about. The LAST occurrence wins, matching
 * `upsertCourse`'s rule that a later sighting is the better one.
 */
function dedupeById<T extends { courseId: string }>(rows: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) byId.set(row.courseId, row);
  return [...byId.values()];
}

/** True when there is anything worth writing. An empty flush is not an error. */
export function hasAnythingToMigrate(state: GuestOnboardingState): boolean {
  return (
    state.school !== null ||
    state.programIds.length > 0 ||
    state.courses.length > 0 ||
    state.interestTags.length > 0
  );
}
