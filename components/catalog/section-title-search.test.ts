/**
 * Searching for a class that only exists as a SECTION.
 *
 * Columbia publishes container courses: COMS6998 is one course titled "TOPICS
 * IN COMPUTER SCIENCE" whose 24 sections are 24 unrelated classes -- "LLM Based
 * Generative AI", "Computation and the Brain", "Adv Tpcs Competitive Prog".
 * Those names live on the section (the `<h3>` in `#section-header`), so a
 * catalog that indexes only the course has no searchable text for 24 different
 * classes beyond the same seven generic words.
 *
 * These cases pin the read side end to end: the token reaches BOTH indexes, and
 * the hit carries the section it was about so the row can open on it. They use
 * a synthetic container course because ingest is not writing `Section.title`
 * yet -- which is the point. The moment it does, this is already correct, and
 * if it regresses these fail rather than the gap re-opening silently.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createLocalSearchSource } from "@/components/catalog/search-source";
import { projectCourse } from "@/lib/catalog-list-types";
import { buildIndex } from "@/lib/search/build";
import { SearchEngine } from "@/lib/search/engine";
import { decodeIndex, encodeIndex } from "@/lib/search/index-format";
import type { CourseWithSections } from "@/lib/types";

const seed = JSON.parse(readFileSync("lib/seed/coms-fall2026.json", "utf8")) as CourseWithSections[];

/** A COMS6998-shaped course: one generic title over several distinct classes. */
const TOPICS: CourseWithSections = (() => {
  const donor = seed.find((course) => course.sections.length > 0)!;
  const template = donor.sections[0];
  const titles = [
    "LLM BASED GENERATIVE AI",
    "COMPUTATION AND THE BRAIN",
    "ADV TPCS COMPETITIVE PROG",
    null, // an untitled sibling: the common shape, and it must stay unmatched
  ];
  return {
    ...donor,
    courseId: "COMS6998E",
    subjectCode: "COMS",
    number: 6998,
    qualifier: "E",
    title: "TOPICS IN COMPUTER SCIENCE",
    description: null,
    sections: titles.map((title, index) => ({
      ...template,
      sectionId: `20263COMS6998E00${index + 1}`,
      courseId: "COMS6998E",
      sectionCode: `00${index + 1}`,
      callNumber: `9000${index + 1}`,
      title,
    })),
  };
})();

// Course ordinal is courseId order, and the DISP block is indexed by ordinal --
// so the display array has to be sorted the same way scripts/build-index.ts
// sorts it, or `getCourse` returns a different course's sections.
const catalog = [...seed, TOPICS].sort((a, b) => a.courseId.localeCompare(b.courseId));
const local = createLocalSearchSource(catalog.map(projectCourse));
const built = buildIndex(catalog, {
  indexVersion: "section-title",
  builtAt: "2026-01-01T00:00:00.000Z",
});
// `buildIndex` leaves DISP empty; scripts/build-index.ts fills it. The rows read
// from this block, so the test has to assemble the artifact the same way.
built.display = catalog.map(projectCourse);
const encoded = encodeIndex(built);
// Round-trip through the wire format so the engine reads views over a received
// ArrayBuffer, exactly as it would in the browser.
const engine = new SearchEngine(
  decodeIndex(
    encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer,
  ),
);

describe("section titles are searchable", () => {
  it("finds a class whose name exists only on a section", () => {
    const hits = local.search({ q: "brain" }).hits;
    expect(hits.map((hit) => hit.courseId)).toContain("COMS6998E");
  });

  it("agrees with the binary engine, which is what keeps the hit from vanishing", () => {
    // The local source answers keystrokes; the engine takes over when the index
    // finishes downloading. Disagreement here is a result that appears and then
    // disappears a moment later with nothing on screen to explain it.
    for (const q of ["brain", "generative", "competitive"]) {
      const fromLocal = local.search({ q }).hits.map((hit) => hit.courseId).sort();
      const fromEngine = engine.search({ q }).hits.map((hit) => hit.courseId).sort();
      expect(fromLocal, `query: ${q}`).toEqual(fromEngine);
    }
  });

  it("names the section the query was about, so the row opens on it", () => {
    const hit = local.search({ q: "brain" }).hits.find((h) => h.courseId === "COMS6998E")!;
    expect(hit.matchedSectionIds).toEqual(["20263COMS6998E002"]);
  });

  it("names the same section on the engine path, which is what renders", () => {
    // /search now renders rows from the binary index, so the engine is the path
    // a user actually hits. If only the local source singled out the section,
    // the row would open correctly for one frame and then collapse.
    const hit = engine.search({ q: "brain" }).hits.find((h) => h.courseId === "COMS6998E")!;
    expect(hit.matchedSectionIds).toEqual(["20263COMS6998E002"]);
  });

  it("carries the section title into the index display record", () => {
    // The row reads `engine.getCourse(...)`, not the RSC payload -- a title
    // that reached the postings but not the DISP block would be findable and
    // invisible.
    const course = engine.getCourse("COMS6998E")!;
    expect(course.sections.map((section) => section.title)).toEqual([
      "LLM BASED GENERATIVE AI",
      "COMPUTATION AND THE BRAIN",
      "ADV TPCS COMPETITIVE PROG",
      undefined,
    ]);
  });

  it("uses the best-covered section rather than any token overlap", () => {
    // "computation" hits section 002 only; "6998" hits no section title at all.
    // Counting per section keeps the useful token from being cancelled by the
    // one that was never going to match a title.
    const hit = local.search({ q: "computation 6998" }).hits.find((h) => h.courseId === "COMS6998E");
    expect(hit?.matchedSectionIds).toEqual(["20263COMS6998E002"]);
  });

  it("leaves matchedSectionIds null when the query is about the course", () => {
    // Every section ties, so there is nothing to single out -- the course row
    // is already the whole answer and expanding it would be noise.
    const hit = local.search({ q: "topics" }).hits.find((h) => h.courseId === "COMS6998E");
    expect(hit?.matchedSectionIds).toBeNull();
  });

  it("drops a section title that merely restates the course title", () => {
    // Every section row in the directory carries a title; on an ordinary course
    // it is the course title again. Shipping ~8,000 of those would put a
    // meaningless caption next to every section code.
    const echoed = projectCourse({
      ...TOPICS,
      title: "COMPUTER SCIENCE THEORY",
      sections: TOPICS.sections.map((section) => ({
        ...section,
        title: "computer   science theory", // same string, different case/spacing
      })),
    });
    expect(echoed.sections.every((section) => section.title === undefined)).toBe(true);
  });

  it("ranks a section-title match above a course that only mentions the word", () => {
    const ranked = local.search({ q: "generative" }).hits;
    expect(ranked[0]?.courseId).toBe("COMS6998E");
  });
});
