/**
 * Turning transcript text into a reviewable list of courses.
 *
 * Shared by both import paths — the PDF extractor in `./pdf-text.ts` and the
 * plain paste box — because once a PDF has been flattened to text the two are
 * the same problem.
 *
 * ── The governing rule: this NEVER commits anything ─────────────────────────
 *
 * Everything here produces *candidates* for a student to confirm. Transcripts
 * are noisy in ways no parser survives cleanly:
 *
 *   - Withdrawals and failures appear alongside passes, and a W is not a course
 *     you took. We surface the grade we saw and let the student decide, because
 *     grade columns are laid out differently by every system that prints one.
 *   - Transfer and AP credit appear as courses, sometimes with a foreign
 *     institution's code that means nothing in our catalog.
 *   - A course a student is currently enrolled in is on the transcript with no
 *     grade at all, and whether that counts as "taken" depends on the month.
 *   - The registrar renumbers courses. `COMS W3157` from 2019 and today's are
 *     the same course; some others genuinely are not.
 *
 * A parser that decided any of those silently would put a wrong course on a
 * degree audit. So the output is explicitly a proposal.
 */

import { formatCourseId, parseBulletinCode, type CourseId } from "@/lib/requirements/code";

/**
 * A course found in transcript text.
 *
 * `raw` is kept so the confirmation UI can show the student the actual line it
 * came from. Reviewing "we think you took COMS W3157" is much harder than
 * reviewing it next to the line that produced it.
 */
export interface TranscriptCandidate {
  courseId: CourseId;
  /** Normalised for display: `"COMS W3157"`. */
  code: string;
  /** Title as printed on the transcript, when one followed the code. */
  title: string | null;
  /** Points/credits printed on the line, when we could find them. */
  points: number | null;
  /** Grade printed on the line. Uninterpreted — shown, never acted on. */
  grade: string | null;
  /** Term as printed, e.g. `"Fall 2024"`. Not resolved to a `TermCode`. */
  term: string | null;
  /** The source line, for the confirmation UI. */
  raw: string;
  /**
   * Why this might not belong. Empty means nothing looked wrong; a non-empty
   * list is rendered next to the row so the student can uncheck it.
   */
  warnings: TranscriptWarning[];
}

export type TranscriptWarning =
  | "withdrawn"
  | "failed"
  | "in_progress"
  | "transfer_or_ap"
  | "pass_fail";

export interface TranscriptParse {
  candidates: TranscriptCandidate[];
  /** Lines that held something code-shaped we could not resolve. */
  skipped: string[];
  /** Term headings seen, in order. Useful for a "we read 8 terms" summary. */
  terms: string[];
}

/**
 * A course code anywhere in a line.
 *
 * Deliberately permissive about the space, because PDF extraction loses it
 * often (see `pdf-text.ts`) and `parseBulletinCode` can handle the unspaced
 * form. Anchored on a word boundary so `SCORE1201` in prose is not a course.
 */
const CODE_PATTERN =
  /\b([A-Z]{2,6})\s{0,2}([A-Z]{1,3})?\s{0,2}(\d{4})([A-Z]{1,3})?\b/g;

/** `Fall 2024`, `2024 Spring Term`, `Spring Semester 2025`. */
const TERM_PATTERN =
  /\b(?:(Fall|Spring|Summer|Winter)\s+(\d{4})|(\d{4})\s+(Fall|Spring|Summer|Winter))\b/i;

/**
 * A grade token.
 *
 * Anchored to end-of-line or to whitespace-plus-end because a bare `A` or `D`
 * mid-sentence is a word, not a grade. `IP`/`I` are in-progress markers,
 * `W`/`WD` withdrawals, `P`/`CR` pass-credit, `R` a repeat.
 */
const GRADE_TOKEN =
  /(?:^|\s)((?:[A-D][+-]?|F|W|WD|WF|P|CR|NC|IP|I|R|AP|TR|Y))(?=$|\s)/g;

const POINTS_PATTERN = /\b(\d{1,2}(?:\.\d{1,2})?)\s*(?:points?|pts?|credits?|cr\b)/i;

/**
 * The last grade-shaped token after the course code.
 *
 * Taking the first one steals the Roman numeral in "ALGORITHMS I". Taking
 * every "D" steals the one in "CHINA- D". Student Planning puts the real mark
 * immediately before Taken/Planned, so that wins when it is present.
 */
function lastGrade(afterCode: string, line: string): string | null {
  const beforeStatus = /\s((?:[A-D][+-]?|F|W|WD|WF|P|CR|NC|IP|I|R|AP|TR|Y)|-)\s+(Taken|Planned)\s*$/i.exec(
    line,
  );
  if (beforeStatus) {
    return beforeStatus[1] === "-" ? null : beforeStatus[1];
  }
  const matches = [...afterCode.matchAll(GRADE_TOKEN)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1] ?? null;
}

function classify(grade: string | null, line: string): TranscriptWarning[] {
  const warnings: TranscriptWarning[] = [];
  const g = grade?.trim().toUpperCase() ?? "";

  if (g === "W" || g === "WD" || g === "WF") warnings.push("withdrawn");
  if (g === "F" || g === "NC") warnings.push("failed");
  if (g === "IP" || g === "I" || g === "Y" || g === "") warnings.push("in_progress");
  if (g === "P" || g === "CR") warnings.push("pass_fail");
  if (g === "AP" || g === "TR") warnings.push("transfer_or_ap");

  if (/\b(transfer|advanced placement|\bAP\b|exemption|credit awarded)\b/i.test(line)) {
    if (!warnings.includes("transfer_or_ap")) warnings.push("transfer_or_ap");
  }

  return warnings;
}

export const WARNING_LABEL: Record<TranscriptWarning, string> = {
  withdrawn: "Withdrawn",
  failed: "Did not pass",
  in_progress: "No grade shown",
  transfer_or_ap: "Transfer or AP credit",
  pass_fail: "Pass/fail",
};

/**
 * The title, taken as whatever sits between the course code and the first
 * numeric column.
 *
 * Transcripts are columnar and the columns are separated by runs of whitespace
 * that a text extraction collapses unpredictably, so this is a best effort. A
 * wrong title is cosmetic — the `courseId` is what the audit uses, and the
 * catalog supplies the real title once the code resolves.
 */
function titleAfter(line: string, endOfCode: number): string | null {
  const rest = line.slice(endOfCode);
  const cut = rest.search(/\s{2,}\d|\s\d+\.\d{2}\b|\s\d{1,2}\.\d\b/);
  const candidate = (cut === -1 ? rest : rest.slice(0, cut))
    .replace(/[.…]+$/, "")
    .trim();
  if (candidate.length < 3) return null;
  // A leftover grade or credit column is not a title.
  if (/^\d/.test(candidate)) return null;
  return candidate.slice(0, 80);
}

export function parseTranscriptText(text: string): TranscriptParse {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const candidates: TranscriptCandidate[] = [];
  const skipped: string[] = [];
  const terms: string[] = [];
  const seen = new Set<CourseId>();
  let currentTerm: string | null = null;

  for (const line of lines) {
    const termMatch = TERM_PATTERN.exec(line);
    if (termMatch) {
      const season = termMatch[1] ?? termMatch[4];
      const year = termMatch[2] ?? termMatch[3];
      const label = `${season[0].toUpperCase()}${season.slice(1).toLowerCase()} ${year}`;
      currentTerm = label;
      if (!terms.includes(label)) terms.push(label);
      // A term heading can also carry courses, so fall through rather than
      // continuing — SSOL prints "Fall 2024" inline on some layouts.
    }

    CODE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    let foundOnLine = false;

    while ((match = CODE_PATTERN.exec(line)) !== null) {
      const [whole] = match;
      const parsed = parseBulletinCode(whole);
      if (!parsed) {
        skipped.push(line);
        continue;
      }

      /*
       * Reject four-digit years wearing a course code's clothes.
       *
       * "SPRING 2024" and "AWARDED 2019" match the pattern, and a transcript is
       * full of both. Course numbers below 1000 do not exist at Columbia and
       * numbers above 9999 are not four digits, so the year range is the tell.
       */
      if (parsed.number >= 1900 && parsed.number <= 2100 && !parsed.qualifier) {
        continue;
      }

      foundOnLine = true;
      if (seen.has(parsed.courseId)) continue;
      seen.add(parsed.courseId);

      const grade = lastGrade(line.slice(match.index + whole.length), line);
      const pointsMatch = POINTS_PATTERN.exec(line);

      candidates.push({
        courseId: parsed.courseId,
        code: formatCourseId(parsed.courseId),
        title: titleAfter(line, match.index + whole.length),
        points: pointsMatch ? Number(pointsMatch[1]) : null,
        grade,
        term: currentTerm,
        raw: line,
        warnings: classify(grade, line),
      });
    }

    if (!foundOnLine && /\b[A-Z]{2,6}\s?[A-Z]?\d{3,4}\b/.test(line)) {
      skipped.push(line);
    }
  }

  return { candidates, skipped, terms };
}

/**
 * The default checked/unchecked state for the confirmation screen.
 *
 * Pre-checking everything makes a student accept a withdrawal by inattention;
 * pre-checking nothing makes them do the work the import was supposed to save.
 * So: check the clean rows, leave anything carrying a warning for them.
 */
export function defaultSelection(candidates: TranscriptCandidate[]): Set<CourseId> {
  return new Set(
    candidates.filter((c) => c.warnings.length === 0).map((c) => c.courseId),
  );
}
