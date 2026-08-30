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
import {
  SearchEngine,
  type PersonalOverlayEntry,
  type SearchEngineOptions,
} from "@/lib/search/engine";
import { buildEmbeddingBlock, decodeIndex, encodeIndex } from "@/lib/search/index-format";
import type { CourseWithSections } from "@/lib/types";

const catalog = JSON.parse(
  readFileSync("lib/seed/coms-fall2026.json", "utf8"),
) as CourseWithSections[];
const ordered = [...catalog].sort((a, b) => a.courseId.localeCompare(b.courseId));

function freshEngine(options?: SearchEngineOptions): SearchEngine {
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
    options,
  );
}

const idsFor = (engine: SearchEngine, query: string): string[] =>
  engine.search({ q: query }).hits.map((hit) => hit.courseId);

const BAND_FRACTION = 0.02;

/**
 * Turn on semantic fusion with vectors we choose, so scores can be driven
 * negative on purpose.
 *
 * `applySemantic` adds `semanticWeight * cosine` to the lexical score, and a
 * document whose binary code is the complement of the query's scores a cosine
 * of exactly -1. At the default weight of 12 that is far below any BM25 score
 * this seed produces, so `orientation` is a direct switch on the sign of every
 * fused score — the regime the banding has to survive and the one no lexical
 * query can reach on its own.
 */
function attachSemantics(engine: SearchEngine, orientation: (ordinal: number) => 1 | -1): void {
  const dims = 32;
  const unit = 1 / Math.sqrt(dims);
  const query = new Float32Array(dims).fill(unit);
  const vectors = Array.from({ length: engine.courseCount }, (_, ordinal) => {
    const vector = new Float32Array(dims);
    vector.fill(orientation(ordinal) * unit);
    return vector;
  });
  engine.attachEmbeddings(buildEmbeddingBlock(vectors, dims, "personal-ranking-test", true));
  engine.setQueryEmbedder(() => query);
}

/**
 * The contract, checked against the scores the engine itself reports.
 *
 * Bands must be non-increasing down the ranked list. That is precisely "query
 * relevance is the primary key": personal relevance may reorder hits inside a
 * band and nowhere else, whatever the sign of the scores involved.
 *
 * Recomputing the band from the materialized hits is only sound because this
 * seed never exceeds `maxHits` — a truncated list would have a higher floor
 * than the engine used, and so narrower bands than the engine's.
 */
function expectQueryOrderPreserved(hits: { score: number }[]): void {
  const scores = hits.map((hit) => hit.score);
  const top = Math.max(...scores);
  const bottom = Math.min(...scores);
  const bandWidth = (top - bottom) * BAND_FRACTION;
  if (bandWidth <= 0) return;
  const bandOf = (score: number) => Math.floor((score - bottom) / bandWidth);
  for (let i = 1; i < scores.length; i++) {
    expect(bandOf(scores[i])).toBeLessThanOrEqual(bandOf(scores[i - 1]));
  }
}

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

  /*
   * The regime the first version of the banding got wrong.
   *
   * It measured bands as a fraction of the top score and floored everything
   * nonpositive into band 0. Semantic fusion makes both assumptions false:
   * a fused score has no lower bound at zero, so the unbounded negative tail
   * landed in the same band as the weakest positive matches, and a query whose
   * every score came out nonpositive had no top to measure against at all.
   */
  describe("with semantic fusion driving scores below zero", () => {
    /*
     * Every document points away from the query, so each retrieved hit is
     * fused down by the full semantic weight. On this seed "computer" scores
     * 95, 60, 9.2 and then a long tail at 0.01, which at the default weight of
     * 12 becomes 83, 48, -2.8 and a tail at -12.
     *
     * That -2.8 is the whole case. It is a far better answer than the -12 tail
     * -- nine points of lexical score better -- and the first version of the
     * banding put it in the same band as all 34 of them, where personal
     * relevance decided the order.
     */
    it("keeps a stronger negative match above a weaker one", () => {
      const engine = freshEngine();
      attachSemantics(engine, () => -1);

      const baseline = engine.search({ q: "computer" }).hits;
      expect(baseline.some((hit) => hit.score > 0)).toBe(true);
      const negatives = baseline.filter((hit) => hit.score < 0);
      expect(negatives.length).toBeGreaterThan(2);
      // The result set has to straddle zero for this to be testing anything.
      expect(negatives[0].score).toBeGreaterThan(negatives[1].score + 1);

      // Personal relevance in exactly the reverse of the query's own order:
      // the worst match is what the student most needs. Nothing here may
      // promote it past a better answer to what they typed.
      const overlay: PersonalOverlayEntry[] = baseline.map((hit, rank) => ({
        courseId: hit.courseId,
        score: rank + 1,
      }));
      engine.setPersonalOverlay(overlay);

      const ranked = engine.search({ q: "computer" }).hits;
      const lastPositive = ranked.findLastIndex((hit) => hit.score > 0);
      const firstNegative = ranked.findIndex((hit) => hit.score < 0);
      expect(firstNegative).toBeGreaterThan(lastPositive);
      // The strongest negative match still leads the negatives.
      expect(ranked[firstNegative].courseId).toBe(negatives[0].courseId);
      expectQueryOrderPreserved(ranked);
    });

    /*
     * And the degenerate case: a query where NOTHING scores above zero after
     * fusion. Measuring bands against the top score has no scale to work with
     * here at all, and the whole result set falls through to personal order
     * with query relevance ignored outright.
     */
    it("keeps the best answer on top when every fused score is negative", () => {
      // A semantic weight past the top lexical score is what pushes the entire
      // set below zero; at the default of 12 the strongest matches stay
      // positive and the case cannot be reached.
      const engine = freshEngine({ semanticWeight: 200 });
      attachSemantics(engine, () => -1);

      const baseline = engine.search({ q: "computer" }).hits;
      expect(baseline.length).toBeGreaterThan(2);
      expect(baseline.every((hit) => hit.score < 0)).toBe(true);

      const overlay: PersonalOverlayEntry[] = baseline.map((hit, rank) => ({
        courseId: hit.courseId,
        score: rank + 1,
      }));
      engine.setPersonalOverlay(overlay);

      const ranked = engine.search({ q: "computer" }).hits;
      expect(ranked[0].courseId).toBe(baseline[0].courseId);
      expect(ranked[0].score).toBe(Math.max(...ranked.map((hit) => hit.score)));
      expectQueryOrderPreserved(ranked);
    });
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
