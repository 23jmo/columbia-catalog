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
   * No primary plan exists yet: plans require an account (spec §15) and both
   * the auth and schedule lanes are still landing. `null` is the correct
   * value — the conflict panel says "no plan to check against" rather than
   * implying this course is conflict-free.
   *
   * TODO(schedule/auth): populate from `lib/schedule/plans.ts` once a signed-in
   * student can have a primary plan.
   */
  primaryPlan: null,

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
   * STILL UNWIRED — and each is blocked on DATA, not on a missing module.
   *
   * TODO(ingest): `loadSeatHistory` needs `enrollment_snapshots` to have rows.
   *   The crawler writes them, but nothing has crawled yet, so every course
   *   would return an empty series. The chart renders its designed "nothing
   *   has moved yet" state rather than an empty axis, which is the truth.
   * TODO(reviews): `loadReputation` ← lib/reviews/aggregate.ts, once review
   *   ingest populates course and instructor summaries. Course and instructor
   *   stay SEPARATE — never averaged (spec §12).
   *
   * `lookupRmp` is intentionally absent rather than TODO: RMP is read live in
   * the browser through `/api/rmp/[instructor]`, so it is wired inside the
   * client instructor panel where the fetch belongs, never injected from the
   * server and never persisted.
   */
};
