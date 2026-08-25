import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

import { beforeAll, describe, expect, it } from "vitest";

interface ScanHelpers {
  fullScanUrl(value: unknown): string | null;
  normalizeTermCode(value: unknown): string | null;
  parsePaginatorRange(value: unknown): { start: number; end: number; total: number } | null;
}

let helpers: ScanHelpers;

beforeAll(async () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const source = await readFile(path.resolve(testDirectory, "../scan-helpers.js"), "utf8");
  runInThisContext(source, { filename: "scan-helpers.js" });
  helpers = (
    globalThis as typeof globalThis & { ColumbiaCatalogScanHelpers: ScanHelpers }
  ).ColumbiaCatalogScanHelpers;
});

describe("full-term scan helpers", () => {
  it("builds only the read-only all-courses Vergil URL", () => {
    expect(helpers.fullScanUrl("20263")).toBe(
      "https://vergil.columbia.edu/vergil/search?hc=true&term=20263",
    );
    expect(helpers.fullScanUrl("../../planner")).toBeNull();
    expect(helpers.fullScanUrl("202630")).toBeNull();
  });

  it("parses Vergil's paginated course range", () => {
    expect(helpers.parsePaginatorRange("Items per page: 100 5,101 – 5,194 of 5,194")).toEqual({
      start: 5101,
      end: 5194,
      total: 5194,
    });
    expect(helpers.parsePaginatorRange("1 - 100 of 5,194")).toEqual({
      start: 1,
      end: 100,
      total: 5194,
    });
    expect(helpers.parsePaginatorRange("not loaded")).toBeNull();
  });
});
