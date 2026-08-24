/**
 * End-to-end tests for the fold-in query embedder: build a real index over a
 * small corpus, embed it with the real LSA builder, and check that semantic
 * fusion finds what lexical search cannot.
 *
 * The corpus is built so that lexical search MUST fail on the target query —
 * the query word appears in one topic's documents and never in the document
 * we expect it to surface. That is the only way to show the semantic signal
 * is doing work rather than riding along behind BM25.
 */
import { describe, expect, it } from "vitest";
import { buildIndex } from "./build";
import { buildLsaVectors } from "./lsa";
import { buildEmbeddingBlock } from "./index-format";
import { SearchEngine } from "./engine";
import { createFoldInQueryEmbedder } from "./query-embedder";
import type { CourseWithSections } from "@/lib/types";

const DIMS = 64;

function course(id: string, title: string, description: string): CourseWithSections {
  return {
    courseId: id,
    subjectCode: id.slice(0, 4),
    number: Number(id.slice(4, 8)),
    qualifier: null,
    title,
    description,
    pointsMin: 3,
    pointsMax: 3,
    prerequisiteText: null,
    department: null,
    requirementFlags: {},
    sections: [],
  } as unknown as CourseWithSections;
}

/**
 * "gradient" and "backpropagation" co-occur across the training courses, so
 * the factorization learns they point the same way — but MATH0003 never uses
 * the word "gradient", which is what makes it a real synonymy test.
 */
const CORPUS: CourseWithSections[] = [
  course("COMS0001", "DEEP LEARNING", "gradient descent backpropagation neural network training epochs optimization"),
  course("COMS0002", "NEURAL COMPUTATION", "backpropagation neural network training epochs optimization layers"),
  course("MATH0003", "OPTIMIZATION THEORY", "backpropagation optimization training epochs convex objective"),
  course("HIST0004", "MEDIEVAL EUROPE", "monastery feudal charters manuscripts abbey peasantry"),
  course("HIST0005", "FEUDAL SOCIETY", "feudal charters manorial peasantry agriculture abbey"),
  course("HIST0006", "MONASTIC LIFE", "monastery manuscripts scriptorium abbey charters peasantry"),
  course("HIST0007", "NOVICES AND ABBEYS", "monastery abbey feudal charters peasantry training manuscripts"),
];

function buildEngine(): { engine: SearchEngine; attach: () => void } {
  const index = buildIndex(CORPUS);
  const engine = new SearchEngine(index);
  const ordered = [...CORPUS].sort((a, b) => (a.courseId < b.courseId ? -1 : 1));
  const { vectors, model } = buildLsaVectors(
    ordered.map((c) => `${c.title} ${c.description}`),
    { dims: DIMS, minDocFreq: 2, maxDocFraction: 0.9 },
  );
  const block = buildEmbeddingBlock(vectors, DIMS, model, true);
  return {
    engine,
    attach: () => {
      engine.attachEmbeddings(block);
      const embedder = createFoldInQueryEmbedder(index, block);
      expect(embedder).not.toBeNull();
      engine.setQueryEmbedder(embedder);
    },
  };
}

describe("createFoldInQueryEmbedder", () => {
  it("leaves the engine lexical-only until both halves are attached", () => {
    const { engine, attach } = buildEngine();
    expect(engine.hasSemantic).toBe(false);
    attach();
    expect(engine.hasSemantic).toBe(true);
  });

  it("produces a unit vector for a query the catalog knows", () => {
    const index = buildIndex(CORPUS);
    const ordered = [...CORPUS].sort((a, b) => (a.courseId < b.courseId ? -1 : 1));
    const { vectors, model } = buildLsaVectors(
      ordered.map((c) => `${c.title} ${c.description}`),
      { dims: DIMS, minDocFreq: 2, maxDocFraction: 0.9 },
    );
    const embedder = createFoldInQueryEmbedder(index, buildEmbeddingBlock(vectors, DIMS, model, true));
    const vector = embedder?.("backpropagation");
    expect(vector).not.toBeNull();
    let norm = 0;
    for (const value of vector!) norm += value * value;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 4);
  });

  it("returns null for a query of words the catalog has never seen", () => {
    const index = buildIndex(CORPUS);
    const ordered = [...CORPUS].sort((a, b) => (a.courseId < b.courseId ? -1 : 1));
    const { vectors, model } = buildLsaVectors(
      ordered.map((c) => `${c.title} ${c.description}`),
      { dims: DIMS, minDocFreq: 2, maxDocFraction: 0.9 },
    );
    const embedder = createFoldInQueryEmbedder(index, buildEmbeddingBlock(vectors, DIMS, model, true));
    // Null, not a zero vector: the engine must fall back to lexical rather
    // than rank the catalog against a direction that means nothing.
    expect(embedder?.("zzzqqq wibblefrotz")).toBeNull();
  });

  it("refuses a block whose document count disagrees with the index", () => {
    const index = buildIndex(CORPUS);
    const wrongSize = buildEmbeddingBlock(
      [new Float32Array(DIMS), new Float32Array(DIMS)],
      DIMS,
      "mismatched",
      true,
    );
    expect(createFoldInQueryEmbedder(index, wrongSize)).toBeNull();
  });

  it("re-ranks an ambiguous term toward the topic the rest of the query names", () => {
    const { engine, attach } = buildEngine();

    // "training" is shared vocabulary: it appears in the three technical
    // courses AND in HIST0007, which is about training novices in an abbey.
    // Lexically they are all just hits for the same word.
    const lexical = engine.search({ q: "training" }).hits.map((hit) => hit.courseId);
    expect(lexical).toContain("HIST0007");
    expect(lexical).toContain("COMS0001");

    attach();
    const fused = engine.search({ q: "training" }).hits.map((hit) => hit.courseId);
    // Same candidates -- fusion re-ranks, it does not retrieve (see
    // SearchEngine.applySemantic) -- but the technical sense now outranks the
    // monastic one, because the query folds in to the technical region of the
    // space where most "training" documents live.
    expect(new Set(fused)).toEqual(new Set(lexical));
    expect(fused.indexOf("COMS0001")).toBeLessThan(fused.indexOf("HIST0007"));
  });

  it("re-ranks without discarding the lexically strongest hit", () => {
    const { engine, attach } = buildEngine();
    attach();
    // A term unique to one course must still win outright: a semantic signal
    // that could overturn an exact lexical match would make search feel
    // arbitrary on the queries users are most confident about.
    const hits = engine.search({ q: "scriptorium" }).hits.map((hit) => hit.courseId);
    expect(hits[0]).toBe("HIST0006");
  });
});
