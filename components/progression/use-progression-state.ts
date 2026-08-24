"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { ProgressionGraph } from "@/lib/prereqs/graph";
import {
  analyzeFourYearPlan,
  createEmptyPlan,
  earliestFeasibleTerm,
  suggestPlan,
  type FourYearPlan,
} from "@/lib/progression/plan";
import {
  getProgressionServerSnapshot,
  getProgressionSnapshot,
  parseProgression,
  subscribeToProgression,
  writeProgression,
  type StoredProgression,
} from "./progression-storage";

/**
 * The progression screen's state, and where it lives.
 *
 * ── Why localStorage, and why that is temporary ─────────────────────────────
 *
 * Spec §15: writes require an account, reads are free. A four-year plan is a
 * write, and there is no auth lane yet, so it lives in the browser. That is not
 * a stand-in so much as the correct behaviour for a signed-out student, who
 * should be able to plan without handing over an identity first. When Supabase
 * SSO lands, `progression-storage.ts` grows a sync seam and nothing above this
 * hook changes.
 *
 * There is no React state here at all. Every mutation writes to the store and
 * the store notifies; the derived analysis is memoized on the stored value. One
 * source of truth, no effects, and two tabs stay in step for free.
 */

export interface ProgressionState {
  completed: ReadonlySet<string>;
  plan: FourYearPlan;
  analysis: ReturnType<typeof analyzeFourYearPlan>;
  /** Every course placed anywhere in the plan. */
  placed: ReadonlySet<string>;
  toggleCompleted: (courseId: string) => void;
  moveCourse: (courseId: string, toTermKey: string) => void;
  removeCourse: (courseId: string, fromTermKey: string) => void;
  /** Drop a course into the earliest term where its prerequisites are met. */
  addCourseAutomatically: (courseId: string) => void;
  autoBuild: (goals: readonly string[]) => { unplaced: string[]; assumedExternal: string[] };
  reset: () => void;
}

export function useProgressionState(
  graph: ProgressionGraph,
  startYear: number,
): ProgressionState {
  const raw = useSyncExternalStore(
    subscribeToProgression,
    getProgressionSnapshot,
    getProgressionServerSnapshot,
  );

  const stored = useMemo<StoredProgression>(() => {
    return (
      parseProgression(raw) ?? { completed: [], plan: createEmptyPlan(startYear) }
    );
  }, [raw, startYear]);

  const completed = useMemo(() => new Set(stored.completed), [stored.completed]);
  const plan = stored.plan;

  const analysis = useMemo(() => analyzeFourYearPlan(graph, plan), [graph, plan]);
  const placed = useMemo(
    () => new Set(plan.terms.flatMap((term) => term.courseIds)),
    [plan],
  );

  /**
   * Every mutation is expressed as a transform over the *current* stored value
   * rather than over the closed-over one, so two updates in the same tick
   * cannot lose one another.
   */
  const update = useCallback(
    (transform: (current: StoredProgression) => StoredProgression) => {
      const current =
        parseProgression(getProgressionSnapshot()) ?? {
          completed: [],
          plan: createEmptyPlan(startYear),
        };
      writeProgression(transform(current));
    },
    [startYear],
  );

  const toggleCompleted = useCallback(
    (courseId: string) => {
      update((current) => ({
        ...current,
        completed: current.completed.includes(courseId)
          ? current.completed.filter((id) => id !== courseId)
          : [...current.completed, courseId],
      }));
    },
    [update],
  );

  /** A course belongs to exactly one term, so a move is a remove plus an add. */
  const moveCourse = useCallback(
    (courseId: string, toTermKey: string) => {
      update((current) => ({
        ...current,
        plan: {
          ...current.plan,
          terms: current.plan.terms.map((term) => {
            const without = term.courseIds.filter((id) => id !== courseId);
            if (term.termKey !== toTermKey) return { ...term, courseIds: without };
            return { ...term, courseIds: [...without, courseId] };
          }),
        },
      }));
    },
    [update],
  );

  const removeCourse = useCallback(
    (courseId: string, fromTermKey: string) => {
      update((current) => ({
        ...current,
        plan: {
          ...current.plan,
          terms: current.plan.terms.map((term) =>
            term.termKey === fromTermKey
              ? { ...term, courseIds: term.courseIds.filter((id) => id !== courseId) }
              : term,
          ),
        },
      }));
    },
    [update],
  );

  const addCourseAutomatically = useCallback(
    (courseId: string) => {
      update((current) => {
        if (current.plan.terms.some((term) => term.courseIds.includes(courseId))) {
          return current;
        }
        // Falling back to the last term rather than refusing the add: a course
        // whose chain does not fit is still one the student asked for, and the
        // board will show exactly why it does not work where it landed.
        const target =
          earliestFeasibleTerm(graph, current.plan, courseId) ??
          current.plan.terms[current.plan.terms.length - 1];

        return {
          ...current,
          plan: {
            ...current.plan,
            terms: current.plan.terms.map((term) =>
              term.termKey === target.termKey
                ? { ...term, courseIds: [...term.courseIds, courseId] }
                : term,
            ),
          },
        };
      });
    },
    [graph, update],
  );

  const autoBuild = useCallback(
    (goals: readonly string[]) => {
      const result = suggestPlan(graph, goals, { startYear, alreadyCompleted: completed });
      update((current) => ({
        ...current,
        plan: { ...result.plan, planId: current.plan.planId, name: current.plan.name },
      }));
      return { unplaced: result.unplaced, assumedExternal: result.assumedExternal };
    },
    [graph, startYear, completed, update],
  );

  const reset = useCallback(() => {
    writeProgression({ completed: [], plan: createEmptyPlan(startYear) });
  }, [startYear]);

  return {
    completed,
    plan,
    analysis,
    placed,
    toggleCompleted,
    moveCourse,
    removeCourse,
    addCourseAutomatically,
    autoBuild,
    reset,
  };
}
