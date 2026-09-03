"use client";

import { useEffect, useRef, useState } from "react";

import { plannedSectionsAction, type PlannedSection } from "@/app/onboarding/actions";
import type { CourseHit } from "@/lib/onboarding/server";
import type { GuestCourse, GuestOnboardingState } from "@/lib/onboarding/state";
import { plannedCourses } from "@/lib/onboarding/state";
import { CURRENT_TERM, termLabel } from "@/lib/constants";
import { haptic } from "@/lib/haptics";

import { ChipWrap, OptionChip, RemovableChip, courseChipLines } from "./chip";
import { CourseSearch } from "./course-search";

/**
 * The planned screen: what the student is taking THIS term.
 *
 * ── Why this screen exists ─────────────────────────────────────────────────
 *
 * The feedback that produced it: "I'm not sure how to tell your app about
 * courses I'm planning to take, or am registered for, but haven't taken yet."
 * The coursework screen is about the past and the feed is about the future,
 * and a course a student is sitting in right now fell between them — it
 * came back as a recommendation, the audit called its requirement unmet, and
 * the chat suggested things that met at the same time.
 *
 * ── It writes `source: "plan"`, and that is the whole mechanism ────────────
 *
 * The product already had a meaning for a planned course; nothing wrote it.
 * A `student_courses` row with `source = "plan"` is dropped from the
 * recommender's candidates, marked in progress by the requirements engine
 * (counted toward the group, flagged rather than ticked), pushed into the
 * search's "decided" band, and handed to the chat as `planned: true`. So
 * this screen's job is to produce those rows, and the rest of the app does
 * what it always could.
 *
 * ── The section, when there is one to choose ───────────────────────────────
 *
 * Clashes are checked against SECTIONS, not courses, so a planned course is
 * only useful to the conflict checker once we know which section. Most
 * courses have one this term, and that one is chosen silently. When there
 * are several, the screen asks — days and times, not call numbers — and the
 * chosen id goes onto the schedule when the flow finishes. Not answering is
 * allowed: the course still counts everywhere else, it just cannot be
 * clash-checked.
 *
 * Transcript rows with no grade arrive here already, as chips without a
 * section; tapping one opens the same chooser.
 */

export interface StepPlannedProps {
  state: GuestOnboardingState;
  addCourse: (course: GuestCourse) => void;
  removeCourse: (courseId: string) => void;
  setSection: (courseId: string, sectionId: string | null) => void;
}

interface Chooser {
  courseId: string;
  label: string;
  sections: PlannedSection[];
}

export function StepPlanned({ state, addCourse, removeCourse, setSection }: StepPlannedProps) {
  const planned = plannedCourses(state);
  /**
   * EVERY course on the record, not only the planned ones. A course already
   * recorded as taken must read "added" in the search rather than be offered:
   * `upsertCourse` replaces the row wholesale, so adding it here would turn
   * a taken course into a planned one and drop it from the audit and the
   * "what you liked" screen without a word.
   */
  const recordedIds = new Set(state.courses.map((course) => course.courseId));
  /** Latest planned ids, for the async lookup to check against after it lands. */
  const plannedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    plannedIds.current = new Set(planned.map((course) => course.courseId));
  });
  const [chooser, setChooser] = useState<Chooser | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Courses we looked up and found no section for this term. */
  const [unoffered, setUnoffered] = useState<Set<string>>(() => new Set());

  /**
   * Look the sections up and decide whether there is a question to ask.
   * One section: answered. None (a course not offered this term, or one we
   * hold no meeting data for): nothing to ask. Several: the chooser.
   */
  const resolveSections = async (courseId: string, label: string) => {
    setError(null);
    const result = await plannedSectionsAction(courseId);
    // Removed while we were looking: a chooser for it would offer options
    // that set a section on nothing.
    if (!plannedIds.current.has(courseId)) return;
    if (!result.ok) {
      setError(result.error ?? "We could not look up that course's sections.");
      return;
    }
    const sections = result.sections ?? [];
    if (sections.length === 1) {
      setSection(courseId, sections[0].sectionId);
      setChooser(null);
      return;
    }
    if (sections.length > 1) {
      setChooser({ courseId, label, sections });
      return;
    }
    // Nothing this term — a transcript "Planned" row for a course that is
    // not offered. Say so, or the chip keeps inviting a tap that does nothing.
    setUnoffered((current) => new Set(current).add(courseId));
    setChooser(null);
  };

  const onAdd = (hit: CourseHit) => {
    addCourse({
      courseId: hit.courseId,
      code: hit.code,
      title: hit.title,
      termLabel: termLabel(CURRENT_TERM),
      points: hit.points,
      liked: null,
      source: "plan",
      inCatalog: true,
      sectionId: null,
    });
    void resolveSections(hit.courseId, courseChipLines(hit.code, hit.title).label);
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {planned.length > 0 ? (
        <ChipWrap className="gap-1.5 overflow-visible px-2.5 pt-2 sm:gap-2">
          {planned.map((course) => {
            const lines = courseChipLines(course.code, course.title);
            const note = course.sectionId
              ? `section ${sectionCodeOf(course.sectionId)}`
              : unoffered.has(course.courseId)
                ? "not offered this term"
                : "tap to pick a section";
            return (
              <RemovableChip
                key={course.courseId}
                sublabel={lines.sublabel}
                note={note}
                onPress={() => {
                  haptic("selection");
                  void resolveSections(course.courseId, lines.label);
                }}
                onRemove={() => {
                  if (chooser?.courseId === course.courseId) setChooser(null);
                  removeCourse(course.courseId);
                }}
                removeLabel={`Remove ${lines.label}${
                  lines.sublabel ? ` — ${lines.sublabel}` : ""
                }`}
              >
                {lines.label}
              </RemovableChip>
            );
          })}
        </ChipWrap>
      ) : (
        <p className="text-center text-body-regular text-text-secondary">
          Nothing yet. Search for what you are registered for, or skip this if you have not
          registered.
        </p>
      )}

      {chooser ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-center text-caption-2-medium tracking-[0.08em] text-text-tertiary uppercase">
            Which section of {chooser.label}?
          </h2>
          <ChipWrap>
            {chooser.sections.map((section) => {
              const current = planned.find((c) => c.courseId === chooser.courseId)?.sectionId;
              return (
                <OptionChip
                  key={section.sectionId}
                  isSelected={current === section.sectionId}
                  sublabel={section.instructors ?? undefined}
                  onPress={() => {
                    haptic("selection");
                    setSection(chooser.courseId, section.sectionId);
                    setChooser(null);
                  }}
                >
                  {section.label}
                </OptionChip>
              );
            })}
          </ChipWrap>
          <button
            type="button"
            onClick={() => setChooser(null)}
            className="self-center text-caption-1-regular text-text-tertiary underline-offset-2 hover:underline"
          >
            Not sure yet
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-center text-body-regular text-text-secondary">{error}</p>
      ) : null}

      <CourseSearch
        confirmedIds={recordedIds}
        onAdd={onAdd}
        label="Search for a course you're taking"
      />
    </div>
  );
}

/** `20263COMS4113W001` → `001`. The id's shape is documented on `Section.sectionId`. */
function sectionCodeOf(sectionId: string): string {
  return sectionId.slice(-3);
}
