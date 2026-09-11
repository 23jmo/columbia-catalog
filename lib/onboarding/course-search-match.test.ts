import { describe, expect, it } from "vitest";

import { matchCourseHits, searchKeys, type SearchListing } from "./course-search-match";

/** The registrar's actual Spanish titles for Fall 2026, abbreviations and all. */
const SPANISH: SearchListing[] = [
  ["SPAN2101UN", "INTERMEDIATE SPANISH I"],
  ["SPAN2102UN", "INTERMEDIATE SPANISH II"],
  ["SPAN2103UN", "INTERMED SPAN II - MEDICAL"],
  ["SPAN2120UN", "COMPREHENSIVE INTER SPANISH"],
  ["SPAN1101UN", "ELEMENTARY SPANISH I"],
  ["MATH1201UN", "CALCULUS III"],
  ["COMS3134W", "Data Structures in Java"],
].map(([courseId, title]) => ({ courseId, title, points: 3, ...searchKeys(courseId, title) }));

const ids = (query: string) => matchCourseHits(query, SPANISH).map((hit) => hit.courseId);

describe("matchCourseHits", () => {
  it("finds a course the registrar abbreviated, by its full name", () => {
    // The report that produced this file: "the search just didn't yield it
    // (only intermediate I, II, and medical)".
    expect(ids("accelerated intermediate spanish")).toContain("SPAN2120UN");
    expect(ids("intermediate spanish")).toContain("SPAN2120UN");
    expect(ids("intermediate spanish")).toContain("SPAN2103UN");
  });

  it("ranks whole-title matches above the ones that needed an allowance", () => {
    const hits = ids("intermediate spanish");
    expect(hits.indexOf("SPAN2101UN")).toBeLessThan(hits.indexOf("SPAN2120UN"));
  });

  it("forgives one missing word only when there are three or more", () => {
    expect(ids("accelerated spanish")).toEqual([]);
    expect(ids("accelerated intermediate spanish")).not.toContain("SPAN1101UN");
  });

  it("does not let a two-letter query word complete every title", () => {
    expect(ids("in java")).toEqual(["COMS3134W"]);
  });

  it("still puts a typed code first", () => {
    expect(ids("MATH 1201")[0]).toBe("MATH1201UN");
    expect(ids("calc")).toEqual(["MATH1201UN"]);
  });
});
