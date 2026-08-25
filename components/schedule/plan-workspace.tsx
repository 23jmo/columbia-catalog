"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RiAddLine, RiCalendarLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { Notification, NotificationViewport } from "@/components/base/notification/notification";
import { AddFromSaved } from "@/components/schedule/add-from-saved";
import { CalendarShell } from "@/components/schedule/calendar-shell";
import { ownerIdOf, toWeekGridBlocks } from "@/components/schedule/to-blocks";
import type { SourcedBlock } from "@/components/schedule/calendar-types";
import { usePlans } from "@/hooks/use-plans";
import { CURRENT_TERM, buildTerm } from "@/lib/constants";
import { getCoursesByIds, getSections } from "@/lib/data/catalog";
import { getTypicalMeetings, type TypicalMeetingPattern } from "@/lib/db/typical-meetings";
import { signIn } from "@/lib/db/auth";
import {
  analyzePlan,
  copyName,
  icsFilename,
  nextPlanName,
  PlanWriteDeniedError,
  planToIcs,
  planStore,
  termBounds,
  type PlanAnalysisDetail,
} from "@/lib/schedule";
import type { Course, CustomBlock, Section, Term, TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * The interactive planner — spec §8.
 *
 * Data and mutations live here. The Nuxt-style calendar (`CalendarShell`)
 * owns view state. Historical meeting patterns still render as a separate
 * layer so a guess never looks like a published time.
 */

export interface PlanWorkspaceProps {
  termCode?: TermCode;
  /**
   * The term row, when the server has one. Carries the real first and last day
   * of instruction, which a term code cannot imply — without it the `.ics`
   * export bounds its recurrences with a per-season estimate that is several
   * days out in both directions.
   */
  term?: Term;
  className?: string;
}

interface Resolved {
  sections: Section[];
  courses: Course[];
  typical: Map<string, TypicalMeetingPattern>;
}

const EMPTY: Resolved = { sections: [], courses: [], typical: new Map() };

export function PlanWorkspace({ termCode = CURRENT_TERM, term, className }: PlanWorkspaceProps) {
  const plans = usePlans(termCode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fetched, setFetched] = useState<{ key: string; data: Resolved }>({
    key: "",
    data: EMPTY,
  });
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: "auth" | "error" } | null>(null);

  // First visit: open the calendar on a default plan instead of an empty shell.
  useEffect(() => {
    if (plans.length > 0) return;
    const plan = planStore.createPlan({ name: "My schedule", termCode });
    setSelectedId(plan.planId);
  }, [plans.length, termCode]);

  const selected = useMemo(() => {
    const byId = selectedId ? plans.find((plan) => plan.planId === selectedId) : null;
    return byId ?? plans.find((plan) => plan.isPrimary) ?? plans[0] ?? null;
  }, [plans, selectedId]);

  const sectionIds = useMemo(() => selected?.sectionIds ?? [], [selected]);
  const sectionKey = sectionIds.join(",");
  const resolved = fetched.key === sectionKey ? fetched.data : EMPTY;
  const loadError = failure?.key === sectionKey ? failure.message : null;

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

  const sourced: SourcedBlock[] = useMemo(() => {
    if (!selected) return [];
    const customIds = new Set(selected.customBlocks.map((block) => block.blockId));
    const confirmed = toWeekGridBlocks({
      sections: resolved.sections,
      customBlocks: selected.customBlocks,
    }).map((block) => ({
      block,
      layer: customIds.has(ownerIdOf(block.blockId)) ? ("commitment" as const) : ("class" as const),
    }));
    const historical = [...resolved.typical.values()].flatMap((pattern) =>
      pattern.meetings.map((meeting, index) => ({
        block: {
          blockId: `typical:${pattern.sectionId}:${index}`,
          label: labelForSection(pattern.sectionId, resolved),
          sublabel: `usually ${meeting.room ?? meeting.buildingName ?? ""}`.trim(),
          weekday: meeting.weekday,
          startMinute: meeting.startMinute,
          endMinute: meeting.endMinute,
          tone: "candidate" as const,
        },
        layer: "historical" as const,
      })),
    );
    return [...confirmed, ...historical];
  }, [selected, resolved]);

  const guard = useCallback((run: () => void) => {
    try {
      run();
      setToast(null);
    } catch (cause) {
      if (cause instanceof PlanWriteDeniedError) {
        setToast({ message: cause.message, kind: "auth" });
        return;
      }
      setToast({
        message: cause instanceof Error ? cause.message : String(cause),
        kind: "error",
      });
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

  const planTerm = term ?? buildTerm(termCode);
  const bounds = termBounds(termCode, planTerm);

  return (
    <div className={cx("flex min-h-0 flex-1 flex-col", className)}>
      {loadError ? (
        <p className="rounded-2lg bg-background-secondary-default p-3 text-caption-1-regular text-text-secondary">
          {loadError}
        </p>
      ) : null}

      {toast ? (
        <NotificationViewport position="bottom-right">
          <Notification
            key={toast.message}
            status={toast.kind === "auth" ? "information" : "error"}
            title={toast.kind === "auth" ? "Sign in to add classes" : "Could not save"}
            description={toast.message}
            dismissible
            onDismiss={() => setToast(null)}
            autoDismissDuration={toast.kind === "auth" ? undefined : 6000}
            actions={
              toast.kind === "auth"
                ? [
                    {
                      label: "Sign in",
                      onClick: () => {
                        void signIn();
                      },
                    },
                  ]
                : undefined
            }
          />
        </NotificationViewport>
      ) : null}

      {!selected ? (
        <EmptyPlans onCreate={createPlan} />
      ) : (
          <CalendarShell
            plans={plans}
            selectedId={selected.planId}
            onSelectPlan={setSelectedId}
            onCreatePlan={createPlan}
            sourced={sourced}
            analysis={analysis}
            termStart={bounds.startsOn}
            termEnd={bounds.endsOn}
            sections={resolved.sections}
            courses={resolved.courses}
            customBlocks={selected.customBlocks}
            savedPicker={
              /*
                The shortlist, one click from the canvas.
                Rendered against the week rather than beside a list of what is
                already on the plan, because the decision it serves — "what
                fills this Tuesday gap" — is made looking at the calendar.
              */
              <AddFromSaved
                termCode={termCode}
                planSections={resolved.sections}
                planBlocks={selected.customBlocks}
                planSectionIds={selected.sectionIds}
                onAdd={(sectionId) =>
                  guard(() => planStore.addSection(selected.planId, sectionId))
                }
              />
            }
            onSaveBlock={(block: CustomBlock) =>
              guard(() => planStore.upsertBlock(selected.planId, block))
            }
            onRemoveBlock={(blockId) =>
              guard(() => planStore.removeBlock(selected.planId, blockId))
            }
            canExport={resolved.sections.some((section) => (section.meetings?.length ?? 0) > 0)}
            onExport={() => {
              const withTimes = resolved.sections.filter((section) => (section.meetings?.length ?? 0) > 0);
              const result = planToIcs({
                plan: { ...selected, sectionIds: withTimes.map((section) => section.sectionId) },
                sections: withTimes,
                courses: resolved.courses,
                term: planTerm,
              });
              downloadText(result.content, result.filename || icsFilename(selected), "text/calendar");
            }}
            onDuplicate={() =>
              guard(() => {
                const plan = planStore.duplicatePlan(
                  selected.planId,
                  copyName(selected.name, plans.map((plan) => plan.name)),
                );
                setSelectedId(plan.planId);
              })
            }
            onDelete={() =>
              guard(() => {
                planStore.deletePlan(selected.planId);
                setSelectedId(null);
              })
            }
            onMakePrimary={() => guard(() => planStore.setPrimaryPlan(selected.planId))}
            isPrimary={selected.isPrimary}
          />
      )}
    </div>
  );
}

function labelForSection(sectionId: string, resolved: Resolved): string {
  const section = resolved.sections.find((item) => item.sectionId === sectionId);
  if (!section) return sectionId;
  const course = resolved.courses.find((item) => item.courseId === section.courseId);
  return `${course?.courseId ?? section.courseId} ${section.sectionCode}`;
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
