/**
 * Contract tests for the Core approved-course lists.
 *
 * These run against real captured Bulletin HTML and, like the rest of the parse
 * lane, assert CONCRETE known-good values rather than shapes — a test that only
 * checked `entries.length > 0` would have passed on every regression this file
 * is here to catch.
 *
 * There is a second job here that is not about markup at all. The flag keys
 * written by `core-flags.ts` and the flag keys selected on by
 * `lib/requirements/programs/*.ts` are two independently authored string
 * literals that MUST agree. When they disagree the app does not crash and no
 * test fails by default: the requirement simply reports zero candidates, which
 * on screen is indistinguishable from "you have finished this". `flag keys
 * match the authored programs` closes that gap.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AUTHORED_PROGRAMS } from "@/lib/requirements/programs";
import type { CourseSelector, RequirementRule } from "@/lib/requirements/types";

import {
  CORE_FLAG_KEYS,
  CORE_FLAG_SOURCES,
  collectCoreFlags,
  readCoreFlagPage,
} from "./core-flags";
import { parseCoreCourseList } from "./parsers/core-lists";

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
}

const GLOBAL_CORE_HTML = fixture("bulletin-core-global-core.html");
const SCIENCE_HTML = fixture("bulletin-core-science.html");

const globalCoreSource = CORE_FLAG_SOURCES.find((s) => s.id === "global-core")!;
const scienceSource = CORE_FLAG_SOURCES.find((s) => s.id === "science")!;

describe("parseCoreCourseList", () => {
  it("reads the Global Core list, splitting it by the heading each table sits under", () => {
    const parsed = parseCoreCourseList(GLOBAL_CORE_HTML);

    // Five tables: three per-term, two master lists split by campus.
    expect(parsed.headings).toEqual([
      "Fall 2026",
      "Summer 2026",
      "Spring 2026",
      "All Approved Courses: Morningside Campus",
      "All Approved Courses: Offered Abroad",
    ]);

    expect(parsed.lastUpdatedText).toBe("Last updated on June 23, 2026.");

    const ids = new Set(parsed.entries.map((e) => e.courseId));
    expect(ids.size).toBeGreaterThan(300);
    // The first row of the Fall 2026 table, verbatim.
    expect(ids.has("AFAS1001UN")).toBe(true);
  });

  it("survives the non-breaking space between subject and number", () => {
    /*
     * The markup is `title="AFAS\u00a0UN1001"` — the separator is a NON-BREAKING
     * SPACE, not a space. This is the single highest-value assertion in the
     * file: every naive `[A-Z]{4} [A-Z]{2}\d{4}` pattern matches ZERO rows
     * against the real page, and an empty approved list reads downstream as
     * "nothing left to take" rather than as a parse failure.
     *
     * The literals below are written as escapes on purpose. Typed as visible
     * characters these strings are indistinguishable on screen, and an
     * assertion nobody can read is an assertion nobody can maintain.
     */
    expect(GLOBAL_CORE_HTML).toContain("AFAS\u00a0UN1001");

    const entry = parseCoreCourseList(GLOBAL_CORE_HTML).entries.find(
      (e) => e.courseId === "AFAS1001UN",
    );
    expect(entry).toBeDefined();
    // Normalised on the way out, so nothing downstream has to know about NBSP.
    expect(entry!.code).toBe("AFAS\u0020UN1001");
    expect(entry!.department).toBe("African-American Studies");
    expect(entry!.heading).toBe("Fall 2026");
  });

  it("keeps Science B and Science C apart", () => {
    const parsed = parseCoreCourseList(SCIENCE_HTML);

    // Science A is Frontiers of Science — a named course, so it has no table.
    expect(parsed.headings).toEqual(["Science B", "Science C"]);

    const b = new Set(
      parsed.entries.filter((e) => e.heading === "Science B").map((e) => e.courseId),
    );
    const c = new Set(
      parsed.entries.filter((e) => e.heading === "Science C").map((e) => e.courseId),
    );
    expect(b.size).toBe(60);
    expect(c.size).toBe(81);

    // COMS is approved for Science C but NOT Science B. If a change ever makes
    // these two sets identical, the distribution rule has been flattened.
    expect(c.has("COMS1004W")).toBe(true);
    expect(b.has("COMS1004W")).toBe(false);
  });

  it("ignores page furniture headings", () => {
    // "Columbia College", "College Offices" and "Follow Us" are footer <h2>s on
    // the science page. If one of them became the active heading, the table
    // above it would lose its category.
    const parsed = parseCoreCourseList(SCIENCE_HTML);
    expect(parsed.headings).not.toContain("Follow Us");
  });
});

describe("core flag assignment", () => {
  it("flags every Global Core table, across all terms", () => {
    const page = readCoreFlagPage(globalCoreSource, GLOBAL_CORE_HTML);
    expect(page.unmappedHeadings).toEqual([]);
    expect(page.flaggedCourseIds.length).toBeGreaterThan(300);
  });

  it("flags Science B and C but never invents a Science A flag", () => {
    const page = readCoreFlagPage(scienceSource, SCIENCE_HTML);
    expect(page.unmappedHeadings).toEqual([]);

    const flags = collectCoreFlags([page]);
    // BIOL UN2005 is on the Science C list.
    expect(flags.get("COMS1004W")).toEqual({
      scienceRequirement: true,
      scienceC: true,
    });
  });

  it("merges pages without either one clobbering the other", () => {
    const flags = collectCoreFlags([
      readCoreFlagPage(globalCoreSource, GLOBAL_CORE_HTML),
      readCoreFlagPage(scienceSource, SCIENCE_HTML),
    ]);

    // Only `true` keys are ever stored — the column's documented shape, and
    // what the `@> '{"globalCore":true}'` containment query needs.
    for (const value of flags.values()) {
      expect(Object.values(value).every((v) => v === true)).toBe(true);
    }

    expect(flags.size).toBeGreaterThan(380);
  });

  it("writes only keys listed in CORE_FLAG_KEYS", () => {
    const flags = collectCoreFlags(
      CORE_FLAG_SOURCES.map((source) =>
        readCoreFlagPage(source, source.id === "science" ? SCIENCE_HTML : GLOBAL_CORE_HTML),
      ),
    );

    const written = new Set<string>();
    for (const value of flags.values()) for (const key of Object.keys(value)) written.add(key);

    expect([...written].sort()).toEqual(
      [...CORE_FLAG_KEYS].filter((k) => written.has(k)).sort(),
    );
  });

  it("flag keys match the authored programs that select on them", () => {
    /*
     * The failure this catches is silent by construction: a program selecting
     * `flag: "scienceReq"` against a column populated with `scienceRequirement`
     * produces an empty candidate list, and an empty candidate list renders as
     * a finished requirement. Nothing throws.
     */
    const selectors: CourseSelector[] = [];
    const collect = (rule: RequirementRule) => {
      if (rule.kind === "n_matching" || rule.kind === "points_matching") {
        selectors.push(rule.select);
      }
    };
    for (const program of AUTHORED_PROGRAMS) {
      for (const group of program.groups) collect(group.rule);
    }

    const selected = new Set(
      selectors.map((s) => s.flag).filter((f): f is string => f != null),
    );
    expect(selected.size).toBeGreaterThan(0);

    for (const flag of selected) {
      expect(CORE_FLAG_KEYS as readonly string[]).toContain(flag);
    }
  });
});
