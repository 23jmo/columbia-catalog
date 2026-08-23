/**
 * One-off profiler for /search load phases.
 *
 * Measures:
 *   1. getAllCourses() — Supabase round trips
 *   2. JSON serialization — RSC payload proxy
 *   3. createLocalSearchSource + empty search — client work proxy
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

  const { invalidateCatalogCache, getAllCourses } = await import("@/lib/data/catalog");
  const { createLocalSearchSource } = await import("@/components/catalog/search-source");
  const { CURRENT_TERM } = await import("@/lib/constants");

  const term = CURRENT_TERM;

  console.log("\n/search load profile");
  console.log("=====================");
  console.log(`Term: ${term}`);

  // --- Phase 1: cold Supabase fetch ---
  invalidateCatalogCache(term);
  const coldStart = performance.now();
  const catalog = await getAllCourses(term);
  const coldMs = performance.now() - coldStart;

  // --- Phase 2: warm cache hit (same process) ---
  const warmStart = performance.now();
  await getAllCourses(term);
  const warmMs = performance.now() - warmStart;

  // --- Phase 3: RSC payload proxy (serialize props SearchScreen receives) ---
  const serializeStart = performance.now();
  const json = JSON.stringify(catalog);
  const serializeMs = performance.now() - serializeStart;
  const jsonBytes = Buffer.byteLength(json, "utf8");

  // --- Phase 4: client bootstrap proxy ---
  const indexStart = performance.now();
  const source = createLocalSearchSource(catalog);
  const indexMs = performance.now() - indexStart;

  const searchStart = performance.now();
  const result = source.search({ termCode: term });
  const searchMs = performance.now() - searchStart;

  const rowsStart = performance.now();
  const rows = result.hits.map((hit) => ({
    courseId: hit.courseId,
    matchedSectionIds: hit.matchedSectionIds,
  }));
  const rowsMs = performance.now() - rowsStart;

  let sectionCount = 0;
  for (const course of catalog) sectionCount += course.sections.length;

  console.log("\nCatalog");
  console.log(`  courses:  ${catalog.length.toLocaleString()}`);
  console.log(`  sections: ${sectionCount.toLocaleString()}`);

  console.log("\nPhase timings (server-side simulation)");
  console.log(`  1. getAllCourses (cold):     ${coldMs.toFixed(0)} ms`);
  console.log(`  2. getAllCourses (warm):     ${warmMs.toFixed(0)} ms  ← 60s cache`);
  console.log(`  3. JSON.stringify(catalog):  ${serializeMs.toFixed(0)} ms`);
  console.log(`  4. createLocalSearchSource:  ${indexMs.toFixed(0)} ms`);
  console.log(`  5. search (no filters):      ${searchMs.toFixed(1)} ms  ← UI "elapsedMs"`);
  console.log(`  6. map hits → rows:          ${rowsMs.toFixed(0)} ms`);

  console.log("\nPayload");
  console.log(`  JSON size: ${(jsonBytes / 1024 / 1024).toFixed(2)} MB (${jsonBytes.toLocaleString()} bytes)`);
  console.log(`  hits returned: ${result.total.toLocaleString()}`);

  const serverBound = coldMs + serializeMs;
  const clientBound = indexMs + searchMs + rowsMs;
  console.log("\nDominant bucket (this run, server process only)");
  console.log(`  Server-bound (DB + serialize): ~${serverBound.toFixed(0)} ms`);
  console.log(`  Client-bound (index + search): ~${clientBound.toFixed(0)} ms`);
  if (coldMs > clientBound * 2) {
    console.log("  → Supabase fetch dominates cold loads.");
  } else if (serializeMs > coldMs) {
    console.log("  → Serialization dominates; payload size is the pain.");
  } else {
    console.log("  → Client bootstrap is comparable; measure in browser for hydration.");
  }

  console.log("\nNext: run `npm run dev` and hit /search — check Network tab for");
  console.log("document + RSC flight bytes and TTFB (hydration not captured here).\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
