"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { WeekGridBlock } from "@/components/course/contracts";
import { usePlans } from "@/hooks/use-plans";
import { CURRENT_TERM } from "@/lib/constants";
import { getCoursesByIds, getSections } from "@/lib/data/catalog";
import { refreshPlansFromServer } from "@/lib/db/plan-sync";
import { analyzePlan, PlanWriteDeniedError, planStore, type PlanAnalysisDetail } from "@/lib/schedule";
import { toast } from "@/lib/toast/store";
import { signIn } from "@/lib/db/auth";
import type { Course, Plan, Section, TermCode } from "@/lib/types";

import { toWeekGridBlocks } from "./to-blocks";

/**
 * The student's one schedule for a term, resolved and analysed.
 *
 * ── One plan ──────────────────────────────────────────────────────────────
 *
 * The store still holds a list, because the sync and the MCP adapters speak
 * that shape and it costs nothing to keep. But the product has one schedule:
 * the primary plan for the term, created on first visit. Nothing here can
 * create a second, and nothing renders a switcher.
 *
 * ── Server first, then local ──────────────────────────────────────────────
 *
 * The chat can add a class from the server side. A mount-time pull (remote
 * wins) is what makes "add COMS 4111 to my schedule" in the chat and then
 * opening this tab show the class, without the student reloading.
 */

export interface ScheduleState {
  termCode: TermCode;
  plan: Plan | null;
  sections: Section[];
  courses: Course[];
  courseById: Map<string, Course>;
  sectionById: Map<string, Section>;
  analysis: PlanAnalysisDetail | null;
  blocks: WeekGridBlock[];
  commitmentIds: Set<string>;
  isResolving: boolean;
  addSection: (sectionId: string) => boolean;
  removeSection: (sectionId: string) => void;
  removeBlock: (blockId: string) => void;
}

interface Resolved {
  key: string;
  sections: Section[];
  courses: Course[];
}

const NONE: Resolved = { key: "", sections: [], courses: [] };

export function useSchedule(termCode: TermCode = CURRENT_TERM): ScheduleState {
  const plans = usePlans(termCode);
  const plan = useMemo(() => plans.find((p) => p.isPrimary) ?? plans[0] ?? null, [plans]);
  const [resolved, setResolved] = useState<Resolved>(NONE);

  // Adopt what the server has before trusting the local cache.
  useEffect(() => {
    void refreshPlansFromServer(termCode);
  }, [termCode]);

  // First visit: the schedule exists before the student does anything.
  useEffect(() => {
    if (plans.length > 0) return;
    planStore.createPlan({ name: "My schedule", termCode });
  }, [plans.length, termCode]);

  const sectionKey = (plan?.sectionIds ?? []).join(",");

  useEffect(() => {
    if (sectionKey === "") return;
    let active = true;
    void (async () => {
      try {
        const sections = await getSections(sectionKey.split(","));
        const courses = await getCoursesByIds([...new Set(sections.map((s) => s.courseId))], termCode);
        if (active) setResolved({ key: sectionKey, sections, courses });
      } catch (cause) {
        if (!active) return;
        toast.error({
          title: "Couldn't load your classes",
          description: cause instanceof Error ? cause.message : "Please try again.",
          dedupeKey: "schedule-resolve",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [sectionKey, termCode]);

  const current = resolved.key === sectionKey ? resolved : NONE;
  // Keep what we have while a new id set is in flight: a removed class leaves
  // on the same commit, an added one appears when it arrives.
  const sections = useMemo(() => {
    const ids = new Set(sectionKey ? sectionKey.split(",") : []);
    const known = current.sections.length > 0 ? current.sections : resolved.sections;
    return known.filter((section) => ids.has(section.sectionId));
  }, [current.sections, resolved.sections, sectionKey]);
  const courses = current.courses.length > 0 ? current.courses : resolved.courses;

  const analysis = useMemo(
    () => (plan ? analyzePlan({ sections, courses, blocks: plan.customBlocks }) : null),
    [plan, sections, courses],
  );

  const blocks = useMemo(
    () => (plan ? toWeekGridBlocks({ sections, customBlocks: plan.customBlocks }) : []),
    [plan, sections],
  );

  const commitmentIds = useMemo(
    () => new Set((plan?.customBlocks ?? []).map((block) => block.blockId)),
    [plan?.customBlocks],
  );

  const guard = useCallback((run: () => void): boolean => {
    try {
      run();
      return true;
    } catch (cause) {
      if (cause instanceof PlanWriteDeniedError) {
        toast.info({
          title: "Sign in to save your schedule",
          description: cause.message,
          dedupeKey: "schedule-auth",
          action: { label: "Sign in", onPress: () => void signIn() },
        });
        return false;
      }
      toast.error({
        title: "Couldn't update your schedule",
        description: cause instanceof Error ? cause.message : "Please try again.",
        dedupeKey: "schedule-write",
      });
      return false;
    }
  }, []);

  const addSection = useCallback(
    (sectionId: string) => (plan ? guard(() => planStore.addSection(plan.planId, sectionId)) : false),
    [plan, guard],
  );
  const removeSection = useCallback(
    (sectionId: string) => {
      if (plan) guard(() => planStore.removeSection(plan.planId, sectionId));
    },
    [plan, guard],
  );
  const removeBlock = useCallback(
    (blockId: string) => {
      if (plan) guard(() => planStore.removeBlock(plan.planId, blockId));
    },
    [plan, guard],
  );

  return {
    termCode,
    plan,
    sections,
    courses,
    courseById: useMemo(() => new Map(courses.map((course) => [course.courseId, course])), [courses]),
    sectionById: useMemo(() => new Map(sections.map((section) => [section.sectionId, section])), [sections]),
    analysis,
    blocks,
    commitmentIds,
    isResolving: sectionKey !== "" && resolved.key !== sectionKey,
    addSection,
    removeSection,
    removeBlock,
  };
}
