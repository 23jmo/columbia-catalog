/**
 * The query side of semantic search.
 *
 * `SearchEngine` has been able to fuse a semantic signal since the index
 * format was written; what it lacked was a `QueryEmbedder` — a SYNCHRONOUS
 * `(query: string) => Float32Array | null`. That signature is spec §9's
 * zero-latency promise written into a type: search never awaits, and never
 * touches the network. It was read as requiring an embedding model running in
 * the browser, which this repo cannot add (AGENTS.md rule 2 forbids new
 * dependencies). See .plans/BLOCKERS.md item 12 for the history.
 *
 * ── The observation that removes the model ─────────────────────────────────
 *
 * A model is one way to place a query in the embedding space. It is not the
 * only way, because the space is not a secret — we ship a labelled sample of
 * it. Every course's vector is in the sidecar, and the inverted index says
 * exactly which courses contain any given term. So a term's position is
 * recoverable as the TF-IDF-weighted centroid of the documents containing it,
 * and a query's position is the sum of its terms':
 *
 *     v(query) = normalize( Σ_terms idf(t) · Σ_docs(t) w(t,d) · v(d) )
 *
 * This is the standard LSA fold-in, and it is the reason `lsa.ts` never needs
 * to emit the term factor of its SVD: the client reconstructs the part it
 * needs, for the three or four terms actually typed, from data it already has
 * for lexical search. Nothing extra ships.
 *
 * ── Why this is provider-agnostic ──────────────────────────────────────────
 *
 * The derivation above never assumes where document vectors came from. It is
 * a statement about a term and the documents containing it, so it holds in an
 * LSA space, an OpenAI space, or anything else `IndexEmbeddingInfo.model` may
 * one day name. Setting EMBEDDING_API_KEY changes the space and changes
 * nothing here.
 *
 * ── What it cannot do ──────────────────────────────────────────────────────
 *
 * A term the catalog never uses has no documents to average, so it
 * contributes nothing; a query made entirely of such terms returns null and
 * search stays lexical-only — the behaviour that shipped before this file
 * existed. That is a real ceiling relative to a sentence encoder, which can
 * place an unseen word from its own pretraining. It is also the correct
 * failure: inventing a direction for a word the corpus has never seen would
 * return confident neighbours of nothing.
 */

import {
  POSTING_DOC_SHIFT,
  VarintCursor,
  WEIGHT_TABLE,
  lookupTerm,
  type EmbeddingBlock,
  type SerializedIndex,
} from "./index-format";
import type { QueryEmbedder } from "./engine";
import { tokenize } from "./tokenize";

/**
 * Terms past this point in the query are ignored. Fold-in cost is linear in
 * total document frequency, and a query long enough to hit this is prose, not
 * a search — its head terms already carry the topic.
 */
export const MAX_QUERY_TERMS = 12;

/**
 * Documents consulted per term. A term in 3,000 courses costs 3,000 * 384
 * multiply-adds; capping keeps the worst case inside a keystroke's budget.
 * The cap is applied to the postings list in document order, which is
 * arbitrary with respect to relevance — acceptable because a term that common
 * has a small IDF and contributes little to the direction anyway. Rare terms,
 * the ones that actually locate the query, are never truncated.
 */
export const MAX_DOCS_PER_TERM = 2048;

/**
 * Terms in more than this fraction of the catalog are skipped outright. They
 * pull the query vector toward the centroid of everything, which is the one
 * direction that discriminates nothing.
 */
export const MAX_TERM_DOC_FRACTION = 0.5;

/**
 * Build a fold-in query embedder over an index and its embedding sidecar.
 *
 * Both are required: the index supplies the postings, the block supplies the
 * document vectors. Returns null when the block's geometry disagrees with the
 * index, rather than producing vectors that silently address the wrong
 * courses.
 */
export function createFoldInQueryEmbedder(
  index: SerializedIndex,
  block: EmbeddingBlock,
): QueryEmbedder | null {
  const dims = block.info.dims;
  const docCount = block.info.docCount;
  if (docCount !== index.meta.courseCount || dims <= 0) return null;

  const encoder = new TextEncoder();
  const cursor = new VarintCursor(index.postings);
  const accumulator = new Float32Array(dims);
  const words = dims >>> 5;
  const maxDocFreq = Math.max(1, Math.floor(docCount * MAX_TERM_DOC_FRACTION));

  const rescore = block.rescore;
  const rescoreScale = block.rescoreScale;
  const binary = block.binary;

  /**
   * Add `weight * v(doc)` to the accumulator.
   *
   * Prefers the int8 rescore vectors, which are the real directions. The
   * binary fallback treats each bit as +/-1: a coarse vector, but the Hamming
   * pass it feeds is equally coarse, so the pairing is consistent.
   */
  const addDocument = (doc: number, weight: number): void => {
    if (rescore && rescoreScale) {
      const base = doc * dims;
      const scale = rescoreScale[doc] * weight;
      for (let d = 0; d < dims; d += 1) accumulator[d] += rescore[base + d] * scale;
      return;
    }
    const base = doc * words;
    for (let d = 0; d < dims; d += 1) {
      const bit = (binary[base + (d >>> 5)] >>> (d & 31)) & 1;
      accumulator[d] += bit === 1 ? weight : -weight;
    }
  };

  return (query: string): Float32Array | null => {
    const tokens = tokenize(query);
    if (tokens.length === 0) return null;

    accumulator.fill(0);
    let contributed = false;
    const seen = new Set<number>();

    for (let i = 0; i < tokens.length && seen.size < MAX_QUERY_TERMS; i += 1) {
      const termId = lookupTerm(index, encoder.encode(tokens[i]));
      if (termId < 0 || seen.has(termId)) continue;
      seen.add(termId);

      const docFreq = index.termDocFreq[termId];
      if (docFreq === 0 || docFreq > maxDocFreq) continue;

      const idf = index.termIdf[termId];
      const start = index.postingOffsets[termId];
      const end = index.postingOffsets[termId + 1];
      if (start === end) continue;

      cursor.reset(start);
      let doc = 0;
      let consulted = 0;
      while (cursor.pos < end && consulted < MAX_DOCS_PER_TERM) {
        const packed = cursor.next();
        // Document ordinals are delta-encoded, so the running sum must be
        // maintained even for postings we stop consuming — which is why the
        // cap breaks the loop rather than skipping entries inside it.
        doc += packed >>> POSTING_DOC_SHIFT;
        if (doc >= docCount) break;
        addDocument(doc, idf * WEIGHT_TABLE[(packed >>> 4) & 0xff]);
        consulted += 1;
        contributed = true;
      }
    }

    if (!contributed) return null;

    let sumOfSquares = 0;
    for (let d = 0; d < dims; d += 1) sumOfSquares += accumulator[d] * accumulator[d];
    if (sumOfSquares === 0) return null;
    const inverse = 1 / Math.sqrt(sumOfSquares);
    // A fresh array per call: the engine holds the returned vector across its
    // rescore pass, and handing out the scratch buffer would alias it into the
    // next keystroke's accumulation.
    const out = new Float32Array(dims);
    for (let d = 0; d < dims; d += 1) out[d] = accumulator[d] * inverse;
    return out;
  };
}
