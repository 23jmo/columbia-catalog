/**
 * These tests pin the property LSA is here for — that co-occurrence puts
 * documents about the same thing near each other even when they share no
 * vocabulary — rather than pinning particular vector values, which are an
 * implementation detail of the factorization and would change if the sketch
 * width or seed did.
 */
import { describe, expect, it } from "vitest";
import { buildLsaVectors } from "./lsa";

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

/**
 * Two topics with disjoint vocabularies, plus one bridge document per topic
 * pair. Every document is unique so nothing is trivially identical.
 */
const MACHINE_LEARNING = [
  "neural networks backpropagation gradient descent training deep architectures",
  "deep learning convolutional networks gradient optimization training epochs",
  "statistical learning regression classification training generalization gradient",
  "reinforcement learning policy gradient reward training agents",
];
const MEDIEVAL_HISTORY = [
  "medieval europe monastery feudal charters manuscripts abbey",
  "feudal society peasantry manorial charters medieval agriculture",
  "monastic manuscripts scriptorium medieval abbey illumination",
  "crusades feudal knights medieval warfare charters europe",
];

describe("buildLsaVectors", () => {
  const documents = [...MACHINE_LEARNING, ...MEDIEVAL_HISTORY];
  const dims = 32;
  const result = buildLsaVectors(documents, { dims, minDocFreq: 2, maxDocFraction: 0.9 });

  it("returns one unit-length vector per document, in input order", () => {
    expect(result.vectors).toHaveLength(documents.length);
    for (const vector of result.vectors) {
      expect(vector).toHaveLength(dims);
      expect(cosine(vector, vector)).toBeCloseTo(1, 4);
    }
  });

  it("places documents nearer their own topic than the other one", () => {
    const mlCount = MACHINE_LEARNING.length;
    for (let i = 0; i < mlCount; i += 1) {
      let worstSameTopic = Infinity;
      for (let j = 0; j < mlCount; j += 1) {
        if (i === j) continue;
        worstSameTopic = Math.min(worstSameTopic, cosine(result.vectors[i], result.vectors[j]));
      }
      let bestOtherTopic = -Infinity;
      for (let j = mlCount; j < documents.length; j += 1) {
        bestOtherTopic = Math.max(bestOtherTopic, cosine(result.vectors[i], result.vectors[j]));
      }
      expect(worstSameTopic).toBeGreaterThan(bestOtherTopic);
    }
  });

  it("is deterministic — the same corpus factors to the same vectors", () => {
    const again = buildLsaVectors(documents, { dims, minDocFreq: 2, maxDocFraction: 0.9 });
    for (let i = 0; i < documents.length; i += 1) {
      expect([...again.vectors[i]]).toEqual([...result.vectors[i]]);
    }
  });

  it("gives an empty document the zero vector rather than a direction", () => {
    const withEmpty = buildLsaVectors([...documents, ""], {
      dims,
      minDocFreq: 2,
      maxDocFraction: 0.9,
    });
    const last = withEmpty.vectors[documents.length];
    expect([...last].every((value) => value === 0)).toBe(true);
  });

  it("survives a corpus smaller than the requested dimensionality", () => {
    // The block is fixed-width, so a rank we cannot reach must pad, not throw.
    const tiny = buildLsaVectors(["alpha beta gamma", "alpha beta delta"], {
      dims: 64,
      minDocFreq: 1,
      maxDocFraction: 1,
    });
    expect(tiny.vectors).toHaveLength(2);
    expect(tiny.vectors[0]).toHaveLength(64);
  });

  it("returns nothing for an empty corpus", () => {
    expect(buildLsaVectors([]).vectors).toHaveLength(0);
  });
});
