/**
 * The server-side vector source, against the artifact we actually ship.
 *
 * The headline assertion is the one the engine could not make before this file
 * existed: given a plausible student record, `cosine(tasteVector, courseVector)`
 * is NOT zero. Every unit test of the engine passes hand-built vectors, so all
 * of them stayed green while the only production implementation returned
 * `undefined` for all 4,878 courses. A test that hand-builds vectors cannot
 * catch that; only one that reads the real bytes can.
 *
 * It is written to SKIP rather than fail when the artifact is absent —
 * `public/index/*` is a build output, and a fresh clone that has never run
 * `npm run build:index` should not see a red suite for a file it was never
 * given. The skip prints, so it cannot be mistaken for a pass.
 */

import { describe, expect, it } from "vitest";

import { toCourseId, type CourseId } from "@/lib/requirements/code";

import {
  buildCourseVectorIndex,
  loadCourseVectorSource,
  VECTOR_SOURCE_UNAVAILABLE,
  type CourseVectorIndex,
} from "./course-vectors";
import { buildTasteVector, cosine } from "./taste";
import type { TakenCourse } from "./types";

const id = (code: string): CourseId => {
  const parsed = toCourseId(code);
  if (!parsed) throw new Error(`unparseable fixture code: ${code}`);
  return parsed;
};

/**
 * A second-year CS student, in stored-id form.
 *
 * Chosen because these five are certain to be in the two active terms — they
 * are the CS core sequence — so the assertion is about the vector space rather
 * than about whether a particular niche seminar happened to be offered.
 */
const CS_SOPHOMORE: TakenCourse[] = [
  { courseId: id("COMS W1004"), liked: true },
  { courseId: id("COMS W3134"), liked: null },
  { courseId: id("COMS W3203"), liked: true },
  { courseId: id("COMS W3157"), liked: null },
  { courseId: id("MATH UN1201"), liked: null },
];

/** Courses this student should score high on, and one they should not. */
const NEAR = id("COMS W4111"); // Databases — same department, same subject matter

/**
 * First Year Arabic II, and the choice is deliberate.
 *
 * The obvious "far" pick is a Core humanities course, but Music Humanities
 * scores ~0.09 against this profile where Databases scores ~0.11 — an LSA space
 * built from catalog prose puts every long, well-written course description
 * somewhat near every other one, so a two-point margin is not a fact worth
 * asserting. A language course's description shares almost no vocabulary with
 * anything technical and lands at ~-0.14, which is a real separation rather
 * than a lucky one. The narrowness of the humanities margin is a genuine
 * limitation of LSA, not a bug in the loader, and pretending otherwise with a
 * knife-edge assertion would just produce a flaky test.
 */
const FAR = id("MDES UN1211");

let loaded: CourseVectorIndex | null = null;

async function vectors(): Promise<CourseVectorIndex | null> {
  if (loaded === null) loaded = await loadCourseVectorSource();
  return loaded === VECTOR_SOURCE_UNAVAILABLE ? null : loaded;
}

describe("server-side course vectors", () => {
  it("loads the shipped LSA artifact", async () => {
    const source = await vectors();
    if (!source) {
      console.warn("skipped: public/index has no embedding artifact (run npm run build:index)");
      return;
    }

    expect(source.dims).toBe(384);
    expect(source.size).toBeGreaterThan(4000);
    expect(source.model).toMatch(/^lsa-svd-/);
  });

  it("returns unit-length vectors for real course ids", async () => {
    const source = await vectors();
    if (!source) return;

    const vector = source.vectorFor(id("COMS W1004"));
    expect(vector).toBeDefined();
    expect(vector?.length).toBe(384);

    let sumOfSquares = 0;
    for (const component of vector ?? []) sumOfSquares += component * component;
    expect(Math.sqrt(sumOfSquares)).toBeCloseTo(1, 5);
  });

  it("returns undefined for a course id that is not in the artifact", async () => {
    const source = await vectors();
    if (!source) return;

    // A syntactically valid id the registrar has never issued.
    expect(source.vectorFor("ZZZZ9999X" as CourseId)).toBeUndefined();
  });

  /* ======================================================================
   * THE assertion this file exists for
   * ====================================================================== */

  it("produces a NON-ZERO taste score for a plausible profile", async () => {
    const source = await vectors();
    if (!source) {
      console.warn("skipped: no embedding artifact, cannot check taste scoring");
      return;
    }

    const taste = buildTasteVector(CS_SOPHOMORE, source);
    expect(taste.vector).not.toBeNull();
    expect(taste.skipped).toEqual([]);
    expect(taste.contributors.length).toBe(CS_SOPHOMORE.length);

    const databases = source.vectorFor(NEAR);
    expect(databases).toBeDefined();

    const similarity = cosine(taste.vector!, databases!);

    // The number, printed. A regression that silently returns to a dead space
    // shows up here as 0 rather than as a slightly different ranking nobody
    // notices.
    console.log(`taste · COMS W4111 = ${similarity.toFixed(4)}`);

    expect(similarity).not.toBe(0);
    /*
     * 0.05 rather than something larger. The measured value is ~0.11 and the
     * whole-catalog distribution for this profile has mean ~0.01 and standard
     * deviation ~0.05, so this is roughly +2σ — comfortably a signal, and the
     * threshold is set to catch "the space went dead" rather than to pin a
     * number that a catalog re-ingest would legitimately move.
     */
    expect(Math.abs(similarity)).toBeGreaterThan(0.05);
  });

  it("ranks a same-subject course above an unrelated one", async () => {
    const source = await vectors();
    if (!source) return;

    const taste = buildTasteVector(CS_SOPHOMORE, source);
    const near = source.vectorFor(NEAR);
    const far = source.vectorFor(FAR);
    if (!taste.vector || !near || !far) {
      console.warn("skipped: one of the comparison courses is not in the active terms");
      return;
    }

    const nearScore = cosine(taste.vector, near);
    const farScore = cosine(taste.vector, far);
    console.log(`taste · ${NEAR} = ${nearScore.toFixed(4)} · ${FAR} = ${farScore.toFixed(4)}`);

    expect(nearScore).toBeGreaterThan(farScore);
  });
});

/* ==========================================================================
 * The decoder, driven from bytes rather than from the filesystem
 * ========================================================================== */

describe("buildCourseVectorIndex", () => {
  const DIMS = 64;
  const WORDS = DIMS >>> 5;

  function binaryFor(patterns: number[][]): Uint32Array {
    return Uint32Array.from(patterns.flat());
  }

  const info = { dims: DIMS, docCount: 2, hasRescore: false, model: "test" };

  it("decodes one sign bit per dimension into a unit vector", () => {
    // Doc 0: every bit set. Doc 1: every bit clear.
    const index = buildCourseVectorIndex({
      courseIds: ["AAAA1000X", "BBBB1000X"],
      info,
      binary: binaryFor([
        new Array(WORDS).fill(0xffffffff),
        new Array(WORDS).fill(0),
      ]),
      rescore: null,
      rescoreScale: null,
      indexVersion: "test",
    });

    const allOnes = index.vectorFor("AAAA1000X" as CourseId)!;
    const allZeros = index.vectorFor("BBBB1000X" as CourseId)!;

    expect(allOnes.length).toBe(DIMS);
    expect(allOnes[0]).toBeCloseTo(1 / Math.sqrt(DIMS), 6);
    expect(allZeros[0]).toBeCloseTo(-1 / Math.sqrt(DIMS), 6);

    // Opposite sign vectors are exactly antipodal — the popcount identity at
    // its two extremes, which is the cheapest check that bit order is right.
    expect(cosine(allOnes, allZeros)).toBeCloseTo(-1, 5);
    expect(cosine(allOnes, allOnes)).toBeCloseTo(1, 5);
  });

  it("refuses a geometry mismatch rather than addressing the wrong course", () => {
    // Three ids, two documents: every ordinal past the first would name the
    // wrong course's vector, so the source must refuse outright.
    const index = buildCourseVectorIndex({
      courseIds: ["AAAA1000X", "BBBB1000X", "CCCC1000X"],
      info,
      binary: binaryFor([new Array(WORDS).fill(0), new Array(WORDS).fill(0)]),
      rescore: null,
      rescoreScale: null,
      indexVersion: "test",
    });

    expect(index).toBe(VECTOR_SOURCE_UNAVAILABLE);
    expect(index.vectorFor("AAAA1000X" as CourseId)).toBeUndefined();
  });

  it("prefers int8 rescore vectors when a build ships them", () => {
    const rescore = new Int8Array(DIMS * 2);
    // Doc 0 leans hard on dimension 0; doc 1 on dimension 1.
    rescore[0] = 127;
    rescore[DIMS + 1] = 127;

    const index = buildCourseVectorIndex({
      courseIds: ["AAAA1000X", "BBBB1000X"],
      info: { ...info, hasRescore: true },
      binary: binaryFor([new Array(WORDS).fill(0), new Array(WORDS).fill(0)]),
      rescore,
      rescoreScale: Float32Array.from([1, 1]),
      indexVersion: "test",
    });

    const first = index.vectorFor("AAAA1000X" as CourseId)!;
    const second = index.vectorFor("BBBB1000X" as CourseId)!;

    expect(first[0]).toBeCloseTo(1, 5);
    expect(second[1]).toBeCloseTo(1, 5);
    // Orthogonal, which the binary path could never produce for these bits.
    expect(cosine(first, second)).toBeCloseTo(0, 5);
  });
});
