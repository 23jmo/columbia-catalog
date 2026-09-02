"use client";

import {
  AddChip,
  ChipWrap,
  RemovableChip,
  courseChipLines,
} from "@/components/onboarding/chip";

import { LANDING_SUGGESTED, LANDING_TAKEN } from "./landing-fixtures";

/*
 * A client module, and the reason is the RSC boundary rather than interaction.
 *
 * `courseChipLines` is a pure string helper, but it is EXPORTED FROM a
 * "use client" module (`components/onboarding/chip.tsx`), and that makes it a
 * client function: a server component may render `AddChip`, but calling
 * `courseChipLines()` during a server render throws "Attempted to call
 * courseChipLines() from the server". The build does not catch this — it
 * compiles clean and fails as a 500 on first request.
 *
 * Reimplementing the helper here would dodge the boundary and lose the point,
 * since the whole reason this band exists is that the chips are the wizard's
 * own. So the shot crosses the boundary instead. It costs nothing: every chip
 * it renders was already client, and this file adds no state of its own.
 *
 * `LandingProductShot` stays a server component for exactly this reason — it
 * calls nothing, so the hero's frame does not have to ship.
 */
/**
 * Onboarding's second screen, with the real chips.
 *
 * `AddChip`, `RemovableChip`, `ChipWrap` and `courseChipLines` are
 * `components/onboarding/chip.tsx` — the same four the wizard renders, so the
 * two-line pill (title over call number), the accent fill on a course already
 * on the record, and the `+` affordance on a suggestion are all the product's
 * own and not an approximation of it.
 *
 * The band this sits in claims the wizard "guesses your transcript first". The
 * grey heading below is the guess's second half, verbatim from
 * `step-coursework.tsx`: students with these usually have these too. Saying
 * that in a paragraph and drawing a generic icon beside it was the version
 * this replaced.
 *
 * The handlers are no-ops and `inert` covers the frame, same as the feed shot
 * above: every chip here is a real button, and none of them has anything to
 * mutate on a page with no session.
 */
export function LandingCourseworkShot() {
  const noop = () => {};

  return (
    <figure
      role="img"
      aria-label={
        "LionPlan's degree setup, second screen. It has already filled in four courses it " +
        "thinks the student has taken — Introduction to Computer Science, University Writing, " +
        "Calculus I and Frontiers of Science — each removable. Below, under the heading " +
        "'students with these usually have these too', it offers Calculus II and Discrete " +
        "Mathematics to add."
      }
      className="w-full"
    >
      <div
        inert
        className="flex flex-col gap-5 rounded-[1.25rem] bg-background-primary-default p-5 shadow-[0_1px_3px_rgba(3,34,90,0.08),0_24px_50px_-30px_rgba(3,34,90,0.45)] ring-1 ring-black/[0.06] sm:rounded-[1.5rem] sm:p-6"
      >
        <div className="flex flex-col gap-3">
          <h3 className="text-center text-caption-2-medium uppercase tracking-[0.08em] text-text-tertiary">
            What we think you have taken
          </h3>
          <ChipWrap className="justify-center gap-1.5 overflow-visible sm:gap-2">
            {LANDING_TAKEN.map((course) => {
              const lines = courseChipLines(course.code, course.title);
              return (
                <RemovableChip
                  key={course.code}
                  sublabel={lines.sublabel}
                  onRemove={noop}
                  removeLabel={`Remove ${lines.label}`}
                >
                  {lines.label}
                </RemovableChip>
              );
            })}
          </ChipWrap>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-center text-caption-2-medium uppercase tracking-[0.08em] text-text-tertiary">
            Students with these usually have these too
          </h3>
          <ChipWrap className="justify-center gap-1.5 overflow-visible sm:gap-2">
            {LANDING_SUGGESTED.map((course) => {
              const lines = courseChipLines(course.code, course.title);
              return (
                <AddChip
                  key={course.code}
                  sublabel={lines.sublabel}
                  onPress={noop}
                  label={`Add ${lines.label}`}
                >
                  {lines.label}
                </AddChip>
              );
            })}
          </ChipWrap>
        </div>
      </div>
    </figure>
  );
}
