/**
 * Query relevance first, then personal relevance.
 *
 * The catalog gained a second sort key: how much each course matters to the
 * signed-in student, computed on the server by `catalogRelevanceAction` and
 * installed as an overlay. Three claims hold it in place, and each one is a
 * different way the feature could have been built wrong:
 *
 *   1. Without an overlay nothing moves. A visitor with no record must see the
 *      catalog the engine has always produced, byte for byte — otherwise this
 *      is a rewrite of search rather than an addition to it.
 *   2. With no query, personal relevance IS the order. That is the whole ask.
 *   3. With a query, personal relevance never outranks a better answer. This is
 *      the one a naive weighted blend fails: searching "operating systems"
 *      must return operating systems, not the Global Core seminar the student
 *      happens to need.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { projectCourse } from "@/lib/catalog-list-types";
import { buildIndex } from "@/lib/search/build";
import { SearchEngine, type PersonalOverlayEntry } from "@/lib/search/engine";
import { decodeIndex, encodeIndex } from "@/lib/search/index-format";
import type { CourseWithSections } from "@/lib/types";

const catalog = JSON.parse(
  readFileSync("lib/seed/coms-fall2026.json", "utf8"),
) as CourseWithSections[];
const ordered = [...catalog].sort((a, b) => a.courseId.localeCompare(b.courseId));

function freshEngine(): SearchEngine {
  const encoded = encodeIndex(
    (() => {
      const index = buildIndex(ordered, {
        indexVersion: "personal-ranking",
        builtAt: "2026-01-01T00:00:00.000Z",
      });
      index.display = ordered.map(projectCourse);
      return index;
    })(),
  );
  return new SearchEngine(
    decodeIndex(
      encoded.buffer.slice(
        encoded.byteOffset,
        encoded.byteOffset + encoded.byteLength,
      ) as ArrayBuffer,
    ),
  );
}

const idsFor = (engine: SearchEngine, query: string): string[] =>
  engine.search({ q: query }).hits.map((hit) => hit.courseId);

describe("personal relevance overlay", () => {
  it("changes nothing until it is installed", () => {
    const engine = freshEngine();
    expect(engine.hasPersonalOverlay).toBe(false);

    const before = idsFor(engine, "");
    const withQuery = idsFor(engine, "systems");

    // Installing and then clearing has to land back on the same ordering, not
    // merely a similar one: the overlay allocates and reuses a scratch array,
    // and a `clear` that only dropped the reference would leave stale scores.
    engine.setPersonalOverlay([{ courseId: before[before.length - 1], score: 2 }]);
    engine.clearPersonalOverlay();

    expect(engine.hasPersonalOverlay).toBe(false);
    expect(idsFor(engine, "")).toEqual(before);
    expect(idsFor(engine, "systems")).toEqual(withQuery);
  });

  it("orders an unqueried catalog by personal relevance", () => {
    const engine = freshEngine();
    const baseline = idsFor(engine, "");
    expect(baseline.length).toBeGreaterThan(3);

    // The course the catalog would have listed LAST is the one the student
    // most needs. Nothing about course number can produce this order.
    const promoted = baseline[baseline.length - 1];
    const demoted = baseline[0];
    engine.setPersonalOverlay([
      { courseId: promoted, score: 2 },
      { courseId: demoted, score: -2 },
    ]);

    const ranked = idsFor(engine, "");
    expect(ranked[0]).toBe(promoted);
    expect(ranked[ranked.length - 1]).toBe(demoted);
    // Same set, reordered — a sort key must never be a filter.
    expect([...ranked].sort()).toEqual([...baseline].sort());
  });

  it("keeps unscored courses between the withheld and the ranked", () => {
    const engine = freshEngine();
    const baseline = idsFor(engine, "");
    const ranked = baseline[baseline.length - 1];
    const withheld = baseline[1];

    engine.setPersonalOverlay([
      { courseId: ranked, score: 1.5 },
      { courseId: withheld, score: -1 },
    ]);

    const order = idsFor(engine, "");
    // "We know nothing about this one" has to beat "we know you cannot take
    // it yet", or a prerequisite wall reads as a recommendation.
    expect(order.indexOf(ranked)).toBeLessThan(order.indexOf(withheld));
    expect(order.indexOf(withheld)).toBe(order.length - 1);
  });

  it("never lets personal relevance outrank a better answer to the query", () => {
    const engine = freshEngine();
    const baseline = idsFor(engine, "computer");
    expect(baseline.length).toBeGreaterThan(2);

    const best = baseline[0];
    const worst = baseline[baseline.length - 1];

    // Maximum personal relevance on the WORST match, none on the best. If the
    // two keys were blended rather than banded, this is the input that would
    // put the wrong course on top.
    engine.setPersonalOverlay([{ courseId: worst, score: 2 }]);

    const ranked = idsFor(engine, "computer");
    expect(ranked[0]).toBe(best);
    expect(ranked.indexOf(worst)).toBeGreaterThan(0);
  });

  it("orders comparably relevant hits personally", () => {
    const engine = freshEngine();
    const baseline = idsFor(engine, "computer");

    /*
     * Take the tail of the result list, where scores are close enough to share
     * a band, and reverse it with personal relevance. This is the half of the
     * contract the previous case cannot show: banding that only ever preserved
     * the query order would pass "never outranks" trivially and do nothing.
     */
    const tail = baseline.slice(Math.max(1, baseline.length - 5));
    const overlay: PersonalOverlayEntry[] = tail.map((courseId, position) => ({
      courseId,
      score: position + 1,
    }));
    engine.setPersonalOverlay(overlay);

    const ranked = idsFor(engine, "computer");
    const rerankedTail = ranked.filter((courseId) => tail.includes(courseId));
    expect(rerankedTail).toEqual([...tail].reverse());
  });
});
