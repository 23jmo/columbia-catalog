/**
 * Mapper tests for the row → domain boundary.
 *
 * `rowToCourseWithSections` is the single chokepoint every embedded section
 * read passes through — eight call sites in `catalog-queries.ts` use
 * `COURSE_WITH_TERM_SECTIONS_SELECT`, and all of them arrive here. That makes
 * it the right place for the withdrawn-section filter and the wrong place for
 * a regression to go unnoticed.
 */

import { describe, expect, it } from "vitest";

import { rowToCourseWithSections, type CourseRow, type SectionRow } from "./schema";

function courseRow(): CourseRow {
  return {
    course_id: "COMS4113W",
    subject_code: "COMS",
    course_number: 4113,
    qualifier: "W",
    title: "Distributed Systems",
    description: null,
    points_min: 3,
    points_max: 3,
    prerequisite_text: null,
    corequisite_text: null,
    department: "Computer Science",
    requirement_flags: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function sectionRow(overrides: Partial<SectionRow> = {}): SectionRow {
  return {
    section_id: "20263COMS4113W001",
    course_id: "COMS4113W",
    term_code: "20263",
    subject_code: "COMS",
    call_number: "19581",
    section_code: "001",
    title: null,
    component: "LECTURE",
    method_of_instruction: "In-Person",
    grading_mode: "Standard",
    min_unit: 3,
    max_unit: 3,
    enrollment_count: 22,
    enrollment_cap: 110,
    waitlist_count: 0,
    waitlist_cap: null,
    status: "open",
    source_as_of: null,
    source_as_of_raw: null,
    last_seen_at: null,
    detail_url: null,
    note: null,
    open_to: null,
    withdrawn_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// The mapper takes rows carrying embedded relations; the relation shape is not
// what these tests are about, so they supply the sections and nothing else.
function withSections(sections: SectionRow[]) {
  return { ...courseRow(), sections } as Parameters<typeof rowToCourseWithSections>[0];
}

describe("rowToCourseWithSections", () => {
  it("drops sections Columbia has withdrawn", () => {
    const result = rowToCourseWithSections(
      withSections([
        sectionRow({ section_id: "live", section_code: "001" }),
        sectionRow({
          section_id: "pulled",
          section_code: "002",
          withdrawn_at: "2026-08-24T03:10:34Z",
        }),
      ]),
    );

    expect(result.sections.map((s) => s.sectionId)).toEqual(["live"]);
  });

  it("returns a course with no sections rather than throwing when all are withdrawn", () => {
    // A real case: GNPH8090P in 20251 has exactly one section and it was
    // pulled. The course still exists; it simply has nothing to show.
    const result = rowToCourseWithSections(
      withSections([sectionRow({ withdrawn_at: "2026-08-24T03:10:34Z" })]),
    );

    expect(result.courseId).toBe("COMS4113W");
    expect(result.sections).toEqual([]);
  });

  it("still filters by term, and the two filters compose", () => {
    const result = rowToCourseWithSections(
      withSections([
        sectionRow({ section_id: "fall-live", term_code: "20263" }),
        sectionRow({ section_id: "spring-live", term_code: "20271" }),
        sectionRow({
          section_id: "fall-pulled",
          term_code: "20263",
          withdrawn_at: "2026-08-24T03:10:34Z",
        }),
      ]),
      "20263",
    );

    expect(result.sections.map((s) => s.sectionId)).toEqual(["fall-live"]);
  });

  it("keeps every live section when none are withdrawn", () => {
    const result = rowToCourseWithSections(
      withSections([
        sectionRow({ section_id: "a", section_code: "001" }),
        sectionRow({ section_id: "b", section_code: "002" }),
      ]),
    );

    expect(result.sections).toHaveLength(2);
  });
});
