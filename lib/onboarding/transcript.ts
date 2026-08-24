/**
 * The transcript escape hatch — deliberately narrow.
 *
 * ── Why this file exists at all, given `lib/profile/transcript.ts` ──────────
 *
 * Transcript upload is the SECONDARY path through onboarding. The guess-and-
 * confirm grid is the base flow, and it has to stay the base flow, because the
 * concrete transcript PDF format is explicitly unresolved: nobody has agreed
 * whether students will hand us an SSOL export, a Vergil print-to-PDF, or a
 * photograph of a paper transcript, and two of those three cannot be parsed at
 * all.
 *
 * So the onboarding flow talks to exactly one function —
 *
 *     parseTranscript(text: string): CourseCandidate[]
 *
 * — and knows nothing else about transcripts. When the real format is settled,
 * the implementation behind that signature changes and no screen, action or
 * state type moves. If it is never settled, the button stays, does its
 * best-effort thing, and the grid carries the flow.
 *
 * `lib/profile/transcript.ts` already contains a good line-oriented parser and
 * this delegates to it rather than growing a second one. What this adds is the
 * NARROWING: the profile parser's richer result (grades, skipped lines, term
 * headings) is reduced to the fields onboarding actually stores, so a future
 * replacement is not obliged to reproduce fields nobody reads.
 *
 * ── Grades are read and then dropped, on purpose ────────────────────────────
 *
 * The underlying parser surfaces a grade so the review UI can show it. It is
 * NOT carried into `CourseCandidate` and must never be: migration 0028's header
 * is emphatic that the absence of a grade column is load-bearing rather than
 * incidental, and a grade that reaches this type is a grade one refactor away
 * from reaching the database. What survives is the *warning* derived from it —
 * "withdrawn", "did not pass" — which is a flag for the student's own review
 * and says nothing about performance once acted on.
 */

import { extractPdfText } from "@/lib/profile/pdf-text";
import {
  parseTranscriptText,
  WARNING_LABEL,
  type TranscriptWarning,
} from "@/lib/profile/transcript";
import type { CourseId } from "@/lib/requirements/code";

/**
 * One course a transcript claims the student took.
 *
 * A *candidate*, never a fact. Every path that produces one of these ends in a
 * screen where the student confirms it, because transcripts contain
 * withdrawals, in-progress rows, and transfer credit whose codes mean nothing
 * in our catalog — and a parser that decided any of those silently would put a
 * wrong course on a degree audit.
 */
export interface CourseCandidate {
  courseId: CourseId;
  /** Normalised for display: `"COMS W3157"`. */
  code: string;
  /** As printed on the transcript. The catalog's title wins once it resolves. */
  title: string | null;
  points: number | null;
  /** As printed: `"Fall 2024"`. Never resolved to a `TermCode`. */
  termLabel: string | null;
  /**
   * Reasons to look twice, in plain language. Empty means nothing looked wrong.
   * A candidate with warnings starts unchecked; one without starts checked.
   */
  warnings: string[];
  /** The source line, so the student reviews our reading next to their own. */
  raw: string;
}

/**
 * The interface the onboarding flow codes against.
 *
 * Named as a type so a future implementation — a real SSOL parser, a server
 * round trip, an OCR path — can be swapped in by satisfying it, and so that the
 * test can substitute a fake without touching the PDF layer.
 */
export type TranscriptParser = (text: string) => CourseCandidate[];

export const parseTranscript: TranscriptParser = (text) => {
  const parsed = parseTranscriptText(text);

  return parsed.candidates.map((candidate) => ({
    courseId: candidate.courseId,
    code: candidate.code,
    title: candidate.title,
    points: candidate.points,
    termLabel: candidate.term,
    warnings: candidate.warnings.map(labelFor),
    raw: candidate.raw,
  }));
};

function labelFor(warning: TranscriptWarning): string {
  return WARNING_LABEL[warning] ?? warning;
}

/** Rows a student would sensibly start with checked: the ones with no warning. */
export function defaultCandidateSelection(
  candidates: readonly CourseCandidate[],
): Set<CourseId> {
  return new Set(
    candidates.filter((candidate) => candidate.warnings.length === 0).map((c) => c.courseId),
  );
}

export interface TranscriptFileResult {
  candidates: CourseCandidate[];
  /**
   * What to tell the student when nothing came out. `null` when it worked.
   *
   * A PDF with no text layer is a scan, and there is no amount of retrying that
   * fixes it — the message has to say so and point at the grid, rather than
   * looking like a transient failure.
   */
  problem: string | null;
}

/**
 * Read a transcript file in the BROWSER. Never uploaded.
 *
 * `lib/profile/pdf-text.ts` extracts the text layer client-side and there is no
 * storage bucket for the file (migration 0028). That is not an optimisation: a
 * transcript is the most sensitive document a student has, and the strongest
 * possible guarantee about it is that it never left their machine.
 *
 * `.txt` and pasted text go through the same parser — once a PDF is flattened
 * to text the two are the same problem.
 */
export async function readTranscriptFile(file: File): Promise<TranscriptFileResult> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

  if (!isPdf) {
    const text = await file.text();
    const candidates = parseTranscript(text);
    return {
      candidates,
      problem: candidates.length === 0 ? "We could not find any course codes in that file." : null,
    };
  }

  const extraction = await extractPdfText(await file.arrayBuffer());

  if (extraction.outcome === "no_text_layer") {
    return {
      candidates: [],
      problem:
        "That PDF is a scan — there is no text in it to read. Use the grid below, or paste the text instead.",
    };
  }
  if (extraction.outcome === "unreadable") {
    return {
      candidates: [],
      problem:
        "We could read the PDF but not its text. Use the grid below, or paste the text instead.",
    };
  }

  const candidates = parseTranscript(extraction.text);
  return {
    candidates,
    problem:
      candidates.length === 0
        ? "We read the PDF but found no course codes in it. Use the grid below instead."
        : null,
  };
}
