/**
 * Tests for the CULPA JSON adapter.
 *
 * Fixtures in `__fixtures__/` are REAL responses captured from culpa.info on
 * 2026-08-24, trimmed only in length. They are the thing the HTML adapter never
 * had — see the header of `sources/culpa.ts`. When CULPA changes its API, these
 * are what should fail first.
 *
 * No test here touches the network. `StubFetcher` serves fixtures by URL.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { FetchedPage, PageFetcher } from "./sources/contract";
import { resolveInstructorName, surnameOf } from "./instructor-match";
import {
  CULPA_API_ROUTES,
  CulpaApiAdapter,
  chooseCourse,
  chooseProfessor,
  parseCourseSearch,
  parseProfessorSearch,
  parseReviewsPage,
  toUtcIsoDate,
} from "./sources/culpa-api";

const FIXTURE_DIR = join(__dirname, "__fixtures__");

function fixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

const PROFESSOR_SEARCH = fixture("culpa-professor-search.json");
const COURSE_SEARCH = fixture("culpa-course-search.json");
const PROFESSOR_REVIEWS = fixture("culpa-professor-reviews.json");

/** Pacing that never sleeps, so tests run at full speed. */
const NO_WAIT = {
  pacing: {
    minIntervalMs: 0,
    jitterMs: 0,
    maxRequestsPerRun: 50,
    maxRequestsPerHour: 500,
  },
  pacerOptions: { sleep: async () => {}, random: () => 0 },
};

class StubFetcher implements PageFetcher {
  readonly requested: string[] = [];
  constructor(private readonly routes: Array<[RegExp, string | number]>) {}

  async get(url: string): Promise<FetchedPage> {
    this.requested.push(url);
    for (const [pattern, response] of this.routes) {
      if (!pattern.test(url)) continue;
      return typeof response === "number"
        ? { url, status: response, body: "" }
        : { url, status: 200, body: response };
    }
    return { url, status: 404, body: "" };
  }
}

describe("professor matching", () => {
  const candidates = parseProfessorSearch(PROFESSOR_SEARCH);

  it("reads the captured search payload", () => {
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates[0]).toHaveProperty("professor_id");
  });

  /*
   * The regression this whole matcher exists for. CULPA's relevance ranking
   * puts "Jae Woo" (a name-split artifact, no UNI) above the real "Jae Lee"
   * (uni jwl3) when searching "Jae Woo Lee". Taking the top hit files one
   * professor's reviews under another's name.
   */
  it("does not take the top relevance hit when it is the wrong person", () => {
    const top = candidates[0];
    expect(`${top.first_name} ${top.last_name}`).toBe("Jae Woo");

    const chosen = chooseProfessor("Jae Woo Lee", candidates);
    expect(chosen?.professor_id).not.toBe(top.professor_id);
    expect(chosen?.last_name).toBe("Lee");
  });

  it("prefers an exact full-name match over anything else", () => {
    const chosen = chooseProfessor("Jae Woo", candidates);
    expect(chosen && `${chosen.first_name} ${chosen.last_name}`).toBe("Jae Woo");
  });

  it("returns null rather than guessing when no surname matches", () => {
    expect(chooseProfessor("Ada Lovelace", candidates)).toBeNull();
  });

  it("returns null when no candidate's given name fits", () => {
    const ambiguous = [
      { professor_id: 1, first_name: "Alice", last_name: "Chen", uni: null },
      { professor_id: 2, first_name: "Bob", last_name: "Chen", uni: null },
    ];
    expect(chooseProfessor("Carol Chen", ambiguous)).toBeNull();
  });

  /*
   * A shared surname alone must not disqualify a match — the captured fixture
   * holds both "Jae Lee" and "Seok-Woo Lee", and only one of them can be the
   * Jae Woo Lee we asked for. But two candidates who BOTH fit the given name
   * is exactly when guessing does damage.
   */
  it("still matches when an unrelated person shares the surname", () => {
    const candidates = parseProfessorSearch(PROFESSOR_SEARCH);
    expect(candidates.filter((c) => c.last_name === "Lee")).toHaveLength(2);
    expect(chooseProfessor("Jae Woo Lee", candidates)?.uni).toBe("jwl3");
  });

  it("returns null when two candidates both fit the given name", () => {
    const twins = [
      { professor_id: 1, first_name: "Jae", last_name: "Lee", uni: "a" },
      { professor_id: 2, first_name: "Jae", last_name: "Lee", uni: "b" },
    ];
    expect(chooseProfessor("Jae Woo Lee", twins)).toBeNull();
  });
});

describe("course matching", () => {
  const candidates = parseCourseSearch(COURSE_SEARCH);

  it("ignores same-number courses from other subjects", () => {
    // The captured search for COMS W4118 also returns EAAS W4118.
    expect(candidates.some((c) => c.course_code === "EAAS W4118")).toBe(true);
    const chosen = chooseCourse("COMS4118W", candidates);
    expect(chosen?.course_code).toBe("COMS W4118");
  });

  it("matches across the two spellings of a course code", () => {
    expect(chooseCourse("COMS W4118", candidates)?.course_code).toBe("COMS W4118");
    expect(chooseCourse("COMS4118W", candidates)?.course_code).toBe("COMS W4118");
  });

  it("returns null when the code is absent rather than taking a near hit", () => {
    expect(chooseCourse("MATH1201UN", candidates)).toBeNull();
  });
});

describe("review page parsing", () => {
  const parsed = parseReviewsPage(PROFESSOR_REVIEWS, {
    pageUrl: "https://culpa.info/professor/42",
  });

  it("maps every review in the payload", () => {
    expect(parsed.records).toHaveLength(parsed.documents.length);
    expect(parsed.records.length).toBeGreaterThan(0);
    expect(parsed.hasRows).toBe(true);
  });

  it("reports the corpus total, not the page count", () => {
    // The captured page holds 3 reviews; the professor has 18.
    expect(parsed.totalReviews).toBe(18);
    expect(parsed.records.length).toBeLessThan(parsed.totalReviews!);
  });

  it("normalises the course code to our own courseId form", () => {
    const withCourse = parsed.records.find((record) => record.courseId !== null);
    expect(withCourse?.courseId).toMatch(/^[A-Z]{4}\d{4}[A-Z]?$/);
  });

  it("carries CULPA's numeric rating into teachingQuality and nothing else", () => {
    const rated = parsed.records.find((record) => record.teachingQuality !== null);
    expect(rated).toBeDefined();
    expect(rated!.teachingQuality).toBeGreaterThanOrEqual(1);
    expect(rated!.teachingQuality).toBeLessThanOrEqual(5);
    // Every other dimension is the extractor's job — this adapter never guesses.
    expect(rated!.workload).toBeNull();
    expect(rated!.difficulty).toBeNull();
    expect(rated!.gradingFairness).toBeNull();
    expect(rated!.sentiment).toBeNull();
    expect(rated!.wouldTakeAgain).toBeNull();
  });

  it("keeps the prose workload string as a raw field", () => {
    const withWorkload = parsed.documents.find((doc) => doc.fields.workload);
    expect(withWorkload?.fields.workload).toBeTypeOf("string");
  });

  it("always attributes a record back to a real page", () => {
    for (const record of parsed.records) {
      expect(record.url).toBe("https://culpa.info/professor/42");
    }
  });

  it("uses CULPA's own review id so re-ingest updates rather than duplicates", () => {
    for (const record of parsed.records) {
      expect(record.reviewId).toMatch(/^culpa:\d+$/);
    }
  });

  it("degrades to a warning on malformed input instead of throwing", () => {
    const broken = parseReviewsPage("{not json", { pageUrl: "u" });
    expect(broken.records).toHaveLength(0);
    expect(broken.warnings.join(" ")).toContain("unparseable");
  });

  it("treats an empty page as the end of the walk", () => {
    const empty = parseReviewsPage(JSON.stringify({ number_of_reviews: 18, reviews: [] }), {
      pageUrl: "u",
    });
    expect(empty.hasRows).toBe(false);
  });
});

describe("timestamps", () => {
  /*
   * CULPA sends a naive local timestamp with no zone. Reading it as UTC keeps
   * a stored date stable no matter where ingest runs.
   */
  it("reads a zoneless timestamp as UTC", () => {
    expect(toUtcIsoDate("2020-01-27T02:19:07")).toBe("2020-01-27T02:19:07.000Z");
  });

  it("respects an explicit zone when one is present", () => {
    expect(toUtcIsoDate("2020-01-27T02:19:07Z")).toBe("2020-01-27T02:19:07.000Z");
  });

  it("returns null rather than an Invalid Date", () => {
    expect(toUtcIsoDate("not a date")).toBeNull();
    expect(toUtcIsoDate("")).toBeNull();
  });
});

describe("adapter pagination", () => {
  /** Three pages: 5, 5, then empty — 10 reviews total. */
  function pagedRoutes(): Array<[RegExp, string | number]> {
    const makePage = (ids: number[]) =>
      JSON.stringify({
        number_of_reviews: 10,
        reviews: ids.map((id) => ({
          review_id: id,
          content: `review body ${id}`,
          rating: 4,
          workload: "heavy",
          submission_date: "2024-03-01T12:00:00",
          course_header: { course_id: 1, course_code: "COMS W4118", course_name: "OS I" },
          professor_header: { professor_id: 3509, first_name: "Jae", last_name: "Lee", uni: "jwl3" },
        })),
      });
    return [
      [/professor\/search/, PROFESSOR_SEARCH],
      [/review\/professor\/\d+\?page=1/, makePage([1, 2, 3, 4, 5])],
      [/review\/professor\/\d+\?page=2/, makePage([6, 7, 8, 9, 10])],
      [/review\/professor\/\d+\?page=3/, JSON.stringify({ number_of_reviews: 10, reviews: [] })],
    ];
  }

  it("walks every page rather than stopping at the first", async () => {
    const fetcher = new StubFetcher(pagedRoutes());
    const adapter = new CulpaApiAdapter({ fetcher, ...NO_WAIT });

    const result = await adapter.fetchForInstructor("Jae Woo Lee");

    expect(result.records).toHaveLength(10);
    expect(result.warnings.join(" ")).not.toContain("PARTIAL");
  });

  it("never returns the same review twice across pages", async () => {
    const routes = pagedRoutes();
    // Page 2 repeats one of page 1's reviews, as a shifting corpus would.
    routes[2][1] = JSON.stringify({
      number_of_reviews: 10,
      reviews: [5, 6, 7, 8, 9].map((id) => ({
        review_id: id,
        content: `review body ${id}`,
        rating: 3,
        submission_date: "2024-03-01T12:00:00",
      })),
    });
    const adapter = new CulpaApiAdapter({ fetcher: new StubFetcher(routes), ...NO_WAIT });

    const result = await adapter.fetchForInstructor("Jae Woo Lee");
    const ids = result.records.map((record) => record.reviewId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /*
   * The silent-truncation guard. A one-request budget yields the search and
   * nothing else; the run MUST say the corpus is partial rather than reporting
   * a clean zero.
   */
  it("warns loudly when the pacing ceiling truncates a walk", async () => {
    const adapter = new CulpaApiAdapter({
      fetcher: new StubFetcher(pagedRoutes()),
      pacing: { minIntervalMs: 0, jitterMs: 0, maxRequestsPerRun: 2, maxRequestsPerHour: 500 },
      pacerOptions: { sleep: async () => {}, random: () => 0 },
    });

    const result = await adapter.fetchForInstructor("Jae Woo Lee");

    expect(result.records.length).toBeLessThan(10);
    const warnings = result.warnings.join(" ");
    expect(warnings).toContain("PARTIAL");
    expect(warnings).toContain("pacing ceiling reached");
  });

  it("declines to guess when no professor matches, and says so", async () => {
    const adapter = new CulpaApiAdapter({
      fetcher: new StubFetcher(pagedRoutes()),
      ...NO_WAIT,
    });

    const result = await adapter.fetchForInstructor("Ada Lovelace");

    expect(result.records).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("no confident CULPA professor match");
  });

  it("issues only GET requests to the read endpoints", async () => {
    const fetcher = new StubFetcher(pagedRoutes());
    const adapter = new CulpaApiAdapter({ fetcher, ...NO_WAIT });
    await adapter.fetchForInstructor("Jae Woo Lee");

    for (const url of fetcher.requested) {
      expect(url.startsWith("https://culpa.info/api/")).toBe(true);
      expect(url).not.toMatch(/\/(new|vote|flag|approve|admin_page)\b/);
    }
  });

  it("survives a non-2xx without throwing", async () => {
    const adapter = new CulpaApiAdapter({
      fetcher: new StubFetcher([
        [/professor\/search/, PROFESSOR_SEARCH],
        [/review\/professor/, 503],
      ]),
      ...NO_WAIT,
    });

    const result = await adapter.fetchForInstructor("Jae Woo Lee");
    expect(result.records).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("503");
  });
});

describe("route construction", () => {
  it("paginates the review endpoints", () => {
    expect(CULPA_API_ROUTES.reviewsForProfessor(42, 3)).toBe(
      "https://culpa.info/api/review/professor/42?page=3",
    );
    expect(CULPA_API_ROUTES.reviewsForCourse(2384, 1)).toBe(
      "https://culpa.info/api/review/course/2384?page=1",
    );
  });

  it("escapes a name with a space", () => {
    expect(CULPA_API_ROUTES.professorSearch("Jae Woo Lee")).toContain("Jae%20Woo%20Lee");
  });
});

describe("instructor name reconciliation", () => {
  const catalog = [
    { id: "a", fullName: "Jae W Lee" },
    { id: "b", fullName: "Seok-Woo Lee" },
    { id: "c", fullName: "Jonathan Gross" },
  ];

  /*
   * The bug this exists for: CULPA stored "Jae Lee", every page queries
   * "Jae W Lee", and 55 correctly-ingested reviews were invisible.
   */
  it("resolves a source spelling that drops the middle initial", () => {
    expect(resolveInstructorName("Jae Lee", catalog)?.fullName).toBe("Jae W Lee");
  });

  it("resolves an exact match without consulting the loose rule", () => {
    expect(resolveInstructorName("Seok-Woo Lee", catalog)?.id).toBe("b");
  });

  it("does not match a different person with the same surname", () => {
    expect(resolveInstructorName("Kathleen Lee", catalog)).toBeNull();
  });

  it("refuses to guess between two equally compatible people", () => {
    const twins = [
      { id: "a", fullName: "Jae W Lee" },
      { id: "b", fullName: "Jae K Lee" },
    ];
    expect(resolveInstructorName("Jae Lee", twins)).toBeNull();
  });

  it("never resolves a single-token placeholder to a person", () => {
    expect(resolveInstructorName("Staff", catalog)).toBeNull();
    expect(surnameOf("Staff")).toBeNull();
    expect(surnameOf("Jae W Lee")).toBe("lee");
  });

  it("ignores punctuation and case", () => {
    expect(resolveInstructorName("jae w. lee", catalog)?.id).toBe("a");
  });
});
