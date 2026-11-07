"use client";

import { useEffect, useMemo, useState } from "react";
import { RiAlertLine, RiBookmarkLine, RiCheckLine, RiSearchLine } from "@remixicon/react";

import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useSavedCatalog } from "@/hooks/use-saved-catalog";
import { savedSectionIds } from "@/lib/bookmarks/grouping";
import { WEEKDAY_SHORT, minutesToLabel } from "@/lib/constants";
import { groupByWeekday, overlaps, toTimedItems, type TimedItem } from "@/lib/schedule";
import type { CustomBlock, Meeting, Section, TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

import { searchSchedulableCourses, type SchedulableCourse } from "@/app/schedule/actions";
import { Sheet } from "./sheet";

/**
 * "Add a class" — from what you saved, or from the catalog, in one sheet.
 *
 * ── Two sources, one row shape ────────────────────────────────────────────
 *
 * A saved class and a searched class are the same decision: does this fit
 * the week? So both tabs render the same row — code, section, when, who —
 * with the same ✓ (already on) and ⚠ (overlaps X) marks. The marks come from
 * the same timeline helpers the analysis uses, so the sheet and the grid
 * cannot disagree about what clashes.
 *
 * ── Overlaps are marked, never blocked ────────────────────────────────────
 *
 * A row that overlaps stays tappable. Holding two overlapping sections while
 * a swap is pending is a real plan, and a disabled row with no reason reads
 * as broken.
 *
 * ── Tap adds and stays open ───────────────────────────────────────────────
 *
 * Building a week is several adds in a row. The sheet stays up and the row
 * flips to ✓; the grid behind it has already redrawn.
 */

export interface AddClassSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  termCode: TermCode;
  planSections: readonly Section[];
  planBlocks: readonly CustomBlock[];
  planSectionIds: readonly string[];
  /** Returns true when the add landed (false when refused, e.g. signed out). */
  onAdd: (sectionId: string) => boolean;
  onRemove: (sectionId: string) => void;
}

type Source = "saved" | "search";

interface Candidate {
  sectionId: string;
  courseId: string;
  sectionCode: string;
  title: string;
  instructors: string[];
  meetings: Meeting[];
}

export function AddClassSheet({
  isOpen,
  onOpenChange,
  termCode,
  planSections,
  planBlocks,
  planSectionIds,
  onAdd,
  onRemove,
}: AddClassSheetProps) {
  const [source, setSource] = useState<Source>("saved");
  const inPlan = useMemo(() => new Set(planSectionIds), [planSectionIds]);

  const busyByDay = useMemo(
    () => groupByWeekday(toTimedItems(planSections, planBlocks)),
    [planSections, planBlocks],
  );

  const clashFor = (candidate: Candidate): string | null => {
    if (inPlan.has(candidate.sectionId)) return null;
    const probe: Section = {
      sectionId: candidate.sectionId,
      courseId: candidate.courseId,
      termCode,
      callNumber: "",
      sectionCode: candidate.sectionCode,
      component: null,
      methodOfInstruction: null,
      gradingMode: null,
      minUnit: null,
      maxUnit: null,
      instructors: candidate.instructors,
      meetings: candidate.meetings,
      enrollmentCount: null,
      enrollmentCap: null,
      waitlistCount: null,
      waitlistCap: null,
      status: "unknown",
      sourceAsOf: "",
    } as Section;
    for (const item of toTimedItems([probe], [])) {
      for (const busy of busyByDay.get(item.weekday) ?? []) {
        if (busy.id === candidate.sectionId) continue;
        if (overlaps(item, busy as TimedItem)) return busy.label;
      }
    }
    return null;
  };

  const toggle = (candidate: Candidate) => {
    if (inPlan.has(candidate.sectionId)) onRemove(candidate.sectionId);
    else onAdd(candidate.sectionId);
  };

  return (
    <Sheet isOpen={isOpen} onOpenChange={onOpenChange} title="Add a class" className="sm:max-h-[80dvh]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-5 pt-3">
          <SegmentedControl
            aria-label="Where to add from"
            selectedKeys={[source]}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (next === "saved" || next === "search") setSource(next);
            }}
            className="w-full"
          >
            <SegmentedControlItem id="saved" className="flex-1 gap-1.5">
              <RiBookmarkLine className="size-4" aria-hidden />
              Saved
            </SegmentedControlItem>
            <SegmentedControlItem id="search" className="flex-1 gap-1.5">
              <RiSearchLine className="size-4" aria-hidden />
              Search
            </SegmentedControlItem>
          </SegmentedControl>
        </div>

        {source === "saved" ? (
          <SavedTab termCode={termCode} inPlan={inPlan} clashFor={clashFor} onToggle={toggle} />
        ) : (
          <SearchTab termCode={termCode} inPlan={inPlan} clashFor={clashFor} onToggle={toggle} isOpen={isOpen} />
        )}
      </div>
    </Sheet>
  );
}

interface TabProps {
  termCode: TermCode;
  inPlan: ReadonlySet<string>;
  clashFor: (candidate: Candidate) => string | null;
  onToggle: (candidate: Candidate) => void;
}

function SavedTab({ termCode, inPlan, clashFor, onToggle }: TabProps) {
  const snapshot = useBookmarks();
  const savedIds = useMemo(() => savedSectionIds(snapshot, { termCode }), [snapshot, termCode]);
  const { sections, courses, isResolving } = useSavedCatalog(savedIds);

  const candidates: Candidate[] = useMemo(
    () =>
      sections.map((section) => ({
        sectionId: section.sectionId,
        courseId: section.courseId,
        sectionCode: section.sectionCode,
        title: courses.get(section.courseId)?.title ?? section.title ?? section.courseId,
        instructors: section.instructors,
        meetings: section.meetings,
      })),
    [sections, courses],
  );

  if (savedIds.length === 0) {
    return (
      <Empty>
        Nothing saved for this term yet. Bookmark a class from the catalog, or search for one here.
      </Empty>
    );
  }
  if (isResolving && candidates.length === 0) return <Empty>Loading your saved classes…</Empty>;

  return (
    <ul className="flex flex-col px-2 pb-2 pt-2">
      {candidates.map((candidate) => (
        <CandidateRow
          key={candidate.sectionId}
          candidate={candidate}
          isOn={inPlan.has(candidate.sectionId)}
          clashesWith={clashFor(candidate)}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

function SearchTab({ termCode, inPlan, clashFor, onToggle, isOpen }: TabProps & { isOpen: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; courses: SchedulableCourse[] } | null>(null);
  const trimmed = query.trim();
  // Derived, not stored: the box is "searching" whenever what it shows is not
  // the answer to what is typed. No state to reset when the query changes.
  const isSearching = trimmed.length >= 2 && results?.query !== trimmed;

  useEffect(() => {
    if (trimmed.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      searchSchedulableCourses(trimmed, termCode)
        .then((courses) => {
          if (active) setResults({ query: trimmed, courses });
        })
        .catch(() => {
          if (active) setResults({ query: trimmed, courses: [] });
        });
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmed, termCode]);

  const candidates = useMemo(() => {
    if (!results) return [];
    return results.courses.flatMap((course) =>
      course.sections.map((section) => ({
        sectionId: section.sectionId,
        courseId: course.courseId,
        sectionCode: section.sectionCode,
        title: course.title,
        instructors: section.instructors,
        meetings: section.meetings,
      })),
    );
  }, [results]);

  return (
    <>
      <div className="shrink-0 px-5 pt-3">
        <label className="relative block">
          <RiSearchLine
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-icon-tertiary"
            aria-hidden
          />
          <input
            type="search"
            autoFocus={isOpen}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Course code, title, or topic"
            aria-label="Search the catalog"
            enterKeyHint="search"
            autoComplete="off"
            className={cx(
              "h-11 w-full rounded-xl border border-border-button-default bg-background-primary-default pl-9 pr-3",
              "text-body-regular text-text-primary placeholder:text-text-tertiary",
              "outline-none focus:border-border-button-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          />
        </label>
      </div>

      {trimmed.length < 2 ? (
        <Empty>Try “COMS 4111”, “databases”, or a professor’s name.</Empty>
      ) : isSearching && !results ? (
        <Empty>Searching…</Empty>
      ) : candidates.length === 0 ? (
        <Empty>No sections this term match “{results?.query ?? trimmed}”.</Empty>
      ) : (
        <ul className="flex flex-col px-2 pb-2 pt-2">
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.sectionId}
              candidate={candidate}
              isOn={inPlan.has(candidate.sectionId)}
              clashesWith={clashFor(candidate)}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function CandidateRow({
  candidate,
  isOn,
  clashesWith,
  onToggle,
}: {
  candidate: Candidate;
  isOn: boolean;
  clashesWith: string | null;
  onToggle: (candidate: Candidate) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(candidate)}
        aria-pressed={isOn}
        className={cx(
          "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left outline-none",
          "touch-manipulation transition-colors hover:bg-background-primary-hover active:bg-background-secondary-default",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        <span
          aria-hidden
          className={cx(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
            isOn
              ? "bg-text-primary text-background-primary-default ring-text-primary"
              : clashesWith
                ? "text-text-error-primary ring-border-error-default"
                : "ring-border-button-default",
          )}
        >
          {isOn ? <RiCheckLine className="size-3.5" /> : clashesWith ? <RiAlertLine className="size-3.5" /> : null}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-1.5">
            <span className="text-body-medium tabular-nums text-text-primary">{candidate.courseId}</span>
            <span className="text-caption-1-regular tabular-nums text-text-tertiary">§{candidate.sectionCode}</span>
          </span>
          <span className="truncate text-caption-1-regular text-text-secondary">{candidate.title}</span>
          <span className="truncate text-caption-1-regular text-text-tertiary">
            {meetingSummary(candidate.meetings)}
            {candidate.instructors.length > 0 ? ` · ${candidate.instructors[0]}` : ""}
          </span>
          {isOn ? (
            <span className="text-caption-2-regular text-text-tertiary">On your schedule · tap to remove</span>
          ) : clashesWith ? (
            <span className="text-caption-2-regular text-text-error-primary">Overlaps {clashesWith}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function meetingSummary(meetings: Meeting[]): string {
  if (meetings.length === 0) return "Time not published";
  const days = [...new Set(meetings.map((meeting) => WEEKDAY_SHORT[meeting.weekday]))].join("/");
  const first = meetings[0];
  return `${days} ${minutesToLabel(first.startMinute)}–${minutesToLabel(first.endMinute)}`;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-caption-1-regular text-text-tertiary">{children}</p>;
}
