"use client";

import {
  RiAddLine,
  RiCheckLine,
  RiFileTextLine,
  RiLockUnlockLine,
  RiRouteLine,
} from "@remixicon/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import {
  ancestors,
  descendants,
  evaluateCourse,
  type ProgressionGraph,
} from "@/lib/prereqs/graph";
import { courseLabel } from "@/lib/progression/catalog";
import { PrereqTreeView } from "./prereq-tree-view";
import { cx } from "@/utils/cx";

/**
 * Everything known about the focused course, in the order a student needs it.
 *
 * The published prose sits at the bottom, under the parsed reading, and is
 * never hidden behind a toggle. The parse is a best-effort translation of
 * genuinely ambiguous English — the repo's rule that provenance travels with
 * the data applies to a parsed prerequisite exactly as it does to a seat
 * count. A student about to plan four years around this needs to be able to
 * check our reading against the registrar's words.
 */

/**
 * Shorter than the map's 320ms camera move on purpose: the panel should have
 * resolved and be readable by the time the camera settles, rather than still
 * arriving after it.
 *
 * The curve is a literal only because `motion` JS configs cannot read a CSS
 * custom property. It is the same cubic-bezier as the `--ease-out` token in
 * styles/theme.css -- if that token is ever retuned, this array has to be
 * updated by hand to match.
 */
const PANEL_TRANSITION = { duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const;

export interface CourseDetailPanelProps {
  graph: ProgressionGraph;
  courseId: string;
  completed: ReadonlySet<string>;
  onSelectCourse: (courseId: string) => void;
  onToggleCompleted: (courseId: string) => void;
  onAddToPlan?: (courseId: string) => void;
}

const STATUS_CHIP = {
  met: { color: "lime" as const, label: "Prerequisites met" },
  unmet: { color: "rose" as const, label: "Prerequisites not met" },
  unknown: { color: "yellow" as const, label: "Check with the department" },
};

export function CourseDetailPanel({
  graph,
  courseId,
  completed,
  onSelectCourse,
  onToggleCompleted,
  onAddToPlan,
}: CourseDetailPanelProps) {
  const course = graph.courses.get(courseId);
  const evaluation = evaluateCourse(graph, courseId, completed);
  const directUnlocks = graph.unlocks.get(courseId) ?? [];
  const reach = descendants(graph, courseId).length;
  const chain = ancestors(graph, courseId).length;
  const isCompleted = completed.has(courseId);
  /*
   * Reduced motion keeps the crossfade and drops the 4px travel. The fade is
   * the comprehension aid here -- it is what tells the reader the panel now
   * describes a different course -- so suppressing it entirely would remove the
   * signal rather than soften it.
   */
  const shouldReduceMotion = useReducedMotion();
  const offset = shouldReduceMotion ? 0 : 4;

  if (!course) {
    return (
      <aside className="flex flex-col gap-2 rounded-2lg border border-dashed border-border-button-default bg-background-secondary-default p-4">
        <h3 className="text-md-semibold text-text-primary">{courseLabel(graph, courseId)}</h3>
        <p className="text-caption-1-regular text-text-secondary">
          Named by a prerequisite, but described on a department page this catalog has not
          ingested yet. Its own prerequisites are unknown.
        </p>
      </aside>
    );
  }

  const status = STATUS_CHIP[evaluation.status];

  return (
    <aside className="rounded-2lg border border-border-table bg-background-primary-default p-4">
      {/*
        The frame -- border, background, radius, padding -- deliberately does not
        move. Only what it contains is replaced, so the panel reads as being
        re-filled rather than swapped out.

        `mode="wait"` so the outgoing course clears before the incoming one
        arrives; overlapping them puts two titles on top of each other mid-fade.
        `initial={false}` so nothing animates on first paint.
      */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={courseId}
          initial={{ opacity: 0, transform: `translateY(${offset}px)` }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transform: `translateY(-${offset}px)` }}
          transition={PANEL_TRANSITION}
          className="flex min-w-0 flex-col gap-4"
        >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-caption-1-semibold tracking-[0.08em] text-text-tertiary uppercase">
            {courseLabel(graph, courseId)}
          </span>
          <Chip variant="caption" color={isCompleted ? "cyan" : status.color}>
            {isCompleted ? "Already taken" : status.label}
          </Chip>
        </div>

        <h2 className="text-title-1-medium text-balance text-text-primary">{course.title}</h2>

        <div className="text-caption-1-regular flex flex-wrap items-center gap-x-3 gap-y-1 text-text-tertiary">
          {course.points !== null && <span>{course.points} points</span>}
          <span className="inline-flex items-center gap-1">
            <RiRouteLine className="size-3.5" aria-hidden />{" "}
            {chain === 1 ? "1 course comes" : `${chain} courses come`} before it
          </span>
          <span className="inline-flex items-center gap-1">
            <RiLockUnlockLine className="size-3.5" aria-hidden /> {reach} downstream
          </span>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          variant={isCompleted ? "secondary" : "primary"}
          leadingIcon={RiCheckLine}
          onClick={() => onToggleCompleted(courseId)}
        >
          {isCompleted ? "Not taken after all" : "I've taken this"}
        </Button>
        {onAddToPlan && (
          <Button size="small" variant="secondary" leadingIcon={RiAddLine} onClick={() => onAddToPlan(courseId)}>
            Add to plan
          </Button>
        )}
      </div>

      <Section title="Prerequisites">
        {course.prereq?.tree ? (
          <PrereqTreeView
            node={course.prereq.tree}
            graph={graph}
            completed={completed}
            onSelectCourse={onSelectCourse}
          />
        ) : (
          <p className="text-caption-1-regular text-text-secondary">
            No course prerequisite the bulletin states in a checkable form.
          </p>
        )}

        {course.prereq?.corequisites && (
          <div className="mt-3 flex flex-col gap-1.5">
            <span className="text-caption-1-semibold tracking-[0.08em] text-text-tertiary uppercase">
              Alongside
            </span>
            <PrereqTreeView
              node={course.prereq.corequisites}
              graph={graph}
              completed={completed}
              onSelectCourse={onSelectCourse}
              stackRoot={false}
            />
          </div>
        )}

        {course.prereq?.instructorPermission && (
          <p className="text-caption-1-regular mt-3 text-text-tertiary">
            The bulletin also allows the instructor&rsquo;s permission in place of the above.
          </p>
        )}

        {(course.prereq?.advisories.length ?? 0) > 0 && (
          <ul className="mt-3 flex flex-col gap-1">
            {course.prereq?.advisories.map((advisory) => (
              <li
                key={advisory}
                className="text-caption-1-regular flex gap-2 text-text-secondary before:text-text-tertiary before:content-['—']"
              >
                {advisory}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {course.equivalents.length > 0 && (
        <Section title="Counts as the same course">
          <div className="flex flex-wrap gap-1.5">
            {course.equivalents.map((equivalentId) => (
              <button
                key={equivalentId}
                type="button"
                onClick={() => onSelectCourse(equivalentId)}
                className="text-caption-1-medium rounded-md border border-border-table bg-background-secondary-default px-1.5 py-0.5 text-text-secondary hover:border-accent-500"
              >
                {courseLabel(graph, equivalentId)}
              </button>
            ))}
          </div>
          <p className="text-caption-1-regular mt-2 text-text-tertiary">
            The registrar grants credit for only one of these.
          </p>
        </Section>
      )}

      <Section
        title={`Unlocks ${directUnlocks.length} course${directUnlocks.length === 1 ? "" : "s"} directly`}
      >
        {directUnlocks.length === 0 ? (
          <p className="text-caption-1-regular text-text-secondary">
            Nothing in this catalog lists it as a prerequisite.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {directUnlocks.map((unlockedId) => {
              const unlocked = graph.courses.get(unlockedId);
              const opensNow =
                evaluateCourse(graph, unlockedId, new Set([...completed, courseId])).status !==
                "unmet";
              return (
                <li key={unlockedId}>
                  <button
                    type="button"
                    onClick={() => onSelectCourse(unlockedId)}
                    className={cx(
                      "flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left transition-colors duration-150",
                      "hover:bg-background-secondary-hover",
                    )}
                  >
                    <span className="text-caption-1-medium w-[86px] shrink-0 text-text-primary">
                      {courseLabel(graph, unlockedId)}
                    </span>
                    <span className="text-caption-1-regular min-w-0 flex-1 truncate text-text-secondary">
                      {unlocked?.title ?? "—"}
                    </span>
                    {/* The distinction that matters when choosing between two
                        intro courses: which one actually opens something next
                        term, rather than three years from now. */}
                    {opensNow && (
                      <Chip variant="caption" color="lime">
                        opens next
                      </Chip>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {course.prereq && (
        <Section title="As the bulletin prints it">
          <p className="text-caption-1-regular flex gap-2 rounded-md bg-background-secondary-default p-2.5 text-text-secondary">
            <RiFileTextLine className="mt-0.5 size-3.5 shrink-0 text-text-tertiary" aria-hidden />
            <span className="min-w-0">{course.prereq.rawText}</span>
          </p>
        </Section>
      )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-separator-border pt-3 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className="text-caption-1-semibold tracking-[0.08em] text-text-tertiary uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
