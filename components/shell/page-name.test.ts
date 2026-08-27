import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SHELL_NAV_ITEMS } from "./nav";
import { PAGE_NAME } from "./mobile-nav";

/**
 * The page has one name, and three places say it.
 *
 * On a phone the shell's top bar prints `PAGE_NAME[activeNav]` and the page's
 * own `<PageHeader>` hides itself (`hideTitleOnMobile`) precisely BECAUSE the
 * bar is already printing it. That makes the bar the only copy of the name a
 * phone reader ever sees — and the only copy no desktop check can reach.
 *
 * Which is how `/` shipped a heading and a rail that both said
 * "Recommendations" above a bar that still said "Home". Nothing in 1,339 tests
 * noticed; it took a screenshot at 390px. These two tests are the cheaper
 * version of that screenshot.
 */

const APP_DIR = join(__dirname, "..", "..", "app");

describe("the mobile bar's page names", () => {
  it("say exactly what the rail says", () => {
    // Guaranteed by the spread in `mobile-nav.tsx` rather than by discipline,
    // so this asserts the wiring is still there, not that someone remembered.
    for (const item of SHELL_NAV_ITEMS) {
      expect(PAGE_NAME[item.key]).toBe(item.label);
    }
  });

  it("say what a page whose own heading is hidden would have said", () => {
    const mismatches: string[] = [];

    for (const { file, source } of routeFiles(APP_DIR)) {
      if (!source.includes("hideTitleOnMobile")) continue;

      const navKey = source.match(/activeNav="([a-z]+)"/)?.[1];
      const title = source.match(/<PageHeader\s+title="([^"]+)"/)?.[1];
      // Either can be an expression rather than a literal; this test only
      // speaks to the pages that spell both out, which is all of them today.
      if (!navKey || !title) continue;

      const barName = PAGE_NAME[navKey as keyof typeof PAGE_NAME];
      if (barName !== title) {
        mismatches.push(`${file}: heading "${title}" but the bar says "${barName}"`);
      }
    }

    // Named rather than counted: the whole value here is being told which page
    // and which two words, because the failure is invisible on a desktop.
    expect(mismatches).toEqual([]);
  });
});

function routeFiles(dir: string): { file: string; source: string }[] {
  const found: { file: string; source: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      found.push(...routeFiles(path));
    } else if (entry.name === "page.tsx") {
      found.push({ file: path.slice(APP_DIR.length + 1), source: readFileSync(path, "utf8") });
    }
  }
  return found;
}
