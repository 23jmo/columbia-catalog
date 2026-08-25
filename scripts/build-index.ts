/**
 * Build the client search index artifact.
 *
 *   npx tsx scripts/build-index.ts
 *   npx tsx scripts/build-index.ts --terms 20263,20271 --out public/index
 *
 * Reads the catalog through `getAllCourses()` — the same seam the UI uses — so
 * whatever backs that function (seed extract today, Supabase tomorrow) is what
 * ships in the index.
 *
 * Outputs, into `public/index/`:
 *   catalog-<version>.bin   the lexical index (versioned, immutable, CDN-safe)
 *   manifest.json           tiny pointer the client fetches first
 *
 *   catalog-<version>.emb.bin  the semantic sidecar (separate, lazy download)
 *
 * EMBEDDINGS ALWAYS SHIP. There are two sources and the difference is only
 * which space the vectors live in:
 *
 *   - Default: `buildLsaVectors` factors the catalog's own text (lib/search/
 *     lsa.ts). No credential, no dependency, no network.
 *   - Set EMBEDDING_API_KEY (plus EMBEDDING_BASE_URL / EMBEDDING_MODEL /
 *     EMBEDDING_DIMS for anything other than OpenAI's 384-dim
 *     text-embedding-3-small) and a hosted encoder is used instead. Better
 *     vectors; a bill and a key to rotate.
 *
 * Nothing downstream distinguishes them. The query side folds a query into
 * whatever space the block was built in, using the postings the lexical index
 * already ships — see lib/search/query-embedder.ts. That is what makes the
 * choice of provider a pure quality knob rather than a feature flag.
 */

import { gzipSync } from "node:zlib";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { getAllCourses } from "@/lib/data/catalog";
import { projectCourse } from "@/lib/catalog-list-types";
import { cloneCoursesWithTypicalMeetings } from "@/lib/db/typical-meetings";
import { ACTIVE_TERMS, PERF_BUDGET } from "@/lib/constants";
import type { CourseWithSections, TermCode } from "@/lib/types";
import { buildIndex, estimateBlockSizes } from "@/lib/search/build";
import {
  INDEX_FORMAT_VERSION,
  buildEmbeddingBlock,
  encodeEmbeddingBlock,
  encodeIndex,
  type EmbeddingBlock,
} from "@/lib/search/index-format";
import { buildLsaVectors } from "@/lib/search/lsa";
import {
  courseEmbeddingText,
  embedCourses,
  EMBEDDING_DIMS,
  MIN_EMBEDDABLE_CHARS,
  isProviderProblem,
  readEmbeddingProviderFromEnv,
} from "@/lib/search/embeddings";
import type { SearchIndexManifest } from "@/lib/search/client";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readArg(name: string): string | undefined {
  const flag = `--${name}`;
  const argv = process.argv;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === flag) return argv[i + 1];
    if (argv[i].startsWith(`${flag}=`)) return argv[i].slice(flag.length + 1);
  }
  return undefined;
}

const termsArg = readArg("terms");
const terms: TermCode[] = termsArg ? termsArg.split(",").map((t) => t.trim()).filter(Boolean) : [...ACTIVE_TERMS];
const outDir = resolve(process.cwd(), readArg("out") ?? "public/index");

// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * A course can be offered in several terms. The index is one document per
 * course with its sections from every requested term attached, so a term
 * filter narrows sections rather than duplicating rows.
 */
function mergeByCourse(batches: CourseWithSections[][]): CourseWithSections[] {
  const byId = new Map<string, CourseWithSections>();
  for (const batch of batches) {
    for (const course of batch) {
      const existing = byId.get(course.courseId);
      if (!existing) {
        byId.set(course.courseId, { ...course, sections: [...course.sections] });
        continue;
      }
      const seen = new Set(existing.sections.map((s) => s.sectionId));
      for (const section of course.sections) {
        if (!seen.has(section.sectionId)) existing.sections.push(section);
      }
      // Prefer the record that actually carries a description.
      if (!existing.description && course.description) existing.description = course.description;
    }
  }
  return [...byId.values()];
}

/**
 * One binary-quantized vector per course, or null when no provider is
 * configured.
 *
 * `ordered` must be the SAME array the lexical build indexed — the embedding
 * block is positional, so a different order would attach every course's vector
 * to its neighbour. The caller passes `ordered`, not `courses`, for exactly
 * this reason.
 *
 * `withRescore` ships the int8 block the engine uses to re-rank the top slice
 * in float. It is OFF by default, which is a measurement rather than a
 * preference: on the real catalog it costs 1.4 MB gzipped — pushing the
 * artifact 47% over spec §19's budget — and moves 7% of top-10 positions
 * (93% agreement with binary-only across eight representative queries). The
 * semantic signal itself moves 38% of positions relative to lexical-only, so
 * the fusion is worth shipping and the extra precision is not. Set
 * EMBEDDING_RESCORE=1 to include it anyway.
 *
 * A provider failure aborts the build rather than degrading to lexical-only.
 * Silently shipping an artifact missing the block the operator just asked for
 * would look like success and be discovered weeks later.
 */
/** Opt-in: see `buildEmbeddings` on why the default is off. */
function wantsRescore(): boolean {
  const raw = process.env.EMBEDDING_RESCORE;
  return raw === "1" || raw === "true";
}

/**
 * The no-credential path, and the one that actually ships.
 *
 * `buildLsaVectors` factors the catalog's own text rather than calling a
 * hosted encoder, so semantic search works out of the box instead of waiting
 * on an API key that may never be set. The vectors are weaker than a
 * transformer's — see lib/search/lsa.ts on exactly how — but the alternative
 * on offer is no semantic signal at all.
 *
 * Courses whose text is too thin to mean anything are handed to the SVD as
 * empty documents, which produces the zero vector: it quantizes to an
 * all-zero code and never wins a neighbour search. That is the right answer
 * for a course we know nothing about beyond its number, and it matches what
 * `embedCourses` does on the hosted path.
 */
function buildLsaEmbeddings(ordered: CourseWithSections[]): EmbeddingBlock {
  const documents = ordered.map((course) => {
    const text = courseEmbeddingText(course);
    return text.length < MIN_EMBEDDABLE_CHARS ? "" : text;
  });

  const result = buildLsaVectors(documents, {
    dims: EMBEDDING_DIMS,
    onProgress: (stage) => console.log(`    lsa: ${stage}`),
  });
  console.log(
    `  embeddings     : ${result.model} — ${result.vocabularySize.toLocaleString()} terms`,
  );
  return buildEmbeddingBlock(result.vectors, EMBEDDING_DIMS, result.model, wantsRescore());
}

async function buildEmbeddings(ordered: CourseWithSections[]): Promise<EmbeddingBlock | null> {
  const configured = readEmbeddingProviderFromEnv();
  if (isProviderProblem(configured)) {
    console.log(`\n  embeddings     : ${configured.reason}; using local LSA`);
    return buildLsaEmbeddings(ordered);
  }

  console.log(`\n  embeddings     : ${configured.model} @ ${configured.dims}d`);
  const vectors = await embedCourses(ordered, configured, {
    onProgress: (done, total) => {
      if (done % 1024 === 0 || done === total) {
        console.log(`    embedded ${done.toLocaleString()} / ${total.toLocaleString()}`);
      }
    },
  });
  return buildEmbeddingBlock(vectors, configured.dims, configured.model, wantsRescore());
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`LionPlan — search index build`);
  console.log(`  format version : ${INDEX_FORMAT_VERSION}`);
  console.log(`  terms          : ${terms.join(", ")}`);

  const batches: CourseWithSections[][] = [];
  for (const term of terms) batches.push(await getAllCourses(term));
  const courses = mergeByCourse(batches);
  const sectionTotal = courses.reduce((sum, c) => sum + c.sections.length, 0);
  console.log(`  courses        : ${courses.length.toLocaleString()}`);
  console.log(`  sections       : ${sectionTotal.toLocaleString()}`);

  if (courses.length === 0) {
    console.error("\nNo courses returned by getAllCourses(). Nothing to build.");
    process.exitCode = 1;
    return;
  }

  const buildStarted = Date.now();
  const ordered = [...courses].sort((a, b) => a.courseId.localeCompare(b.courseId));
  const { courses: indexedCourses, enrichedSections } =
    await cloneCoursesWithTypicalMeetings(ordered);
  if (enrichedSections > 0) {
    console.log(
      `  typical times  : ${enrichedSections.toLocaleString()} sections (historical, search filters only)`,
    );
  }
  const index = buildIndex(indexedCourses);
  // Display rows keep directory truth — no historical times rendered as current.
  index.display = ordered.map(projectCourse);
  const buildMs = Date.now() - buildStarted;
  const bytes = encodeIndex(index);
  const gzipped = gzipSync(bytes, { level: 9 });
  const version = index.meta.indexVersion;

  mkdirSync(outDir, { recursive: true });
  const lexicalName = `catalog-${version}.bin`;
  writeFileSync(join(outDir, lexicalName), bytes);

  // --- embeddings (optional) ----------------------------------------------
  const embedding = await buildEmbeddings(ordered);
  let embeddingName: string | null = null;
  let embeddingBytes = 0;
  let embeddingGzip = 0;
  if (embedding) {
    const encoded = encodeEmbeddingBlock(embedding);
    embeddingName = `catalog-${version}.emb.bin`;
    embeddingBytes = encoded.byteLength;
    embeddingGzip = gzipSync(encoded, { level: 9 }).byteLength;
    writeFileSync(join(outDir, embeddingName), encoded);
    index.meta.embedding = embedding.info;
  }

  const manifest: SearchIndexManifest = {
    formatVersion: INDEX_FORMAT_VERSION,
    version,
    builtAt: index.meta.builtAt,
    terms,
    courseCount: index.meta.courseCount,
    sectionCount: index.meta.sectionCount,
    lexical: { url: `/index/${lexicalName}`, bytes: bytes.byteLength, gzipBytes: gzipped.byteLength },
    embedding: embeddingName
      ? {
          url: `/index/${embeddingName}`,
          bytes: embeddingBytes,
          gzipBytes: embeddingGzip,
          dims: embedding!.info.dims,
          model: embedding!.info.model,
        }
      : null,
  };
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  /*
   * Drop the artifacts this build superseded.
   *
   * Every build writes a content-hashed name, and nothing used to remove the
   * old one — `public/index` had grown to four `.bin` files and 18.8 MB, all of
   * which are committed and all of which ship, though the client only ever
   * fetches the one the manifest names. The hashed name is what makes the file
   * safe to cache forever; it is also what makes the stale ones invisible.
   *
   * Only files this script's own naming scheme could have produced are
   * considered, and only ones the manifest we just wrote does not reference.
   */
  const live = new Set([lexicalName, embedding ? embeddingName : null].filter(Boolean));
  const stale = readdirSync(outDir).filter(
    (name) => /^catalog-[a-z0-9]+(\.emb)?\.bin$/.test(name) && !live.has(name),
  );
  for (const name of stale) unlinkSync(join(outDir, name));
  if (stale.length > 0) {
    console.log(`\nRemoved ${stale.length} superseded artifact(s): ${stale.join(", ")}`);
  }

  // --- report ---------------------------------------------------------------
  console.log(`\nBlock sizes (raw):`);
  const blocks = estimateBlockSizes(index);
  const widest = Math.max(...Object.keys(blocks).map((k) => k.length));
  for (const [name, size] of Object.entries(blocks).sort((a, b) => b[1] - a[1])) {
    const share = ((size / bytes.byteLength) * 100).toFixed(1).padStart(5);
    console.log(`  ${name.padEnd(widest)}  ${formatBytes(size).padStart(10)}  ${share}%`);
  }

  console.log(`\nArtifact:`);
  console.log(`  ${lexicalName}`);
  console.log(`  dictionary     : ${index.meta.termDictSize.toLocaleString()} terms`);
  console.log(`  raw            : ${formatBytes(bytes.byteLength)}`);
  console.log(`  gzip           : ${formatBytes(gzipped.byteLength)}   <- what ships`);
  if (embeddingName) {
    console.log(`  ${embeddingName}`);
    console.log(`  raw            : ${formatBytes(embeddingBytes)}`);
    console.log(`  gzip           : ${formatBytes(embeddingGzip)}`);
  }

  const shipped = gzipped.byteLength + embeddingGzip;
  const budget = PERF_BUDGET.indexBytes;
  const pct = ((shipped / budget) * 100).toFixed(1);
  console.log(`\nBudget (spec §19): ${formatBytes(shipped)} / ${formatBytes(budget)}  (${pct}%)`);
  if (shipped > budget) {
    console.error(`  OVER BUDGET by ${formatBytes(shipped - budget)}`);
    process.exitCode = 1;
  } else {
    console.log(`  within budget, ${formatBytes(budget - shipped)} of headroom`);
  }

  if (!embedding) {
    console.log(
      `\nSemantic search DISABLED: no embedding provider is configured, so no\n` +
        `embedding block was produced. The artifact is a complete, valid\n` +
        `lexical index — BM25, prefix and fuzzy matching all work.\n` +
        `\n` +
        `Everything on this side is built: buildEmbeddings() below, the block\n` +
        `encoder, the client loader and the engine. Set EMBEDDING_API_KEY (and\n` +
        `EMBEDDING_MODEL / EMBEDDING_BASE_URL if not OpenAI) and this build\n` +
        `produces the sidecar. Note that DOCUMENT embeddings are only half of\n` +
        `it: spec §9 forbids search from touching the network, so ranking a\n` +
        `query against them needs a model running in the browser. See\n` +
        `.plans/BLOCKERS.md item 12.`,
    );
  }

  console.log(
    `\nBuilt in ${buildMs} ms (${Date.now() - startedAt} ms total). Wrote ${outDir}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
