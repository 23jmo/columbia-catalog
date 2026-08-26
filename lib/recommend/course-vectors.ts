/**
 * The server-side `CourseVectorSource` — semantic vectors, read on the server.
 *
 * ── What was broken ────────────────────────────────────────────────────────
 *
 * `lib/recommend/index.ts` blends `λ · cosine(tasteVector, courseVector)` into
 * every score, and `lib/recommend/sources.ts` shipped exactly one real
 * implementation of the vector interface: `noVectorSource()`, which returns
 * `undefined` for every course. So in production the taste term was 0 for all
 * 4,878 recommendable courses, every recommendation carried a `no_vector`
 * caveat, and the entire "because you took X, Y, Z" half of the product was
 * dead while looking alive — the code path existed, the tests passed against
 * hand-built fixtures, and nothing said the space was empty.
 *
 * ── Why the artifact rather than a table ───────────────────────────────────
 *
 * The vectors already exist. `scripts/build-index.ts` runs the LSA over the
 * catalog's own text and writes `public/index/catalog-<version>.emb.bin` for
 * the browser search client. Recomputing them server-side would mean running a
 * randomized truncated SVD over 4,878 documents per process — seconds of CPU to
 * reproduce a file we already ship — and, worse, it would produce a SECOND
 * embedding space. Search and recommendations would then disagree about what
 * "similar" means, which is precisely the client/server duplication that
 * `types.ts` warns about in its header.
 *
 * So this reads the same bytes the browser reads, through the same decoder
 * (`decodeEmbeddingBlock`). One space, one artifact, one definition of similar.
 *
 * ── The reconstruction, and its honest limits ──────────────────────────────
 *
 * The shipped sidecar carries only the BINARY block: 384 bits per course, one
 * sign bit per dimension, 48 bytes. The optional int8 rescore block (`EMBQ`)
 * was not built — `manifest.json` reports `hasRescore: false` — so the float
 * magnitudes are genuinely not recoverable from what we ship.
 *
 * A sign vector is therefore what comes back: +1/-1 per dimension, scaled to
 * unit length. Cosine between two of them is `(dims - 2·hamming) / dims`, which
 * is the popcount identity the index format was designed around and the same
 * approximation the browser's first-pass search runs on. It is a monotone but
 * lossy proxy for the true cosine: it preserves "these two courses are about
 * the same thing" and loses fine ordering between two courses that are both
 * close. For a feed that shows twenty cards out of ~4,900, that is the right
 * trade — and it is a REAL signal where there was previously none.
 *
 * If a float space is ever wanted here, the fix is one flag: build the index
 * with rescore vectors and `vectorFor` starts returning them without any
 * caller changing.
 *
 * ── Where the course ids come from ─────────────────────────────────────────
 *
 * The sidecar is addressed by course ORDINAL, not by id — it is a bare matrix.
 * The ordinal → id mapping lives in the lexical index's `DISP` block, so the
 * lexical artifact is decoded once to read it and then released. That costs one
 * ~10 MB read and ~130 ms, once per process, and it is the only place the two
 * artifacts have to agree. They are content-addressed by the SAME manifest
 * version, so a mismatch is impossible unless someone hand-edits `public/index`.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CourseId } from "@/lib/requirements/code";
import {
  decodeEmbeddingBlock,
  decodeIndex,
  type IndexEmbeddingInfo,
} from "@/lib/search/index-format";

import { noVectorSource } from "./sources";
import type { CourseVectorSource } from "./types";

/* ==========================================================================
 * The manifest
 * ========================================================================== */

/**
 * The subset of `public/index/manifest.json` this module needs.
 *
 * Declared locally and narrowed by hand rather than imported from
 * `lib/search/client.ts`: that module is written for the browser (IndexedDB,
 * `fetch`, feature detection) and importing it here would drag a client bundle
 * into a server path for the sake of one interface.
 */
interface IndexManifestShape {
  version: string;
  lexical: { url: string };
  embedding: { url: string; dims: number; model: string } | null;
}

function readManifest(value: unknown): IndexManifestShape | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const lexical = record.lexical as { url?: unknown } | undefined;
  if (!lexical || typeof lexical.url !== "string") return null;

  const embedding = record.embedding as
    | { url?: unknown; dims?: unknown; model?: unknown }
    | null
    | undefined;

  return {
    version: typeof record.version === "string" ? record.version : "unknown",
    lexical: { url: lexical.url },
    embedding:
      embedding && typeof embedding.url === "string" && typeof embedding.dims === "number"
        ? {
            url: embedding.url,
            dims: embedding.dims,
            model: typeof embedding.model === "string" ? embedding.model : "unknown",
          }
        : null,
  };
}

/* ==========================================================================
 * Locating the artifacts
 * ========================================================================== */

/**
 * Candidate roots for `public/index`.
 *
 * More than one because `process.cwd()` is not the same directory in every
 * runtime this code runs in: `next dev` and `next build` run from the repo
 * root, a standalone server runs from `.next/standalone`, and vitest runs from
 * wherever the suite was invoked. Trying a short list is cheaper and far more
 * legible than threading a path through every caller.
 *
 * The FIRST root is written as `path.join(process.cwd(), "public", "index",
 * name)` on purpose. Turbopack traces dynamic `readFile` calls; a fully
 * dynamic `path.join(root, name)` made it include the whole repo in every
 * serverless function (AGENTS.md, tests, SQL, the extension). Scoping the
 * primary path to `public/index` keeps the index bytes in the function and
 * leaves the rest of the tree out. Fallbacks use `turbopackIgnore` so they
 * do not re-expand the trace.
 *
 * NOTE for deployment: on a serverless host, files under `public/` are served
 * by the CDN and are not guaranteed to be present in the function's filesystem.
 * If they are absent every lookup below fails, `loadCourseVectorSource` logs
 * once and degrades to `noVectorSource()` — the exact behaviour that shipped
 * before this file existed, not a crash. See `VECTOR_SOURCE_UNAVAILABLE`.
 */
async function readFirst(relativeName: string): Promise<Buffer | null> {
  // Primary path: statically scoped so Turbopack traces only public/index.
  try {
    return await readFile(path.join(process.cwd(), "public", "index", relativeName));
  } catch {
    // cwd is not the repo root. Try the two other known layouts.
  }

  const fallbacks = [
    path.join(process.cwd(), "..", "public", "index", relativeName),
    path.join(process.cwd(), ".next", "standalone", "public", "index", relativeName),
  ];
  for (const candidate of fallbacks) {
    try {
      // turbopackIgnore: do not treat these as another unbounded fs root.
      return await readFile(/* turbopackIgnore: true */ candidate);
    } catch {
      // Next fallback. A miss here is the expected case for two of three.
    }
  }
  return null;
}

/** `/index/catalog-1tphgkr.emb.bin` → `catalog-1tphgkr.emb.bin`. */
function basename(url: string): string {
  return url.split("/").filter(Boolean).pop() ?? url;
}

/** Node's Buffer is a view INTO a pooled ArrayBuffer; slice to the real bytes. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/* ==========================================================================
 * The source
 * ========================================================================== */

export interface CourseVectorIndex extends CourseVectorSource {
  /** Vector dimensionality, e.g. 384. */
  readonly dims: number;
  /** How many courses carry a vector. */
  readonly size: number;
  /** Provenance, straight off the artifact: `"lsa-svd-384d-v8746"`. */
  readonly model: string;
  /** The content-addressed build these vectors came from. */
  readonly indexVersion: string;
}

/**
 * Sentinel returned when the artifacts could not be read.
 *
 * A distinct object rather than a plain `noVectorSource()` so a caller — or a
 * test — can tell "we have no semantic space" from "this student's courses
 * happen to be unvectorized", which look identical through the interface.
 */
export const VECTOR_SOURCE_UNAVAILABLE: CourseVectorIndex = {
  ...noVectorSource(),
  dims: 0,
  size: 0,
  model: "unavailable",
  indexVersion: "unavailable",
};

/**
 * Decode the artifacts into an id-addressed, lazily-materialized vector source.
 *
 * Exported separately from the loader so a test can drive it from bytes it
 * built itself, without a filesystem.
 */
export function buildCourseVectorIndex(args: {
  /** Course ids in ORDINAL order — the lexical index's `DISP` order. */
  courseIds: readonly string[];
  info: IndexEmbeddingInfo;
  /** `docCount * (dims / 32)` words, one sign bit per dimension. */
  binary: Uint32Array;
  /** `docCount * dims` int8s, when the build shipped a rescore block. */
  rescore: Int8Array | null;
  rescoreScale: Float32Array | null;
  indexVersion: string;
}): CourseVectorIndex {
  const { courseIds, info, binary, rescore, rescoreScale, indexVersion } = args;
  const dims = info.dims;
  const words = dims >>> 5;

  /*
   * A geometry mismatch is fatal to correctness rather than to the process: if
   * the sidecar holds a different number of documents than the index has
   * courses, every ordinal past the first divergence addresses the WRONG
   * course's vector — a recommender that silently recommends by someone else's
   * taste. Refusing is the only safe answer, and the caller degrades.
   */
  if (info.docCount !== courseIds.length || dims <= 0 || dims % 32 !== 0) {
    return VECTOR_SOURCE_UNAVAILABLE;
  }

  const ordinalById = new Map<string, number>();
  for (let ordinal = 0; ordinal < courseIds.length; ordinal += 1) {
    // First ordinal wins. The builder emits one row per course, so a duplicate
    // would be a builder bug; taking the first keeps this deterministic if so.
    if (!ordinalById.has(courseIds[ordinal])) ordinalById.set(courseIds[ordinal], ordinal);
  }

  /*
   * Materialized on demand and cached.
   *
   * Eagerly expanding all 4,878 vectors costs 7.5 MB of Float32Array for a feed
   * that touches a few hundred of them — the taste vector reads one per course
   * on the student's record, and scoring reads one per candidate. Lazy keeps
   * the resident cost proportional to what was actually asked about, and the
   * cache keeps repeated scoring passes from re-decoding the same bits.
   */
  const cache = new Map<string, Float32Array>();

  // Sign vectors all have the same norm, so normalizing is one constant.
  const signScale = 1 / Math.sqrt(dims);

  function decodeAt(ordinal: number): Float32Array {
    const vector = new Float32Array(dims);

    if (rescore && rescoreScale) {
      // The float-ish path. Only taken when a build shipped `EMBQ`; today it
      // does not, but the branch costs nothing and removes a future edit.
      const base = ordinal * dims;
      const scale = rescoreScale[ordinal];
      for (let d = 0; d < dims; d += 1) vector[d] = rescore[base + d] * scale;
      return normalize(vector);
    }

    const base = ordinal * words;
    for (let d = 0; d < dims; d += 1) {
      const word = binary[base + (d >>> 5)];
      // `>>> 31` rather than a mask-and-compare: the bit is either the sign of
      // the LSA coordinate or its absence, and both map to +/-1.
      vector[d] = (word >>> (d & 31)) & 1 ? signScale : -signScale;
    }
    return vector;
  }

  return {
    dims,
    size: ordinalById.size,
    model: info.model,
    indexVersion,
    vectorFor(courseId: CourseId): Float32Array | undefined {
      const cached = cache.get(courseId);
      if (cached) return cached;

      const ordinal = ordinalById.get(courseId);
      if (ordinal === undefined) return undefined;

      const vector = decodeAt(ordinal);
      cache.set(courseId, vector);
      return vector;
    },
  };
}

function normalize(vector: Float32Array): Float32Array {
  let sumOfSquares = 0;
  for (let index = 0; index < vector.length; index += 1) {
    sumOfSquares += vector[index] * vector[index];
  }
  if (sumOfSquares === 0) return vector;
  const inverse = 1 / Math.sqrt(sumOfSquares);
  for (let index = 0; index < vector.length; index += 1) vector[index] *= inverse;
  return vector;
}

/* ==========================================================================
 * The loader
 * ========================================================================== */

/**
 * Memoised as a PROMISE, not a value.
 *
 * Two concurrent requests on a cold process would otherwise each read 10 MB and
 * each run the decode. Caching the in-flight promise coalesces them onto one.
 * A rejection cannot be memoised here because the loader never rejects — it
 * resolves to `VECTOR_SOURCE_UNAVAILABLE` — which is deliberate: a feed must
 * not fail to render because an artifact was missing.
 */
let pending: Promise<CourseVectorIndex> | null = null;

/** Drop the memo. For tests and for an ingest that rebuilds the artifact. */
export function invalidateCourseVectorCache(): void {
  pending = null;
}

export function loadCourseVectorSource(): Promise<CourseVectorIndex> {
  if (!pending) pending = load();
  return pending;
}

async function load(): Promise<CourseVectorIndex> {
  try {
    const manifestBytes = await readFirst("manifest.json");
    if (!manifestBytes) {
      console.warn(
        "recommend: no public/index/manifest.json found; taste scoring is disabled.",
      );
      return VECTOR_SOURCE_UNAVAILABLE;
    }

    const manifest = readManifest(JSON.parse(manifestBytes.toString("utf8")));
    if (!manifest?.embedding) {
      console.warn(
        "recommend: the search index shipped without an embedding sidecar; taste scoring is disabled.",
      );
      return VECTOR_SOURCE_UNAVAILABLE;
    }

    const [embeddingBytes, lexicalBytes] = await Promise.all([
      readFirst(basename(manifest.embedding.url)),
      readFirst(basename(manifest.lexical.url)),
    ]);
    if (!embeddingBytes || !lexicalBytes) {
      console.warn("recommend: index artifacts are missing; taste scoring is disabled.");
      return VECTOR_SOURCE_UNAVAILABLE;
    }

    const block = decodeEmbeddingBlock(toArrayBuffer(embeddingBytes));

    /*
     * The lexical index is decoded ONLY for its ordinal → courseId mapping, and
     * the decoded index is dropped as soon as the ids are copied out. Holding
     * it would pin the whole 10 MB buffer (every block is a view into it) for
     * the lifetime of the process to serve a 4,878-entry string array.
     */
    const index = decodeIndex(toArrayBuffer(lexicalBytes));
    const courseIds = index.display.map((entry) => entry.courseId);

    return buildCourseVectorIndex({
      courseIds,
      info: block.info,
      binary: block.binary,
      rescore: block.rescore,
      rescoreScale: block.rescoreScale,
      indexVersion: manifest.version,
    });
  } catch (cause) {
    /*
     * Degrade, never throw. Every failure mode here — a truncated artifact, a
     * format version this code cannot read, a read-only filesystem — produces
     * the same correct fallback: recommendations ranked on requirement fit and
     * unlock, every card carrying its `no_vector` caveat. That is a worse feed,
     * not a broken page.
     */
    console.error("recommend: could not load course vectors, degrading:", cause);
    return VECTOR_SOURCE_UNAVAILABLE;
  }
}
