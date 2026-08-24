"use client";

import { useMemo } from "react";

import { interestTagsForPrograms } from "@/lib/profile/interest-tags";

import { ChipWrap, OptionChip } from "./chip";

/**
 * "What are you into?" — interest tags, scoped to the declared programs.
 *
 * The list is hand-authored per major (`lib/profile/interest-tags.ts`) and
 * short on purpose: eight to twelve options is one screen and one decision,
 * thirty is a survey. Each tag carries exemplar courses whose LSA vectors seed
 * it, so a declared interest reaches the recommender in the same semantic space
 * as a course the student actually took.
 *
 * The blurb under each label ("Operating systems, networks, distributed
 * machines") is the one piece of secondary copy that survived the strip-down,
 * because these labels are genuinely ambiguous to a first-year — "Theory" and
 * "Systems" are jargon, and a student who guesses wrong here tilts their feed
 * away from what they wanted. It rides inside the pill rather than sitting
 * beside the headline, so the screen still reads as one question.
 *
 * ── When a major has no authored list, this screen says so and moves on ─────
 *
 * The program registry gains programs faster than the tag file does. A student
 * in a newly-added major should get a flow that skips a question, not one that
 * shows them an empty box and an arrow they cannot interpret.
 */

export interface StepInterestsProps {
  programIds: readonly string[];
  selected: readonly string[];
  /**
   * One tag id, not the new list.
   *
   * Emitting the whole array meant computing it from the `selected` prop, and
   * two taps inside one frame then both start from the same stale array — the
   * second silently discards the first. Easy to hit on a phone, invisible when
   * it happens, and indistinguishable afterwards from a tap that just missed.
   */
  onToggle: (tagId: string) => void;
}

/** The database's own check constraint on `interest_tags`. */
export const MAX_INTEREST_TAGS = 24;

export function StepInterests({ programIds, selected, onToggle }: StepInterestsProps) {
  const tags = useMemo(() => interestTagsForPrograms(programIds), [programIds]);
  const chosen = new Set(selected);

  if (tags.length === 0) {
    return (
      <p className="text-center text-body-regular text-text-secondary">
        We have not written interest tags for your programs yet. Your coursework already tells us
        plenty — carry on.
      </p>
    );
  }

  return (
    <ChipWrap>
      {tags.map((tag) => {
        const isSelected = chosen.has(tag.id);
        return (
          <OptionChip
            key={tag.id}
            isSelected={isSelected}
            // Un-picking is always allowed; the cap only guards growth.
            onPress={() => {
              if (!isSelected && selected.length >= MAX_INTEREST_TAGS) return;
              onToggle(tag.id);
            }}
            sublabel={tag.blurb}
          >
            {tag.label}
          </OptionChip>
        );
      })}
    </ChipWrap>
  );
}
