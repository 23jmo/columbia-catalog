/**
 * Document embeddings for the search index.
 *
 * Spec §9 asks for 384-dimension vectors, binary-quantized to one bit per
 * dimension, with a float rescore over the top slice. Every piece of that
 * except the vectors themselves already exists: `buildEmbeddingBlock` does the
 * quantization, `encodeEmbeddingBlock` writes the sidecar, `SearchClient`
 * downloads it after the lexical block, and `SearchEngine.applySemantic`
 * fuses it. This module is the missing input — the thing that turns a course
 * into a vector.
 *
 * ── Where the query side went ──────────────────────────────────────────────
 *
 * `QueryEmbedder` in engine.ts is SYNCHRONOUS by design: `(query: string) =>
 * Float32Array | null`. That signature is the spec's zero-latency promise
 * written into a type — a search that had to await a round trip could not
 * return in the same tick as the keystroke, and spec §9 is explicit that
 * search never touches the network.
 *
 * That was read for a long time as requiring an embedding model in the
 * browser, which this repo cannot add. It does not: `createFoldInQueryEmbedder`
 * (query-embedder.ts) places a query in the space by averaging the vectors of
 * the documents containing its terms, using the postings the lexical index
 * already ships. It is synchronous, offline, and agnostic to where the
 * document vectors came from — this provider or lsa.ts.
 *
 * ── Provider ───────────────────────────────────────────────────────────────
 *
 * The wire format is OpenAI's `/embeddings`, which is what nearly every hosted
 * embedder speaks — set `EMBEDDING_BASE_URL` and it points at any of them.
 * There is no default endpoint: with no key configured the build falls back to
 * `lsa.ts`, which factors the catalog's own text. That fallback is a different
 * space, not a degraded version of this one, and the artifact records which
 * via `IndexEmbeddingInfo.model` — an embedding provider that silently
 * substituted something cheap while claiming to be this one would put vectors
 * in the index that mean nothing, and a wrong neighbour is worse than no
 * neighbour.
 */

import type { CourseWithSections } from "@/lib/types";

/**
 * 384 is the spec's number and it is also the constraint: `buildEmbeddingBlock`
 * requires a multiple of 32 (one word per 32 dimensions), and 384 divides
 * cleanly into 12 words per document — 48 bytes per course, ~380 KB for the
 * whole catalog before the rescore block.
 */
export const EMBEDDING_DIMS = 384;

/** Below this, the text is a course code and a stub title; a vector would be noise. */
export const MIN_EMBEDDABLE_CHARS = 24;

/**
 * Hosted embedders bill and truncate by token. This cap is in characters
 * because we have no tokenizer here; ~6000 chars is comfortably inside an 8k
 * token window for English prose and no Columbia course description is close.
 */
export const MAX_DOC_CHARS = 6000;

export interface EmbeddingProvider {
  /** Provenance, written into `IndexEmbeddingInfo.model`. */
  readonly model: string;
  readonly dims: number;
  /** One unit-normalized vector per input, in input order. */
  embed(texts: string[]): Promise<Float32Array[]>;
}

// ---------------------------------------------------------------------------
// What a course "is", as text
// ---------------------------------------------------------------------------

/**
 * The document we embed.
 *
 * Ordered most-identifying first, because every embedder weights early tokens
 * more heavily and a truncated document should lose its tail, not its subject.
 *
 * Section titles are included and deduplicated: COMS E6998's twenty sections
 * are twenty different classes ("LLM BASED GENERATIVE AI", "HIGH PERF MACH
 * LEARNING", …) and a vector built only from the course title would place all
 * twenty at the same point — the exact failure the `sections.title` column
 * exists to fix.
 *
 * Seat counts, meeting times and instructors are deliberately absent. The
 * index is the immutable half of the split (spec §9): anything that changes
 * hourly must never be baked into an artifact that is regenerated a few times
 * a term.
 */
export function courseEmbeddingText(course: CourseWithSections): string {
  const parts: string[] = [`${course.subjectCode} ${course.number} ${course.title}`];

  const sectionTitles = new Set<string>();
  for (const section of course.sections) {
    const title = section.title?.trim();
    if (!title) continue;
    if (title.toLowerCase() === course.title.trim().toLowerCase()) continue;
    sectionTitles.add(title);
  }
  if (sectionTitles.size > 0) parts.push([...sectionTitles].join("; "));

  if (course.description) parts.push(course.description);
  if (course.prerequisiteText) parts.push(`Prerequisites: ${course.prerequisiteText}`);
  if (course.department) parts.push(course.department);

  const text = parts.join("\n").replace(/\s+/g, " ").trim();
  return text.length > MAX_DOC_CHARS ? text.slice(0, MAX_DOC_CHARS) : text;
}

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

/**
 * Unit-normalize in place and return the same array.
 *
 * Both consumers assume it: binary quantization takes the sign bit, which is
 * scale-free only if every vector shares a scale, and the int8 rescore divides
 * by a per-document max that is only comparable across documents when the
 * vectors are unit length. A zero vector is returned unchanged rather than
 * producing NaNs.
 */
export function normalizeVector(vector: Float32Array): Float32Array {
  let sumOfSquares = 0;
  for (let index = 0; index < vector.length; index += 1) {
    sumOfSquares += vector[index] * vector[index];
  }
  if (sumOfSquares === 0) return vector;
  const inverseNorm = 1 / Math.sqrt(sumOfSquares);
  for (let index = 0; index < vector.length; index += 1) vector[index] *= inverseNorm;
  return vector;
}

// ---------------------------------------------------------------------------
// The OpenAI-shaped provider
// ---------------------------------------------------------------------------

export interface HttpEmbeddingConfig {
  apiKey: string;
  /** Base URL without a trailing slash, e.g. "https://api.openai.com/v1". */
  baseUrl: string;
  model: string;
  dims: number;
  /** Inputs per HTTP request. Providers cap this; 96 is safe everywhere. */
  batchSize?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

interface EmbeddingResponse {
  data?: { index?: number; embedding?: number[] }[];
  error?: { message?: string };
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createHttpEmbeddingProvider(config: HttpEmbeddingConfig): EmbeddingProvider {
  const batchSize = Math.max(1, config.batchSize ?? 96);
  const maxRetries = Math.max(0, config.maxRetries ?? 4);
  const doFetch = config.fetchImpl ?? fetch;

  async function embedBatch(texts: string[]): Promise<Float32Array[]> {
    let lastError = "";
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) await sleep(Math.min(30_000, 500 * 2 ** (attempt - 1)));

      let response: Response;
      try {
        response = await doFetch(`${config.baseUrl}/embeddings`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            input: texts,
            // Matryoshka truncation, where the provider supports it. A provider
            // that ignores this is caught by the length check below rather than
            // shipping vectors of the wrong width.
            dimensions: config.dims,
            encoding_format: "float",
          }),
        });
      } catch (cause) {
        lastError = cause instanceof Error ? cause.message : String(cause);
        continue;
      }

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        if (RETRYABLE_STATUS.has(response.status)) continue;
        throw new Error(`Embedding request failed: ${lastError}`);
      }

      const payload = (await response.json()) as EmbeddingResponse;
      if (payload.error) throw new Error(`Embedding request failed: ${payload.error.message}`);
      const rows = payload.data ?? [];
      if (rows.length !== texts.length) {
        throw new Error(`Embedding response covered ${rows.length} of ${texts.length} inputs`);
      }

      // Providers are permitted to return out of order; `index` is authoritative.
      const ordered: Float32Array[] = new Array(texts.length);
      for (let position = 0; position < rows.length; position += 1) {
        const row = rows[position];
        const slot = row.index ?? position;
        const values = row.embedding;
        if (!values || values.length !== config.dims) {
          throw new Error(
            `Embedding ${slot} has ${values?.length ?? 0} dimensions, expected ${config.dims}`,
          );
        }
        ordered[slot] = normalizeVector(Float32Array.from(values));
      }
      return ordered;
    }
    throw new Error(`Embedding request failed after ${maxRetries + 1} attempts: ${lastError}`);
  }

  return {
    model: config.model,
    dims: config.dims,
    async embed(texts) {
      const out: Float32Array[] = [];
      for (let start = 0; start < texts.length; start += batchSize) {
        out.push(...(await embedBatch(texts.slice(start, start + batchSize))));
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface EmbeddingConfigProblem {
  provider: null;
  reason: string;
}

/**
 * Reads the provider from the environment, or explains what is missing.
 *
 * Returns a reason rather than throwing because the index build must succeed
 * without embeddings — that is the shipping configuration today, not an error
 * state.
 */
export function readEmbeddingProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingProvider | EmbeddingConfigProblem {
  const apiKey = env.EMBEDDING_API_KEY;
  if (!apiKey) {
    return { provider: null, reason: "EMBEDDING_API_KEY is not set — building lexical-only" };
  }
  const baseUrl = (env.EMBEDDING_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const dims = Number(env.EMBEDDING_DIMS ?? EMBEDDING_DIMS);

  if (!Number.isInteger(dims) || dims <= 0 || dims % 32 !== 0) {
    return {
      provider: null,
      reason: `EMBEDDING_DIMS must be a positive multiple of 32 (the index packs 32 dimensions per word); got ${dims}`,
    };
  }
  return createHttpEmbeddingProvider({ apiKey, baseUrl, model, dims });
}

export function isProviderProblem(
  value: EmbeddingProvider | EmbeddingConfigProblem,
): value is EmbeddingConfigProblem {
  return "provider" in value && value.provider === null;
}

// ---------------------------------------------------------------------------
// Driving a whole catalog through it
// ---------------------------------------------------------------------------

export interface EmbedCoursesOptions {
  /** Courses per progress report and per provider call group. */
  chunkSize?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Embed every course, in the caller's order.
 *
 * The caller is responsible for passing courses in the SAME order
 * `buildIndex` assigns ordinals (courseId ascending) — the embedding block is
 * positional, and a misaligned block would attach every course's vector to its
 * neighbour. A course whose text is too thin to mean anything gets a zero
 * vector, which quantizes to an all-zero code and simply never wins a
 * neighbour search; that is the correct answer for a course we know nothing
 * about beyond its number.
 */
export async function embedCourses(
  courses: CourseWithSections[],
  provider: EmbeddingProvider,
  options: EmbedCoursesOptions = {},
): Promise<Float32Array[]> {
  const chunkSize = Math.max(1, options.chunkSize ?? 256);
  const vectors: Float32Array[] = new Array(courses.length);

  const embeddable: { position: number; text: string }[] = [];
  for (let position = 0; position < courses.length; position += 1) {
    const text = courseEmbeddingText(courses[position]);
    if (text.length < MIN_EMBEDDABLE_CHARS) {
      vectors[position] = new Float32Array(provider.dims);
      continue;
    }
    embeddable.push({ position, text });
  }

  for (let start = 0; start < embeddable.length; start += chunkSize) {
    const chunk = embeddable.slice(start, start + chunkSize);
    const embedded = await provider.embed(chunk.map((item) => item.text));
    for (let index = 0; index < chunk.length; index += 1) {
      vectors[chunk[index].position] = embedded[index];
    }
    options.onProgress?.(Math.min(start + chunkSize, embeddable.length), embeddable.length);
  }

  // Anything the loop skipped (an empty catalog slice) still needs a vector.
  for (let position = 0; position < vectors.length; position += 1) {
    if (!vectors[position]) vectors[position] = new Float32Array(provider.dims);
  }
  return vectors;
}
