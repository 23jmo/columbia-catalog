"use client";

import { useMemo, useState } from "react";
import { RiAddLine, RiAlertLine, RiShareForwardLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import type { WeekGridBlock } from "@/components/course/contracts";
import { PageHeader } from "@/components/shell/page-header";
import { CURRENT_TERM, buildTerm, termLabel } from "@/lib/constants";
import { icsFilename, planToIcs } from "@/lib/schedule";
import type { Term, TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

import { AddClassSheet } from "./add-class-sheet";
import { BlockSheet, type BlockSelection } from "./block-sheet";
import { ScheduleWeek } from "./schedule-week";
import { ShareSheet } from "./share-sheet";
import { ownerIdOf } from "./to-blocks";
import { useSchedule } from "./use-schedule";

/**
 * `/schedule` — the week, and the three things you do to it.
 *
 * Add a class (from saved or from search), tap a class to see or remove it,
 * share a read-only link. That is the whole page. The month view, the plan
 * switcher, the layer rail and the analysis sidebar were each a screen's
 * worth of chrome around the same five columns, and none of them was the
 * thing a student opens this tab for.
 *
 * On a phone the grid is the page: the summary line above it, the add and
 * share buttons in reach of a thumb, and every detail behind a tap. The
 * class list underneath is the same information as the grid for anyone who
 * would rather read than scan — and for the classes with no published time,
 * which the grid cannot draw.
 */

export interface ScheduleScreenProps {
  termCode?: TermCode;
  term?: Term;
}

export function ScheduleScreen({ termCode = CURRENT_TERM, term }: ScheduleScreenProps) {
  const schedule = useSchedule(termCode);
  const [isAdding, setIsAdding] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  const selection: BlockSelection | null = useMemo(() => {
    if (!selectedOwnerId) return null;
    const section = schedule.sectionById.get(selectedOwnerId);
    if (section) {
      return { kind: "section", section, course: schedule.courseById.get(section.courseId) ?? null };
    }
    const block = schedule.plan?.customBlocks.find((candidate) => candidate.blockId === selectedOwnerId);
    return block ? { kind: "block", block } : null;
  }, [selectedOwnerId, schedule.sectionById, schedule.courseById, schedule.plan]);

  // The count matches what the grid hatches: time overlaps and two sections of
  // one course. Commute warnings are not drawn, so they are not counted.
  const overlaps = (schedule.analysis?.conflicts ?? []).filter(
    (conflict) => conflict.kind === "overlap" || conflict.kind === "duplicate_course",
  );
  const untimed = schedule.sections.filter((section) => section.meetings.length === 0);
  const withTimes = schedule.sections.filter((section) => section.meetings.length > 0);

  const exportIcs = () => {
    if (!schedule.plan || withTimes.length === 0) return;
    const result = planToIcs({
      plan: { ...schedule.plan, sectionIds: withTimes.map((section) => section.sectionId) },
      sections: withTimes,
      courses: schedule.courses,
      term: term ?? buildTerm(termCode),
    });
    downloadText(result.content, result.filename || icsFilename(schedule.plan), "text/calendar");
  };

  const summary = schedule.analysis ? creditLine(schedule.analysis.creditsMin, schedule.analysis.creditsMax) : null;

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
      <PageHeader
        title="Schedule"
        hideTitleOnMobile
        description={`${termLabel(termCode)}. Add classes, tap one to see it, share the week.`}
        action={<Actions onAdd={() => setIsAdding(true)} onShare={() => setIsSharing(true)} />}
      />

      <div className="flex items-center justify-between gap-3 xl:hidden">
        <SummaryLine count={schedule.sections.length} credits={summary} hardConflicts={overlaps.length} />
        <Actions compact onAdd={() => setIsAdding(true)} onShare={() => setIsSharing(true)} />
      </div>
      <div className="hidden xl:block">
        <SummaryLine count={schedule.sections.length} credits={summary} hardConflicts={overlaps.length} />
      </div>

      <ScheduleWeek
        blocks={schedule.blocks}
        commitmentIds={schedule.commitmentIds}
        selectedOwnerId={selectedOwnerId}
        onSelectBlock={(block: WeekGridBlock) => setSelectedOwnerId(ownerIdOf(block.blockId))}
      />

      {schedule.sections.length === 0 && !schedule.isResolving ? (
        <EmptyWeek onAdd={() => setIsAdding(true)} />
      ) : (
        <ClassList
          sections={schedule.sections}
          untimed={untimed}
          titleFor={(courseId) => schedule.courseById.get(courseId)?.title ?? courseId}
          onOpen={setSelectedOwnerId}
        />
      )}

      <AddClassSheet
        isOpen={isAdding}
        onOpenChange={setIsAdding}
        termCode={termCode}
        planSections={schedule.sections}
        planBlocks={schedule.plan?.customBlocks ?? []}
        planSectionIds={schedule.plan?.sectionIds ?? []}
        onAdd={schedule.addSection}
        onRemove={schedule.removeSection}
      />
      <ShareSheet
        isOpen={isSharing}
        onOpenChange={setIsSharing}
        termCode={termCode}
        onExportIcs={withTimes.length > 0 ? exportIcs : undefined}
      />
      <BlockSheet
        selection={selection}
        onClose={() => setSelectedOwnerId(null)}
        onRemoveSection={schedule.removeSection}
        onRemoveBlock={schedule.removeBlock}
      />
    </div>
  );
}

function Actions({ compact = false, onAdd, onShare }: { compact?: boolean; onAdd: () => void; onShare: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="secondary"
        size={compact ? "small" : "medium"}
        iconOnly={compact}
        leadingIcon={RiShareForwardLine}
        onClick={onShare}
        aria-label={compact ? "Share schedule" : undefined}
      >
        {compact ? null : "Share"}
      </Button>
      <Button size={compact ? "small" : "medium"} leadingIcon={RiAddLine} onClick={onAdd}>
        Add class
      </Button>
    </div>
  );
}

function SummaryLine({ count, credits, hardConflicts }: { count: number; credits: string | null; hardConflicts: number }) {
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-caption-1-regular text-text-secondary">
      <span className="tabular-nums">
        {count} {count === 1 ? "class" : "classes"}
      </span>
      {credits ? (
        <>
          <span aria-hidden className="text-text-tertiary">·</span>
          <span className="tabular-nums">{credits}</span>
        </>
      ) : null}
      {hardConflicts > 0 ? (
        <>
          <span aria-hidden className="text-text-tertiary">·</span>
          <span className="inline-flex items-center gap-1 text-text-error-primary">
            <RiAlertLine className="size-3.5" aria-hidden />
            {hardConflicts} {hardConflicts === 1 ? "clash" : "clashes"}
          </span>
        </>
      ) : null}
    </p>
  );
}

function creditLine(min: number, max: number): string | null {
  if (max === 0) return null;
  return min === max ? `${min} points` : `${min}–${max} points`;
}

function ClassList({
  sections,
  untimed,
  titleFor,
  onOpen,
}: {
  sections: ReturnType<typeof useSchedule>["sections"];
  untimed: ReturnType<typeof useSchedule>["sections"];
  titleFor: (courseId: string) => string;
  onOpen: (sectionId: string) => void;
}) {
  if (sections.length === 0) return null;
  const untimedIds = new Set(untimed.map((section) => section.sectionId));
  return (
    <section className="flex flex-col gap-2" aria-label="Classes on your schedule">
      <ul className="overflow-hidden rounded-2xl border border-border-table bg-background-primary-default">
        {sections.map((section) => (
          <li key={section.sectionId} className="border-t border-border-table first:border-t-0">
            <button
              type="button"
              onClick={() => onOpen(section.sectionId)}
              className={cx(
                "flex w-full items-center gap-3 px-4 py-3 text-left outline-none",
                "touch-manipulation transition-colors hover:bg-background-primary-hover active:bg-background-secondary-default",
                "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-body-medium tabular-nums text-text-primary">{section.courseId}</span>
                  <span className="text-caption-1-regular tabular-nums text-text-tertiary">§{section.sectionCode}</span>
                </span>
                <span className="truncate text-caption-1-regular text-text-secondary">{titleFor(section.courseId)}</span>
              </span>
              {untimedIds.has(section.sectionId) ? (
                <span className="shrink-0 rounded-full bg-background-secondary-default px-2 py-0.5 text-caption-2-regular text-text-tertiary">
                  No time yet
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {untimed.length > 0 ? (
        <p className="px-1 text-caption-2-regular text-text-tertiary">
          Columbia has not published a meeting time for {untimed.length === 1 ? "one of these" : `${untimed.length} of these`} yet, so
          {untimed.length === 1 ? " it is" : " they are"} listed but not drawn.
        </p>
      ) : null}
    </section>
  );
}

function EmptyWeek({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl bg-background-secondary-default p-5">
      <div className="flex flex-col gap-1">
        <p className="text-body-medium text-text-primary">Your week is empty</p>
        <p className="text-caption-1-regular text-text-secondary">
          Add classes you saved, search the catalog, or ask the chat to put one on your schedule.
        </p>
      </div>
      <Button leadingIcon={RiAddLine} onClick={onAdd}>
        Add class
      </Button>
    </div>
  );
}

function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
