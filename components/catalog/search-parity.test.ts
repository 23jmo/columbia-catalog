/**
 * The two search paths must agree.
 *
 * `createLocalSearchSource` answers keystrokes from the records the server
 * already sent, so typing works on the first frame. `SearchEngine` takes over
 * once the binary index finishes downloading. Both are live in a single
 * session, on the same screen, for the same filters — so any disagreement
 * shows up to the student as results silently changing under them a moment
 * after the page settles, with nothing on screen to explain it.
 *
 * That is exactly what happened: the engine matched sections meeting ONLY on
 * the selected days (containment) while the local source matched sections
 * meeting on ANY of them (intersection). Multi-day filters coincided, so it
 * hid; `days=["Tu"]` returned 1 result on one path and 10 on the other.
 *
 * These cases compare the two implementations against each other rather than
 * against a hand-written expectation, because the invariant that matters is
 * agreement — a future change to either path has to move both.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createLocalSearchSource, sectionHasOpenSeats } from "@/components/catalog/search-source";
import { buildIndex } from "@/lib/search/build";
import { SearchEngine } from "@/lib/search/engine";
import { decodeIndex, encodeIndex } from "@/lib/search/index-format";
import type { CourseWithSections, SearchFilters } from "@/lib/types";

const catalog = JSON.parse(
  readFileSync("lib/seed/coms-fall2026.json", "utf8"),
) as CourseWithSections[];

// Round-trip through the wire format so the engine reads views over a received
// ArrayBuffer, exactly as it would in the browser.
const encoded = encodeIndex(
  buildIndex(catalog, { indexVersion: "parity", builtAt: "2026-01-01T00:00:00.000Z" }),
);
const engine = new SearchEngine(
  decodeIndex(
    encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer,
  ),
);
// Seats are the volatile half and are NOT baked into the index — the client
// installs them as an overlay once the engine is adopted (see
// `app/search/search-screen.tsx`). Without this the engine would answer
// `openSeatsOnly` from whatever was true at build time, so the parity check
// has to install it the same way the app does, with the same predicate.
engine.setSeatOverlay(
  catalog.flatMap((course) =>
    course.sections.map((section) => ({
      sectionId: section.sectionId,
      hasOpenSeats: sectionHasOpenSeats(section),
    })),
  ),
);

const localSource = createLocalSearchSource(catalog);

const CASES: Array<{ label: string; filters: SearchFilters }> = [
  { label: "single day (the regression)", filters: { q: "", days: ["Tu"] } },
  { label: "single day — Thursday", filters: { q: "", days: ["Th"] } },
  { label: "single day — Monday", filters: { q: "", days: ["Mo"] } },
  { label: "two days", filters: { q: "", days: ["Tu", "Th"] } },
  { label: "MWF", filters: { q: "", days: ["Mo", "We", "Fr"] } },
  { label: "time window", filters: { q: "", startAfterMinute: 600, endBeforeMinute: 1000 } },
  { label: "days + time window", filters: { q: "", days: ["Tu", "Th"], startAfterMinute: 540, endBeforeMinute: 1080 } },
  { label: "open seats only", filters: { q: "", openSeatsOnly: true } },
  { label: "query + days", filters: { q: "systems", days: ["Mo", "We"] } },
  { label: "level range", filters: { q: "", levelRange: [4000, 4999] } },
  { label: "subject", filters: { q: "", subjects: ["COMS"] } },
];

describe("search parity — local source vs. binary engine", () => {
  for (const { label, filters } of CASES) {
    it(`agrees on ${label}`, async () => {
      const fromEngine = engine.search(filters);
      const fromLocal = await localSource.search(filters);

      const engineIds = [...fromEngine.hits.map((hit) => hit.courseId)].sort();
      const localIds = [...fromLocal.hits.map((hit) => hit.courseId)].sort();

      expect(localIds).toEqual(engineIds);
      expect(fromLocal.total).toBe(fromEngine.total);
    });
  }

  it("excludes sections with no parsed meeting days from a day filter", () => {
    // Not "assume it fits" — an unknown pattern cannot be shown to fit, and
    // most of this seed has no meetings at all, so this guards the default.
    const all = engine.search({ q: "" }).total;
    const anyWeekday = engine.search({
      q: "",
      days: ["Mo", "Tu", "We", "Th", "Fr"],
    }).total;
    expect(anyWeekday).toBeLessThan(all);
    expect(anyWeekday).toBeGreaterThan(0);
  });
});
