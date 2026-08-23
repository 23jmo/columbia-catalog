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
 * EMBEDDINGS ARE OPTIONAL AND OFF BY DEFAULT. Set EMBEDDING_API_KEY (plus
 * EMBEDDING_BASE_URL / EMBEDDING_MODEL / EMBEDDING_DIMS to point somewhere
 * other than OpenAI's 384-dim text-embedding-3-small) and this script builds
 * the semantic sidecar alongside the lexical block. With no key it emits a
 * lexical-only artifact and prints why — which is what ships today.
 *
 * Note that document vectors alone do not turn semantic search on: the engine
 * also needs a SYNCHRONOUS query embedder, which means a model running in the
 * browser. See lib/search/embeddings.ts and .plans/BLOCKERS.md item 12.
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
import {
  embedCourses,
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
 * `withRescore = true` ships the int8 block the engine uses to re-rank the top
 * slice in float. It roughly quadruples the sidecar (48 bytes per course
 * becomes ~430), and it is what makes binary quantization safe: Hamming
 * distance ranks the whole catalog cheaply and approximately, and the rescore
 * fixes the ordering where it actually matters.
 *
 * A provider failure aborts the build rather than degrading to lexical-only.
 * Silently shipping an artifact missing the block the operator just asked for
 * would look like success and be discovered weeks later.
 */
async function buildEmbeddings(ordered: CourseWithSections[]): Promise<EmbeddingBlock | null> {
  const configured = readEmbeddingProviderFromEnv();
  if (isProviderProblem(configured)) {
    console.log(`\n  embeddings     : skipped — ${configured.reason}`);
    return null;
  }

  console.log(`\n  embeddings     : ${configured.model} @ ${configured.dims}d`);
  const vectors = await embedCourses(ordered, configured, {
    onProgress: (done, total) => {
      if (done % 1024 === 0 || done === total) {
        console.log(`    embedded ${done.toLocaleString()} / ${total.toLocaleString()}`);
      }
    },
  });
  return buildEmbeddingBlock(vectors, configured.dims, configured.model, true);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`Columbia Catalog — search index build`);
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
