/**
 * Latent Semantic Analysis over the catalog's own text.
 *
 * This is the second `EmbeddingProvider`-shaped source of document vectors,
 * alongside the hosted one in `embeddings.ts`. It exists because the hosted
 * one needs a credential, and a search feature that only works when someone
 * has pasted an API key is not a shipped feature.
 *
 * ── Why LSA rather than a downloaded transformer ───────────────────────────
 *
 * The constraint that shaped this is AGENTS.md rule 2: no new dependencies.
 * That rules out every sentence-transformer runtime. What it does not rule
 * out is building an embedding space out of the corpus itself — a truncated
 * SVD of the TF-IDF term-document matrix is linear algebra, not a model, and
 * ~250 lines of arithmetic with no imports beyond our own tokenizer.
 *
 * LSA earns its keep on exactly the failure that lexical search has: a query
 * for "machine learning" cannot match a course that only ever says "neural
 * networks", because BM25 scores terms, not meanings. Co-occurrence across
 * 4,878 course descriptions puts those two phrases in nearly the same latent
 * direction, so the vector search finds it. That is the whole point of spec
 * §9's ranking step 3, and it does not require the vectors to have come from
 * a transformer.
 *
 * It is genuinely weaker than a modern sentence encoder on paraphrase and on
 * anything needing world knowledge the catalog never states. The honest
 * framing is that this is the floor, not the ceiling: set EMBEDDING_API_KEY
 * and `readEmbeddingProviderFromEnv` takes over, the artifact is rebuilt in a
 * better space, and nothing downstream changes — including the query
 * embedder, which is space-agnostic (see query-embedder.ts).
 *
 * ── Algorithm ──────────────────────────────────────────────────────────────
 *
 * Randomized truncated SVD (Halko/Martinsson/Tropp), which is the standard
 * way to get the top k singular vectors of a large sparse matrix without
 * forming anything dense at full width:
 *
 *   1. A is docs x terms, sparse, log-tf * idf, L2-normalized per row.
 *   2. Sketch the column space: Y = A Ω with Ω terms x l Gaussian, l = k + p.
 *   3. Power iterations Y <- A (Aᵀ Y), re-orthonormalized each pass, which
 *      sharpens the spectrum when singular values decay slowly (they do here).
 *   4. Q = orth(Y), docs x l.
 *   5. C = Qᵀ A Aᵀ Q, an l x l symmetric PSD matrix. Eigendecomposing it
 *      gives C = W Σ² Wᵀ, so U = Q W and the document coordinates U Σ come
 *      out as Q W sqrt(Λ) — the right singular vectors V are never needed and
 *      never formed. That matters: V is terms x k, the one genuinely large
 *      dense object in an SVD of this shape.
 *
 * Everything is seeded and deterministic. `indexVersion` is content-derived,
 * so a build that produced different vectors from identical input would
 * publish an artifact whose version claims it is unchanged.
 */

import { tokenize } from "./tokenize";

/** Matches the hosted provider's default and the spec's number. */
export const LSA_DEFAULT_DIMS = 384;

/**
 * A term must appear in at least this many courses to enter the vocabulary.
 * Below it there is no co-occurrence to learn from — a term in one document
 * contributes a direction that describes that document and nothing else,
 * which is overfitting expressed as a matrix column.
 */
export const LSA_MIN_DOC_FREQ = 3;

/**
 * ...and in no more than this fraction of them. A term in half the catalog
 * ("students", "course", "prerequisite") carries no topical information but
 * has a large norm, so it would dominate the leading singular directions.
 * IDF already damps it; this removes it.
 */
export const LSA_MAX_DOC_FRACTION = 0.4;

/** Extra sketch columns beyond k. 16-32 is the usual recommendation. */
export const LSA_OVERSAMPLING = 24;

/** Power iterations. Two is the standard default and is plenty here. */
export const LSA_POWER_ITERATIONS = 2;

export interface LsaOptions {
  dims?: number;
  minDocFreq?: number;
  maxDocFraction?: number;
  oversampling?: number;
  powerIterations?: number;
  seed?: number;
  onProgress?: (stage: string) => void;
}

export interface LsaResult {
  /** One unit-normalized vector per input document, in input order. */
  vectors: Float32Array[];
  /** Provenance for `IndexEmbeddingInfo.model`. */
  model: string;
  vocabularySize: number;
}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/**
 * mulberry32 plus a Box-Muller transform. A seeded generator rather than
 * Math.random because the build must be byte-reproducible: see the module
 * docblock on indexVersion.
 */
function createGaussianSource(seed: number): () => number {
  let state = seed >>> 0;
  const uniform = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    // Reject exact zero: log(0) is -Infinity.
    let u = uniform();
    while (u === 0) u = uniform();
    const radius = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * uniform();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

// ---------------------------------------------------------------------------
// The sparse term-document matrix
// ---------------------------------------------------------------------------

interface SparseMatrix {
  docCount: number;
  termCount: number;
  /** Column index per nonzero, grouped by row. */
  columns: Int32Array;
  values: Float32Array;
  /** Row r occupies [rowStart[r], rowStart[r + 1]). Length docCount + 1. */
  rowStart: Int32Array;
}

function buildMatrix(
  documents: string[],
  minDocFreq: number,
  maxDocFraction: number,
): SparseMatrix {
  const docCount = documents.length;
  const perDocCounts: Map<string, number>[] = new Array(docCount);
  const docFreq = new Map<string, number>();

  for (let doc = 0; doc < docCount; doc += 1) {
    const counts = new Map<string, number>();
    for (const token of tokenize(documents[doc])) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    perDocCounts[doc] = counts;
    for (const token of counts.keys()) docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
  }

  const maxDocFreq = Math.max(minDocFreq, Math.floor(docCount * maxDocFraction));
  const termIdByToken = new Map<string, number>();
  // Sorted so the vocabulary — and therefore the whole factorization — does
  // not depend on Map iteration order for a corpus that reorders.
  const kept = [...docFreq.keys()].filter((token) => {
    const df = docFreq.get(token) ?? 0;
    return df >= minDocFreq && df <= maxDocFreq;
  });
  kept.sort();
  for (const token of kept) termIdByToken.set(token, termIdByToken.size);

  const termCount = termIdByToken.size;
  const idf = new Float32Array(termCount);
  for (const [token, termId] of termIdByToken) {
    // Smoothed IDF; the +1 outside keeps it strictly positive so no term's
    // column collapses to zero and silently leaves the vocabulary.
    idf[termId] = Math.log(1 + docCount / (1 + (docFreq.get(token) ?? 1)));
  }

  const rowStart = new Int32Array(docCount + 1);
  let nonzeros = 0;
  for (let doc = 0; doc < docCount; doc += 1) {
    for (const token of perDocCounts[doc].keys()) {
      if (termIdByToken.has(token)) nonzeros += 1;
    }
    rowStart[doc + 1] = nonzeros;
  }

  const columns = new Int32Array(nonzeros);
  const values = new Float32Array(nonzeros);
  let cursor = 0;
  for (let doc = 0; doc < docCount; doc += 1) {
    const start = cursor;
    for (const [token, count] of perDocCounts[doc]) {
      const termId = termIdByToken.get(token);
      if (termId === undefined) continue;
      columns[cursor] = termId;
      values[cursor] = (1 + Math.log(count)) * idf[termId];
      cursor += 1;
    }
    // L2-normalize the row so long descriptions do not outweigh short ones.
    let sumOfSquares = 0;
    for (let i = start; i < cursor; i += 1) sumOfSquares += values[i] * values[i];
    if (sumOfSquares > 0) {
      const inverse = 1 / Math.sqrt(sumOfSquares);
      for (let i = start; i < cursor; i += 1) values[i] *= inverse;
    }
    // Column order within a row is Map insertion order; sort so the matvec
    // touches the accumulator monotonically and the build stays reproducible.
    sortRowByColumn(columns, values, start, cursor);
  }

  return { docCount, termCount, columns, values, rowStart };
}

/** Insertion sort: rows are short (tens of terms) and already near-sorted. */
function sortRowByColumn(
  columns: Int32Array,
  values: Float32Array,
  start: number,
  end: number,
): void {
  for (let i = start + 1; i < end; i += 1) {
    const column = columns[i];
    const value = values[i];
    let j = i - 1;
    while (j >= start && columns[j] > column) {
      columns[j + 1] = columns[j];
      values[j + 1] = values[j];
      j -= 1;
    }
    columns[j + 1] = column;
    values[j + 1] = value;
  }
}

// ---------------------------------------------------------------------------
// Dense helpers. Matrices are row-major Float64Array with an explicit width.
// ---------------------------------------------------------------------------

/** out (docs x width) = A * input (terms x width). */
function multiplyMatrix(
  matrix: SparseMatrix,
  input: Float64Array,
  width: number,
  out: Float64Array,
): void {
  out.fill(0);
  const { docCount, columns, values, rowStart } = matrix;
  for (let doc = 0; doc < docCount; doc += 1) {
    const outBase = doc * width;
    for (let i = rowStart[doc]; i < rowStart[doc + 1]; i += 1) {
      const weight = values[i];
      const inBase = columns[i] * width;
      for (let c = 0; c < width; c += 1) out[outBase + c] += weight * input[inBase + c];
    }
  }
}

/** out (terms x width) = Aᵀ * input (docs x width). */
function multiplyTranspose(
  matrix: SparseMatrix,
  input: Float64Array,
  width: number,
  out: Float64Array,
): void {
  out.fill(0);
  const { docCount, columns, values, rowStart } = matrix;
  for (let doc = 0; doc < docCount; doc += 1) {
    const inBase = doc * width;
    for (let i = rowStart[doc]; i < rowStart[doc + 1]; i += 1) {
      const weight = values[i];
      const outBase = columns[i] * width;
      for (let c = 0; c < width; c += 1) out[outBase + c] += weight * input[inBase + c];
    }
  }
}

/**
 * Orthonormalize the columns of `m` (rows x width) in place, modified
 * Gram-Schmidt. Classic Gram-Schmidt loses orthogonality catastrophically
 * after a power iteration, which is exactly where this is used.
 */
function orthonormalize(m: Float64Array, rows: number, width: number): void {
  for (let c = 0; c < width; c += 1) {
    for (let prev = 0; prev < c; prev += 1) {
      let dot = 0;
      for (let r = 0; r < rows; r += 1) dot += m[r * width + c] * m[r * width + prev];
      for (let r = 0; r < rows; r += 1) m[r * width + c] -= dot * m[r * width + prev];
    }
    let norm = 0;
    for (let r = 0; r < rows; r += 1) norm += m[r * width + c] * m[r * width + c];
    norm = Math.sqrt(norm);
    // A dependent column carries no new direction; zero it rather than
    // amplifying rounding noise into a unit vector of nonsense.
    if (norm < 1e-9) {
      for (let r = 0; r < rows; r += 1) m[r * width + c] = 0;
      continue;
    }
    const inverse = 1 / norm;
    for (let r = 0; r < rows; r += 1) m[r * width + c] *= inverse;
  }
}

/**
 * Cyclic Jacobi eigendecomposition of a symmetric n x n matrix, in place.
 * Returns eigenvalues; `vectors` receives the eigenvectors as columns.
 *
 * Jacobi rather than a Householder/QL pair because n is ~400 here, it is
 * unconditionally stable on symmetric PSD input, and it is a quarter the code
 * of anything faster. At this size the whole decomposition is well under a
 * second.
 */
function jacobiEigen(a: Float64Array, n: number, vectors: Float64Array): Float64Array {
  vectors.fill(0);
  for (let i = 0; i < n; i += 1) vectors[i * n + i] = 1;

  for (let sweep = 0; sweep < 60; sweep += 1) {
    let offDiagonal = 0;
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) offDiagonal += a[p * n + q] * a[p * n + q];
    }
    if (offDiagonal < 1e-18) break;

    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-15) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const sign = theta >= 0 ? 1 : -1;
        const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const cos = 1 / Math.sqrt(t * t + 1);
        const sin = t * cos;

        for (let k = 0; k < n; k += 1) {
          const akp = a[k * n + p];
          const akq = a[k * n + q];
          a[k * n + p] = cos * akp - sin * akq;
          a[k * n + q] = sin * akp + cos * akq;
        }
        for (let k = 0; k < n; k += 1) {
          const apk = a[p * n + k];
          const aqk = a[q * n + k];
          a[p * n + k] = cos * apk - sin * aqk;
          a[q * n + k] = sin * apk + cos * aqk;
        }
        for (let k = 0; k < n; k += 1) {
          const vkp = vectors[k * n + p];
          const vkq = vectors[k * n + q];
          vectors[k * n + p] = cos * vkp - sin * vkq;
          vectors[k * n + q] = sin * vkp + cos * vkq;
        }
      }
    }
  }

  const eigenvalues = new Float64Array(n);
  for (let i = 0; i < n; i += 1) eigenvalues[i] = a[i * n + i];
  return eigenvalues;
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

export function buildLsaVectors(documents: string[], options: LsaOptions = {}): LsaResult {
  const dims = options.dims ?? LSA_DEFAULT_DIMS;
  const progress = options.onProgress ?? (() => {});
  const docCount = documents.length;

  if (docCount === 0) return { vectors: [], model: lsaModelName(dims, 0), vocabularySize: 0 };

  progress("tokenizing");
  const matrix = buildMatrix(
    documents,
    options.minDocFreq ?? LSA_MIN_DOC_FREQ,
    options.maxDocFraction ?? LSA_MAX_DOC_FRACTION,
  );

  // A rank we cannot reach — fewer documents or terms than requested
  // dimensions — is padded with zeros rather than failed. The embedding block
  // is fixed-width, and a corpus this small is a test fixture, not production.
  const sketchWidth = Math.min(
    docCount,
    matrix.termCount,
    dims + (options.oversampling ?? LSA_OVERSAMPLING),
  );
  if (sketchWidth === 0 || matrix.termCount === 0) {
    return {
      vectors: documents.map(() => new Float32Array(dims)),
      model: lsaModelName(dims, matrix.termCount),
      vocabularySize: matrix.termCount,
    };
  }

  progress(`sketching ${matrix.termCount.toLocaleString()} terms`);
  const gaussian = createGaussianSource(options.seed ?? 0x5eed1e);
  const omega = new Float64Array(matrix.termCount * sketchWidth);
  for (let i = 0; i < omega.length; i += 1) omega[i] = gaussian();

  const q = new Float64Array(docCount * sketchWidth);
  multiplyMatrix(matrix, omega, sketchWidth, q);
  orthonormalize(q, docCount, sketchWidth);

  const termScratch = new Float64Array(matrix.termCount * sketchWidth);
  const powerIterations = options.powerIterations ?? LSA_POWER_ITERATIONS;
  for (let pass = 0; pass < powerIterations; pass += 1) {
    progress(`power iteration ${pass + 1}/${powerIterations}`);
    multiplyTranspose(matrix, q, sketchWidth, termScratch);
    multiplyMatrix(matrix, termScratch, sketchWidth, q);
    orthonormalize(q, docCount, sketchWidth);
  }

  // C = Qᵀ (A Aᵀ Q). Formed via two sparse products so the terms x terms and
  // terms x dims dense matrices are never materialized.
  progress("forming the core matrix");
  multiplyTranspose(matrix, q, sketchWidth, termScratch);
  const aTimesTerm = new Float64Array(docCount * sketchWidth);
  multiplyMatrix(matrix, termScratch, sketchWidth, aTimesTerm);

  const core = new Float64Array(sketchWidth * sketchWidth);
  for (let i = 0; i < sketchWidth; i += 1) {
    for (let j = i; j < sketchWidth; j += 1) {
      let dot = 0;
      for (let r = 0; r < docCount; r += 1) dot += q[r * sketchWidth + i] * aTimesTerm[r * sketchWidth + j];
      core[i * sketchWidth + j] = dot;
      core[j * sketchWidth + i] = dot;
    }
  }

  progress("eigendecomposition");
  const eigenvectors = new Float64Array(sketchWidth * sketchWidth);
  const eigenvalues = jacobiEigen(core, sketchWidth, eigenvectors);

  const order = Array.from({ length: sketchWidth }, (_, i) => i);
  order.sort((a, b) => eigenvalues[b] - eigenvalues[a]);
  const keep = Math.min(dims, sketchWidth);

  progress("projecting documents");
  const vectors: Float32Array[] = new Array(docCount);
  for (let doc = 0; doc < docCount; doc += 1) {
    const vector = new Float32Array(dims);
    for (let component = 0; component < keep; component += 1) {
      const source = order[component];
      // Singular value = sqrt(eigenvalue of A Aᵀ); a tiny negative eigenvalue
      // is rounding noise on a PSD matrix, and its component is empty anyway.
      const singular = Math.sqrt(Math.max(0, eigenvalues[source]));
      if (singular === 0) continue;
      let coordinate = 0;
      for (let r = 0; r < sketchWidth; r += 1) {
        coordinate += q[doc * sketchWidth + r] * eigenvectors[r * sketchWidth + source];
      }
      vector[component] = coordinate * singular;
    }
    normalizeInPlace(vector);
    vectors[doc] = vector;
  }

  return { vectors, model: lsaModelName(dims, matrix.termCount), vocabularySize: matrix.termCount };
}

function lsaModelName(dims: number, vocabularySize: number): string {
  return `lsa-svd-${dims}d-v${vocabularySize}`;
}

function normalizeInPlace(vector: Float32Array): void {
  let sumOfSquares = 0;
  for (let i = 0; i < vector.length; i += 1) sumOfSquares += vector[i] * vector[i];
  if (sumOfSquares === 0) return;
  const inverse = 1 / Math.sqrt(sumOfSquares);
  for (let i = 0; i < vector.length; i += 1) vector[i] *= inverse;
}
