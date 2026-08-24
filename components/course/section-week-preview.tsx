"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RiAlertLine } from "@remixicon/react";

import { CalendarWeekPreview } from "@/components/schedule/calendar-week-preview";
import { ownerIdOf, toWeekGridBlocks } from "@/components/schedule/to-blocks";
import { usePlans } from "@/hooks/use-plans";
import { getSections } from "@/lib/data/catalog";
import type { Section, TermCode, Weekday } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * This section, dropped onto the reader's own week.
 *
 * Renders through `CalendarWeekPreview` — the same Nuxt calendar blocks and
 * tokens as the schedule tab — narrowed to this section's meeting days and
 * read-only. See that module for why the canvas is section-scoped rather than
 * a second schedule page.
 */

/** Below this width the preview becomes an agenda list (spec §18). */
const COMPACT_THRESHOLD_PX = 7.65 * 16 * 2 + 3.75 * 16;

export interface SectionWeekPreviewProps {
  section: Section;
  termCode: TermCode;
  className?: string;
}

export function SectionWeekPreview({ section, termCode, className }: SectionWeekPreviewProps) {
  const plans = usePlans(termCode);
  const primaryPlan = plans.find((plan) => plan.isPrimary) ?? null;
  const planSectionIds = primaryPlan?.sectionIds ?? [];
  const planKey = planSectionIds.join(",");

  const [resolved, setResolved] = useState<{ key: string; sections: Section[] }>({
    key: "",
    sections: [],
  });

  useEffect(() => {
    if (planKey === "") return;
    let cancelled = false;
    getSections(planKey.split(","))
      .then((sections) => {
        if (!cancelled) setResolved({ key: planKey, sections });
      })
      .catch(() => {
        if (!cancelled) setResolved({ key: planKey, sections: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [planKey]);

  const isSaved = planSectionIds.includes(section.sectionId);

  const meetingDays = useMemo(
    () => [...new Set(section.meetings.map((meeting) => meeting.weekday))],
    [section.meetings],
  );

  const commitmentIds = useMemo(
    () => new Set((primaryPlan?.customBlocks ?? []).map((block) => block.blockId)),
    [primaryPlan?.customBlocks],
  );

  const blocks = useMemo(() => {
    const planSections = resolved.key === planKey ? resolved.sections : [];
    const others = planSections.filter((other) => other.sectionId !== section.sectionId);
    const all = toWeekGridBlocks({
      sections: isSaved ? [...others, section] : others,
      customBlocks: primaryPlan?.customBlocks ?? [],
      candidateSections: isSaved ? [] : [section],
    });
    const drawn = new Set<Weekday>(meetingDays);
    return all.filter((block) => drawn.has(block.weekday));
  }, [isSaved, meetingDays, planKey, primaryPlan?.customBlocks, resolved, section]);

  const clashesWith = useMemo(() => {
    const names = new Set<string>();
    for (const block of blocks) {
      if (block.tone !== "conflict") continue;
      if (ownerIdOf(block.blockId) === section.sectionId) continue;
      names.add(block.label);
    }
    return [...names];
  }, [blocks, section.sectionId]);

  const frameRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setIsNarrow(entry.contentRect.width < COMPACT_THRESHOLD_PX);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  if (section.meetings.length === 0) return null;

  return (
    <div ref={frameRef} className={cx("flex w-full flex-col gap-3", className)}>
      {clashesWith.length > 0 ? (
        <p className="flex items-start gap-2 text-body-regular text-status-rose-text">
          <RiAlertLine aria-hidden className="mt-px size-4 shrink-0" />
          <span>Overlaps {clashesWith.join(" and ")} in your plan.</span>
        </p>
      ) : null}

      <CalendarWeekPreview
        blocks={blocks}
        weekdays={meetingDays}
        termCode={termCode}
        commitmentIds={commitmentIds}
        compact={isNarrow}
        className="w-full"
      />
    </div>
  );
}
