"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import {
  RiFileTextLine,
  RiLock2Line,
  RiUploadCloud2Line,
} from "@remixicon/react";

import { addCoursesAction } from "@/app/profile/actions";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Chip } from "@/components/base/badges/chip";
import { extractPdfText } from "@/lib/profile/pdf-text";
import {
  isImageFile,
  ocrImages,
  pdfPageImages,
  type OcrProgress,
} from "@/lib/onboarding/transcript-ocr";
import {
  defaultSelection,
  parseTranscriptText,
  WARNING_LABEL,
  type TranscriptCandidate,
} from "@/lib/profile/transcript";
import type { CourseSource } from "@/lib/profile/types";
import { cx } from "@/utils/cx";
import { ProfileModal } from "./profile-modal";

/**
 * Import coursework from a transcript.
 *
 * ── The one thing to understand about this component ────────────────────────
 *
 * **The file never leaves the browser.** `extractPdfText` inflates the PDF's
 * content streams with the platform's own `DecompressionStream` and pulls the
 * text out in this tab; a scan with no text to inflate goes to `ocrImages`,
 * which is tesseract compiled to WASM, running in a worker on the student's own
 * machine. There is no upload endpoint, no storage bucket, and no server action
 * that takes a file. What crosses the network is a list of course codes the
 * student ticked, and nothing else.
 *
 * The OCR path is why this reads pictures at all. It used to tell a student
 * holding a scan "nothing can read it without OCR" and send them off to copy
 * and paste — which is not a thing you can do with an image, so the advice was
 * a dead end for exactly the file the Vergil unofficial record is.
 *
 * That is not an implementation detail, it is the reason the feature is
 * allowed to exist. `vergil_api_spec.md` §15 is explicit that centralized
 * third-party ingestion of education records creates FERPA exposure and that
 * personal academic data should stay on the student's device. A transcript is
 * the densest education record a student owns — name, UNI, every grade, GPA,
 * holds, sometimes an address. Parsing it here means we get the two useful
 * columns and never take custody of the rest.
 *
 * ── Grades are shown and then thrown away ───────────────────────────────────
 *
 * The review table prints the grade off each line, because a student
 * confirming rows needs to recognise them and because "this row says W" is how
 * they spot one they should not import. Nothing carries the grade past the
 * confirm button: `addCoursesAction` has no parameter for it and
 * `student_courses` has no column for it. See the header of migration 0017.
 *
 * ── Why every row is confirmed ──────────────────────────────────────────────
 *
 * A transcript is not a clean data feed. It contains withdrawals, failures,
 * in-progress registrations, AP and transfer credit posted under codes that are
 * not Columbia courses, and page furniture that looks code-shaped. The parser
 * flags what it can (`TranscriptWarning`) and pre-ticks only the rows with no
 * warning at all. The student is the one who decides.
 */

type Mode = "choose" | "paste" | "review";

export interface TranscriptImportProps {
  /** False when nobody is signed in; the trigger stays visible but inert. */
  signedIn?: boolean;
  className?: string;
}

const MAX_FILE_BYTES = 12 * 1024 * 1024;

export function TranscriptImport({ signedIn = true, className }: TranscriptImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("choose");
  const [pasted, setPasted] = useState("");
  const [candidates, setCandidates] = useState<TranscriptCandidate[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<CourseSource>("transcript_paste");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setMode("choose");
    setPasted("");
    setCandidates([]);
    setSkipped([]);
    setTerms([]);
    setSelected(new Set());
    setNotice(null);
    setError(null);
    setIsReading(false);
  }, []);

  const review = useCallback((text: string, from: CourseSource) => {
    const parse = parseTranscriptText(text);
    if (parse.candidates.length === 0) {
      setError(
        "We could not find any course codes in that. If it was a scan or a photo, a sharper one usually reads — otherwise copy and paste the text instead.",
      );
      return;
    }
    setCandidates(parse.candidates);
    setSkipped(parse.skipped);
    setTerms(parse.terms);
    setSelected(defaultSelection(parse.candidates));
    setSource(from);
    setError(null);
    setMode("review");
  }, []);

  /**
   * Read a dropped or chosen file.
   *
   * Two sources, and the order matters: a PDF's text layer is exact where OCR
   * is a guess, so the scan path is only reached when there is no text to be
   * had. Both end at `review`, so there is one parser and one confirm table
   * whatever the student handed us.
   */
  const readFile = useCallback(
    async (file: File) => {
      setError(null);
      setNotice(null);

      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf && !isImageFile(file)) {
        setError("That is not a PDF or a picture. Paste the text instead — it works just as well.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError("That file is larger than a transcript should be.");
        return;
      }

      setIsReading(true);
      /*
       * Progress rides on `notice` rather than a second piece of state. OCR is
       * the only thing here slow enough to need it, and a scan takes seconds a
       * page — long enough that a dropzone reading "Reading it here in your
       * browser…" with nothing moving reads as a hang.
       */
      const report = (progress: OcrProgress) => setNotice(progress.label);

      try {
        if (isImageFile(file)) {
          review(await ocrImages([file], report), "transcript_pdf");
          return;
        }

        const bytes = await file.arrayBuffer();
        const extraction = await extractPdfText(bytes);
        if (extraction.outcome === "ok") {
          review(extraction.text, "transcript_pdf");
          return;
        }

        /*
         * No text layer, or glyph soup. Both describe a scan, which is what the
         * Vergil unofficial record is — JPEGs of the page — so pull those
         * images out and read them rather than sending the student away.
         */
        const images = await pdfPageImages(new Uint8Array(bytes));
        if (images.length === 0) {
          setError(
            "That PDF has no text in it and no page images we can read either. Paste the text instead.",
          );
          return;
        }
        review(await ocrImages(images, report), "transcript_pdf");
      } catch (cause) {
        // Includes a worker that never started — blocked WASM, or memory on an
        // old machine. The remedy is the same as for any unreadable file.
        console.error("transcript: read failed", cause);
        setError("Something went wrong reading that file. Pasting the text always works.");
      } finally {
        setIsReading(false);
        setNotice(null);
      }
    },
    [review],
  );

  const toggle = (courseId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  const chosen = useMemo(
    () => candidates.filter((candidate) => selected.has(candidate.courseId)),
    [candidates, selected],
  );

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await addCoursesAction(
        chosen.map((candidate) => ({
          code: candidate.courseId,
          termLabel: candidate.term,
          points: candidate.points,
          // A row with no grade yet is on the schedule, not the record. Same
          // rule as onboarding's `toGuestCourses`.
          source: candidate.warnings.includes("in_progress") ? "plan" : source,
        })),
      );
      if (!result.ok) {
        setError(result.error ?? "Could not save those.");
        return;
      }
      setNotice(`Added ${result.count ?? chosen.length} courses.`);
      setIsOpen(false);
      reset();
    });
  };

  return (
    <>
      <Button
        size="small"
        variant="secondary"
        leadingIcon={RiFileTextLine}
        onClick={() => {
          reset();
          setIsOpen(true);
        }}
        disabled={!signedIn}
        title={signedIn ? undefined : "Sign in first — otherwise there is nowhere to put the result."}
        className={className}
      >
        Import a transcript
      </Button>

      <ProfileModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          reset();
        }}
        size={mode === "review" ? "wide" : "default"}
        title="Import your transcript"
        description={
          mode === "review"
            ? "Tick the courses that belong on your record. Grades are shown so you can recognise the rows — none of them are saved."
            : "Your transcript is read in this browser tab. The file is never uploaded, and only the course codes you tick are saved."
        }
        footer={
          mode === "review" ? (
            <>
              <Button size="small" variant="secondary" onClick={reset}>
                Start over
              </Button>
              <Button size="small" disabled={isPending || chosen.length === 0} onClick={submit}>
                {isPending ? "Saving…" : `Add ${chosen.length} course${chosen.length === 1 ? "" : "s"}`}
              </Button>
            </>
          ) : mode === "paste" ? (
            <>
              <Button size="small" variant="secondary" onClick={() => setMode("choose")}>
                Back
              </Button>
              <Button
                size="small"
                disabled={pasted.trim().length === 0}
                onClick={() => review(pasted, "transcript_paste")}
              >
                Read it
              </Button>
            </>
          ) : null
        }
      >
        {mode === "choose" ? (
          <div className="flex flex-col gap-4">
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a transcript PDF"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void readFile(file);
              }}
              className={cx(
                "group flex h-[164px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-4 text-center outline-none transition-colors duration-200",
                "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring",
                dragOver
                  ? "border-border-button-active bg-background-secondary-default"
                  : "border-border-checkbox-default hover:border-border-button-active",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void readFile(file);
                }}
              />
              <span className="flex size-10 items-center justify-center rounded-full bg-file-upload-icon-background p-2.5">
                <RiUploadCloud2Line
                  className="size-6 text-file-upload-icon-foreground"
                  aria-hidden
                />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-body-medium text-text-secondary">
                  {isReading
                    ? (notice ?? "Reading it here in your browser…")
                    : "Drop your transcript PDF or a photo of it"}
                </p>
                <p className="text-caption-1-regular text-text-tertiary">
                  or click to choose a file
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-2lg bg-background-secondary-default p-3 dark:bg-background-tertiary-default">
              <RiLock2Line
                className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
                aria-hidden
              />
              <p className="text-caption-1-regular text-pretty text-text-secondary">
                The file is opened and read by this tab — a scan by an optical reader that runs
                here too. It is never uploaded, we keep no copy of
                it, and there is nowhere on our servers it could go. After you confirm, what we
                store is a list of course codes — no grades, no GPA, no name, no UNI.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode("paste");
              }}
              className="self-start rounded-lg px-1 py-0.5 text-caption-1-medium text-text-secondary underline-offset-2 outline-none transition-colors duration-150 hover:text-accent-600 hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              Or paste the text instead
            </button>

            {error ? (
              <p className="text-caption-1-regular text-pretty text-text-error-primary" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === "paste" ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="transcript-paste" className="text-body-medium text-text-primary">
              Transcript text
            </label>
            <textarea
              id="transcript-paste"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={12}
              spellCheck={false}
              placeholder={"Fall 2024\nCOMS W3134 Data Structures in Java   3.00   A-\nMATH UN1201 Calculus III   3.00   B+"}
              className={cx(
                "w-full resize-y rounded-2lg bg-background-tertiary-default p-3",
                "font-mono text-body-regular text-text-primary placeholder:text-text-tertiary",
                "ring-2 ring-inset ring-transparent outline-none",
                "focus:ring-border-focus-ring",
              )}
            />
            <p className="text-caption-1-regular text-text-tertiary">
              Select the whole transcript and paste. Extra text does no harm — we only keep lines
              that hold a course code, and you confirm each one.
            </p>
            {error ? (
              <p className="text-caption-1-regular text-pretty text-text-error-primary" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === "review" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-caption-1-regular text-text-secondary">
                {candidates.length} course{candidates.length === 1 ? "" : "s"} found
                {terms.length > 0 ? ` across ${terms.length} term${terms.length === 1 ? "" : "s"}` : ""}
                {skipped.length > 0 ? ` · ${skipped.length} line${skipped.length === 1 ? "" : "s"} we could not read` : ""}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set(candidates.map((c) => c.courseId)))}
                  className="rounded-lg px-1.5 py-0.5 text-caption-1-medium text-text-secondary outline-none transition-colors duration-150 hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-lg px-1.5 py-0.5 text-caption-1-medium text-text-secondary outline-none transition-colors duration-150 hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  Clear
                </button>
              </div>
            </div>

            <ul className="flex flex-col gap-1">
              {candidates.map((candidate) => (
                <li key={candidate.courseId}>
                  <label
                    className={cx(
                      "flex cursor-pointer items-start gap-2.5 rounded-2lg p-2 transition-colors duration-150",
                      "hover:bg-background-secondary-hover",
                      candidate.warnings.length > 0 && "bg-status-yellow-background/40",
                    )}
                  >
                    <Checkbox
                      isSelected={selected.has(candidate.courseId)}
                      onChange={() => toggle(candidate.courseId)}
                      aria-label={`Import ${candidate.code}`}
                      className="mt-0.5"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-body-medium tabular-nums text-text-primary">
                          {candidate.code}
                        </span>
                        {candidate.title ? (
                          <span className="min-w-0 truncate text-body-regular text-text-secondary">
                            {candidate.title}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-2-regular text-text-tertiary">
                        {candidate.term ? <span>{candidate.term}</span> : null}
                        {candidate.points != null ? <span>{candidate.points} pts</span> : null}
                        {candidate.grade ? <span>grade {candidate.grade} — not saved</span> : null}
                      </span>
                      {candidate.warnings.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {candidate.warnings.map((warning) => (
                            <Chip key={warning} variant="caption" color="yellow">
                              {WARNING_LABEL[warning]}
                            </Chip>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            {error ? (
              <p className="text-caption-1-regular text-pretty text-text-error-primary" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </ProfileModal>

      {notice ? (
        <p className="sr-only" role="status">
          {notice}
        </p>
      ) : null}
    </>
  );
}
