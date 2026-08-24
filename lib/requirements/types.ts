/**
 * The requirement rule language.
 *
 * This is the smallest vocabulary that can express what Columbia's Bulletin
 * actually publishes, and — just as importantly — it refuses to express things
 * we cannot check. A degree audit that quietly guesses is worse than no degree
 * audit, because a student plans a semester around it.
 *
 * ── The three verification tiers ─────────────────────────────────────────────
 *
 * Every rule declares how confidently it can be checked, and every surface in
 * the app shows that tier. This is the honesty principle from spec §3
 * ("every number carries its provenance") applied to requirements.
 *
 *   exact     The Bulletin names specific courses. `SCNC CC1000`, or
 *             `HUMA CC1001` + `HUMA CC1002`. We compare course ids. If we say
 *             this is done, it is done.
 *
 *   flagged   The Bulletin says "two courses from the list of approved courses
 *             that meet the guidelines of the Science Requirement". The list is
 *             real and public, and the registrar also stamps each course record
 *             with `requirement_flags`, so this is checkable — but against a
 *             list that moves, and a course approved in 2023 may not be
 *             approved now. Correct today, not provably correct retroactively.
 *
 *   attested  "The successful completion of the Intermediate II level in a
 *             single language OR the exemption from the requirement through
 *             approved exam scores." "Two courses and a swimming test."
 *             No public data source records whether a given student passed the
 *             swim test. The student ticks a box and we say plainly that they
 *             ticked it.
 *
 * A rule kind maps to exactly one tier, so the tier is derived rather than
 * authored — see `verificationOf`. Nothing can claim a stronger tier than its
 * own logic supports.
 *
 * ── What this language deliberately CANNOT say ───────────────────────────────
 *
 * No grade minima ("passed with C- or higher"), no residency rules, no
 * "at most one course may double count", no advisor petitions, no transfer
 * credit equivalencies. Every one of those needs the registrar's own record,
 * which we cannot have (see `lib/profile/types.ts`). Encoding them would
 * produce an audit that looks authoritative and is not. The UI says so.
 */

import type { RequirementFlags } from "@/lib/types";
import type { BulletinCode } from "./code";

export type Verification = "exact" | "flagged" | "attested";

/**
 * Which school's rules a program belongs to. Not a filter — a student in
 * Columbia College and a student in SEAS satisfy genuinely different Cores.
 */
export type School = "CC" | "SEAS" | "GS" | "BC";

export const SCHOOL_LABEL: Record<School, string> = {
  CC: "Columbia College",
  SEAS: "Columbia Engineering",
  GS: "General Studies",
  BC: "Barnard College",
};

export type ProgramKind = "core" | "major" | "concentration" | "minor";

/**
 * A predicate over the catalog, used by rules that count courses matching a
 * shape rather than naming them. Every field present must hold (AND).
 */
export interface CourseSelector {
  /** Unpadded subject codes: `["COMS", "CSEE"]`. Padded internally. */
  subjects?: string[];
  /** Inclusive course-number bounds. `[3000, 9999]` is "3000-level or above". */
  numberRange?: [number, number];
  /** A curriculum flag the course record must carry. */
  flag?: keyof RequirementFlags;
  /** Explicit codes that always match, on top of the shape above. */
  include?: BulletinCode[];
  /** Explicit codes that never match, even if the shape says they do. */
  exclude?: BulletinCode[];
}

export type RequirementRule =
  /** Every listed course is required. Lit Hum I *and* Lit Hum II. */
  | { kind: "all_of"; courses: BulletinCode[] }
  /** Pick `n` from this explicit list. "Select one of the following courses:" */
  | { kind: "n_of"; n: number; courses: BulletinCode[] }
  /**
   * Complete **all** of one named sequence, from several alternatives.
   *
   * SEAS: "One of the following two-semester sequences: Lit Hum I + Lit Hum II,
   * or CC I + CC II." This cannot be written as `n_of` with `n: 2` over the
   * four courses — that would accept Lit Hum I plus CC I, which satisfies
   * neither sequence and is a schedule a real student could plausibly build.
   * The alternatives are atomic, so the rule has to be too.
   */
  | {
      kind: "sequence_choice";
      sequences: { label: string; courses: BulletinCode[] }[];
    }
  /** `n` courses matching a shape. Global Core, Science, "three 3000+ electives". */
  | { kind: "n_matching"; n: number; select: CourseSelector }
  /** `points` worth of credit matching a shape, rather than a course count. */
  | { kind: "points_matching"; points: number; select: CourseSelector }
  /** Not checkable from public data. The student certifies it themselves. */
  | { kind: "attested"; note: string };

/** The tier is a property of the rule kind, never something an author picks. */
export function verificationOf(rule: RequirementRule): Verification {
  switch (rule.kind) {
    case "all_of":
    case "n_of":
    case "sequence_choice":
      return "exact";
    case "n_matching":
    case "points_matching":
      return "flagged";
    case "attested":
      return "attested";
  }
}

export interface RequirementGroup {
  /** Stable within a program. Used as a React key and an audit storage key. */
  id: string;
  label: string;
  /** The Bulletin's own sentence, verbatim where there is one. */
  note?: string;
  rule: RequirementRule;
  /**
   * Deep link to the Bulletin page this group was read from, so a student can
   * check us against the registrar in one click. Every group should have one.
   */
  sourceUrl?: string;
}

export interface Program {
  /** Slug: `"cc-core"`, `"cc-major-computer-science"`. */
  id: string;
  kind: ProgramKind;
  school: School;
  /** `"The Core Curriculum"`, `"Computer Science"`. */
  name: string;
  /** For majors: the department heading the Bulletin files it under. */
  department?: string;
  /** Total points the *degree* requires. Only meaningful on `kind: "core"`. */
  degreePoints?: number;
  groups: RequirementGroup[];
  sourceUrl: string;
  /**
   * Where this definition came from. `"authored"` means a human transcribed it
   * from the Bulletin and it is covered by a test; `"parsed"` means the
   * CourseLeaf parser produced it. The UI distinguishes them, because a parsed
   * program has never been read by a person.
   */
  origin: "authored" | "parsed";
  /** Bulletin edition this was read from, e.g. `"2026-2027"`. */
  edition: string;
}

// ---------------------------------------------------------------------------
// Audit results
// ---------------------------------------------------------------------------

export type GroupStatus = "satisfied" | "in_progress" | "unmet";

/** One course of the student's, matched against one group. */
export interface GroupMatch {
  courseId: string;
  /** As the student reads it: `"MATH UN1201"`. */
  code: string;
  title: string | null;
  points: number | null;
  /** `true` when this course is still on a plan rather than completed. */
  planned: boolean;
}

export interface GroupResult {
  group: RequirementGroup;
  status: GroupStatus;
  verification: Verification;
  /** Courses that counted. */
  matched: GroupMatch[];
  /** How much is done and how much is needed, in `unit`. */
  completed: number;
  required: number;
  unit: "courses" | "points";
  /**
   * Courses that would satisfy what remains, when the rule names a finite set.
   * Empty for `n_matching` over a broad selector — there the recommender, not
   * the audit, is the right surface.
   */
  candidates: string[];
  /** Set by `attested` groups the student has ticked. */
  attestedAt?: string | null;
}

export interface ProgramResult {
  program: Program;
  groups: GroupResult[];
  /** Groups fully satisfied. */
  satisfiedCount: number;
  /** Groups with at least one match but not finished. */
  inProgressCount: number;
  /** Groups with nothing yet. */
  unmetCount: number;
  /**
   * 0–1. Weighted by each group's `required`, not by group count, so a
   * ten-course major requirement does not weigh the same as a one-course one.
   */
  fraction: number;
}
