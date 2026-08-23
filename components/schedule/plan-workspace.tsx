"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RiAddLine,
  RiCalendarLine,
  RiDeleteBinLine,
  RiDownloadLine,
  RiFileCopyLine,
  RiStarFill,
  RiStarLine,
  RiTimeLine,
} from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { WeekGrid } from "@/components/schedule/week-grid";
import { usePlans } from "@/hooks/use-plans";
import { CURRENT_TERM, WEEKDAY_LABEL, buildTerm, minutesToLabel } from "@/lib/constants";
import { getCoursesByIds, getSections } from "@/lib/data/catalog";
import { getTypicalMeetings, type TypicalMeetingPattern } from "@/lib/db/typical-meetings";
import {
  analyzePlan,
  copyName,
  icsFilename,
  makeBlock,
  nextPlanName,
  planToIcs,
  planStore,
  type PlanAnalysisDetail,
} from "@/lib/schedule";
import { toWeekGridBlocks } from "@/components/schedule/to-blocks";
import type { Course, CustomBlock, Section, TermCode, Weekday } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * The interactive planner — spec §8.
 *
 * ── Why this is one client component and not several ───────────────────────
 *
 * Plan tabs, the section list, the custom-block editor and the week canvas all
 * read the same three things: the selected plan, its resolved sections, and the
 * analysis over both. Splitting them would mean either lifting that state into
 * a context or fetching sections three times. The canvas itself (`WeekGrid`)
 * stays a pure server-renderable component and is handed blocks; nothing
 * interactive leaked into it.
 *
 * ── Meeting times you can trust, and meeting times you cannot ──────────────
 *
 * Columbia stopped publishing days, times and rooms after Spring 2025
 * (.plans/BLOCKERS.md #5). Sections that have none get a *historical* pattern
 * from `typical_meetings`, and the two are never blended:
 *
 *   · confirmed times drive the grid, hard conflicts and `.ics` export;
 *   · historical times render with the term they came from, are excluded from
 *     the calendar file, and never raise a hard conflict.
 *
 * A student must be able to tell, at a glance, which of the rectangles on their
 * week is a fact.
 */

export interface PlanWorkspaceProps {
  termCode?: TermCode;
  className?: string;
}

interface Resolved {
  sections: Section[];
  courses: Course[];
  typical: Map<string, TypicalMeetingPattern>;
}

const EMPTY: Resolved = { sections: [], courses: [], typical: new Map() };

export function PlanWorkspace({ termCode = CURRENT_TERM, className }: PlanWorkspaceProps) {
  const plans = usePlans(termCode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Keyed by the section list that produced it. Deriving `resolved` from the
  // key rather than clearing it in an effect means an empty plan, or a plan
  // switch, renders empty on the *same* commit as the change — no synchronous
  // setState in an effect, and no flash of the previous plan's courses.
  const [fetched, setFetched] = useState<{ key: string; data: Resolved }>({
    key: "",
    data: EMPTY,
  });
  // Two error channels, because they are cleared by different things: a load
  // failure belongs to one section list and dies when the plan changes, while
  // a rejected mutation (plan cap, duplicate section) survives until the next
  // mutation succeeds.
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // The selected plan follows the primary until the student picks another, and
  // falls back rather than rendering an empty screen if the selection is
  // deleted from a second tab.
  const selected = useMemo(() => {
    const byId = selectedId ? plans.find((plan) => plan.planId === selectedId) : null;
    return byId ?? plans.find((plan) => plan.isPrimary) ?? plans[0] ?? null;
  }, [plans, selectedId]);

  const sectionIds = useMemo(() => selected?.sectionIds ?? [], [selected]);
  const sectionKey = sectionIds.join(",");

  // Both derived from the same key, so a plan switch clears the previous
  // plan's error and shows the spinner without an extra render pass.
  const resolved = fetched.key === sectionKey ? fetched.data : EMPTY;
  const loadError = failure?.key === sectionKey ? failure.message : null;
  const error = loadError ?? mutationError;
  const isLoading = sectionIds.length > 0 && fetched.key !== sectionKey && loadError === null;

  useEffect(() => {
    if (sectionIds.length === 0) return;
    let active = true;

    void (async () => {
      try {
        const sections = await getSections(sectionIds);
        const [courses, typical] = await Promise.all([
          getCoursesByIds([...new Set(sections.map((s) => s.courseId))], termCode),
          getTypicalMeetings(sectionIds),
        ]);
        if (!active) return;
        setFetched({ key: sectionKey, data: { sections, courses, typical } });
      } catch (cause) {
        if (!active) return;
        setFailure({
          key: sectionKey,
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    })();

    return () => {
      active = false;
    };
    // sectionKey rather than the array: a new array identity every render would
    // refetch the whole plan on every keystroke elsewhere on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, termCode]);

  const analysis: PlanAnalysisDetail | null = useMemo(() => {
    if (!selected) return null;
    return analyzePlan({
      sections: resolved.sections,
      courses: resolved.courses,
      blocks: selected.customBlocks,
    });
  }, [selected, resolved]);

  const blocks = useMemo(() => {
    if (!selected) return [];
    const confirmed = toWeekGridBlocks({
      sections: resolved.sections,
      customBlocks: selected.customBlocks,
    });
    // Historical patterns join the canvas as candidates, which is the tone the
    // grid already reserves for "not committed" — so they read as provisional
    // without inventing a fourth visual language.
    const historical = [...resolved.typical.values()].flatMap((pattern) =>
      pattern.meetings.map((meeting, index) => ({
        blockId: `typical:${pattern.sectionId}:${index}`,
        label: labelForSection(pattern.sectionId, resolved),
        sublabel: `usually ${meeting.room ?? meeting.buildingName ?? ""}`.trim(),
        weekday: meeting.weekday,
        startMinute: meeting.startMinute,
        endMinute: meeting.endMinute,
        tone: "candidate" as const,
      })),
    );
    return [...confirmed, ...historical];
  }, [selected, resolved]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const guard = useCallback((run: () => void) => {
    try {
      run();
      setMutationError(null);
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const createPlan = () =>
    guard(() => {
      const plan = planStore.createPlan({
        name: nextPlanName(plans.map((p) => p.name)),
        termCode,
      });
      setSelectedId(plan.planId);
    });

  const duplicate = () =>
    guard(() => {
      if (!selected) return;
      const plan = planStore.duplicatePlan(
        selected.planId,
        copyName(selected.name, plans.map((p) => p.name)),
      );
      setSelectedId(plan.planId);
    });

  const remove = () =>
    guard(() => {
      if (!selected) return;
      planStore.deletePlan(selected.planId);
      setSelectedId(null);
    });

  const makePrimary = () =>
    guard(() => {
      if (!selected) return;
      planStore.setPrimaryPlan(selected.planId);
    });

  const rename = (name: string) =>
    guard(() => {
      if (!selected || !name.trim()) return;
      planStore.renamePlan(selected.planId, name.trim());
    });

  const dropSection = (sectionId: string) =>
    guard(() => {
      if (!selected) return;
      planStore.removeSection(selected.planId, sectionId);
    });

  const saveBlock = (block: CustomBlock) =>
    guard(() => {
      if (!selected) return;
      planStore.upsertBlock(selected.planId, block);
    });

  const dropBlock = (blockId: string) =>
    guard(() => {
      if (!selected) return;
      planStore.removeBlock(selected.planId, blockId);
    });

  const exportIcs = () => {
    if (!selected) return;
    guard(() => {
      // Only sections with confirmed meetings reach the calendar. A historical
      // pattern written into an .ics becomes an appointment in someone's phone
      // that nothing on screen still labels as a guess.
      const withTimes = resolved.sections.filter((s) => (s.meetings?.length ?? 0) > 0);
      const result = planToIcs({
        plan: { ...selected, sectionIds: withTimes.map((s) => s.sectionId) },
        sections: withTimes,
        courses: resolved.courses,
        term: buildTerm(termCode),
      });
      downloadText(result.content, result.filename || icsFilename(selected), "text/calendar");
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const historicalCount = resolved.typical.size;

  return (
    <div className={cx("flex flex-col gap-5", className)}>
      <PlanTabs
        plans={plans}
        selectedId={selected?.planId ?? null}
        onSelect={setSelectedId}
        onCreate={createPlan}
      />

      {error && (
        <p className="rounded-2lg bg-background-secondary-default p-3 text-caption-1-regular text-text-secondary">
          {error}
        </p>
      )}

      {!selected ? (
        <EmptyPlans onCreate={createPlan} />
      ) : (
        <>
          <PlanToolbar
            name={selected.name}
            isPrimary={selected.isPrimary}
            onRename={rename}
            onDuplicate={duplicate}
            onDelete={remove}
            onMakePrimary={makePrimary}
            onExport={exportIcs}
            canExport={resolved.sections.some((s) => (s.meetings?.length ?? 0) > 0)}
          />

          {historicalCount > 0 && (
            <p className="flex items-start gap-2 rounded-2lg bg-background-secondary-default p-3 text-caption-1-regular text-text-secondary">
              <RiTimeLine className="mt-px size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
              <span>
                {historicalCount === 1 ? "One section on" : `${historicalCount} sections on`} this
                plan {historicalCount === 1 ? "has" : "have"} no published meeting time for this
                term — Columbia now lists times only in Vergil. The lighter blocks show when{" "}
                {historicalCount === 1 ? "it" : "they"} last met, which is a guide, not a schedule.
                They are left out of the calendar export.
              </span>
            </p>
          )}

          <WeekGrid blocks={blocks} />

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionList
              sections={resolved.sections}
              courses={resolved.courses}
              typical={resolved.typical}
              isLoading={isLoading}
              onRemove={dropSection}
            />
            <BlockEditor
              blocks={selected.customBlocks}
              onSave={saveBlock}
              onRemove={dropBlock}
            />
          </div>

          {analysis && <AnalysisStrip analysis={analysis} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function labelForSection(sectionId: string, resolved: Resolved): string {
  const section = resolved.sections.find((s) => s.sectionId === sectionId);
  if (!section) return sectionId;
  const course = resolved.courses.find((c) => c.courseId === section.courseId);
  return `${course?.courseId ?? section.courseId} ${section.sectionCode}`;
}

/**
 * Browser-only file save. A Blob URL rather than a data: URI because an .ics
 * for a full schedule comfortably exceeds what some browsers accept in a
 * navigable data URL.
 */
function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick: revoking synchronously races the download in
  // Safari, which reads the blob after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function PlanTabs({
  plans,
  selectedId,
  onSelect,
  onCreate,
}: {
  plans: readonly { planId: string; name: string; isPrimary: boolean }[];
  selectedId: string | null;
  onSelect: (planId: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Plans">
      {plans.map((plan) => (
        <button
          key={plan.planId}
          type="button"
          role="tab"
          aria-selected={plan.planId === selectedId}
          onClick={() => onSelect(plan.planId)}
          className={cx(
            "flex items-center gap-1.5 rounded-2lg border px-3 py-1.5 text-body-medium transition-colors",
            plan.planId === selectedId
              ? "border-border-button-default bg-background-secondary-default text-text-primary"
              : "border-transparent text-text-secondary hover:bg-background-secondary-hover",
          )}
        >
          {plan.isPrimary && (
            <RiStarFill className="size-3.5 text-foreground-icon-secondary" aria-label="Primary" />
          )}
          {plan.name}
        </button>
      ))}
      <Button size="small" variant="secondary" leadingIcon={RiAddLine} onClick={onCreate}>
        New plan
      </Button>
    </div>
  );
}

function PlanToolbar({
  name,
  isPrimary,
  onRename,
  onDuplicate,
  onDelete,
  onMakePrimary,
  onExport,
  canExport,
}: {
  name: string;
  isPrimary: boolean;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMakePrimary: () => void;
  onExport: () => void;
  canExport: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        Uncontrolled, keyed on the name it was seeded with. Typing lives in the
        DOM and commits on blur; when the plan changes underneath us (a tab
        switch, or a rename synced from another device) the key changes, React
        remounts the input, and it re-seeds from the new name. A controlled
        input would have needed an effect to do the same thing.
      */}
      <input
        key={name}
        defaultValue={name}
        onBlur={(event) => onRename(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        aria-label="Plan name"
        className="min-w-0 flex-1 rounded-2lg border border-border-button-default bg-background-primary-default px-3 py-1.5 text-body-medium text-text-primary outline-none focus:border-border-button-hover"
      />
      <Button
        size="small"
        variant="secondary"
        leadingIcon={isPrimary ? RiStarFill : RiStarLine}
        onClick={onMakePrimary}
        disabled={isPrimary}
      >
        {isPrimary ? "Primary" : "Make primary"}
      </Button>
      <Button size="small" variant="secondary" leadingIcon={RiFileCopyLine} onClick={onDuplicate}>
        Duplicate
      </Button>
      <Button
        size="small"
        variant="secondary"
        leadingIcon={RiDownloadLine}
        onClick={onExport}
        disabled={!canExport}
      >
        Export .ics
      </Button>
      <Button size="small" variant="secondary" leadingIcon={RiDeleteBinLine} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}

function EmptyPlans({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-3xl border border-border-table bg-background-secondary-default p-6">
      <RiCalendarLine className="size-6 text-foreground-icon-tertiary" aria-hidden />
      <div>
        <p className="text-title-3-medium text-text-primary">No plans yet</p>
        <p className="text-body-regular text-text-secondary">
          A plan is a named draft of your week. Make as many as you like — &ldquo;Plan A&rdquo;,
          &ldquo;if I don&rsquo;t get Op Systems&rdquo; — and mark one primary.
        </p>
      </div>
      <Button leadingIcon={RiAddLine} onClick={onCreate}>
        Create a plan
      </Button>
    </div>
  );
}

function SectionList({
  sections,
  courses,
  typical,
  isLoading,
  onRemove,
}: {
  sections: Section[];
  courses: Course[];
  typical: Map<string, TypicalMeetingPattern>;
  isLoading: boolean;
  onRemove: (sectionId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title-3-medium text-text-primary">Sections</h2>
      {isLoading && <p className="text-caption-1-regular text-text-tertiary">Loading…</p>}
      {!isLoading && sections.length === 0 && (
        <p className="text-caption-1-regular text-text-tertiary">
          Nothing added yet. Add sections from a course page.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {sections.map((section) => {
          const course = courses.find((c) => c.courseId === section.courseId);
          const pattern = typical.get(section.sectionId);
          const hasTimes = (section.meetings?.length ?? 0) > 0;
          return (
            <li
              key={section.sectionId}
              className="flex items-start justify-between gap-3 rounded-2lg border border-border-table p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-body-medium text-text-primary">
                  {section.courseId} {section.sectionCode} · {course?.title ?? "Untitled"}
                </p>
                <p className="text-caption-1-regular text-text-tertiary">
                  {hasTimes
                    ? section.meetings
                        .map(
                          (m) =>
                            `${WEEKDAY_LABEL[m.weekday]} ${minutesToLabel(m.startMinute)}–${minutesToLabel(m.endMinute)}`,
                        )
                        .join(" · ")
                    : pattern
                      ? `No published time this term. Last met ${pattern.meetings
                          .map(
                            (m) =>
                              `${WEEKDAY_LABEL[m.weekday]} ${minutesToLabel(m.startMinute)}–${minutesToLabel(m.endMinute)}`,
                          )
                          .join(", ")} in ${termLabel(pattern.sourceTerm)}.`
                      : "No published meeting time this term."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(section.sectionId)}
                aria-label={`Remove ${section.courseId} ${section.sectionCode}`}
                className="shrink-0 rounded-2lg p-1.5 text-foreground-icon-tertiary hover:bg-background-secondary-hover"
              >
                <RiDeleteBinLine className="size-4" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function termLabel(termCode: string): string {
  const year = termCode.slice(0, 4);
  const season = termCode.slice(4);
  const name = season === "1" ? "Spring" : season === "2" ? "Summer" : "Fall";
  return `${name} ${year}`;
}

const WEEKDAYS: Weekday[] = ["Mo", "Tu", "We", "Th", "Fr"];

function BlockEditor({
  blocks,
  onSave,
  onRemove,
}: {
  blocks: readonly CustomBlock[];
  onSave: (block: CustomBlock) => void;
  onRemove: (blockId: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [weekday, setWeekday] = useState<Weekday>("Mo");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");

  const add = () => {
    const startMinute = parseTime(start);
    const endMinute = parseTime(end);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) return;
    onSave(makeBlock(label.trim() || "Busy", weekday, startMinute, endMinute));
    setLabel("");
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title-3-medium text-text-primary">Other commitments</h2>
      <p className="text-caption-1-regular text-text-tertiary">
        A job shift, practice, a standing meeting. These count in conflict and walk checks
        exactly like a class does.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-2lg border border-border-table p-3">
        <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
          <span className="text-caption-1-regular text-text-tertiary">Label</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Work"
            className="rounded-2lg border border-border-button-default bg-background-primary-default px-2 py-1.5 text-body-medium text-text-primary outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption-1-regular text-text-tertiary">Day</span>
          <select
            value={weekday}
            onChange={(event) => setWeekday(event.target.value as Weekday)}
            className="rounded-2lg border border-border-button-default bg-background-primary-default px-2 py-1.5 text-body-medium text-text-primary outline-none"
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {WEEKDAY_LABEL[day]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption-1-regular text-text-tertiary">From</span>
          <input
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="rounded-2lg border border-border-button-default bg-background-primary-default px-2 py-1.5 text-body-medium text-text-primary outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption-1-regular text-text-tertiary">To</span>
          <input
            type="time"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="rounded-2lg border border-border-button-default bg-background-primary-default px-2 py-1.5 text-body-medium text-text-primary outline-none"
          />
        </label>
        <Button size="small" leadingIcon={RiAddLine} onClick={add}>
          Add
        </Button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {blocks.map((block) => (
          <li
            key={block.blockId}
            className="flex items-center justify-between gap-3 rounded-2lg border border-border-table p-3"
          >
            <span className="min-w-0 truncate text-body-medium text-text-primary">
              {block.label} · {WEEKDAY_LABEL[block.weekday]}{" "}
              {minutesToLabel(block.startMinute)}–{minutesToLabel(block.endMinute)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(block.blockId)}
              aria-label={`Remove ${block.label}`}
              className="shrink-0 rounded-2lg p-1.5 text-foreground-icon-tertiary hover:bg-background-secondary-hover"
            >
              <RiDeleteBinLine className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "09:30" -> 570. Null for anything the browser did not give us as HH:MM. */
function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function AnalysisStrip({ analysis }: { analysis: PlanAnalysisDetail }) {
  const hard = analysis.conflicts.filter((c) => c.severity === "hard").length;
  const soft = analysis.conflicts.length - hard;
  return (
    <div className="flex flex-wrap gap-2">
      <Chip>
        {analysis.creditsMin === analysis.creditsMax
          ? `${analysis.creditsMax} credits`
          : `${analysis.creditsMin}–${analysis.creditsMax} credits`}
      </Chip>
      {hard > 0 && <Chip>{hard} hard conflict{hard === 1 ? "" : "s"}</Chip>}
      {soft > 0 && <Chip>{soft} tight walk{soft === 1 ? "" : "s"}</Chip>}
      {analysis.daysWithNoClasses.length > 0 && (
        <Chip>
          Free: {analysis.daysWithNoClasses.map((day) => WEEKDAY_LABEL[day]).join(", ")}
        </Chip>
      )}
    </div>
  );
}
