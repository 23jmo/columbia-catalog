/**
 * The student profile — what we hold, and the boundary around it.
 *
 * ── Everything here is self-reported, and that is structural ────────────────
 *
 * There is no path by which this data could come from Columbia. The student
 * record endpoints (`studentclasses`, `academicplans`, `transfercredits`,
 * `gpa`) sit behind the SAS API and need a Vergil bearer token;
 * `AGENTS.md` forbids touching one and `vergil_api_spec.md` §15 forbids
 * centralizing those records. So:
 *
 *   - `major` / `school` are declared by the student, never verified.
 *   - `courses` are entered by the student, or imported from a transcript
 *     THEY pasted or uploaded, and confirmed by them row by row.
 *   - `attestations` are literally the student ticking a box.
 *
 * `source` on every course records which of those happened, and the UI shows
 * it. A degree audit built on self-report is useful; one that *presents* as
 * official is dangerous, and the difference is whether the provenance travels.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────
 *
 * **No GPA. No grades.** We cannot obtain them, and holding a self-typed GPA
 * would create the exact FERPA-shaped liability §15 warns about while adding
 * nothing — no feature on this screen needs one. `TakenCourse` has no grade
 * field, and the transcript importer shows grades during review then discards
 * them. That is not an oversight to be fixed later; it is the design.
 *
 * **No transcript file.** The PDF is parsed in the browser and never uploaded
 * (see `./pdf-text.ts`). There is no storage bucket for it.
 */

import type { School } from "@/lib/requirements/types";
import type { CourseId } from "@/lib/requirements/code";

/** How a course got onto the record. Always displayed. */
export type CourseSource = "picker" | "transcript_paste" | "transcript_pdf" | "plan";

export interface TakenCourse {
  courseId: CourseId;
  /** `"20243"`. Null when the student did not say. */
  termCode: string | null;
  /** As printed on their transcript, when imported: `"Fall 2024"`. */
  termLabel: string | null;
  /** Points earned, when they differ from the catalog's range. */
  points: number | null;
  /**
   * The student's own opinion of the course (migration 0032), and NOT a grade.
   *
   * `null` means we never asked, which is the common case and must never be
   * read as "disliked" — the taste vector weights a disliked course DOWN, so
   * collapsing null into false would push a recommender away from everything a
   * student took and never rated. See `lib/recommend/taste.ts`.
   */
  liked: boolean | null;
  source: CourseSource;
  addedAt: string;
}

export interface StudentProfile {
  userId: string;
  /** Display name from Google SSO. Not editable here. */
  displayName: string | null;
  email: string | null;
  school: School | null;
  /** Program ids from `lib/requirements/programs`. Majors, minors, concentrations. */
  programIds: string[];
  /** Expected graduation, e.g. `"2028"`. Free text, used only for display. */
  classYear: string | null;
  courses: TakenCourse[];
  /**
   * Declared interests, hand-authored and major-scoped (migration 0032). Each
   * tag maps to a seed vector built from exemplar courses — so an unrecognised
   * tag contributes nothing rather than erroring, and the list is bounded at 24
   * by a database check rather than by hope.
   */
  interestTags: string[];
  /** `groupKey` → ISO timestamp the student ticked it. */
  attestations: Record<string, string>;
  updatedAt: string | null;
}

/**
 * The key an attestation is stored under.
 *
 * Namespaced by program because two programs can both have a group called
 * `physical-education` and they are not the same claim — a student attesting
 * the SEAS swim requirement has not attested the CC one.
 */
export function attestationKey(programId: string, groupId: string): string {
  return `${programId}:${groupId}`;
}

export const EMPTY_PROFILE: Omit<StudentProfile, "userId"> = {
  displayName: null,
  email: null,
  school: null,
  programIds: [],
  classYear: null,
  courses: [],
  interestTags: [],
  attestations: {},
  updatedAt: null,
};

export const COURSE_SOURCE_LABEL: Record<CourseSource, string> = {
  picker: "Added by hand",
  transcript_paste: "Imported from pasted text",
  transcript_pdf: "Imported from a PDF",
  plan: "From your schedule",
};
