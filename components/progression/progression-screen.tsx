"use client";

import { useCallback, useMemo, useState } from "react";
import {
  RiFlashlightLine,
  RiNodeTree,
  RiCalendarScheduleLine,
  RiRefreshLine,
} from "@remixicon/react";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { getProgressionGraph, courseLabel } from "@/lib/progression/catalog";
import { PrereqMap } from "./prereq-map";
import { CourseDetailPanel } from "./course-detail-panel";
import { CourseTray } from "./course-tray";
import { PlanBoard } from "./plan-board";
import { useProgressionState } from "./use-progression-state";
import { cx } from "@/utils/cx";

/**
 * The progression screen.
 *
 * Two views over one state. The map answers "where does this course lead"; the
 * board answers "does my four years actually work". They share the completed-
 * courses set deliberately: marking COMS W1004 as taken re-colours the map and
 * clears prerequisite errors on the board at the same time, which is the whole
 * reason they belong on one screen rather than two routes.
 *
 * This is a client component in full. Every interaction here — focus changes,
 * drag and drop, marking a course taken — recomputes the graph evaluation, and
 * the graph is a 90KB static import that costs nothing to keep in the browser.
 * A server round trip per click would be slower and buy nothing.
 */

export type ProgressionView = "map" | "plan";

export interface ProgressionScreenProps {
  /** Calendar year of the plan's first Fall term. */
  startYear: number;
  initialCourseId: string;
}

export function ProgressionScreen({ startYear, initialCourseId }: ProgressionScreenProps) {
  const graph = useMemo(() => getProgressionGraph(), []);
  const [view, setView] = useState<ProgressionView>("map");
  const [focusCourseId, setFocusCourseId] = useState(initialCourseId);
  const [autoBuildNote, setAutoBuildNote] = useState<string | null>(null);

  const state = useProgressionState(graph, startYear);

  const errorCount = state.analysis.issues.filter((issue) => issue.severity === "error").length;
  const warningCount = state.analysis.issues.filter((issue) => issue.severity === "warning").length;

  const handleAutoBuild = () => {
    // The plan is built toward what is already on the board. With an empty
    // board there is no goal to aim at, and inventing one would be guessing at
    // a degree requirement this catalog does not model.
    const goals = [...state.placed];
    if (goals.length === 0) {
      setAutoBuildNote("Add the courses you want to end up taking, then build the plan around them.");
      return;
    }
    const { unplaced, assumedExternal } = state.autoBuild(goals);
    setAutoBuildNote(
      [
        unplaced.length > 0
          ? `${unplaced.length} course${unplaced.length === 1 ? "" : "s"} did not fit in four years.`
          : "Every course fits, prerequisites first.",
        assumedExternal.length > 0
          ? `Assumes you take ${assumedExternal.map((id) => courseLabel(graph, id)).join(", ")} outside this department.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          selectedKeys={[view]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next === "map" || next === "plan") setView(next);
          }}
        >
          {/*
            The control's own `py-1` is 28px — two adjacent targets, and this
            pair is how the whole screen changes mode. The base component is
            shared, so the touch height is asked for here rather than widened
            for every surface that uses it.
          */}
          <SegmentedControlItem id="map" className="pointer-coarse:py-2.5">
            Prerequisite map
          </SegmentedControlItem>
          <SegmentedControlItem id="plan" className="pointer-coarse:py-2.5">
            Four-year plan
          </SegmentedControlItem>
        </SegmentedControl>

        <div className="flex flex-wrap items-center gap-2">
          {view === "plan" && (
            <>
              {errorCount > 0 && (
                <Chip variant="caption" color="rose">
                  {errorCount} blocking
                </Chip>
              )}
              {warningCount > 0 && (
                <Chip variant="caption" color="yellow">
                  {warningCount} to check
                </Chip>
              )}
              {errorCount === 0 && warningCount === 0 && state.placed.size > 0 && (
                <Chip variant="caption" color="lime">
                  Order works
                </Chip>
              )}
              <Button size="small" variant="secondary" leadingIcon={RiFlashlightLine} onClick={handleAutoBuild}>
                Build the order
              </Button>
              <Button
                size="small"
                variant="ghost"
                leadingIcon={RiRefreshLine}
                onClick={() => {
                  state.reset();
                  setAutoBuildNote(null);
                }}
              >
                Clear
              </Button>
            </>
          )}
          {state.completed.size > 0 && (
            <Chip variant="caption" color="cyan">
              {state.completed.size} taken
            </Chip>
          )}
        </div>
      </div>

      {view === "plan" && autoBuildNote && (
        <p className="text-caption-1-regular rounded-md bg-background-secondary-default px-3 py-2 text-text-secondary">
          {autoBuildNote}
        </p>
      )}

      {view === "map" ? (
        <MapView
          graph={graph}
          focusCourseId={focusCourseId}
          onFocusChange={setFocusCourseId}
          state={state}
        />
      ) : (
        <PlanView graph={graph} focusCourseId={focusCourseId} onFocusChange={setFocusCourseId} state={state} />
      )}
    </div>
  );
}

type State = ReturnType<typeof useProgressionState>;

function MapView({
  graph,
  focusCourseId,
  onFocusChange,
  state,
}: {
  graph: ReturnType<typeof getProgressionGraph>;
  focusCourseId: string;
  onFocusChange: (courseId: string) => void;
  state: State;
}) {
  const [truncated, setTruncated] = useState(0);
  const onTruncated = useCallback((count: number) => setTruncated(count), []);

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[232px_minmax(0,1fr)_322px]">
      <CourseTray
        graph={graph}
        completed={state.completed}
        selectedCourseId={focusCourseId}
        onSelectCourse={onFocusChange}
        className="max-h-[660px] rounded-2lg border border-border-table bg-background-primary-default p-3"
      />

      <div className="flex min-w-0 flex-col gap-2">
        <div className="h-[660px] min-w-0 overflow-hidden rounded-2lg border border-border-table bg-background-secondary-default">
          <PrereqMap
            graph={graph}
            focusCourseId={focusCourseId}
            completed={state.completed}
            onFocusChange={onFocusChange}
            onTruncated={onTruncated}
          />
        </div>
        <MapLegend truncated={truncated} />
      </div>

      <CourseDetailPanel
        graph={graph}
        courseId={focusCourseId}
        completed={state.completed}
        onSelectCourse={onFocusChange}
        onToggleCompleted={state.toggleCompleted}
        onAddToPlan={state.addCourseAutomatically}
      />
    </div>
  );
}

function PlanView({
  graph,
  focusCourseId,
  onFocusChange,
  state,
}: {
  graph: ReturnType<typeof getProgressionGraph>;
  focusCourseId: string;
  onFocusChange: (courseId: string) => void;
  state: State;
}) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2 rounded-2lg border border-border-table bg-background-primary-default p-3">
        <h3 className="text-caption-1-semibold tracking-[0.08em] text-text-tertiary uppercase">
          Drag a course into a term
        </h3>
        <CourseTray
          graph={graph}
          completed={state.completed}
          placed={state.placed}
          selectedCourseId={focusCourseId}
          onSelectCourse={onFocusChange}
          draggable
          className="max-h-[660px]"
        />
      </div>

      <PlanBoard
        graph={graph}
        plan={state.plan}
        analysis={state.analysis}
        onMoveCourse={state.moveCourse}
        onRemoveCourse={state.removeCourse}
      />
    </div>
  );
}

/**
 * The legend is not optional decoration. Dashed-versus-solid is carrying the
 * difference between "one of three ways in" and "the only way in", and a
 * reader cannot recover that from the drawing alone.
 */
function MapLegend({ truncated }: { truncated: number }) {
  return (
    <div className="text-caption-1-regular flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-text-tertiary">
      <LegendRule className="bg-text-tertiary" label="required" />
      <LegendRule
        className="bg-[repeating-linear-gradient(to_right,var(--color-text-tertiary)_0_5px,transparent_5px_9px)]"
        label="one of several"
      />
      <LegendRule
        className="bg-[repeating-linear-gradient(to_right,var(--color-text-tertiary)_0_1px,transparent_1px_6px)]"
        label="alongside"
      />
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-1 rounded-full bg-status-lime-text" aria-hidden />
        eligible now
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-1 rounded-full bg-status-yellow-text" aria-hidden />
        depends on a prose requirement
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-1 rounded-full bg-accent-500" aria-hidden />
        taken
      </span>
      <span className="inline-flex items-center gap-1">
        <RiNodeTree className="size-3.5" aria-hidden />
        click any course to re-centre
      </span>
      {truncated > 0 && (
        <span className="text-status-yellow-text">
          {truncated} further course{truncated === 1 ? "" : "s"} off-canvas — the panel lists them
          all
        </span>
      )}
    </div>
  );
}

function LegendRule({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("h-px w-6", className)} aria-hidden />
      {label}
    </span>
  );
}

export { RiCalendarScheduleLine };
