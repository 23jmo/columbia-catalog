"use server";

import { revalidatePath } from "next/cache";

import { findCourseByLooseId, getCoursesByIds } from "@/lib/data/catalog";
import { ACTIVE_TERMS } from "@/lib/constants";

import {
  addStudentCourses,
  deleteAcademicRecord,
  loadStudentProfile,
  removeStudentCourse,
  saveStudentProfile,
  type CourseDraft,
} from "@/lib/db/student-profile";
import { attestationKey, type CourseSource } from "@/lib/profile/types";
import { toCourseId } from "@/lib/requirements/code";
import { getProgram } from "@/lib/requirements/programs";
import type { School } from "@/lib/requirements/types";

/**
 * Server actions for the profile screen.
 *
 * ── Every argument is treated as hostile ────────────────────────────────────
 *
 * A server action is a public POST endpoint with a generated name. The forms in
 * `components/profile` are the only intended caller, but nothing enforces that,
 * so each action re-validates its input from scratch: school against the four
 * real schools, program ids against the registry, course ids through the same
 * parser the Bulletin bridge uses, points against a sane range.
 *
 * Row ownership is not checked here and must not be. `lib/db/student-profile.ts`
 * runs every statement as the invoker against RLS'd tables, so there is no
 * argument in which a caller could name someone else's record. Adding a
 * user-id parameter to "check" it would create exactly the hole it pretended to
 * close.
 *
 * ── The failure convention ──────────────────────────────────────────────────
 *
 * Every action returns `{ ok, error? }` rather than throwing. A thrown server
 * action surfaces as a generic error overlay in production, which tells a
 * student nothing; a returned message can be rendered next to the control that
 * caused it.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Set by actions that add rows, so the UI can report what landed. */
  count?: number;
}

const SCHOOLS: School[] = ["CC", "SEAS", "GS", "BC"];
const SOURCES: CourseSource[] = ["picker", "transcript_paste", "transcript_pdf", "plan"];

/** The profile is a per-user server render, so one path covers every revalidation. */
function refresh(): void {
  revalidatePath("/profile");
}

export async function saveDegreeAction(input: {
  school: string | null;
  classYear: string | null;
  programIds: string[];
}): Promise<ActionResult> {
  const school =
    input.school === null || input.school === ""
      ? null
      : (SCHOOLS as string[]).includes(input.school)
        ? (input.school as School)
        : undefined;
  if (school === undefined) return { ok: false, error: "That is not a school we know about." };

  /*
   * Unknown program ids are dropped rather than rejected.
   *
   * The registry changes between deploys — a parsed program can disappear when
   * the Bulletin edition rolls. A student whose saved major vanished should be
   * able to save the rest of their profile, not be locked out of the form by a
   * stale id they never typed.
   */
  const programIds = [...new Set(input.programIds)].filter((id) => getProgram(id) != null);
  if (programIds.length > 8) {
    return { ok: false, error: "Eight programs is the most we can audit at once." };
  }

  const classYear = normalizeClassYear(input.classYear);
  if (classYear === undefined) {
    return { ok: false, error: "Use a four-digit year, e.g. 2028." };
  }

  const saved = await saveStudentProfile({ school, classYear, programIds });
  if (!saved) return { ok: false, error: "Could not save. Are you still signed in?" };
  refresh();
  return { ok: true };
}

/** `undefined` means invalid; `null` means "clear it". */
function normalizeClassYear(raw: string | null): string | null | undefined {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d{4}$/.test(trimmed)) return undefined;
  const year = Number(trimmed);
  // Wide enough for a returning student and a first-year eight years out.
  if (year < 1950 || year > 2100) return undefined;
  return trimmed;
}

export interface CourseInput {
  /** Either a course id (`MATH1201UN`) or a Bulletin code (`MATH UN1201`). */
  code: string;
  termLabel?: string | null;
  points?: number | null;
  source: string;
}

export async function addCoursesAction(inputs: CourseInput[]): Promise<ActionResult> {
  if (inputs.length === 0) return { ok: true, count: 0 };
  // A transcript is tens of rows. A thousand is not a transcript.
  if (inputs.length > 400) return { ok: false, error: "That is more rows than a transcript has." };

  const parsed = inputs
    .map((input) => ({ input, courseId: toCourseId(input.code) }))
    .filter((entry): entry is { input: CourseInput; courseId: string } => entry.courseId !== null);

  const canonical = await canonicalizeCourseIds(parsed.map((entry) => entry.courseId));

  const drafts: CourseDraft[] = [];
  for (const { input, courseId: rawCourseId } of parsed) {
    const courseId = canonical.get(rawCourseId) ?? rawCourseId;

    const source = (SOURCES as string[]).includes(input.source)
      ? (input.source as CourseSource)
      : "picker";

    const points =
      input.points != null && Number.isFinite(input.points) && input.points >= 0 && input.points <= 30
        ? Math.round(input.points * 100) / 100
        : null;

    drafts.push({
      courseId,
      termCode: null,
      termLabel: input.termLabel?.trim() || null,
      points,
      source,
    });
  }

  if (drafts.length === 0) {
    return { ok: false, error: "None of those looked like a Columbia course code." };
  }

  const count = await addStudentCourses(drafts);
  if (count === 0) return { ok: false, error: "Could not save. Are you still signed in?" };
  refresh();
  return { ok: true, count: drafts.length };
}


/**
 * Snap typed course ids onto the catalog's own spelling.
 *
 * Columbia's qualifier is part of the id — `COMS3134W`, not `COMS3134` — but it
 * is the one part a student reliably drops, because a transcript prints
 * `COMS W3134` and a person typing from memory writes "COMS 3134". Storing the
 * unqualified form would leave a course on the record that matches no
 * requirement and no catalog row: the audit would show it as taken and count it
 * toward nothing, which is the most confusing possible outcome.
 *
 * Exact hits are resolved in one query per active term. Only the leftovers go
 * through `findCourseByLooseId`, which is the qualifier-tolerant path — and
 * those are capped, because a pasted transcript full of transfer credit could
 * otherwise turn one import into a hundred round trips. Anything unresolved is
 * stored as typed: a course our catalog does not contain is a legitimate row
 * (transfer credit, a retired offering), and the profile screen already says
 * plainly which rows those are.
 */
const MAX_LOOSE_LOOKUPS = 25;

async function canonicalizeCourseIds(courseIds: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const wanted = [...new Set(courseIds)];
  if (wanted.length === 0) return resolved;

  const perTerm = await Promise.all(
    ACTIVE_TERMS.map((term) => getCoursesByIds(wanted, term)),
  );
  for (const courses of perTerm) {
    for (const course of courses) resolved.set(course.courseId, course.courseId);
  }

  const missing = wanted.filter((courseId) => !resolved.has(courseId));
  for (const courseId of missing.slice(0, MAX_LOOSE_LOOKUPS)) {
    for (const term of ACTIVE_TERMS) {
      const found = await findCourseByLooseId(courseId, term);
      if (found) {
        resolved.set(courseId, found.courseId);
        break;
      }
    }
  }

  return resolved;
}

export async function removeCourseAction(courseId: string): Promise<ActionResult> {
  const resolved = toCourseId(courseId);
  if (!resolved) return { ok: false, error: "Unrecognised course." };
  const removed = await removeStudentCourse(resolved);
  if (!removed) return { ok: false, error: "Could not remove that course." };
  refresh();
  return { ok: true };
}

/**
 * Tick or untick a self-certified requirement.
 *
 * Read-modify-write on a jsonb map rather than a dedicated table: attestations
 * are a handful of keys per student, always read together with the profile, and
 * never queried across users. The race — two tabs ticking two boxes at once,
 * last write wins — loses one tick, which the student can see and redo.
 */
export async function setAttestationAction(
  programId: string,
  groupId: string,
  attested: boolean,
): Promise<ActionResult> {
  const program = getProgram(programId);
  if (!program) return { ok: false, error: "Unknown program." };
  const group = program.groups.find((candidate) => candidate.id === groupId);
  if (!group) return { ok: false, error: "Unknown requirement." };
  if (group.rule.kind !== "attested") {
    // Not a permission check — a correctness one. Letting a student tick a
    // checkable requirement would turn an `exact` green into an unfalsifiable
    // one, which is the whole failure mode the tiers exist to prevent.
    return { ok: false, error: "That requirement is checked against the Bulletin, not certified." };
  }

  const profile = await loadStudentProfile();
  if (!profile) return { ok: false, error: "Sign in to certify a requirement." };

  const key = attestationKey(programId, groupId);
  const attestations = { ...profile.attestations };
  if (attested) attestations[key] = new Date().toISOString();
  else delete attestations[key];

  const saved = await saveStudentProfile({ attestations });
  if (!saved) return { ok: false, error: "Could not save that." };
  refresh();
  return { ok: true };
}

/**
 * Erase the academic record, keeping the account and its schedules.
 *
 * Named practice in `vergil_api_spec.md` §15. The button that calls this is
 * always on the page — a student should never have to email anyone to get their
 * own coursework out of our database.
 */
export async function deleteRecordAction(): Promise<ActionResult> {
  const deleted = await deleteAcademicRecord();
  if (!deleted) return { ok: false, error: "Could not erase the record." };
  refresh();
  return { ok: true };
}
