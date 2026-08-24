/**
 * Parser for a single Directory of Classes section page:
 * `https://doc.sis.columbia.edu/subj/{SUBJ}/{Q}{NUMBER}-{TERM}-{SECTION}/`
 *
 * STRUCTURE — verified against `__fixtures__/doc-section-COMS4113-001.html`.
 *
 * NOTE: this page does NOT use `<dl>`/`<dt>`/`<dd>` like the subject listing.
 * It is a two-column `<table class="section">` of `<th>` label / `<td>` value
 * rows:
 *
 *   <tr><th>Call Number</th><td>19581</td></tr>
 *   <tr><th>Day, Time &amp; Location</th><td><a …>View … in Vergil</a></td></tr>
 *   <tr><th>Points</th><td>3</td></tr>
 *   <tr><th>Grading Mode</th><td>Standard</td></tr>
 *   <tr><th>Approvals Required</th><td>None</td></tr>
 *   <tr><th>Instructor</th><td>Hubertus Franke</td></tr>
 *   <tr><th>Type</th><td>LECTURE</td></tr>
 *   <tr><th>Method of Instruction</th><td>In-Person</td></tr>
 *   <tr><th>Course Description</th><td><p>…</p></td></tr>
 *   <tr><th>Department</th><td><a …>Computer Science</a></td></tr>
 *   <tr><th>Enrollment</th><td>22 students (110 max) as of  5:05PM Saturday, August 22, 2026</td></tr>
 *   <tr><th>Subject</th><td>Computer Science</td></tr>
 *   <tr><th>Number</th><td>W4113</td></tr>
 *   <tr><th>Section</th><td>001</td></tr>
 *   <tr><th>Division</th><td>Interfaculty</td></tr>
 *   <tr><th>Open To</th><td>Barnard College, Columbia College, …</td></tr>
 *   <tr><th>Section key</th><td>20263COMS4113W001</td></tr>
 *
 * "Section key" is the jackpot: it is exactly our `sectionId`
 * (`${termCode}${courseId}${sectionCode}`), so the page is self-identifying and
 * the `subjectCode`/`termCode` arguments are only fallbacks.
 *
 * Day/time/room is a Vergil link, not data — `meetings` is `[]`. The bulletin
 * parser supplies meeting times.
 */

import { parse, type HTMLElement } from "node-html-parser";

import { sectionDetailUrl } from "../../constants";
import type { EnrollmentStatusCode, ParsedSectionDetail, TermCode } from "../../types";
import {
  blankToNull,
  buildCourseId,
  buildSectionId,
  cleanText,
  deriveStatus,
  extractPrerequisiteText,
  normalizeLabel,
  parseCourseNumber,
  parseEnrollment,
  parsePoints,
  splitInstructorList,
} from "./shared";

/** Extra fields the page carries that `ParsedSectionDetail` has no home for. */
export interface SectionDetailExtras {
  /** e.g. "Interfaculty", "Barnard College". From the `Division` row. */
  division: string | null;
  /** Human subject name, e.g. "Computer Science". From the `Subject` row. */
  subjectName: string | null;
  /** The page's own `Section key`, when present. */
  sectionKey: string | null;
}

export interface ParsedSectionDetailWithExtras extends ParsedSectionDetail {
  extras: SectionDetailExtras;
}

/**
 * Does this page say the section has been withdrawn?
 *
 * ── Why this is a predicate and not a parse result ─────────────────────────
 *
 * When a section is pulled, the Directory does not 404. It serves HTTP 200
 * and a 474-byte page titled "Section Removed". To `parseSectionDetail` that
 * is indistinguishable from a page it failed to understand — no section code,
 * no number, no key — so it throws, the crawler records a parse error, and the
 * job backs off and retries a page whose answer will never change.
 *
 * The distinction that matters is not "did we parse it" but "what is it". A
 * tombstone is not a section with its fields missing; it is a different
 * document that happens to live at a section's URL, and it carries real
 * information — the section is gone. Widening `parseSectionDetail`'s return
 * type into a union would push that distinction into every caller of a
 * function that has one job. Asking the question separately, before parsing,
 * keeps the parser about sections.
 *
 * Both the `<title>` and the `<h1>` are checked, and either is enough. They
 * are two independent renderings of the same fact, and a template tweak to one
 * should not turn a definitive answer back into an infinite retry.
 *
 * Deliberately narrow: it matches this specific page and nothing else. A
 * predicate that guessed would silently withdraw sections during an outage,
 * which is far worse than the retry loop it replaces.
 *
 * There is deliberately no size gate. The tombstone is ~474 bytes and a real
 * section page is ~4.4KB, so a cap between them would sit within a nav bar's
 * worth of either — and the failure it introduces is silent: the page grows,
 * the predicate stops matching, and the infinite retry quietly returns. Both
 * patterns are anchored to wording no real section page contains, which is
 * the actual discriminator; the length never was.
 */
export function isSectionTombstone(html: string): boolean {
  if (typeof html !== "string" || html.length === 0) return false;

  const title = /<title>\s*section\s+removed\s*<\/title>/i.test(html);
  const heading = /section\s+removed\s+from\s+the\s+directory\s+of\s+classes/i.test(html);
  return title || heading;
}

/**
 * Parse a section detail page.
 *
 * `subjectCode` and `termCode` are optional: they are only consulted when the
 * page's own `Section key` row is missing. Throws only when the page carries no
 * usable identity at all and no fallback was supplied.
 *
 * Callers should ask `isSectionTombstone` FIRST: a withdrawn section reaches
 * here looking exactly like an unparseable page, and the two need opposite
 * handling.
 */
export function parseSectionDetail(
  html: string,
  subjectCode?: string,
  termCode?: TermCode,
): ParsedSectionDetailWithExtras {
  const root = parse(html);
  const fields = readLabelledRows(root);

  const sectionKey = blankToNull(fields.get("section key")?.text ?? null);
  const metaTerm = blankToNull(
    root.querySelector('meta[name="semes"]')?.getAttribute("content") ?? null,
  );

  const sectionCode =
    blankToNull(fields.get("section")?.text ?? null) ??
    sectionCodeFromKey(sectionKey) ??
    null;

  const numberField =
    blankToNull(fields.get("number")?.text ?? null) ??
    numberTokenFromHeading(root);
  const parsedNumber = parseCourseNumber(numberField);

  if (!sectionCode || !parsedNumber) {
    throw new Error("section-detail: page carries no recoverable section identity");
  }

  const resolvedTerm =
    termCodeFromKey(sectionKey) ?? metaTerm ?? termCode ?? null;
  const resolvedSubject =
    subjectCodeFromKey(sectionKey) ??
    subjectCode ??
    null;

  if (!resolvedTerm || !resolvedSubject) {
    throw new Error(
      "section-detail: could not resolve subject/term; pass subjectCode and termCode",
    );
  }

  const courseId = buildCourseId(resolvedSubject, parsedNumber.number, parsedNumber.qualifier);
  const sectionId = sectionKey ?? buildSectionId(resolvedTerm, courseId, sectionCode);

  const enrollment = parseEnrollment(fields.get("enrollment")?.text ?? null);
  const points = parsePoints(fields.get("points")?.text ?? null);
  const description = readDescription(fields.get("course description") ?? null);

  const instructors = splitInstructorList(
    fields.get("instructors")?.text ?? fields.get("instructor")?.text ?? null,
  );

  const status: EnrollmentStatusCode = deriveStatus(
    enrollment.enrollmentCount,
    enrollment.enrollmentCap,
    enrollment.isFull,
    fields.get("status")?.text ?? null,
  );

  return {
    sectionId,
    courseId,
    termCode: resolvedTerm,
    callNumber: cleanText(fields.get("call number")?.text ?? ""),
    sectionCode,
    title: readTitle(root),
    pointsMin: points.pointsMin,
    pointsMax: points.pointsMax,
    instructors,
    enrollmentCount: enrollment.enrollmentCount,
    enrollmentCap: enrollment.enrollmentCap,
    status,
    sourceAsOf: enrollment.sourceAsOf,
    detailUrl: safeDetailUrl(
      resolvedSubject,
      parsedNumber.qualifier,
      parsedNumber.number,
      resolvedTerm,
      sectionCode,
    ),
    // Columbia serves day/time/room through Vergil only; this row is a link.
    meetings: [],

    description,
    prerequisiteText: extractPrerequisiteText(description),
    department: blankToNull(fields.get("department")?.text ?? null),
    gradingMode: blankToNull(fields.get("grading mode")?.text ?? null),
    component: blankToNull(fields.get("type")?.text ?? fields.get("component")?.text ?? null),
    methodOfInstruction: blankToNull(fields.get("method of instruction")?.text ?? null),
    note: blankToNull(fields.get("note")?.text ?? fields.get("notes")?.text ?? null),
    openTo: blankToNull(fields.get("open to")?.text ?? null),
    approvalsRequired: blankToNull(fields.get("approvals required")?.text ?? null),

    extras: {
      division: blankToNull(fields.get("division")?.text ?? null),
      subjectName: blankToNull(fields.get("subject")?.text ?? null),
      sectionKey,
    },
  };
}

// ---------------------------------------------------------------------------
// Row reading
// ---------------------------------------------------------------------------

/**
 * Collect every `<th>` label → `<td>` value pair. Scoped to `table.section`
 * when present, otherwise the whole document, so a future layout change that
 * drops the class still parses.
 */
function readLabelledRows(root: HTMLElement): Map<string, HTMLElement> {
  const scope = root.querySelector("table.section") ?? root;
  const fields = new Map<string, HTMLElement>();
  for (const row of scope.querySelectorAll("tr")) {
    const label = row.querySelector("th");
    const value = row.querySelector("td");
    if (!label || !value) continue;
    const key = normalizeLabel(label.text);
    if (!key || fields.has(key)) continue;
    fields.set(key, value);
  }
  return fields;
}

function readTitle(root: HTMLElement): string {
  const header = root.querySelector("#section-header h1") ?? root.querySelector("h1");
  return cleanText(header?.text ?? "");
}

function readDescription(cell: HTMLElement | null): string | null {
  if (!cell) return null;
  // The description sits in one or more `<p>`s; join them so multi-paragraph
  // descriptions survive as a single readable string.
  const paragraphs = cell.querySelectorAll("p");
  const text =
    paragraphs.length > 0
      ? paragraphs.map((paragraph) => cleanText(paragraph.text)).filter(Boolean).join("\n\n")
      : cleanText(cell.text);
  return text || null;
}

/**
 * The `Number` row is the canonical qualifier source. If it is gone, fall back
 * to the `<h2>` heading: "Fall 2026 Computer Science W4113 section 001".
 */
function numberTokenFromHeading(root: HTMLElement): string | null {
  const heading = cleanText(root.querySelector("#section-header h2")?.text ?? "");
  const match = /([A-Za-z]{0,3}\d{4}[A-Za-z]{0,3})\s+section\b/i.exec(heading);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Section key decomposition — "20263COMS4113W001"
// ---------------------------------------------------------------------------

function termCodeFromKey(sectionKey: string | null): string | null {
  if (!sectionKey || sectionKey.length < 6) return null;
  const term = sectionKey.slice(0, 5);
  return /^\d{5}$/.test(term) ? term : null;
}

function sectionCodeFromKey(sectionKey: string | null): string | null {
  if (!sectionKey) return null;
  const match = /(\d{3})$/.exec(sectionKey);
  return match ? match[1] : null;
}

/**
 * The subject letters out of a section key, read from the FRONT.
 *
 * A key is `<term><SUBJECT><number><qualifier><section>` —
 * `20263THTR3147V001`. This used to find the subject by measuring the tail:
 * subtract the section code, the number and the qualifier from the length and
 * take what is left.
 *
 * That is wrong, and wrong in a way that produced a plausible-looking result.
 * The qualifier in the KEY is the single school letter (`V`), while the
 * qualifier the rest of the parser carries is the course-level code (`UN`).
 * They are different lengths, so the tail arithmetic overshot by one and
 * `20263THTR3147V001` yielded `THT` — a subject that does not exist, in a
 * course id (`THT3147UN`) that matches no row. `ingest_section_detail` updates
 * `courses` by id, so every one of those pages ingested "successfully",
 * updated its section, and silently failed to write the description it had
 * just parsed. 210 fetches produced 5 descriptions.
 *
 * Reading from the front needs no arithmetic: after the five-digit term, the
 * subject is the leading run of letters, and it ends where the number begins.
 */
function subjectCodeFromKey(sectionKey: string | null): string | null {
  if (!sectionKey) return null;
  const term = termCodeFromKey(sectionKey);
  if (!term) return null;
  const match = /^([A-Za-z_]{2,6})\d/.exec(sectionKey.slice(term.length));
  return match ? match[1] : null;
}

function safeDetailUrl(
  subjectCode: string,
  qualifier: string | null,
  number: number,
  termCode: TermCode,
  sectionCode: string,
): string | null {
  try {
    return sectionDetailUrl(subjectCode, qualifier, number, termCode, sectionCode);
  } catch {
    return null;
  }
}
