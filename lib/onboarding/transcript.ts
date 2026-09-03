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
import { isImageFile, ocrImages, pdfPageImages, type OcrProgress } from "./transcript-ocr";
import {
  parseTranscriptText,
  WARNING_LABEL,
  type TranscriptWarning,
} from "@/lib/profile/transcript";
import type { CourseId } from "@/lib/requirements/code";
import type { GuestCourse } from "./state";

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
  /**
   * No grade yet: an in-progress row, or one Student Planning marks
   * "Planned". Imported as `source: "plan"` — on the schedule, not the
   * record of what was taken.
   */
  planned: boolean;
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
    // In progress is not a reason to look twice any more — it is a fact with
    // a home. It leaves the warnings so the row starts checked.
    warnings: candidate.warnings.filter((w) => w !== "in_progress").map(labelFor),
    planned: candidate.warnings.includes("in_progress"),
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
 * possible guarantee about it is that it never left their machine. OCR does not
 * weaken that — `./transcript-ocr.ts` runs tesseract in a web worker on the
 * student's own machine, which is why it is WASM here and not a vision model.
 *
 * Three sources, narrowing to one:
 *
 *   TEXT LAYER  Preferred wherever it exists. Exact.
 *   PAGE IMAGE  The fallback, for a scan or a photo. A guess, so it is only
 *               reached when there is no text to be had.
 *   PASTED      `.txt` and pasted text go through the same parser — once a PDF
 *               is flattened to text the two are the same problem.
 *
 * All three end in `parseTranscript`, so there is one set of warnings and one
 * review screen whatever the student handed us.
 */
export async function readTranscriptFile(
  file: File,
  onProgress?: (progress: OcrProgress) => void,
): Promise<TranscriptFileResult> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

  /*
   * A photograph or a screenshot has no text layer to try, so it goes straight
   * to OCR. This used to fall through to `file.text()`, which decodes JPEG
   * bytes as UTF-8, finds no course codes in the mojibake, and reports "we
   * could not find any course codes in that file" — a true sentence that reads
   * as a parser failure rather than as "we cannot read pictures".
   */
  if (isImageFile(file)) {
    return fromOcr([file], onProgress, "We read that image but found no course codes in it.");
  }

  if (!isPdf) {
    const text = await file.text();
    const candidates = parseTranscript(text);
    return {
      candidates,
      problem: candidates.length === 0 ? "We could not find any course codes in that file." : null,
    };
  }

  const bytes = await file.arrayBuffer();
  const extraction = await extractPdfText(bytes);

  /*
   * The text layer wins whenever there is one. It is exact where OCR is a
   * guess, so falling back to OCR on a readable PDF would trade correctness
   * for nothing — the fallback is for the files that have no text at all.
   */
  if (extraction.outcome === "ok") {
    const candidates = parseTranscript(extraction.text);
    if (candidates.length > 0) return { candidates, problem: null };
  }

  /*
   * No text layer, glyph soup, or a clean read that yielded no course codes.
   * All three describe the Vergil unofficial record, which is JPEGs of the
   * page — so pull those images out of the PDF and read them.
   */
  const images = await pdfPageImages(new Uint8Array(bytes));
  if (images.length === 0) {
    return {
      candidates: [],
      problem:
        extraction.outcome === "ok"
          ? "We read that PDF but found no course codes in it. Use the grid below instead."
          : "We could not find any text or any page images in that PDF. Use the grid below instead.",
    };
  }

  return fromOcr(
    images,
    onProgress,
    "We read the page but could not make out any course codes. A sharper screenshot usually fixes it — or use the grid below.",
  );
}

/**
 * OCR some images and narrow the result to the same shape as every other path.
 *
 * Failures are returned, never thrown. This runs behind a file picker in the
 * middle of onboarding, and the worker can fail for reasons the student can do
 * nothing about — blocked WASM, a wedged worker, memory on an old phone. Each
 * of those has the same remedy as an unreadable scan, which is the grid.
 */
async function fromOcr(
  images: readonly Blob[],
  onProgress: ((progress: OcrProgress) => void) | undefined,
  emptyMessage: string,
): Promise<TranscriptFileResult> {
  let text: string;
  try {
    text = await ocrImages(images, onProgress);
  } catch (cause) {
    console.error("transcript: OCR failed", cause);
    return {
      candidates: [],
      problem: "We could not read that file in this browser. Use the grid below instead.",
    };
  }

  const candidates = parseTranscript(text);
  return {
    candidates,
    problem: candidates.length === 0 ? emptyMessage : null,
  };
}

/**
 * The shape `resolveCoursesAction` hands back, restated here so this module
 * does not import `./server` — that file reaches the database and must stay
 * out of the client bundle. Structural, so the action's own type satisfies it.
 */
export interface ResolvedTranscriptCourse {
  courseId: string;
  code: string;
  title: string | null;
  points: number | null;
  inCatalog: boolean;
}

/**
 * Resolved transcript rows as guest record rows.
 *
 * Shared by the two places a transcript can land — the first screen and the
 * coursework screen — so the provenance, the term label and the `inCatalog`
 * carry-through cannot disagree between them. A course our catalog does not
 * hold is transfer credit, AP credit or an archived term, which is the
 * coursework a student most needs recorded, so `inCatalog` is carried and
 * never used to reject.
 */
export function toGuestCourses(
  courses: readonly ResolvedTranscriptCourse[],
  candidates: readonly CourseCandidate[],
): GuestCourse[] {
  const byCourse = new Map(candidates.map((candidate) => [candidate.courseId, candidate]));
  return courses.map((course) => {
    const candidate = byCourse.get(course.courseId);
    return {
      courseId: course.courseId,
      code: course.code,
      title: course.title,
      termLabel: candidate?.termLabel ?? null,
      points: course.points,
      liked: null,
      source: candidate?.planned ? ("plan" as const) : ("transcript_pdf" as const),
      inCatalog: course.inCatalog,
      sectionId: null,
    };
  });
}
