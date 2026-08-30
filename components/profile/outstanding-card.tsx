import type { RemainingRequirement } from "@/lib/profile/audit";
import { cx } from "@/utils/cx";
import { VERIFICATION_LABEL, VERIFICATION_TEXT_COLOR, outstandingLabel } from "./format";

/**
 * Everything still outstanding, ordered by how actionable it is.
 *
 * The tree further down is the complete picture; this is the answer to "what do
 * I do about it", which is a different question and deserves its own surface at
 * the top of the page.
 *
 * `auditProfile` has already sorted the list: requirements whose rule names
 * specific courses come first, then flag-matched ones, then the self-certified
 * ones — and within each tier, the closest to done. That ordering is the
 * feature. A requirement with a named candidate list is one click from
 * progress; a flagged one needs a search; an attested one is a box to tick and
 * a conversation with an adviser. Sorting by program instead would bury the
 * one-course-left requirement under a twelve-course elective block.
 *
 * ── Why the rows are one line, not a stack of little cards ──────────────────
 *
 * Every row here appears again in the audit tree six hundred pixels below, in
 * program order. That second appearance is not redundant — this list answers
 * "what next" and the tree answers "where am I" — but when both were rendered
 * as chunky two-line cards on their own surfaces, the page read as though it
 * had printed the same thing twice and lost its nerve. Twelve rows cost close
 * to six hundred pixels for a list whose whole job is to be glanced at.
 *
 * So this is an index: one line per requirement, hairline-separated, the same
 * row grammar the tree uses. It carries every outstanding requirement — a
 * to-do list that hides items is not a to-do list — in roughly half the height,
 * and the difference between the two surfaces is now legible at a glance
 * instead of having to be argued from their contents.
 */

export interface OutstandingCardProps {
  remaining: RemainingRequirement[];
  className?: string;
}

export function OutstandingCard({ remaining, className }: OutstandingCardProps) {
  if (remaining.length === 0) return null;

  return (
    <section
      className={cx(
        "flex w-full flex-col rounded-[20px] bg-background-secondary-default",
        className,
      )}
      aria-labelledby="outstanding-heading"
    >
      <div className="flex flex-col gap-0.5 px-4 pb-2.5 pt-3">
        <p id="outstanding-heading" className="text-body-medium text-text-secondary">
          Still to do, most actionable first
        </p>
        <p className="text-title-2-medium tabular-nums text-text-primary">
          {remaining.length} requirement{remaining.length === 1 ? "" : "s"}
        </p>
      </div>

      <ul className="flex flex-col">
        {remaining.map((requirement) => (
          <li key={`${requirement.programId}:${requirement.groupId}`}>
            <a
              href={`#program-${requirement.programId}-heading`}
              className={cx(
                "flex min-h-11 items-center gap-3 border-t border-border-table px-4 py-2 outline-none",
                "transition-colors duration-150 motion-reduce:transition-none",
                "hover:bg-background-secondary-hover",
                "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring",
              )}
            >
              {/*
                The tier wraps under the label on a phone and sits beside it
                from `sm` up.

                Both on one line at 390px meant a `shrink-0` twenty-four
                character qualifier held its full width while the requirement's
                NAME — the only part a reader scans for — truncated to "Phys…",
                "Glob…", "Econ…". That is the ranking exactly inverted: the name
                identifies the row, the tier only qualifies it. Wrapping costs a
                second line on the six rows that carry a tier and gives the name
                the width it needs on all twelve.
              */}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                {/*
                  Wraps rather than truncates, for the same reason the tree's
                  labels do: the Core has a "Science Requirement (Category A)"
                  and a "(Category B)", and cutting both to "Science Requirement
                  (Cate…" leaves two rows a reader cannot tell apart.
                */}
                <span className="text-pretty text-subheadline-regular text-text-primary">
                  {requirement.label}
                </span>

                {/*
                  Only the tiers that change what you should do about the row.
                  Nothing about a requirement here is finished, so "we can check
                  this one exactly" is not news — it is the ordinary case, it was
                  two thirds of the list, and rendering it as a lime pill on every
                  row made the flagged and attested ones invisible. Those two do
                  change the plan: one means search rather than click, the other
                  means talk to an adviser.
                */}
                {requirement.verification === "exact" ? null : (
                  <span
                    className={cx(
                      "shrink-0 text-caption-2-regular",
                      VERIFICATION_TEXT_COLOR[requirement.verification],
                    )}
                  >
                    {VERIFICATION_LABEL[requirement.verification]}
                  </span>
                )}
              </span>

              {/*
                After the tier, and a fixed width. Ahead of it the program
                name moved horizontally from row to row — a tier is present on
                four rows of twelve — so the one column a reader scans to
                group the list by program was never actually a column.
              */}
              <span className="hidden w-[9rem] shrink-0 truncate text-right text-caption-2-regular text-text-tertiary sm:inline">
                {requirement.programName}
              </span>

              <span className="w-[5.5rem] shrink-0 text-right text-caption-1-medium tabular-nums text-text-primary">
                {outstandingLabel(requirement.outstanding, requirement.unit)} left
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
