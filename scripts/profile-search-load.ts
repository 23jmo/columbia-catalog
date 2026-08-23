/**
 * Profile /search load: index-only path vs legacy server catalog path.
 *
 * Usage: tsx scripts/profile-search-load.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // No .env.local — seed path only.
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const { gzipSync } = await import("node:zlib");
  const { projectCourse } = await import("@/lib/catalog-list-types");
  const { invalidateCatalogCache, getAllCourses } = await import("@/lib/data/catalog");
  const { buildIndex } = await import("@/lib/search/build");
  const { encodeIndex } = await import("@/lib/search/index-format");
  const { SearchEngine } = await import("@/lib/search/engine");
  const { CURRENT_TERM } = await import("@/lib/constants");

  const term = CURRENT_TERM;

  console.log("\n/search load profile (index-only architecture)");
  console.log("================================================");

  // Legacy path (what we removed from page.tsx)
  invalidateCatalogCache(term);
  const coldStart = performance.now();
  const catalog = await getAllCourses(term);
  const coldMs = performance.now() - coldStart;
  const projected = catalog.map(projectCourse);
  const rscJson = JSON.stringify(projected);
  const rscBytes = Buffer.byteLength(rscJson, "utf8");

  // New path: index artifact size + client decode
  const ordered = [...catalog].sort((a, b) => a.courseId.localeCompare(b.courseId));
  const index = buildIndex(ordered);
  index.display = projected;
  const encoded = encodeIndex(index);
  const gzipped = gzipSync(encoded, { level: 9 });

  const decodeStart = performance.now();
  const { decodeIndex } = await import("@/lib/search/index-format");
  const decoded = decodeIndex(
    encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer,
  );
  const decodeMs = performance.now() - decodeStart;

  const engineStart = performance.now();
  const engine = new SearchEngine(decoded);
  engine.setSeatOverlay(engine.seatOverlayForTerm(term));
  const result = engine.search({ termCode: term });
  const engineMs = performance.now() - engineStart;

  console.log(`\nCatalog: ${catalog.length.toLocaleString()} courses`);
  console.log("\nOLD path (server RSC — removed):");
  console.log(`  getAllCourses (cold):  ${coldMs.toFixed(0)} ms`);
  console.log(`  RSC payload (projected): ${(rscBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log("\nNEW path (client index):");
  console.log(`  artifact raw:          ${(encoded.byteLength / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  artifact gzip:         ${(gzipped.byteLength / 1024 / 1024).toFixed(2)} MB (cached in IndexedDB)`);
  console.log(`  decode + engine init:  ${decodeMs.toFixed(0)} ms`);
  console.log(`  first search (cold):   ${engineMs.toFixed(0)} ms (index build + seat overlay)`);
  console.log(`  search():              ${result.elapsedMs.toFixed(1)} ms (${result.total} hits)`);
  console.log("\nServer /search page now skips getAllCourses — expect ~instant TTFB + index download client-side.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
