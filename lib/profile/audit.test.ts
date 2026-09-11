import { describe, expect, it } from "vitest";

import type { CourseId } from "@/lib/requirements/code";
import { toCourseId } from "@/lib/requirements/code";
import type { CourseFacts } from "@/lib/requirements/evaluate";

import { auditProfile } from "./audit";
import { EMPTY_PROFILE, type StudentProfile, type TakenCourse } from "./types";

/**
 * `uncountedCourseIds` — the courses the audit looked at and did not use.
 *
 * The property worth pinning is that this is NOT the same list as
 * `unmatchedCourseIds`, because the two are one careless refactor away from
 * being merged and they answer opposite questions. "We have never heard of this
 * code" is a gap in our catalog; "we know this course and your degree does not
 * need it" is an ordinary elective. Collapsing them would either hide real
 * catalog gaps or accuse a student of a mistake they did not make.
 */

function id(code: string): CourseId {
  const courseId = toCourseId(code);
  if (!courseId) throw new Error(`unparseable fixture code ${code}`);
  return courseId;
}

function taken(code: string): TakenCourse {
  return {
    courseId: id(code),
    termCode: null,
    termLabel: null,
    points: null,
    liked: null,
    source: "picker",
    addedAt: "2026-01-01T00:00:00.000Z",
  };
}

function fact(code: string, title: string): [CourseId, CourseFacts] {
  const courseId = id(code);
  return [courseId, { courseId, title, points: 3, requirementFlags: {} }];
}

function profileWith(courses: TakenCourse[]): StudentProfile {
  return {
    ...EMPTY_PROFILE,
    userId: "test-user",
    programIds: ["cc-major-computer-science"],
    courses,
  };
}

describe("uncountedCourseIds", () => {
  it("leaves out a course a requirement counted", () => {
    /*
     * COMS W3134 is the whole of the CS major's `data-structures` group, so the
     * audit credits it and it must not appear as uncounted. This is the control
     * for the test below: without it, a bug that marked EVERYTHING uncounted
     * would still pass that one.
     */
    const audit = auditProfile({
      profile: profileWith([taken("COMS W3134")]),
      catalog: new Map([fact("COMS W3134", "Data Structures in Java")]),
    });

    expect(audit.uncountedCourseIds).toEqual([]);
  });

  it("names a known course that no requirement needed", () => {
    /*
     * Music Humanities is a real, resolvable course and nothing in the CS major
     * asks for it. That is not an error and the wording on the screen says so —
     * but it has to be listed, because the other reason a course lands here is
     * that we mis-audited it.
     */
    const audit = auditProfile({
      profile: profileWith([taken("COMS W3134"), taken("MUSI V1002")]),
      catalog: new Map([
        fact("COMS W3134", "Data Structures in Java"),
        fact("MUSI V1002", "Masterpieces of Western Music"),
      ]),
    });

    expect(audit.uncountedCourseIds).toEqual([id("MUSI V1002")]);
  });

  it("is not the same list as unmatchedCourseIds", () => {
    /*
     * The distinction, stated as an assertion. `MUSI V1002` is in the catalog
     * and counts toward nothing; `XXXX 9999` is in no catalog at all. A student
     * can act on the second — tell us what it really is — and has nothing to do
     * about the first.
     */
    const audit = auditProfile({
      profile: profileWith([taken("MUSI V1002"), taken("XXXX 9999")]),
      catalog: new Map([fact("MUSI V1002", "Masterpieces of Western Music")]),
    });

    expect(audit.unmatchedCourseIds).toEqual([id("XXXX 9999")]);
    expect(audit.uncountedCourseIds).toContain(id("MUSI V1002"));
    // An unresolvable code counts toward nothing either, so it is in both. The
    // point is that the reverse does not hold.
    expect(audit.unmatchedCourseIds).not.toContain(id("MUSI V1002"));
  });
});
