import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every BoardUI colour class in our code must name a token that exists.
 *
 * ── Why this test exists ───────────────────────────────────────────────────
 *
 * `bg-background-secondary` looks exactly like a real class. It is not one --
 * the theme defines `background-secondary-default` and `-hover`, never a bare
 * `background-secondary` -- and Tailwind's response to a colour it does not
 * know is to emit no rule at all. Not an error, not a warning, not a build
 * failure. The element simply renders transparent.
 *
 * That shipped. The drawer's loading skeleton was nine blocks painted in a
 * token that did not exist, so the panel slid in pure white and stayed white
 * until the content arrived, which read exactly like a broken drawer. Nothing
 * caught it: TypeScript does not check class strings, eslint does not know the
 * theme, and a DOM test can assert the blocks are present without noticing
 * they are invisible.
 *
 * A typo in a colour token is therefore silent by construction, and silent
 * failures are the ones worth spending a test on.
 *
 * ── How it decides what to check ───────────────────────────────────────────
 *
 * A class is checkable when its token name's first segment is the first
 * segment of some real colour token. `bg-background-secondary` -> "background"
 * -> real tokens start with `background-`, so it must resolve. `text-balance`
 * -> "balance" -> nothing colour-shaped starts with `balance-`, so it is a
 * layout utility and is left alone. This keeps the rule self-maintaining: add
 * a new colour family to the theme and its classes start being checked, with
 * no list here to update.
 */

const THEME_FILE = "styles/theme.css";

/** Vendored BoardUI. Not ours to police, and it may define tokens elsewhere. */
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "base",
  "application",
  "_uipicker",
]);

const SOURCE_ROOTS = ["app", "components", "hooks", "lib"];

/** `sm:`, `hover:`, `focus-visible:`, `motion-reduce:`, `dark:`, `group-hover:` … */
const VARIANT_PREFIX = /^[a-z0-9-]+:/;

/** Utilities whose value can be a colour token. */
const COLOUR_UTILITIES = [
  "bg",
  "text",
  "border",
  "ring",
  "fill",
  "stroke",
  "divide",
  "decoration",
  "outline",
  "accent",
  "caret",
  "from",
  "via",
  "to",
  "placeholder",
];

/**
 * Tailwind's own palette, which `@import "tailwindcss"` supplies whether or not
 * the theme mentions it. `styles/theme.css` only ever references these -- it
 * builds semantic tokens out of them -- so they are absent from the file and
 * would otherwise all read as typos. A numeric ramp cannot have the failure
 * this test is about anyway: there is no `-default` suffix to forget.
 */
const TAILWIND_PALETTE = new Set([
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink",
  "rose", "slate", "gray", "zinc", "neutral", "stone",
]);

const TAILWIND_SHADE = /^(?:50|\d{2,3})$/;

/**
 * Comments and their contents are not markup.
 *
 * Worth doing rather than accepting the noise: a comment explaining a colour
 * bug quotes the broken class in backticks, and backticks are also how a
 * className is interpolated -- so the file that documents the fix reports
 * itself as unfixed. Stripping first is the difference between a test that
 * stays green and one that trains people to ignore it.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // the `[^:]` spares `https://`
}

function collectFiles(directory: string, found: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry)) continue;
      collectFiles(full, found);
    } else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) {
      // Tests are not rendered, and this file quotes bad tokens on purpose.
      found.push(full);
    }
  }
  return found;
}

/** Every `--color-*` name the theme defines, without the prefix. */
function knownColourTokens(): Set<string> {
  const css = readFileSync(THEME_FILE, "utf8");
  const names = new Set<string>();
  for (const match of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) {
    names.add(match[1]);
  }
  return names;
}

/**
 * Pull candidate colour classes out of a source file.
 *
 * Deliberately crude — it reads string literals, not JSX semantics — because
 * the failure being guarded against is a typo in a string literal, and a
 * cleverer parser would not catch more of them.
 */
function colourClassesIn(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
    for (const raw of match[1].split(/\s+/)) {
      let token = raw;
      while (VARIANT_PREFIX.test(token)) token = token.replace(VARIANT_PREFIX, "");
      if (!token || token.includes("[")) continue; // arbitrary value — not a token
      const separator = token.indexOf("-");
      if (separator === -1) continue;
      const utility = token.slice(0, separator);
      if (!COLOUR_UTILITIES.includes(utility)) continue;
      const name = token.slice(separator + 1).split("/")[0]; // drop /40 opacity
      if (name) found.push(name);
    }
  }
  return found;
}

describe("BoardUI colour tokens", () => {
  const tokens = knownColourTokens();

  // Families present in the theme, e.g. "background", "text", "border".
  const families = new Set([...tokens].map((token) => token.split("-")[0]));

  it("the theme actually parsed", () => {
    // A guard on the guard: if the regex or the path ever stops matching, this
    // test would pass by checking nothing at all, which is worse than failing.
    expect(tokens.size).toBeGreaterThan(100);
    expect(tokens.has("background-secondary-default")).toBe(true);
    expect(tokens.has("background-secondary")).toBe(false);
  });

  it("every colour class in our code resolves to a real token", () => {
    const unresolved: string[] = [];

    for (const root of SOURCE_ROOTS) {
      for (const file of collectFiles(root)) {
        const source = withoutComments(readFileSync(file, "utf8"));
        for (const name of colourClassesIn(source)) {
          const [family, ...restOfName] = name.split("-");
          if (TAILWIND_PALETTE.has(family)) {
            // `bg-neutral-500` — fine; `bg-neutral-mid` — not a shade.
            if (restOfName.length === 1 && TAILWIND_SHADE.test(restOfName[0])) continue;
          }
          if (!families.has(family)) continue; // not a colour utility at all
          if (tokens.has(name)) continue;
          unresolved.push(`${file}: ${name}`);
        }
      }
    }

    // Named in the failure message rather than counted: the whole value here is
    // pointing at the exact line, since the symptom on screen is "nothing".
    expect(unresolved).toEqual([]);
  });
});
