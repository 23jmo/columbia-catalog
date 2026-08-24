/**
 * Composing a profile, the program registry and the catalog into one audit.
 *
 * The layer that decides *which* programs a student is audited against, and
 * turns their `TakenCourse[]` into the shape `evaluateProgram` wants. All the
 * requirement logic lives in `lib/requirements`; this is the seam between that
 * and the app.
 */

import type { CourseId } from "@/lib/requirements/code";
import {
  crossCountedCourseIds,
  evaluateProgram,
  type CourseFacts,
  type TakenCourseInput,
} from "@/lib/requirements/evaluate";
import { coreForSchool, getProgram } from "@/lib/requirements/programs";
import type { Program, ProgramResult } from "@/lib/requirements/types";
import { attestationKey, type StudentProfile, type TakenCourse } from "./types";

export interface ProfileAudit {
  programs: ProgramResult[];
  /** Courses counting toward more than one requirement. Reported, not resolved. */
  crossCounted: string[];
  /** Points across every course on the record, for the headline figure. */
  totalPoints: number;
  /** Courses we could not find in the catalog — they count for less, honestly. */
  unmatchedCourseIds: string[];
  /** Every group still outstanding, flattened and ordered for the "what's left" card. */
  remaining: RemainingRequirement[];
}

export interface RemainingRequirement {
  programId: string;
  programName: string;
  groupId: string;
  label: string;
  /** How many more courses or points. */
  outstanding: number;
  unit: "courses" | "points";
  verification: ProgramResult["groups"][number]["verification"];
  /** Course ids that would satisfy it, when the rule names a finite set. */
  candidates: string[];
  sourceUrl?: string;
}

/**
 * The programs a student is audited against.
 *
 * The Core is resolved from their school rather than picked, because a Columbia
 * College student cannot elect out of the Core and offering it as an option
 * would imply otherwise. Their declared majors and minors are added on top.
 */
export function programsFor(profile: StudentProfile): Program[] {
  const programs: Program[] = [];
  const core = profile.school ? coreForSchool(profile.school) : undefined;
  if (core) programs.push(core);

  for (const id of profile.programIds) {
    const program = getProgram(id);
    // A core is never a declared program — it is already above, and adding it
    // twice would double every Core requirement on the page.
    if (program && program.kind !== "core") programs.push(program);
  }

  return programs;
}

function toInputs(courses: TakenCourse[]): TakenCourseInput[] {
  return courses.map((course) => ({
    courseId: course.courseId,
    termCode: course.termCode,
    planned: course.source === "plan",
    points: course.points,
  }));
}

export interface AuditOptions {
  profile: StudentProfile;
  /** Catalog facts for every course id we could resolve. */
  catalog: Map<CourseId, CourseFacts>;
}

export function auditProfile({ profile, catalog }: AuditOptions): ProfileAudit {
  const lookup = (courseId: CourseId) => catalog.get(courseId);
  const inputs = toInputs(profile.courses);
  const programs = programsFor(profile);

  const results = programs.map((program) =>
    evaluateProgram(program, {
      taken: inputs,
      lookup,
      /*
       * Attestations are stored program-namespaced but `evaluateProgram` reads
       * them by bare group id, so they are re-keyed per program here. Passing
       * the namespaced map straight through would silently never match, and an
       * attested requirement that never goes green is a bug a student would
       * report as "the tick box does nothing".
       */
      attestations: Object.fromEntries(
        program.groups
          .map((group) => [group.id, profile.attestations[attestationKey(program.id, group.id)]])
          .filter(([, value]) => value != null),
      ),
    }),
  );

  const totalPoints = profile.courses.reduce((sum, course) => {
    return sum + (course.points ?? catalog.get(course.courseId)?.points ?? 0);
  }, 0);

  const unmatchedCourseIds = profile.courses
    .map((course) => course.courseId)
    .filter((courseId) => !catalog.has(courseId));

  const remaining: RemainingRequirement[] = [];
  for (const result of results) {
    for (const group of result.groups) {
      if (group.status === "satisfied") continue;
      remaining.push({
        programId: result.program.id,
        programName: result.program.name,
        groupId: group.group.id,
        label: group.group.label,
        outstanding: Math.max(0, group.required - group.completed),
        unit: group.unit,
        verification: group.verification,
        candidates: group.candidates,
        sourceUrl: group.group.sourceUrl,
      });
    }
  }

  /*
   * Order the outstanding list by how actionable it is, not by program order.
   *
   * A requirement with a named candidate list is something the student can act
   * on in one click; an attested one is a box to tick; a flagged one needs a
   * search. Putting the actionable ones first is what makes this a to-do list
   * rather than a report.
   */
  const rank = { exact: 0, flagged: 1, attested: 2 } as const;
  remaining.sort((a, b) => {
    if (rank[a.verification] !== rank[b.verification]) {
      return rank[a.verification] - rank[b.verification];
    }
    if (a.outstanding !== b.outstanding) return a.outstanding - b.outstanding;
    return a.label.localeCompare(b.label);
  });

  return {
    programs: results,
    crossCounted: crossCountedCourseIds(results),
    totalPoints,
    unmatchedCourseIds,
    remaining,
  };
}

/** 0–1 across every audited program, weighted the same way each one is. */
export function overallProgress(audit: ProfileAudit): number {
  if (audit.programs.length === 0) return 0;
  const sum = audit.programs.reduce((total, result) => total + result.fraction, 0);
  return sum / audit.programs.length;
}
