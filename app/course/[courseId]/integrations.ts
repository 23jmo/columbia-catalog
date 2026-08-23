/**
 * What the course surface can wire up TODAY, and exactly what is still owed.
 *
 * `CourseDetailIntegrations` (components/course/contracts.ts) is the single
 * injection point for the things the course surface does not own. The chart,
 * week grid and campus lanes have since landed and are wired below; what stays
 * `undefined` is undefined because its DATA does not exist yet, not because a
 * module is missing. The built components render designed placeholders by
 * contract, which is a far more honest state than a fake chart.
 */

import { SeatHistoryChart } from "@/components/charts/seat-history-chart";
import type { CourseDetailIntegrations } from "@/components/course/contracts";
import { evaluateCandidateLocally } from "@/components/course/plan-conflicts";
import { WeekGrid } from "@/components/schedule/week-grid";
import { resolveCampusZone } from "@/lib/campus";
import { loadCourseSeatHistory } from "@/lib/db/course-history";
import { getCourseReputation, getInstructorReputation } from "@/lib/db/reputation";

export const courseDetailIntegrations: CourseDetailIntegrations = {
  /*
   * Real today. `evaluateCandidateLocally` is the drawer lane's own conflict +
   * commute evaluator, so the above-the-fold warnings required by spec §7 are
   * genuine from day one for any plan we are handed.
   *
   * TODO(schedule): replace with the authoritative evaluator once it exists —
   * `lib/schedule/conflicts.ts` + `lib/schedule/commute.ts` (schedule lane).
   */
  evaluateCandidate: evaluateCandidateLocally,

  /*
   * The campus lane's resolver, not the drawer's old name-pattern guess. It
   * reads a real building + alias table, so the strings the Bulletin actually
   * prints resolve — "451 Computer Science Bldg", "502 Northwest Corner",
   * "415 Schapiro Cepser" (CEPSR is misspelled at the source). The heuristic
   * gave up on all of those and returned "unknown".
   */
  resolveCampusZone,

  /*
   * Deliberately absent from this object rather than set to null.
   *
   * A plan belongs to whoever is reading, so it cannot live in a module-level
   * constant shared by every request. `CourseDetail` resolves it per render
   * with `loadPrimaryPlanSnapshot` and merges it in. Leaving the key out means
   * a caller that supplies its own `integrations` — the drawer, a test — is not
   * silently handed someone else's plan, and the panel degrades to "no plan to
   * check against" rather than implying this course is conflict-free.
   */

  /*
   * The charts lane's real Recharts implementation. It draws change-only
   * snapshots with step-after interpolation, so the line holds flat between
   * observations instead of sloping between them and implying seats drained
   * at a steady rate they never drained at.
   */
  seatHistoryChart: SeatHistoryChart,

  /*
   * The schedule lane's real week canvas — the same component Home and
   * `/schedule` render, so a section previewed in the drawer is laid out by
   * exactly the code that will lay it out once saved.
   */
  weekGrid: WeekGrid,

  /*
   * Real, now that the crawler has run. Draws one line per section that has
   * readings, plus the prior-term ghost line spec §13 asks for — a Fall 2026
   * line alone says "37 of 60"; the Fall 2025 line behind it says whether 37
   * at this date is early-and-calm or late-and-nearly-gone.
   *
   * Sections with no readings yet contribute no line rather than a flat
   * nothing, and `registration_milestones` is still empty (see
   * .plans/BLOCKERS.md #4 — the registrar 403s server-side requests), so the
   * chart draws without vertical annotations. That is the documented
   * degradation, not a failure.
   */
  loadSeatHistory: loadCourseSeatHistory,

  /*
   * Real pipeline, and today it returns null for both halves — because there
   * are no reviews, not because nothing is wired. That distinction is the
   * whole point of connecting it now: the panel renders the same honest "no
   * reviews matched" state it would render for a genuinely unreviewed course,
   * and the day CULPA or Reddit ingest lands, the page fills in with no code
   * change.
   *
   * Course and instructor are fetched by two functions with no shared path and
   * are handed back apart. They are never averaged (spec §12) — a beloved
   * professor teaching a punishing course is two facts, and one number would
   * destroy both.
   */
  async loadReputation({ courseId, instructorName }) {
    const [course, instructor] = await Promise.all([
      getCourseReputation(courseId),
      instructorName ? getInstructorReputation(instructorName) : Promise.resolve(null),
    ]);
    return { course, instructor, instructorName };
  },

  /*
   * `lookupRmp` is intentionally absent rather than TODO: RMP is read live in
   * the browser through `/api/rmp/[instructor]`, so it is wired inside the
   * client instructor panel where the fetch belongs, never injected from the
   * server and never persisted.
   */
};
