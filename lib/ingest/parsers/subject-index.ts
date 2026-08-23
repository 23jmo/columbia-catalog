/**
 * Parser for the Directory of Classes subject index.
 *
 * IMPORTANT — what `__fixtures__/doc-root.html` actually is:
 *
 * Despite its name, `doc-root.html` is the directory HOME page
 * (`doc.sis.columbia.edu/`). It contains NO subject list at all — only an A–Z
 * navigation strip pointing at `sel/subj-A.html` … `sel/subj-Z.html`, a
 * keyword-search form, and the term `<option>` list. Parsing it for subjects
 * correctly yields an empty array.
 *
 * The pages that actually carry subjects are:
 *   - `https://doc.sis.columbia.edu/sel/subjects.html`   (all subjects)
 *   - `https://doc.sis.columbia.edu/sel/subj-{A..Z}.html` (one letter each)
 *
 * Their shape (verified against the live pages, same markup on both):
 *
 *   <table class="index">
 *     <tr><th>Subject Name</th><th>Terms</th></tr>
 *     <tr>
 *       <td>Computer Science</td>
 *       <td><a href="../subj/COMS/_Summer2026.html">Summer2026</a>,
 *           <a href="../subj/COMS/_Fall2026.html">Fall2026</a></td>
 *     </tr>
 *   </table>
 *
 * The subject CODE lives only inside the term hrefs — there is no code column.
 * Rows whose Terms cell is `&nbsp;` (a subject with no scheduled term) carry no
 * code and are skipped.
 *
 * There is also NO school/division column anywhere in the directory index, so
 * `Subject.school` is null except where the subject name itself marks its owner
 * ("Chemistry (Barnard)", "Classics @Barnard"). Anything richer has to come
 * from another source; see `discoverSubjectIndexUrls` for the crawl entry point
 * this parser pairs with.
 */

import { parse, type HTMLElement } from "node-html-parser";

import { DOC_BASE } from "../../constants";
import type { Subject } from "../../types";
import { cleanText } from "./shared";

/** `../subj/COMS/_Fall2026.html`, `/subj/CR__/_Spring2027.html`, absolute forms. */
const SUBJECT_HREF = /(?:^|\/)subj\/([A-Za-z0-9_]{2,8})\//;

/**
 * School markers Columbia bakes into subject names. The directory prints no
 * school column, so this is the only signal available on these pages.
 */
const SCHOOL_MARKERS: { pattern: RegExp; school: string }[] = [
  { pattern: /\(barnard\)|@\s*barnard/i, school: "Barnard College" },
  { pattern: /\(teachers college\)|@\s*tc\b/i, school: "Teachers College" },
  { pattern: /\(jts\)/i, school: "Jewish Theological Seminary" },
  { pattern: /\(union\)/i, school: "Union Theological Seminary" },
];

/**
 * Parse a subject index page into `Subject[]`.
 *
 * Returns `[]` for pages that carry no subject table (including the directory
 * home page). Never throws.
 */
export function parseSubjectIndex(html: string): Subject[] {
  const root = parse(html);
  const subjects: Subject[] = [];
  const seen = new Set<string>();

  for (const row of collectRows(root)) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 2) continue;

    const subjectName = cleanText(cells[0].text);
    if (!subjectName) continue;

    const subjectCode = readSubjectCode(cells.slice(1));
    if (!subjectCode || seen.has(subjectCode)) continue;

    seen.add(subjectCode);
    subjects.push({
      subjectCode,
      subjectName,
      school: readSchool(subjectName),
    });
  }

  return subjects;
}

/**
 * The A–Z index pages the crawler must enqueue to build a full subject list.
 * `sel/subjects.html` alone is sufficient today; the per-letter pages are the
 * fallback if that page is ever paginated or dropped.
 */
export function subjectIndexUrls(): string[] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return [
    `${DOC_BASE}/sel/subjects.html`,
    ...letters.map((letter) => `${DOC_BASE}/sel/subj-${letter}.html`),
  ];
}

// ---------------------------------------------------------------------------

function collectRows(root: HTMLElement): HTMLElement[] {
  const tables = root.querySelectorAll("table.index");
  if (tables.length > 0) {
    return tables.flatMap((table) => table.querySelectorAll("tr"));
  }
  // Layout drift guard: if the class is ever dropped, fall back to every row on
  // the page. Rows without a `subj/{CODE}/` link are filtered out downstream,
  // so a non-index page still yields nothing rather than garbage.
  return root.querySelectorAll("tr");
}

function readSubjectCode(cells: HTMLElement[]): string | null {
  for (const cell of cells) {
    for (const anchor of cell.querySelectorAll("a")) {
      const href = anchor.getAttribute("href");
      if (!href) continue;
      const match = SUBJECT_HREF.exec(href);
      // Subject codes are padded with underscores to four characters on
      // Columbia's side ("CR__", "AM__"); keep them verbatim because the
      // subject-term URL builder needs the padded form.
      if (match) return match[1].toUpperCase();
    }
  }
  return null;
}

function readSchool(subjectName: string): string | null {
  for (const { pattern, school } of SCHOOL_MARKERS) {
    if (pattern.test(subjectName)) return school;
  }
  return null;
}
