"use client";

import type { GuestCourse } from "@/lib/onboarding/state";

import { ChipWrap, OptionChip, courseChipLines } from "./chip";

/**
 * "Which of these did you like?"
 *
 * ── Why a dedicated screen rather than a heart on each course card ──────────
 *
 * Completion rate. A heart on the coursework screen competes with the task the
 * student is already doing and gets skipped by almost everyone; a screen with
 * one question and every course visible at once is how people actually make
 * this kind of pass. One decision repeated twenty times beats twenty decisions
 * interleaved with a different one.
 *
 * ── The answer is binary here, and null is still the default ────────────────
 *
 * A pill is on or off, so this screen writes `true` or leaves `null`. It used
 * to offer a third state — "not for me", writing `false` — and that signal is
 * genuinely useful to the recommender, which weights a disliked course DOWN.
 * It is not lost, only not asked here: `liked` is editable on the profile
 * screen, and `setLiked` still takes `false`.
 *
 * What matters is that an unpicked chip means `null`, NOT `false`. Collapsing
 * "not asked" into "disliked" would push the recommender away from everything a
 * student took and never rated, which is most of a transcript.
 *
 * ── This is not a grade and must never become one ───────────────────────────
 *
 * Migration 0028's header is emphatic that the absence of grades is
 * load-bearing rather than incidental. A student can love a class they did
 * badly in, and a taste model has to get that case right. The question says
 * "like", never "did well in".
 */

export interface StepLoveProps {
  courses: readonly GuestCourse[];
  onSetLiked: (courseId: string, liked: boolean | null) => void;
}

export function StepLove({ courses, onSetLiked }: StepLoveProps) {
  if (courses.length === 0) {
    return (
      <p className="text-center text-body-regular text-text-secondary">
        Nothing on your record yet, so there is nothing to rate. Go back and add a few courses — or
        carry on; the feed works without this.
      </p>
    );
  }

  return (
    <ChipWrap>
      {courses.map((course) => {
        const lines = courseChipLines(course.code, course.title);
        return (
          <OptionChip
            key={course.courseId}
            isSelected={course.liked === true}
            // Re-pressing clears back to "not asked", which is the honest value
            // for an accidental tap on a screen of twenty pills.
            onPress={() => onSetLiked(course.courseId, course.liked === true ? null : true)}
            sublabel={lines.sublabel}
            label={`${lines.label}${lines.sublabel ? ` — ${lines.sublabel}` : ""}`}
          >
            {lines.label}
          </OptionChip>
        );
      })}
    </ChipWrap>
  );
}
