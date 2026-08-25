import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executableFiles = [
  "observer.js",
  "bridge.js",
  "capture-schema.js",
  "contribution-helpers.js",
  "scan-helpers.js",
  "scanner.js",
  "service-worker.js",
  "popup.js",
  "sanitizer.js",
];

describe("extension security boundary", () => {
  it("has only storage permission and a single trusted contribution origin", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.externally_connectable).toEqual({
      matches: ["https://lionplan.org/*"],
    });
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  it("contains no credential or privileged network access paths", async () => {
    const source = (
      await Promise.all(executableFiles.map((file) => readFile(path.join(root, file), "utf8")))
    ).join("\n");

    for (const forbidden of [
      "local" + "Storage",
      "session" + "Storage",
      "document." + "cookie",
      "chrome." + "cookies",
      "chrome." + "webRequest",
      "chrome." + "debugger",
      "Bearer" + " ",
    ]) {
      expect(source, `found forbidden executable capability: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("pins the observer to the production course-search GET endpoint", async () => {
    const source = await readFile(path.join(root, "observer.js"), "utf8");
    expect(source).toMatch(/prod2-sas-studentrecords\.api\.columbia\.edu/);
    expect(source).toMatch(/\/v1\/course_and_class_search/);
    expect(source).toMatch(/method === "GET"/);
    expect(source).not.toMatch(/\bPOST\b|\bPATCH\b|\bPUT\b|\bDELETE\b/);
  });

  it("keeps automated refresh inside Vergil's own visible paginator", async () => {
    const source = await readFile(path.join(root, "scanner.js"), "utf8");
    expect(source).toContain('button[aria-label="Next page"]');
    expect(source).toContain('[aria-label="Items per page:"]');
    expect(source).not.toContain("prod2-sas-studentrecords.api.columbia.edu");
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it("requires opt-in and verifies the exact catalog origin before sharing", async () => {
    const source = await readFile(path.join(root, "service-worker.js"), "utf8");
    expect(source).toContain('const CATALOG_ORIGIN = "https://lionplan.org"');
    expect(source).toContain("if (!prefs.enabled)");
    expect(source).toContain("senderOrigin !== CATALOG_ORIGIN");
  });

  it("quarantines a materially smaller full-term refresh", async () => {
    const source = await readFile(path.join(root, "service-worker.js"), "utf8");
    expect(source).toContain("sectionsCaptured < baseline * 0.8");
    expect(source).toContain('finalStatus = "quarantined"');
    expect(source).toContain("Existing data was preserved");
  });
});
