/**
 * ============================================================================
 *  SEAM — REPLACE ENTIRELY WHEN THE DATABASE LANDS
 * ============================================================================
 *
 * Home is a *personalised* screen: it renders one student's primary plan and
 * one student's watchlist. Both of those are per-user rows in Postgres, and
 * that database does not exist yet. So this module hand-builds a plausible
 * student out of **real seed data** — every `courseId`, `sectionId` and
 * `callNumber` below is a genuine Fall 2026 COMS record from
 * `lib/seed/coms-fall2026.json`, reachable through `@/lib/data/catalog`.
 *
 * What is REAL here (do not "fix" it):
 *   - section ids, call numbers, instructors
 *   - every seat number and its `sourceAsOf` provenance string, which Home
 *     reads live from `getSections()` — never from this file
 *
 * What is FABRICATED (and must die):
 *   - which sections are in the plan / on the watchlist
 *   - `watcherCount` and `deltaSinceWatched` — real ones are aggregates over
 *     the `watches` table
 *   - `DEMO_SEAT_MOVEMENTS` — real ones come from `enrollment_snapshots`
 *   - `DEMO_MEETINGS` — see the note on that constant
 *   - `DEMO_REQUIREMENT_CHECKLIST` — a degree audit is a separate product
 *     surface; this is a placeholder shape, not a real CC/SEAS requirement set
 *
 * Replacement plan: delete this file, and have `app/page.tsx` read
 * `getPrimaryPlan(userId)` / `listWatches(userId)` / `getSeatHistory(...)`
 * from the database lane. The component props in `components/home/**` are
 * already shaped like the domain types in `@/lib/types`, so nothing else in
 * this lane should have to change.
 */

import { CURRENT_TERM } from "@/lib/constants";
import type { CampusZone, CustomBlock, Meeting, Plan, Weekday } from "@/lib/types";

/** Stand-in for the signed-in student. There is no auth yet (spec §15). */
export const DEMO_USER_ID = "demo-student";

// ---------------------------------------------------------------------------
// Primary plan
// ---------------------------------------------------------------------------

export const DEMO_PRIMARY_PLAN: Plan = {
  planId: "demo-plan-primary",
  userId: DEMO_USER_ID,
  termCode: CURRENT_TERM,
  name: "Senior fall",
  isPrimary: true,
  sectionIds: [
    "20263COMS4118W001", // Operating Systems I — Jason Nieh
    "20263COMS3157W001", // Advanced Programming — Jae W Lee
    "20263COMS4115W001", // Programming Languages & Translators — Ronghui Gu
    "20263COMS4995W002", // Topics in CS — Bjarne Stroustrup
  ],
  customBlocks: [
    {
      blockId: "demo-block-shift",
      label: "Lab shift",
      weekday: "Fr",
      startMinute: 9 * 60,
      endMinute: 13 * 60,
    },
  ],
};

/** The search-forward empty state, reachable at `/?plan=empty`. */
export const DEMO_EMPTY_PLAN: Plan = {
  ...DEMO_PRIMARY_PLAN,
  planId: "demo-plan-empty",
  name: "Untitled plan",
  sectionIds: [],
  customBlocks: [],
};

/**
 * SEAM — meeting times.
 *
 * The Directory of Classes subject pages we seeded carry seats but **not**
 * meeting times; those live on the Bulletin, which the ingest lane is still
 * wiring up (`ParsedBulletinRow.meetings`). Every `section.meetings` array in
 * the seed is therefore empty, and a week grid with no meetings is not a
 * screen anyone can evaluate.
 *
 * So these are plausible Columbia CS meeting patterns keyed by real section
 * id. `app/page.tsx` prefers `section.meetings` and only falls back here, so
 * the day the bulletin parser lands this map goes quiet on its own and can
 * then be deleted.
 */
export const DEMO_MEETINGS: Record<string, Meeting[]> = {
  // Tu/Th 11:40–12:55, Mudd (Morningside)
  "20263COMS4118W001": [
    { weekday: "Tu", startMinute: 700, endMinute: 775, buildingName: "Mudd", room: "233" },
    { weekday: "Th", startMinute: 700, endMinute: 775, buildingName: "Mudd", room: "233" },
  ],
  // Mo/We 4:10–5:25, Mudd (Morningside)
  "20263COMS3157W001": [
    { weekday: "Mo", startMinute: 970, endMinute: 1045, buildingName: "Mudd", room: "833" },
    { weekday: "We", startMinute: 970, endMinute: 1045, buildingName: "Mudd", room: "833" },
  ],
  // Tu/Th 1:10–2:25, Prentis Hall (Manhattanville) — deliberately produces a
  // cross-campus commute leg out of the 12:55 Mudd class above.
  "20263COMS4115W001": [
    { weekday: "Tu", startMinute: 790, endMinute: 865, buildingName: "Prentis Hall", room: "623" },
    { weekday: "Th", startMinute: 790, endMinute: 865, buildingName: "Prentis Hall", room: "623" },
  ],
  // We 4:10–6:00, Mudd — deliberately overlaps Advanced Programming on We.
  "20263COMS4995W002": [
    { weekday: "We", startMinute: 970, endMinute: 1080, buildingName: "Mudd", room: "545" },
  ],
};

/**
 * SEAM — building → campus zone.
 *
 * The real mapping is a geocoded `buildings` table (spec §7, shared with the
 * commute checker and the future 3D card). This is the handful of names the
 * demo plan uses, so the commute card can compute something real against
 * `ZONE_WALK_MINUTES` from `@/lib/constants`.
 */
export const DEMO_BUILDING_ZONES: Record<string, CampusZone> = {
  Mudd: "morningside",
  "Northwest Corner": "morningside",
  Pupin: "morningside",
  Hamilton: "morningside",
  "Prentis Hall": "manhattanville",
  Milstein: "barnard",
};

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

/**
 * The per-user half of `WatchWithState`. Home merges this with the live
 * `Section` (seats + provenance) read through `@/lib/data/catalog`, which is
 * exactly the shape the database lane will return.
 */
export interface DemoWatch {
  sectionId: string;
  createdAt: string;
  /** Spec §14: shown upfront, deliberately. A popular section is a race. */
  watcherCount: number;
  /** Enrollment delta since the watch was created. */
  deltaSinceWatched: number | null;
}

export const DEMO_WATCHES: DemoWatch[] = [
  {
    sectionId: "20263COMS4701W001", // Artificial Intelligence — 145/70
    createdAt: "2026-08-14T15:02:00Z",
    watcherCount: 412,
    deltaSinceWatched: 9,
  },
  {
    sectionId: "20263COMS4111W001", // Introduction to Databases — 221/200
    createdAt: "2026-08-15T18:41:00Z",
    watcherCount: 268,
    deltaSinceWatched: 12,
  },
  {
    sectionId: "20263COMS4170W001", // User Interface Design — 88/80
    createdAt: "2026-08-18T13:20:00Z",
    watcherCount: 193,
    deltaSinceWatched: 4,
  },
  {
    sectionId: "20263COMS4156W001", // Advanced Software Engineering — 117/110
    createdAt: "2026-08-19T09:05:00Z",
    watcherCount: 121,
    deltaSinceWatched: 2,
  },
  {
    sectionId: "20263COMS4771W003", // Machine Learning sec 003 — 0/75
    createdAt: "2026-08-21T21:37:00Z",
    watcherCount: 64,
    deltaSinceWatched: 0,
  },
];

// ---------------------------------------------------------------------------
// Seat movement feed
// ---------------------------------------------------------------------------

/**
 * SEAM — the real feed is a window over `enrollment_snapshots`, diffed per
 * section. `observedAt` is an ISO instant; `sourceAsOf` is the directory's own
 * claim about when the number was true, and it travels with every row because
 * spec §3 says every number carries its provenance.
 */
export interface DemoSeatMovement {
  movementId: string;
  sectionId: string;
  /** When our pipeline saw the change. */
  observedAt: string;
  /** The directory's own "as of" string at the time of the reading. */
  sourceAsOf: string;
  previousEnrollmentCount: number;
  enrollmentCount: number;
  enrollmentCap: number;
  /** True when this reading crossed from full to having room. */
  openedUp: boolean;
}

export const DEMO_SEAT_MOVEMENTS: DemoSeatMovement[] = [
  {
    movementId: "mv-8",
    sectionId: "20263COMS4111W001",
    observedAt: "2026-08-22T18:04:00Z",
    sourceAsOf: "August 22, 2026",
    previousEnrollmentCount: 223,
    enrollmentCount: 221,
    enrollmentCap: 200,
    openedUp: false,
  },
  {
    movementId: "mv-7",
    sectionId: "20263COMS4771W003",
    observedAt: "2026-08-22T17:31:00Z",
    sourceAsOf: "August 22, 2026",
    previousEnrollmentCount: 2,
    enrollmentCount: 0,
    enrollmentCap: 75,
    openedUp: true,
  },
  {
    movementId: "mv-6",
    sectionId: "20263COMS4701W001",
    observedAt: "2026-08-22T16:58:00Z",
    sourceAsOf: "August 22, 2026",
    previousEnrollmentCount: 143,
    enrollmentCount: 145,
    enrollmentCap: 70,
    openedUp: false,
  },
  {
    movementId: "mv-5",
    sectionId: "20263COMS4170W001",
    observedAt: "2026-08-22T15:12:00Z",
    sourceAsOf: "August 22, 2026",
    previousEnrollmentCount: 87,
    enrollmentCount: 88,
    enrollmentCap: 80,
    openedUp: false,
  },
  {
    movementId: "mv-4",
    sectionId: "20263COMS4156W001",
    observedAt: "2026-08-22T13:47:00Z",
    sourceAsOf: "August 22, 2026",
    previousEnrollmentCount: 119,
    enrollmentCount: 117,
    enrollmentCap: 110,
    openedUp: false,
  },
  {
    movementId: "mv-3",
    sectionId: "20263COMS4111W001",
    observedAt: "2026-08-22T11:20:00Z",
    sourceAsOf: "August 22, 2026",
    previousEnrollmentCount: 219,
    enrollmentCount: 223,
    enrollmentCap: 200,
    openedUp: false,
  },
  {
    movementId: "mv-2",
    sectionId: "20263COMS4701W001",
    observedAt: "2026-08-21T22:09:00Z",
    sourceAsOf: "August 21, 2026",
    previousEnrollmentCount: 140,
    enrollmentCount: 143,
    enrollmentCap: 70,
    openedUp: false,
  },
  {
    movementId: "mv-1",
    sectionId: "20263COMS4156W001",
    observedAt: "2026-08-21T19:55:00Z",
    sourceAsOf: "August 21, 2026",
    previousEnrollmentCount: 121,
    enrollmentCount: 119,
    enrollmentCap: 110,
    openedUp: false,
  },
];

// ---------------------------------------------------------------------------
// Requirement hints
// ---------------------------------------------------------------------------

/**
 * SEAM — a degree audit is not v1. This is a small placeholder checklist so
 * the "unmet requirements" card has something honest to count against; the
 * card says plainly that it is a placeholder when nothing can be matched.
 * Keys match `RequirementFlags` in `@/lib/types`.
 */
export const DEMO_REQUIREMENT_CHECKLIST: { key: string; label: string }[] = [
  { key: "globalCore", label: "Global Core" },
  { key: "scienceRequirement", label: "Science Requirement" },
  { key: "artsAndHumanities", label: "Arts & Humanities" },
  { key: "socialScience", label: "Social Science" },
];

/** Custom blocks participate fully in conflict + commute checks. */
export function demoCustomBlocksByDay(): Partial<Record<Weekday, CustomBlock[]>> {
  const byDay: Partial<Record<Weekday, CustomBlock[]>> = {};
  for (const block of DEMO_PRIMARY_PLAN.customBlocks) {
    (byDay[block.weekday] ??= []).push(block);
  }
  return byDay;
}
