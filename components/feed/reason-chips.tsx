import {
  RiCheckboxCircleLine,
  RiCompass3Line,
  RiErrorWarningLine,
  RiKey2Line,
  RiSparkling2Line,
} from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import { formatCourseId } from "@/lib/requirements/code";
import type { RecommendationCaveat, RecommendationReason } from "@/lib/recommend/types";
import { cx } from "@/utils/cx";

/**
 * The sentence a card says about itself.
 *
 * ── The three kinds are rendered as three kinds ────────────────────────────
 *
 * "It clears the Global Core", "you might like it", and "it does both" are
 * different claims with different consequences, and the engine keeps them
 * apart deliberately (`RecommendationReason`). Collapsing them into one
 * relevance score — a number, a star rating, a single grey chip — is the exact
 * move that turns a recommender into decoration: the student cannot tell
 * whether the app is telling them something about their degree or something
 * about their taste, so they stop trusting both.
 *
 * So each kind gets its own colour and its own verb, and `interesting_and_counts`
 * is visibly the strongest card rather than a slightly different shade of the
 * other two.
 *
 * ── Caveats are not reasons ────────────────────────────────────────────────
 *
 * They render below, in prose, in the tone of a footnote — because a caveat is
 * never a selling point. `prereq_unknown` in particular MUST reach the screen:
 * it is the difference between "you can take this" and "we could not tell, and
 * here is the sentence the registrar printed". Hiding it to keep the card tidy
 * would be presenting an uncertainty as a fact.
 */

/** `"COMS4111W"` → `"COMS W4111"`. Students read the printed form. */
function printed(courseIds: readonly string[]): string[] {
  return courseIds.map((courseId) => formatCourseId(courseId));
}

function joinCodes(codes: readonly string[]): string {
  if (codes.length <= 1) return codes[0] ?? "";
  if (codes.length === 2) return `${codes[0]} and ${codes[1]}`;
  return `${codes.slice(0, -1).join(", ")} and ${codes[codes.length - 1]}`;
}

export function ReasonChips({
  reasons,
  className,
}: {
  reasons: readonly RecommendationReason[];
  className?: string;
}) {
  if (reasons.length === 0) return null;

  return (
    <ul className={cx("flex flex-wrap items-center gap-1.5", className)}>
      {reasons.map((reason, index) => (
        <li key={`${reason.kind}-${index}`} className="flex">
          <ReasonChip reason={reason} />
        </li>
      ))}
    </ul>
  );
}

function ReasonChip({ reason }: { reason: RecommendationReason }) {
  switch (reason.kind) {
    /*
     * The strongest card the product has, so it is one chip that says both
     * things rather than two chips side by side. Two chips would read as two
     * weaker reasons; the point is that they coincide.
     */
    case "interesting_and_counts":
      return (
        <Chip variant="caption" color="lime" className="gap-1">
          <RiSparkling2Line className="size-3 shrink-0" aria-hidden />
          Your kind of thing — and it clears {reason.groupLabel}
        </Chip>
      );

    case "required":
      return (
        <Chip variant="caption" color="blue" className="gap-1">
          <RiCheckboxCircleLine className="size-3 shrink-0" aria-hidden />
          Clears {reason.groupLabel}
        </Chip>
      );

    /*
     * Names the courses. "Because the model says so" is not a reason a student
     * can argue with, and being able to argue with it is what makes it useful —
     * if the named courses are wrong, they know to fix their record.
     */
    case "because_you_took":
      return (
        <Chip variant="caption" color="purple" className="gap-1">
          <RiCompass3Line className="size-3 shrink-0" aria-hidden />
          Because you took {joinCodes(printed(reason.similarTo))}
        </Chip>
      );

    case "unlocks":
      return (
        <Chip variant="caption" color="cyan" className="gap-1">
          <RiKey2Line className="size-3 shrink-0" aria-hidden />
          Opens up {joinCodes(printed(reason.courseIds))}
        </Chip>
      );
  }
}

/* ==========================================================================
 * Caveats
 * ========================================================================== */

export function CaveatNotes({
  caveats,
  className,
}: {
  caveats: readonly RecommendationCaveat[];
  className?: string;
}) {
  const prereqUnknown = caveats.find((caveat) => caveat.kind === "prereq_unknown");
  const noVector = caveats.some((caveat) => caveat.kind === "no_vector");

  if (!prereqUnknown && !noVector) return null;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {prereqUnknown ? (
        <div className="flex items-start gap-2 rounded-lg border border-border-table bg-background-secondary-default px-2.5 py-2">
          <RiErrorWarningLine
            className="mt-px size-3.5 shrink-0 text-status-yellow-text"
            aria-hidden
          />
          <p className="min-w-0 text-caption-1-regular text-text-secondary">
            <span className="text-text-primary">We could not verify the prerequisites.</span>{" "}
            {prereqUnknown.advisories.length > 0 ? (
              <>
                The registrar&rsquo;s own wording:{" "}
                <span className="italic">
                  &ldquo;{prereqUnknown.advisories.join("; ")}&rdquo;
                </span>
                . Read the course page before you register.
              </>
            ) : (
              <>Read the course page before you register.</>
            )}
          </p>
        </div>
      ) : null}

      {noVector ? (
        /*
         * Quiet, one line, no box. This is a statement about OUR data — the
         * course's description was too thin to embed — not about the course,
         * and dressing it up as a warning would read as a mark against a
         * perfectly good class from a small department.
         */
        <p className="text-caption-2-regular text-text-tertiary">
          Ranked on requirements alone — this listing has too little description text for us
          to compare it to what you have taken.
        </p>
      ) : null}
    </div>
  );
}
