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
 * EMBEDDINGS ARE NOT BUILT HERE. No embedding provider is wired up yet, so
 * this script emits a lexical-only artifact and says so. The format, the
 * client loader and the engine already support the semantic block; turning it
 * on means producing one Float32Array per course and calling
 * `buildEmbeddingBlock` — see the `buildEmbeddings` stub at the bottom.
 */

import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { getAllCourses } from "@/lib/data/catalog";
import { projectCourse } from "@/lib/catalog-list-types";
import { ACTIVE_TERMS, PERF_BUDGET } from "@/lib/constants";
import type { CourseWithSections, TermCode } from "@/lib/types";
import { buildIndex, estimateBlockSizes } from "@/lib/search/build";
import {
  INDEX_FORMAT_VERSION,
  encodeEmbeddingBlock,
  encodeIndex,
  type EmbeddingBlock,
} from "@/lib/search/index-format";
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
 * STUB. Returns null until an embedding provider is wired up.
 *
 * To enable semantic search, produce one unit-normalized Float32Array per
 * course — in the SAME order `buildIndex` assigns ordinals, which is courseId
 * ascending — and return `buildEmbeddingBlock(vectors, dims, model, true)`.
 * Nothing else in the pipeline changes.
 */
async function buildEmbeddings(courses: CourseWithSections[]): Promise<EmbeddingBlock | null> {
  void courses;
  return null;
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
  const index = buildIndex(ordered);
  index.display = ordered.map(projectCourse);
  const buildMs = Date.now() - buildStarted;
  const bytes = encodeIndex(index);
  const gzipped = gzipSync(bytes, { level: 9 });
  const version = index.meta.indexVersion;

  mkdirSync(outDir, { recursive: true });
  const lexicalName = `catalog-${version}.bin`;
  writeFileSync(join(outDir, lexicalName), bytes);

  // --- embeddings (optional) ----------------------------------------------
  const embedding = await buildEmbeddings(courses);
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
      `\nSemantic search DISABLED: no embedding provider is wired up, so no\n` +
        `embedding block was produced. The artifact is a complete, valid\n` +
        `lexical index — BM25, prefix and fuzzy matching all work. To enable\n` +
        `semantics later, implement buildEmbeddings() in this script; the\n` +
        `format, client loader and engine already handle the block.`,
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
