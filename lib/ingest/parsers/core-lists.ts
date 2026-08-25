/**
 * Parser for the Core Curriculum's *approved course lists*.
 *
 * WHY THIS EXISTS — and why it is on the critical path.
 *
 * `courses.requirement_flags` has existed since `0001_catalog.sql` with a GIN
 * index over it and a comment explaining the one query shape it serves
 * (`requirement_flags @> '{"globalCore":true}'`). Nothing has ever written to
 * it. All 8,189 rows hold `{}`.
 *
 * That matters far more than it sounds. `lib/requirements/types.ts` defines the
 * `flagged` verification tier around exactly this column, and the open-ended
 * rules — `n_matching`, `points_matching` — are the ones a student actually
 * needs help with: Global Core, the Science Requirement, electives. A
 * `CourseSelector` carrying `flag: "globalCore"` compiled against an empty
 * column returns nothing, so "which courses could clear my Global Core?" is
 * unanswerable no matter how good the recommender above it is.
 *
 * The data is public and machine-readable. The Bulletin publishes each approved
 * list as a CourseLeaf `table.sc_courselist` on the requirement's own page, the
 * same markup `./requirements.ts` already reads for degree requirements. This
 * parser reads those tables.
 *
 * ── Structure, verified against `__fixtures__/bulletin-core-global-core.html` ─
 *
 *   <h2 class="toggle"><strong>Fall 2026</strong></h2>     ← heading, owns the table
 *   <p>Last updated on June 23, 2026.</p>
 *   <table class="sc_courselist">
 *     <tr class="even areaheader firstrow">                ← department grouping
 *       <td colspan="2"><span class="courselistcomment areaheader">
 *         Anthropology</span></td><td class="hourscol"></td></tr>
 *     <tr class="odd">
 *       <td class="codecol"><a title="ANTH UN2017" class="bubblelink code">ANTH UN2017</a></td>
 *       <td>Mafias and Other Dangerous Affiliations</td><td class="hourscol"></td></tr>
 *   </table>
 *
 * ── Three things that make this harder than "grep for course codes" ─────────
 *
 * 1. **The separator inside a code is U+00A0, not a space.** The markup is
 *    literally `title="AFAS UN1001"`. Every naive `[A-Z]{4} [A-Z]{2}\d{4}`
 *    pattern silently matches zero rows against the real page, which reads as
 *    "the list is empty" rather than as a bug. `parseBulletinCode` already
 *    folds NBSP and narrow spaces, so codes go through it rather than through a
 *    regex here — trap 3 in `lib/requirements/code.ts` is the same trap.
 *
 * 2. **The heading, not the table, carries the meaning.** The Science
 *    Requirement page renders Science A, Science B and Science C as three `<h2>`
 *    sections, and a course approved for Science B is *not* approved for
 *    Science C. Dropping the heading flattens three distinct requirements into
 *    one and lets a student satisfy the distribution rule three times over with
 *    three Science C courses. The heading travels on every entry.
 *
 * 3. **The Global Core page carries several terms at once.** Fall 2026 and
 *    Spring 2027 are separate tables under separate headings, and the approved
 *    list genuinely differs between them — a topics course approved once is not
 *    approved forever. Entries keep their heading so the caller decides whether
 *    to union the terms or filter to one; this parser never decides for them.
 *
 * WHAT THIS DOES NOT DO: it does not know what a flag is called. Mapping a page
 * and a heading onto a `RequirementFlags` key is a judgement about the
 * curriculum, not about the markup, and it lives in `../core-flags.ts`.
 */

import { parse, type HTMLElement } from "node-html-parser";

import { parseBulletinCode, splitCodeSequence, type CourseId } from "../../requirements/code";
import { cleanText } from "./shared";

/** One approved course, with the context that gives it meaning. */
export interface CoreListEntry {
  /** Our key: `"ANTH2017UN"`. */
  courseId: CourseId;
  /** As the Bulletin prints it: `"ANTH UN2017"`. Kept for provenance. */
  code: string;
  /** The Bulletin's title cell. Often SHOUTED; not normalised here. */
  title: string;
  /**
   * Nearest preceding heading — `"Fall 2026"`, `"Science B"`. Null when the
   * table sits under no heading at all, which happens on short pages.
   */
  heading: string | null;
  /** The `areaheader` row above it — `"Anthropology"`. Null before the first. */
  department: string | null;
}

/** Everything one requirement page yields, plus what it says about itself. */
export interface ParsedCoreList {
  entries: CoreListEntry[];
  /**
   * The distinct headings encountered, in document order. The caller needs
   * these to notice that a page it thought had one list actually has three.
   */
  headings: string[];
  /**
   * "Last updated on June 23, 2026." — the Bulletin's own freshness claim,
   * verbatim, per the provenance rule. Null when the page makes none.
   */
  lastUpdatedText: string | null;
}

/** Headings that are page furniture rather than part of the requirement. */
const IGNORED_HEADINGS = new Set([
  "columbia college",
  "college offices",
  "follow us",
  "contact",
  "footer",
  "quick links",
]);

function isIgnorableHeading(text: string): boolean {
  return IGNORED_HEADINGS.has(text.trim().toLowerCase());
}

/**
 * Read one row's course codes.
 *
 * The code cell is preferred over the `title` attribute because a cell can pack
 * a whole sequence (`HUMA CC1001&#38; HUMA CC1002`) that the attribute on the
 * first anchor cannot express. `splitCodeSequence` handles the ampersand form,
 * including the full-width `＆` some department pages use.
 */
function codesInRow(row: HTMLElement): { code: string; parsed: ReturnType<typeof parseBulletinCode> }[] {
  const codeCell = row.querySelector("td.codecol");
  if (!codeCell) return [];

  const raw = cleanText(codeCell.textContent);
  if (!raw) return [];

  // "or ANTH UN2031" — an alternative in a degree table. On an approved LIST
  // every row is independently approved, so the "or" is noise, not structure.
  const stripped = raw.replace(/^or\s+/i, "");

  return splitCodeSequence(stripped)
    .map((code) => ({ code, parsed: parseBulletinCode(code) }))
    .filter((entry) => entry.parsed !== null);
}

/**
 * Parse every approved-course table on a Core requirement page.
 *
 * Walks headings and tables in document order — the same technique
 * `./requirements.ts` uses — because a table's meaning is set by the heading
 * above it and the DOM is the only thing that records that adjacency.
 */
export function parseCoreCourseList(html: string): ParsedCoreList {
  const root = parse(html);

  const lastUpdated = root
    .querySelectorAll("p")
    .map((node) => cleanText(node.textContent))
    .find((text) => /^last updated on /i.test(text));

  const nodes = root.querySelectorAll("h1, h2, h3, h4, h5, h6, table.sc_courselist");

  const entries: CoreListEntry[] = [];
  const headings: string[] = [];
  let heading: string | null = null;

  for (const node of nodes) {
    if (node.rawTagName?.toLowerCase() !== "table") {
      const text = cleanText(node.textContent);
      // An empty or furniture heading must not shadow the real one above it —
      // clearing on every `<h6>` in a footer would strip "Science B" off the
      // table that follows a stray heading.
      if (text && !isIgnorableHeading(text)) heading = text;
      continue;
    }

    if (heading && !headings.includes(heading)) headings.push(heading);

    let department: string | null = null;
    for (const row of node.querySelectorAll("tr")) {
      const areaheader = row.querySelector(".courselistcomment.areaheader");
      if (areaheader) {
        department = cleanText(areaheader.textContent) || null;
        continue;
      }

      const cells = row.querySelectorAll("td");
      const title = cells.length > 1 ? cleanText(cells[1].textContent) : "";

      for (const { code, parsed } of codesInRow(row)) {
        if (!parsed) continue;
        entries.push({
          courseId: parsed.courseId,
          code,
          title,
          heading,
          department,
        });
      }
    }
  }

  return {
    entries,
    headings,
    lastUpdatedText: lastUpdated ?? null,
  };
}
