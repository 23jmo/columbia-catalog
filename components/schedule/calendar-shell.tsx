"use client";

import { useMemo, useState } from "react";
import { RiAddLine, RiDeleteBinLine, RiStarFill, RiStarLine } from "@remixicon/react";
import { addDays, startOfMonth, startOfWeek } from "date-fns";
import { Button } from "@/components/base/buttons/button";
import { makeBlock } from "@/lib/schedule";
import type { PlanAnalysisDetail } from "@/lib/schedule";
import type { Course, CustomBlock, Section, Weekday } from "@/lib/types";
import type { TypicalMeetingPattern } from "@/lib/db/typical-meetings";
import { cx } from "@/utils/cx";
import { CalendarManage } from "./calendar-manage";
import { CalendarMonth } from "./calendar-month";
import { CalendarRail, type CalendarRailPlan } from "./calendar-rail";
import { CalendarToolbar } from "./calendar-toolbar";
import { CalendarWeek } from "./calendar-week";
import { clampAnchor, blockIdFromEventId } from "./calendar-commitment";
import { CommitmentCard, type CommitmentDraft } from "./calendar-commitment-card";
import { ClassEventCard, type ClassEventDraft } from "./calendar-class-card";
import { clampToTerm, isoDate, weekdayOf } from "./calendar-date";
import { expandEvents, filterEvents } from "./calendar-events";
import type { CalendarLayer, CalendarLayers, CalendarView, CalendarEvent, SourcedBlock } from "./calendar-types";
import "./calendar-glass.css";

const ALL_LAYERS: CalendarLayers = { class: true, commitment: true, historical: true };

export function CalendarShell({
  plans,
  selectedId,
  onSelectPlan,
  onCreatePlan,
  sourced,
  analysis,
  termStart,
  termEnd,
  sections,
  courses,
  typical,
  isLoading,
  customBlocks,
  onRemoveSection,
  onSaveBlock,
  onRemoveBlock,
  canExport,
  onExport,
  onDuplicate,
  onDelete,
  onMakePrimary,
  isPrimary,
  name,
  onRename,
  className,
}: {
  plans: readonly CalendarRailPlan[];
  selectedId: string | null;
  onSelectPlan: (planId: string) => void;
  onCreatePlan: () => void;
  sourced: readonly SourcedBlock[];
  analysis: PlanAnalysisDetail | null;
  termStart: string;
  termEnd: string;
  sections: Section[];
  courses: Course[];
  typical: Map<string, TypicalMeetingPattern>;
  isLoading: boolean;
  customBlocks: readonly CustomBlock[];
  onRemoveSection: (sectionId: string) => void;
  onSaveBlock: (block: CustomBlock) => void;
  onRemoveBlock: (blockId: string) => void;
  canExport: boolean;
  onExport: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMakePrimary: () => void;
  isPrimary: boolean;
  name: string;
  onRename: (name: string) => void;
  className?: string;
}) {
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(() => clampToTerm(new Date(), termStart, termEnd));
  const [layers, setLayers] = useState<CalendarLayers>(ALL_LAYERS);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<CommitmentDraft | null>(null);
  const [classEvent, setClassEvent] = useState<ClassEventDraft | null>(null);

  const range = useMemo(() => visibleRange(cursor, view), [cursor, view]);
  const events = useMemo(() => {
    const expanded = expandEvents(sourced, range.start, range.end, termStart, termEnd);
    return filterEvents(expanded, layers, query);
  }, [sourced, range, termStart, termEnd, layers, query]);
  const weekDays = useMemo(() => {
    if (view === "day") return [cursor];
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursor, view]);

  const openDay = (date: Date) => {
    setCursor(date);
    setView("day");
  };

  const openCreate = (
    day: Date,
    startMinute: number,
    endMinute: number,
    anchor: { top: number; left: number },
  ) => {
    setClassEvent(null);
    setDraft({
      mode: "create",
      weekday: weekdayOf(day),
      label: "",
      startMinute,
      endMinute,
      anchor: clampAnchor(anchor.top, anchor.left),
      dayKey: isoDate(day),
    });
  };

  const openEdit = (eventId: string, anchor: { top: number; left: number }) => {
    setClassEvent(null);
    const blockId = blockIdFromEventId(eventId);
    const block = customBlocks.find((item) => item.blockId === blockId);
    if (!block) return;
    setDraft({
      mode: "edit",
      block,
      weekday: block.weekday,
      label: block.label,
      startMinute: block.startMinute,
      endMinute: block.endMinute,
      anchor: clampAnchor(anchor.top, anchor.left),
    });
  };

  const patchDraft = (patch: Partial<CommitmentDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const saveDraft = () => {
    if (!draft || draft.endMinute <= draft.startMinute) return;
    const label = draft.label.trim() || "Busy";
    if (draft.mode === "create") {
      onSaveBlock(makeBlock(label, draft.weekday, draft.startMinute, draft.endMinute));
    } else if (draft.block) {
      onSaveBlock({
        ...draft.block,
        label,
        weekday: draft.weekday,
        startMinute: draft.startMinute,
        endMinute: draft.endMinute,
      });
    }
    setDraft(null);
  };

  const deleteDraft = () => {
    if (draft?.block) onRemoveBlock(draft.block.blockId);
    setDraft(null);
  };

  const openClass = (event: CalendarEvent, anchor: { top: number; left: number }) => {
    setDraft(null);
    setClassEvent({
      event,
      anchor: clampAnchor(anchor.top, anchor.left, 360, 520),
    });
  };

  const addCommitmentFromToolbar = () => {
    setClassEvent(null);
    const startMinute = 9 * 60;
    const endMinute = 10 * 60;
    const left = typeof window !== "undefined" ? window.innerWidth / 2 - 160 : 200;
    setDraft({
      mode: "create",
      weekday: weekdayOf(cursor),
      label: "",
      startMinute,
      endMinute,
      anchor: clampAnchor(160, left),
      dayKey: isoDate(cursor),
    });
    if (view === "month") setView("week");
  };

  return (
    <div
      className={cx(
        "calendar-root isolate relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row",
        className,
      )}
    >
      <CalendarRail
        plans={plans}
        selectedId={selectedId}
        onSelectPlan={onSelectPlan}
        onCreatePlan={onCreatePlan}
        layers={layers}
        onToggleLayer={(layer: CalendarLayer) =>
          setLayers((current) => ({ ...current, [layer]: !current[layer] }))
        }
        showHistorical={sourced.some((item) => item.layer === "historical")}
        query={query}
        onQuery={setQuery}
        selectedDate={cursor}
        onSelectDate={(date) => {
          setCursor(date);
          if (view === "month") setView("day");
        }}
        onMonthChange={(date) => setCursor(date)}
        analysis={analysis}
        canExport={canExport}
        onExport={onExport}
        onDuplicate={onDuplicate}
      />

      <div className="@container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <CalendarToolbar
          cursor={cursor}
          view={view}
          onViewChange={setView}
          onCursorChange={setCursor}
          onToday={() => setCursor(clampToTerm(new Date(), termStart, termEnd))}
          trailing={
            <>
              <Button size="small" variant="secondary" leadingIcon={RiAddLine} onClick={addCommitmentFromToolbar}>
                Commitment
              </Button>
              <Button
                size="small"
                variant="secondary"
                leadingIcon={isPrimary ? RiStarFill : RiStarLine}
                onClick={onMakePrimary}
                disabled={isPrimary}
              >
                {isPrimary ? "Primary" : "Make primary"}
              </Button>
              <Button size="small" variant="secondary" leadingIcon={RiDeleteBinLine} onClick={onDelete}>
                Delete
              </Button>
            </>
          }
        />

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {view === "month" ? (
            <CalendarMonth
              cursor={cursor}
              events={events}
              onSelectDay={openDay}
              onEditCommitment={openEdit}
              onClassClick={openClass}
            />
          ) : (
            <CalendarWeek
              days={weekDays}
              events={events}
              onSelectDay={openDay}
              draftDayKey={draft?.mode === "create" ? draft.dayKey : null}
              draftMinutes={
                draft?.mode === "create"
                  ? { startMinute: draft.startMinute, endMinute: draft.endMinute }
                  : null
              }
              onCreateAtPointer={openCreate}
              onEditCommitment={openEdit}
              onClassClick={openClass}
            />
          )}
        </div>

        {draft ? (
          <>
            <button
              type="button"
              aria-label="Close commitment editor"
              className="fixed inset-0 z-40"
              onClick={() => setDraft(null)}
            />
            <div className="fixed z-50" style={{ top: draft.anchor.top, left: draft.anchor.left }}>
              <CommitmentCard
                mode={draft.mode}
                label={draft.label}
                weekday={draft.weekday}
                startMinute={draft.startMinute}
                endMinute={draft.endMinute}
                onLabelChange={(label) => patchDraft({ label })}
                onWeekdayChange={(weekday: Weekday) => {
                  const match = weekDays.find((day) => weekdayOf(day) === weekday);
                  patchDraft({
                    weekday,
                    dayKey: match ? isoDate(match) : draft.dayKey,
                  });
                }}
                onStartChange={(startMinute) => patchDraft({ startMinute })}
                onEndChange={(endMinute) => patchDraft({ endMinute })}
                onSave={saveDraft}
                onDelete={draft.mode === "edit" ? deleteDraft : undefined}
                onClose={() => setDraft(null)}
              />
            </div>
          </>
        ) : null}

        {classEvent ? (
          <>
            <button
              type="button"
              aria-label="Close class details"
              className="fixed inset-0 z-40"
              onClick={() => setClassEvent(null)}
            />
            <div
              className="fixed z-50"
              style={{ top: classEvent.anchor.top, left: classEvent.anchor.left }}
            >
              <ClassEventCard
                event={classEvent.event}
                sections={sections}
                courses={courses}
                customBlocks={customBlocks}
                analysis={analysis}
                onClose={() => setClassEvent(null)}
              />
            </div>
          </>
        ) : null}

        <CalendarManage
          name={name}
          onRename={onRename}
          sections={sections}
          courses={courses}
          typical={typical}
          isLoading={isLoading}
          onRemoveSection={onRemoveSection}
          className="max-lg:hidden"
        />
      </div>
    </div>
  );
}

function visibleRange(cursor: Date, view: CalendarView): { start: Date; end: Date } {
  if (view === "day") return { start: cursor, end: cursor };
  if (view === "week") {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return { start, end: addDays(start, 6) };
  }
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  return { start, end: addDays(start, 41) };
}
