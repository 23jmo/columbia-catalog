/**
 * Embedding-build tests.
 *
 * There is no model here and there does not need to be one. What can go wrong
 * in this lane is alignment and shape: a vector attached to the wrong course, a
 * provider that answers out of order, a width that does not match what the
 * index packs. Those are all testable against a fake provider, and they are the
 * failures that would be silent in production — a misaligned block still
 * decodes, still ranks, and just returns the wrong courses.
 */

import { describe, expect, it } from "vitest";

import { buildEmbeddingBlock } from "./index-format";
import {
  courseEmbeddingText,
  createHttpEmbeddingProvider,
  embedCourses,
  EMBEDDING_DIMS,
  isProviderProblem,
  normalizeVector,
  readEmbeddingProviderFromEnv,
  type EmbeddingProvider,
} from "./embeddings";
import type { CourseWithSections, Section } from "@/lib/types";

function section(overrides: Partial<Section> & { sectionCode: string }): Section {
  return {
    sectionId: `20263COMS6998E${overrides.sectionCode}`,
    courseId: "COMS6998E",
    termCode: "20263",
    callNumber: `1${overrides.sectionCode}`,
    sectionCode: overrides.sectionCode,
    component: null,
    methodOfInstruction: null,
    gradingMode: null,
    minUnit: 3,
    maxUnit: 3,
    instructors: [],
    meetings: [],
    enrollmentCount: 0,
    enrollmentCap: null,
    waitlistCount: null,
    waitlistCap: null,
    status: "unknown",
    sourceAsOf: null,
    lastSeenAt: null,
    detailUrl: null,
    note: null,
    openTo: null,
    ...overrides,
  };
}

function course(overrides: Partial<CourseWithSections> = {}): CourseWithSections {
  return {
    courseId: "COMS6998E",
    subjectCode: "COMS",
    number: 6998,
    qualifier: "E",
    title: "TOPICS IN COMPUTER SCIENCE",
    description: null,
    pointsMin: 3,
    pointsMax: 3,
    prerequisiteText: null,
    department: null,
    requirementFlags: {},
    sections: [],
    ...overrides,
  } as CourseWithSections;
}

/** Deterministic stand-in: dimension d carries the d-th character's code. */
function fakeProvider(dims = 64, onCall?: (texts: string[]) => void): EmbeddingProvider {
  return {
    model: "fake",
    dims,
    async embed(texts) {
      onCall?.(texts);
      return texts.map((text) => {
        const vector = new Float32Array(dims);
        for (let index = 0; index < dims; index += 1) {
          vector[index] = ((text.charCodeAt(index % text.length) || 1) % 17) - 8;
        }
        return normalizeVector(vector);
      });
    },
  };
}

describe("courseEmbeddingText", () => {
  it("leads with the identifying line so truncation loses the tail, not the subject", () => {
    const text = courseEmbeddingText(course({ description: "x".repeat(10) }));
    expect(text.startsWith("COMS 6998 TOPICS IN COMPUTER SCIENCE")).toBe(true);
  });

  it("carries distinct section titles — the whole reason sections.title exists", () => {
    const text = courseEmbeddingText(
      course({
        sections: [
          section({ sectionCode: "001", title: "LLM BASED GENERATIVE AI" }),
          section({ sectionCode: "002", title: "HIGH PERF MACH LEARNING" }),
        ],
      }),
    );
    expect(text).toContain("LLM BASED GENERATIVE AI");
    expect(text).toContain("HIGH PERF MACH LEARNING");
  });

  it("does not repeat a section title that merely restates the course title", () => {
    const text = courseEmbeddingText(
      course({
        sections: [
          section({ sectionCode: "001", title: "Topics in Computer Science" }),
          section({ sectionCode: "002", title: null }),
        ],
      }),
    );
    // Once, from the identifying line — not a second time from the sections.
    expect(text.toLowerCase().split("topics in computer science").length - 1).toBe(1);
  });

  it("never bakes in a seat count, a time or an instructor", () => {
    const text = courseEmbeddingText(
      course({
        sections: [
          section({
            sectionCode: "001",
            instructors: ["Jae Woo Lee"],
            enrollmentCount: 143,
            meetings: [
              {
                meetingId: "m1",
                sectionId: "20263COMS6998E001",
                weekday: "TU",
                startMinute: 700,
                endMinute: 775,
                buildingId: null,
                buildingName: "Mudd",
                room: "833",
              },
            ],
          }),
        ],
      }),
    );
    expect(text).not.toContain("Jae Woo Lee");
    expect(text).not.toContain("143");
    expect(text).not.toContain("Mudd");
  });
});

describe("normalizeVector", () => {
  it("returns unit length", () => {
    const vector = normalizeVector(Float32Array.from([3, 4, 0, 0]));
    const norm = Math.hypot(...vector);
    expect(norm).toBeCloseTo(1, 6);
  });

  it("leaves a zero vector alone rather than producing NaN", () => {
    const vector = normalizeVector(new Float32Array(4));
    expect([...vector]).toEqual([0, 0, 0, 0]);
  });
});

describe("embedCourses", () => {
  it("returns one vector per course, positionally aligned", async () => {
    const courses = [
      course({ courseId: "AAAA1000", title: "ANCIENT GREEK POETRY AND ITS READERS" }),
      course({ courseId: "BBBB2000", title: "INTRODUCTION TO MODERN ROBOTICS" }),
      course({ courseId: "CCCC3000", title: "MACROECONOMIC ANALYSIS FOR POLICY" }),
    ];
    const provider = fakeProvider();
    const vectors = await embedCourses(courses, provider);

    expect(vectors).toHaveLength(3);
    const direct = await provider.embed(courses.map(courseEmbeddingText));
    for (let index = 0; index < 3; index += 1) {
      expect([...vectors[index]]).toEqual([...direct[index]]);
    }
  });

  it("gives a course too thin to describe a zero vector instead of noise", async () => {
    // Title omitted entirely: the document is barely a course code.
    const thin = course({ courseId: "ZZZZ1", subjectCode: "Z", number: 1, title: "X" });
    const vectors = await embedCourses([thin], fakeProvider());
    expect([...vectors[0]].every((value) => value === 0)).toBe(true);
  });

  it("keeps alignment when a thin course sits between two real ones", async () => {
    const courses = [
      course({ courseId: "AAAA1000", title: "ANCIENT GREEK POETRY AND ITS READERS" }),
      course({ courseId: "ZZZZ1", subjectCode: "Z", number: 1, title: "X" }),
      course({ courseId: "CCCC3000", title: "MACROECONOMIC ANALYSIS FOR POLICY" }),
    ];
    const vectors = await embedCourses(courses, fakeProvider());
    expect(vectors).toHaveLength(3);
    expect([...vectors[1]].every((value) => value === 0)).toBe(true);
    expect([...vectors[0]].some((value) => value !== 0)).toBe(true);
    expect([...vectors[2]].some((value) => value !== 0)).toBe(true);
  });

  it("produces a block the index format accepts", async () => {
    const courses = [
      course({ courseId: "AAAA1000", title: "ANCIENT GREEK POETRY AND ITS READERS" }),
      course({ courseId: "BBBB2000", title: "INTRODUCTION TO MODERN ROBOTICS" }),
    ];
    const provider = fakeProvider(EMBEDDING_DIMS);
    const block = buildEmbeddingBlock(
      await embedCourses(courses, provider),
      provider.dims,
      provider.model,
      true,
    );
    expect(block.info.docCount).toBe(2);
    expect(block.info.dims).toBe(EMBEDDING_DIMS);
    expect(block.binary).toHaveLength(2 * (EMBEDDING_DIMS / 32));
    expect(block.rescore).not.toBeNull();
  });
});

describe("createHttpEmbeddingProvider", () => {
  function respond(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("reorders a response that comes back shuffled", async () => {
    // Two vectors that stay distinguishable after normalization: one points
    // along dimension 0, the other along dimension 1. If `index` were ignored
    // and the rows taken positionally, they would come back swapped.
    const along = (dimension: number) =>
      Array.from({ length: 32 }, (_, d) => (d === dimension ? 5 : 0));

    const provider = createHttpEmbeddingProvider({
      apiKey: "k",
      baseUrl: "https://example.test/v1",
      model: "m",
      dims: 32,
      fetchImpl: async () =>
        respond({
          data: [
            { index: 1, embedding: along(1) },
            { index: 0, embedding: along(0) },
          ],
        }),
    });

    const [first, second] = await provider.embed(["a", "b"]);
    expect(first[0]).toBeCloseTo(1, 6);
    expect(first[1]).toBeCloseTo(0, 6);
    expect(second[0]).toBeCloseTo(0, 6);
    expect(second[1]).toBeCloseTo(1, 6);
  });

  it("refuses a response whose width is not what we asked for", async () => {
    const provider = createHttpEmbeddingProvider({
      apiKey: "k",
      baseUrl: "https://example.test/v1",
      model: "m",
      dims: 384,
      fetchImpl: async () => respond({ data: [{ index: 0, embedding: [1, 2, 3] }] }),
    });
    await expect(provider.embed(["a"])).rejects.toThrow(/3 dimensions, expected 384/);
  });

  it("retries a 429 and succeeds", async () => {
    let calls = 0;
    const provider = createHttpEmbeddingProvider({
      apiKey: "k",
      baseUrl: "https://example.test/v1",
      model: "m",
      dims: 32,
      maxRetries: 2,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return respond({ error: { message: "slow down" } }, 429);
        return respond({ data: [{ index: 0, embedding: Array.from({ length: 32 }, () => 1) }] });
      },
    });
    const [vector] = await provider.embed(["a"]);
    expect(calls).toBe(2);
    expect(vector).toHaveLength(32);
  });

  it("does not retry a 401 — a bad key will not get better", async () => {
    let calls = 0;
    const provider = createHttpEmbeddingProvider({
      apiKey: "k",
      baseUrl: "https://example.test/v1",
      model: "m",
      dims: 32,
      fetchImpl: async () => {
        calls += 1;
        return respond({ error: { message: "no" } }, 401);
      },
    });
    await expect(provider.embed(["a"])).rejects.toThrow(/HTTP 401/);
    expect(calls).toBe(1);
  });
});

describe("readEmbeddingProviderFromEnv", () => {
  it("explains itself rather than throwing when unconfigured", () => {
    const result = readEmbeddingProviderFromEnv({} as NodeJS.ProcessEnv);
    expect(isProviderProblem(result)).toBe(true);
    if (isProviderProblem(result)) expect(result.reason).toMatch(/EMBEDDING_API_KEY/);
  });

  it("rejects a width the index cannot pack", () => {
    const result = readEmbeddingProviderFromEnv({
      EMBEDDING_API_KEY: "k",
      EMBEDDING_DIMS: "300",
    } as NodeJS.ProcessEnv);
    expect(isProviderProblem(result)).toBe(true);
    if (isProviderProblem(result)) expect(result.reason).toMatch(/multiple of 32/);
  });

  it("defaults to 384 dimensions, which is what the spec asks for", () => {
    const result = readEmbeddingProviderFromEnv({ EMBEDDING_API_KEY: "k" } as NodeJS.ProcessEnv);
    expect(isProviderProblem(result)).toBe(false);
    if (!isProviderProblem(result)) expect(result.dims).toBe(EMBEDDING_DIMS);
  });
});
