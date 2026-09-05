/**
 * Searching for a class that only exists as a SECTION.
 *
 * Columbia publishes container courses: COMS6998 is one course titled "TOPICS
 * IN COMPUTER SCIENCE" whose 20 Fall 2026 sections are 20 unrelated classes --
 * "LLM BASED GENERATIVE AI", "COMPUTATION AND THE BRAIN", "ADV TPCS COMPETITIVE
 * PROG". Those names live on the section (the `<h1>` in each row's
 * `div.course-details`), so a catalog that indexes only the course has no
 * searchable text for 20 different classes beyond the same four generic words.
 *
 * These cases pin the read side end to end: the token reaches BOTH indexes, and
 * the hit carries the section it was about so the row can open on it.
 *
 * They run against the real seed rather than a synthetic stand-in. The seed is
 * 43 real COMS courses captured from the directory, and it now carries the
 * section titles that page prints (`scripts/enrich-seed-section-titles.ts`), so
 * the fixture and production data are the same thing -- which is the only way
 * these assertions can catch the titles going missing again.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createLocalSearchSource } from "@/components/catalog/search-source";
import { isDistinctSectionTitle, projectCourse } from "@/lib/catalog-list-types";
import { buildIndex } from "@/lib/search/build";
import { SearchEngine } from "@/lib/search/engine";
import { decodeIndex, encodeIndex } from "@/lib/search/index-format";
import type { CourseWithSections } from "@/lib/types";

const seed = JSON.parse(readFileSync("lib/seed/coms-fall2026.json", "utf8")) as CourseWithSections[];

/** The container course: one generic title over 20 unrelated classes. */
const TOPICS = seed.find((course) => course.courseId === "COMS6998E")!;
/** An ordinary course: every section row restates the course's own name. */
const ORDINARY = seed.find((course) => course.courseId === "COMS4111W")!;

/** "COMPUTATION AND THE BRAIN" -- the section the `brain` queries are about. */
const BRAIN = TOPICS.sections.find((section) => /BRAIN/i.test(section.title ?? ""))!;

// Course ordinal is courseId order, and the DISP block is indexed by ordinal --
// so the display array has to be sorted the same way scripts/build-index.ts
// sorts it, or `getCourse` returns a different course's sections.
const catalog = [...seed].sort((a, b) => a.courseId.localeCompare(b.courseId));
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
    expect(hit.matchedSectionIds).toEqual([BRAIN.sectionId]);
  });

  it("names the same section on the engine path, which is what renders", () => {
    // /search now renders rows from the binary index, so the engine is the path
    // a user actually hits. If only the local source singled out the section,
    // the row would open correctly for one frame and then collapse.
    const hit = engine.search({ q: "brain" }).hits.find((h) => h.courseId === "COMS6998E")!;
    expect(hit.matchedSectionIds).toEqual([BRAIN.sectionId]);
  });

  it("carries the section title into the index display record", () => {
    // The row reads `engine.getCourse(...)`, not the RSC payload -- a title
    // that reached the postings but not the DISP block would be findable and
    // invisible.
    const course = engine.getCourse("COMS6998E")!;
    const titles = course.sections.map((section) => section.title);
    expect(titles).toContain("LLM BASED GENERATIVE AI");
    expect(titles).toContain("COMPUTATION AND THE BRAIN");
    // Every section of a container course names its own class, so none of the
    // 20 may be dropped as a restatement of "TOPICS IN COMPUTER SCIENCE".
    expect(titles.filter(Boolean)).toHaveLength(course.sections.length);
  });

  it("drops the restated titles an ordinary course carries", () => {
    // The directory prints a title on every section row. On COMS 4111 both rows
    // say "INTRODUCTION TO DATABASES", which is the header they already sit
    // under -- shipping it would put a meaningless caption on every section.
    const course = engine.getCourse(ORDINARY.courseId)!;
    expect(ORDINARY.sections.every((section) => Boolean(section.title))).toBe(true);
    expect(course.sections.every((section) => section.title === undefined)).toBe(true);
  });

  it("uses the best-covered section rather than any token overlap", () => {
    // "computation" hits one section only; "6998" hits no section title at all.
    // Counting per section keeps the useful token from being cancelled by the
    // one that was never going to match a title.
    const hit = local.search({ q: "computation 6998" }).hits.find((h) => h.courseId === "COMS6998E");
    expect(hit?.matchedSectionIds).toEqual([BRAIN.sectionId]);
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

/**
 * The registrar truncates, and it truncates the two title fields at different
 * lengths — section titles at 25 characters, course titles at 40. So the same
 * name arrives clipped twice and a naive inequality test calls the two halves
 * "distinct". In Fall 2026 that was 2,748 of 5,001 sections, 55% of everything
 * the app considered a named section, and each one would have led its search
 * row with a word broken off mid-syllable.
 *
 * These pin the rule that fixes it, in both directions: a clipped repeat of the
 * course title is NOT a name, and a section that genuinely says more still is.
 */
describe("isDistinctSectionTitle — registrar truncation", () => {
  it("rejects a section title that is the course title clipped at 25 characters", () => {
    expect(
      isDistinctSectionTitle("Private Equity and Ventur", "Private Equity and Venture Cap"),
    ).toBe(false);
    expect(
      isDistinctSectionTitle("CONTEMP WESTERN CIVILIZAT", "CONTEMP WESTERN CIVILIZATION I"),
    ).toBe(false);
  });

  it("rejects an exact repeat, the ordinary-course case", () => {
    expect(isDistinctSectionTitle("Computer Science Theory", "Computer Science Theory")).toBe(
      false,
    );
  });

  it("ignores punctuation the directory does not keep stable between the fields", () => {
    // The apostrophe survives in one row and becomes a space in the next.
    expect(isDistinctSectionTitle("The Actuarys Toolkit", "The Actuary s Toolkit")).toBe(false);
    expect(isDistinctSectionTitle("GLOBAL MASTERS ESSAY I", "Global Master's Essay I")).toBe(
      false,
    );
  });

  it("rejects a section title the registrar ABBREVIATED rather than clipped", () => {
    /*
     * The shape a prefix test cannot see. The registrar shortens words from the
     * inside and drops vowels, so neither string is a prefix or a subsequence of
     * the other -- and printing "Clin Pract Impl Dntrty II" as though it named a
     * class is worse than printing the course's own complete name.
     */
    expect(
      isDistinctSectionTitle("Clin Pract Impl Dntrty II", "Clin Practice Implant Dentistry II"),
    ).toBe(false);
  });

  it("still lets a vowel-dropped abbreviation through, knowingly", () => {
    /*
     * The bounded gap in the stem test, pinned so it is a decision rather than
     * a surprise: "MODLNG" stems to `modl` and "MODELING" to `mode`, so the two
     * strings share too few stems to be called one name. Closing it needs fuzzy
     * matching, which would start guessing about real container courses -- and a
     * wrong guess THERE hides the actual name of a class, which is the more
     * expensive mistake. Costs a clipped headline on a handful of rows.
     */
    expect(
      isDistinctSectionTitle(
        "PREDICT MODLNG IN FIN & INSRNC",
        "PREDICTIVE MODELING IN FINANCE & INSURAN",
      ),
    ).toBe(true);
  });

  it("keeps a section that genuinely names a different class", () => {
    // The case the whole feature exists for: a container course.
    expect(
      isDistinctSectionTitle("PHED: Swim (Beginner)", "PHYSICAL EDUCATION ACTIVITIES"),
    ).toBe(true);
    expect(
      isDistinctSectionTitle("LLM Based Generative AI", "TOPICS IN COMPUTER SCIENCE"),
    ).toBe(true);
  });

  it("keeps a section title that EXTENDS the course title", () => {
    /*
     * The prefix test has to be one-directional. A section that starts with the
     * course title and continues is saying more, not saying it shorter — and
     * merging that would delete the only place the specific class is named.
     */
    expect(
      isDistinctSectionTitle("Topics in CS: LLMs", "Topics in CS"),
    ).toBe(true);
  });

  it("treats a missing or empty title as no title at all", () => {
    expect(isDistinctSectionTitle(null, "Anything")).toBe(false);
    expect(isDistinctSectionTitle(undefined, "Anything")).toBe(false);
    expect(isDistinctSectionTitle("   ", "Anything")).toBe(false);
    // Punctuation-only folds away to nothing, so it names nothing.
    expect(isDistinctSectionTitle("--", "Anything")).toBe(false);
  });
});
