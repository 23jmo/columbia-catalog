/**
 * Reads and writes for the self-reported academic record (migration 0017).
 *
 * Follows the house rules from `client.ts`: never throws at import time, and
 * `null` when Supabase is absent or nobody is signed in — which is a correct
 * answer here rather than an error, because reads are free but a profile
 * belongs to an account.
 *
 * Every statement below runs through the RLS'd tables as the *invoker*, so the
 * user id is never a parameter. A caller cannot ask for someone else's record
 * because there is no argument in which to name them.
 */

import type { School } from "@/lib/requirements/types";
import {
  EMPTY_PROFILE,
  type CourseSource,
  type StudentProfile,
  type TakenCourse,
} from "@/lib/profile/types";

import { createServerSupabaseClient } from "./client";
import type { StudentProfileInsert } from "./schema";

interface ProfileRow {
  user_id: string;
  school: string | null;
  program_ids: string[] | null;
  class_year: string | null;
  interest_tags: string[] | null;
  attestations: Record<string, string> | null;
  updated_at: string | null;
}

interface CourseRow {
  course_id: string;
  term_code: string | null;
  term_label: string | null;
  points: number | string | null;
  liked: boolean | null;
  source: string;
  added_at: string;
}

const SCHOOLS: School[] = ["CC", "SEAS", "GS", "BC"];
const SOURCES: CourseSource[] = ["picker", "transcript_paste", "transcript_pdf", "plan"];

function toSchool(value: string | null): School | null {
  return value != null && (SCHOOLS as string[]).includes(value) ? (value as School) : null;
}

function toSource(value: string): CourseSource {
  return (SOURCES as string[]).includes(value) ? (value as CourseSource) : "picker";
}

/**
 * PostgREST serializes `numeric` as an unquoted number, but a proxy that
 * stringifies could hand back `"3.00"`. Same defence as `schema.ts`'s `num()`:
 * one bad assumption must not become a NaN in a credit total.
 */
function toPoints(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCourse(row: CourseRow): TakenCourse {
  return {
    courseId: row.course_id,
    termCode: row.term_code,
    termLabel: row.term_label,
    points: toPoints(row.points),
    // Passed through as the tri-state it is. `?? false` here would be the
    // single change that silently breaks the taste vector.
    liked: row.liked,
    source: toSource(row.source),
    addedAt: row.added_at,
  };
}

/**
 * The signed-in student's profile, or `null` when nobody is signed in.
 *
 * A signed-in student with no row yet gets an empty profile rather than `null`,
 * so the screen can render its own onboarding instead of every caller having to
 * distinguish "signed out" from "signed in but has not started".
 */
export async function loadStudentProfile(): Promise<StudentProfile | null> {
  const client = await createServerSupabaseClient();
  if (!client) return null;

  const { data: userData } = await client.auth.getUser();
  const user = userData?.user;
  if (!user) return null;

  const [profileResult, coursesResult] = await Promise.all([
    client
      .from("student_profiles")
      .select("user_id, school, program_ids, class_year, interest_tags, attestations, updated_at")
      .maybeSingle(),
    client
      .from("student_courses")
      .select("course_id, term_code, term_label, points, liked, source, added_at")
      .order("added_at", { ascending: false }),
  ]);

  const profile = (profileResult.data ?? null) as ProfileRow | null;
  const courses = ((coursesResult.data ?? []) as CourseRow[]).map(toCourse);

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;

  return {
    ...EMPTY_PROFILE,
    userId: user.id,
    displayName,
    email: user.email ?? null,
    school: toSchool(profile?.school ?? null),
    programIds: profile?.program_ids ?? [],
    classYear: profile?.class_year ?? null,
    interestTags: profile?.interest_tags ?? [],
    attestations: profile?.attestations ?? {},
    courses,
    updatedAt: profile?.updated_at ?? null,
  };
}

export interface ProfileDraft {
  school?: School | null;
  programIds?: string[];
  classYear?: string | null;
  attestations?: Record<string, string>;
}

/** Upsert the degree context. Returns false when the write did not land. */
export async function saveStudentProfile(draft: ProfileDraft): Promise<boolean> {
  const client = await createServerSupabaseClient();
  if (!client) return false;

  const { data: userData } = await client.auth.getUser();
  const user = userData?.user;
  if (!user) return false;

  /*
   * Built field by field rather than spread wholesale, so an absent key in the
   * draft means "leave it alone" and an explicit `null` means "clear it".
   * Spreading would send `school: undefined`, which PostgREST drops — making
   * "clear my school" silently impossible.
   */
  const patch: StudentProfileInsert = { user_id: user.id };
  if (draft.school !== undefined) patch.school = draft.school;
  if (draft.programIds !== undefined) patch.program_ids = draft.programIds;
  if (draft.classYear !== undefined) patch.class_year = draft.classYear;
  if (draft.attestations !== undefined) patch.attestations = draft.attestations;

  const { error } = await client.from("student_profiles").upsert(patch, {
    onConflict: "user_id",
  });
  return !error;
}

export interface CourseDraft {
  courseId: string;
  termCode?: string | null;
  termLabel?: string | null;
  points?: number | null;
  source: CourseSource;
}

/**
 * Add coursework. Idempotent by `(user_id, course_id)`.
 *
 * A bulk upsert rather than a loop: a transcript import is a hundred rows and a
 * hundred round trips would make the confirm button feel broken. `ignoreDuplicates`
 * is off so re-importing a transcript corrects a row rather than skipping it —
 * the second import is usually the one with better data.
 */
export async function addStudentCourses(drafts: CourseDraft[]): Promise<number> {
  if (drafts.length === 0) return 0;

  const client = await createServerSupabaseClient();
  if (!client) return 0;

  const { data: userData } = await client.auth.getUser();
  const user = userData?.user;
  if (!user) return 0;

  const rows = drafts.map((draft) => ({
    user_id: user.id,
    course_id: draft.courseId,
    term_code: draft.termCode ?? null,
    term_label: draft.termLabel ?? null,
    points: draft.points ?? null,
    source: draft.source,
  }));

  const { error, count } = await client
    .from("student_courses")
    .upsert(rows, { onConflict: "user_id,course_id", count: "exact" });

  return error ? 0 : (count ?? rows.length);
}

export async function removeStudentCourse(courseId: string): Promise<boolean> {
  const client = await createServerSupabaseClient();
  if (!client) return false;

  const { error } = await client
    .from("student_courses")
    .delete()
    .eq("course_id", courseId);
  return !error;
}

/**
 * Erase the academic record, keeping the account and its schedules.
 *
 * Named practice in `vergil_api_spec.md` §15 ("user-initiated deletion and
 * export of stored personal data"). The RPC is `security invoker`, so it can
 * only ever reach the caller's own rows.
 */
export async function deleteAcademicRecord(): Promise<boolean> {
  const client = await createServerSupabaseClient();
  if (!client) return false;
  const { error } = await client.rpc("delete_my_academic_record");
  return !error;
}
