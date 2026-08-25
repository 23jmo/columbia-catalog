"use client";

import { useRef, useState, useTransition } from "react";
import { RiCloseLine, RiFileTextLine, RiUploadCloud2Line } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { resolveCoursesAction } from "@/app/onboarding/actions";
import {
  defaultCandidateSelection,
  parseTranscript,
  readTranscriptFile,
  type CourseCandidate,
} from "@/lib/onboarding/transcript";
// Type-only: `server.ts` reaches the database and must not enter this bundle.
import type { ResolvedCourse } from "@/lib/onboarding/server";
import { haptic } from "@/lib/haptics";
import { cx } from "@/utils/cx";

/**
 * Escape hatch #2 — the transcript.
 *
 * ── This is the SECONDARY path and the code is arranged to keep it that way ─
 *
 * The whole component talks to one function, `parseTranscript(text) =>
 * CourseCandidate[]`, and knows nothing else about transcripts. The concrete
 * PDF format is deliberately unresolved — nobody has decided whether students
 * will hand us an SSOL export, a Vergil print-to-PDF, or a photograph — and two
 * of those three cannot be parsed at all. Behind that one signature the
 * implementation can change completely without moving a screen, an action, or a
 * state type. If it is never settled, this tab keeps doing its best and the
 * guess grid carries the flow.
 *
 * ── Nothing is committed without review ─────────────────────────────────────
 *
 * Transcripts contain withdrawals, in-progress rows with no grade, and transfer
 * credit whose codes mean nothing in our catalog. So the parse output is a
 * proposal: rows with a warning arrive UNCHECKED, clean rows arrive checked,
 * and the student presses the button. Pre-checking everything makes someone
 * accept a withdrawal by inattention; pre-checking nothing makes them do the
 * work the import was supposed to save.
 *
 * ── The file never leaves the browser ───────────────────────────────────────
 *
 * `readTranscriptFile` extracts the PDF's text layer client-side. There is no
 * upload and no storage bucket (migration 0028). Only the resolved course CODES
 * go to the server, to be looked up against the catalog.
 *
 * ── It is reached from a toast, not from a tab ──────────────────────────────
 *
 * This used to be one of three tabs on the coursework screen, which gave it the
 * same billing as the flow it is a fallback for and told every student the real
 * way to do this was to go and find a PDF. It now opens from a dismissible
 * offer in the corner, and this component renders as a panel on the coursework
 * screen with its own way out.
 */

export interface TranscriptImportProps {
  onImport: (courses: ResolvedCourse[], candidates: readonly CourseCandidate[]) => void;
  /** Closes the panel. Also called once an import lands, since the job is done. */
  onClose: () => void;
}

export function TranscriptImport({ onImport, onClose }: TranscriptImportProps) {
  const [candidates, setCandidates] = useState<CourseCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const accept = (found: CourseCandidate[], reportedProblem: string | null) => {
    setCandidates(found);
    setSelected(defaultCandidateSelection(found) as Set<string>);
    setProblem(reportedProblem);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    haptic("impact");
    startTransition(async () => {
      const result = await readTranscriptFile(file);
      accept(result.candidates, result.problem);
    });
  };

  const onPaste = () => {
    haptic("impact");
    const found = parseTranscript(pasted);
    accept(
      found,
      found.length === 0 ? "We could not find any course codes in that text." : null,
    );
  };

  const confirm = () => {
    if (!candidates) return;
    haptic("success");
    const codes = candidates
      .filter((candidate) => selected.has(candidate.courseId))
      .map((candidate) => candidate.code);

    startTransition(async () => {
      const result = await resolveCoursesAction(codes);
      if (!result.ok) {
        haptic("error");
        setProblem(result.error ?? "We could not look those up.");
        return;
      }
      onImport(result.courses ?? [], candidates);
      setCandidates(null);
      setSelected(new Set());
      setPasted("");
      setProblem(null);
      // The imported courses appear as chips on the screen behind this panel,
      // so leaving it open would hide the thing the student just did.
      onClose();
    });
  };

  const toggle = (courseId: string) => {
    haptic("selection");
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  return (
    /*
     * The one card on this screen. White on the neutral ground, which is the
     * inverse of the old layout and the reason the ground is neutral at all.
     */
    <div className="relative flex flex-col gap-4 rounded-[20px] border border-border-table bg-background-full p-4 shadow-card sm:p-5">
      <button
        type="button"
        onClick={() => {
          haptic("selection");
          onClose();
        }}
        aria-label="Close transcript import"
        className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-background-secondary-hover hover:text-text-primary pointer-coarse:size-11"
      >
        <RiCloseLine className="size-4" aria-hidden />
      </button>

      <div className="flex flex-col gap-3 rounded-2lg border border-dashed border-border-button-default bg-background-secondary-default p-4">
        <div className="flex items-start gap-3">
          <RiUploadCloud2Line
            className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-body-medium text-text-primary">Upload your transcript</p>
            <p className="mt-0.5 text-caption-1-regular text-text-secondary">
              PDF or plain text. It is read in this browser and never uploaded — we store course
              codes, never the file, and never a grade.
            </p>
          </div>
        </div>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.txt,text/plain,application/pdf"
            className="sr-only"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              haptic("selection");
              fileInput.current?.click();
            }}
            disabled={isPending}
          >
            Choose a file
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="onboarding-transcript-paste"
          className="text-caption-1-medium text-text-secondary"
        >
          Or paste the text
        </label>
        <textarea
          id="onboarding-transcript-paste"
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          rows={4}
          placeholder="Fall 2024   COMS W3134  Data Structures   3.00   A-"
          className="w-full rounded-2lg border border-border-button-default bg-background-primary-default px-3 py-2 text-body-regular text-text-primary placeholder:text-text-placeholder"
        />
        <div>
          <Button
            variant="secondary"
            size="small"
            onClick={onPaste}
            disabled={pasted.trim().length === 0 || isPending}
          >
            Read this text
          </Button>
        </div>
      </div>

      {problem ? (
        <p className="text-caption-1-regular text-text-secondary">{problem}</p>
      ) : null}

      {candidates && candidates.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-headline-semibold text-text-primary">
            We found {candidates.length} {candidates.length === 1 ? "course" : "courses"}
          </p>
          <p className="text-caption-1-regular text-text-secondary">
            Check the ones you actually completed. Rows we were unsure about start unchecked.
          </p>
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {candidates.map((candidate) => (
              <li
                key={candidate.courseId}
                className={cx(
                  "flex items-start gap-3 rounded-lg px-2 py-1.5",
                  selected.has(candidate.courseId) && "bg-background-secondary-default",
                )}
              >
                <Checkbox
                  isSelected={selected.has(candidate.courseId)}
                  onChange={() => toggle(candidate.courseId)}
                  aria-label={candidate.code}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-body-medium text-text-primary">
                    {candidate.code}
                    {candidate.title ? (
                      <span className="text-text-secondary"> · {candidate.title}</span>
                    ) : null}
                  </span>
                  <span className="block text-caption-2-regular text-text-tertiary">
                    {[candidate.termLabel, ...candidate.warnings].filter(Boolean).join(" · ") ||
                      "Looks clean"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div>
            <Button leadingIcon={RiFileTextLine} onClick={confirm} disabled={isPending}>
              Add {selected.size} to my record
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
