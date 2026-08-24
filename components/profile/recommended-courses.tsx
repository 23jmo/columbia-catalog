import { RiCompass3Line } from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import { provenanceLabel } from "@/components/course/format";
import type { Recommendation } from "@/lib/profile/recommend";
import { cx } from "@/utils/cx";
import { VERIFICATION_CHIP_COLOR, VERIFICATION_LABEL } from "./format";

/**
 * What to take next term.
 *
 * ── The claim this card makes, stated exactly ───────────────────────────────
 *
 * "This course is offered next term and it satisfies a requirement you have not
 * finished." That is a fact about the catalog and the audit, and every card
 * prints the requirement it would clear, so the reader can check it. It is not
 * a prediction that they will like it — see the header of
 * `lib/profile/recommend.ts` for why a taste model is not v1 (we hold courses
 * *taken*, not courses *rated*, and being required to take Frontiers is not
 * evidence you want more of it).
 *
 * ── Why the reasons are printed rather than a score ─────────────────────────
 *
 * The ranking is a handful of coarse weights over a list a student will read
 * one card at a time. Showing "87" would imply a precision the inputs do not
 * have; showing "Counts toward Foundational Course · Clashes with your current
 * schedule" is the same information in a form the reader can disagree with.
 *
 * Seat numbers carry their "as of" (spec §3), because a seat count without one
 * is a number nobody can act on.
 */

export interface RecommendedCoursesProps {
  recommendations: Recommendation[];
  termLabel: string;
  /** True when the student has declared nothing to audit against. */
  hasPrograms: boolean;
  className?: string;
}

export function RecommendedCourses({
  recommendations,
  termLabel,
  hasPrograms,
  className,
}: RecommendedCoursesProps) {
  return (
    <section
      className={cx(
        "flex w-full flex-col gap-2.5 rounded-[20px] bg-background-secondary-default px-2.5 py-3",
        className,
      )}
      aria-labelledby="recommended-heading"
    >
      <div className="flex flex-col gap-0.5 px-1.5 pt-1">
        <p id="recommended-heading" className="text-body-medium text-text-secondary">
          Offered in {termLabel}, and it would clear something
        </p>
        <p className="text-title-2-medium tabular-nums text-text-primary">
          {recommendations.length} {recommendations.length === 1 ? "course" : "courses"}
        </p>
      </div>

      {recommendations.length === 0 ? (
        <div className="flex items-start gap-2 rounded-2lg bg-background-primary-default p-4">
          <RiCompass3Line
            className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
            aria-hidden
          />
          <p className="text-body-regular text-pretty text-text-secondary">
            {hasPrograms
              ? `Nothing to suggest for ${termLabel}. Either your named requirements are done, or what is left is matched on a curriculum flag rather than a course list — search is the right tool for those, and each requirement above links to the Bulletin page that defines it.`
              : "Declare a school and a major above and this fills with courses that would move your audit forward."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {recommendations.map(({ offering, requirement, reasons }) => {
            const asOf = provenanceLabel(offering.seatsAsOf);
            return (
              <li key={offering.courseId}>
                <article className="flex flex-col gap-2 rounded-2lg bg-background-primary-default p-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-caption-1-semibold tracking-[0.04em] tabular-nums text-accent-600">
                        {offering.code}
                      </span>
                      <h3 className="text-headline-semibold text-pretty text-text-primary">
                        <a
                          href={`/course/${offering.courseId}`}
                          className="rounded-lg outline-none transition-colors duration-150 ease hover:text-accent-600 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                        >
                          {offering.title}
                        </a>
                      </h3>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {offering.points != null ? (
                        <Chip variant="caption" color="soft">
                          {offering.points} pts
                        </Chip>
                      ) : null}
                      <Chip
                        variant="caption"
                        color={VERIFICATION_CHIP_COLOR[requirement.verification]}
                      >
                        {VERIFICATION_LABEL[requirement.verification]}
                      </Chip>
                    </div>
                  </div>

                  <p className="text-caption-1-regular text-text-secondary">
                    <span className="text-text-primary">{requirement.label}</span>
                    {" · "}
                    {requirement.programName}
                  </p>

                  <ul className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {reasons.map((reason) => (
                      <li
                        key={reason}
                        className="text-caption-2-regular text-text-tertiary before:mr-2 before:content-['·'] first:before:hidden"
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>

                  {/*
                    Spec §3 and AGENTS.md: a seat number never renders without
                    the directory's own "as of". No timestamp, no number — an
                    unqualified seat count is the one figure a student would act
                    on immediately and the one most likely to be stale.
                  */}
                  {offering.seatsOpen != null && asOf ? (
                    <p className="text-caption-2-regular tabular-nums text-text-tertiary">
                      {offering.seatsOpen} of {offering.seatsTotal ?? "?"} seats open, as of {asOf}
                    </p>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
