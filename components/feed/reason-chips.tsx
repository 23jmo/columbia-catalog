import { RiErrorWarningLine, RiSparkling2Line } from "@remixicon/react";

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
 * different claims with different consequences, and the engine keeps them apart
 * deliberately (`RecommendationReason`). Collapsing them into one relevance
 * score — a number, a star rating, one undifferentiated chip — is the exact
 * move that turns a recommender into decoration: the student cannot tell
 * whether the app is telling them something about their degree or something
 * about their taste, so they stop trusting both.
 *
 * ── …but the distinction is the verb, not the hue ─────────────────────────
 *
 * These used to be four saturated chips — lime, blue, purple, cyan — one per
 * kind. Four hues on a card that also carries a seat meter, a caveat and a
 * button made the reasons the loudest thing on it, which is backwards: the
 * reason is why you are reading the card, not what you do with it.
 *
 * `Chip color="soft"` is the same chip the search results use for requirement
 * labels, so a student who has seen one has seen the other. `gray` is the same
 * chip one step darker, spent on `interesting_and_counts` — the strongest
 * thing this product can say — along with the one glyph on the card. Two tints
 * of one neutral still read as two ranks; they just do not shout.
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
    <ul className={cx("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {reasons.map((reason, index) => (
        <li key={`${reason.kind}-${index}`} className="flex">
          <ReasonChip reason={reason} />
        </li>
      ))}
    </ul>
  );
}

/**
 * A reason is a sentence, not a status word. `Chip`'s base is
 * `whitespace-nowrap`, which is right for "Open" and "+3.4%" and wrong for
 * "Your kind of thing — and it clears CS Track Elective": on a 390px screen
 * that chip is 330px of unbreakable text and it pushes the whole page into
 * horizontal scroll.
 */
const REASON_CHIP = "max-w-full whitespace-normal text-left";

function ReasonChip({ reason }: { reason: RecommendationReason }) {
  switch (reason.kind) {
    /*
     * The strongest card the product has, so it is one chip that says both
     * things rather than two chips side by side. Two chips would read as two
     * weaker reasons; the point is that they coincide.
     */
    case "interesting_and_counts":
      return (
        <Chip variant="caption" color="gray" className={REASON_CHIP + " gap-1"}>
          <RiSparkling2Line className="size-3 shrink-0 text-foreground-icon-tertiary" aria-hidden />
          Your kind of thing — and it clears {reason.groupLabel}
        </Chip>
      );

    case "required":
      return (
        <Chip variant="caption" color="soft" className={REASON_CHIP}>
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
        <Chip variant="caption" color="soft" className={REASON_CHIP}>
          Because you took {joinCodes(printed(reason.similarTo))}
        </Chip>
      );

    case "unlocks":
      return (
        <Chip variant="caption" color="soft" className={REASON_CHIP}>
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
        /*
         * No box. It was a bordered, tinted panel — a fourth container on a
         * card that already had three — and the warning glyph carries the
         * tone on its own now that nothing else on the card is coloured.
         */
        <p className="flex items-start gap-1.5 text-caption-2-regular text-text-secondary">
          <RiErrorWarningLine
            className="mt-px size-3.5 shrink-0 text-status-yellow-text"
            aria-hidden
          />
          <span className="min-w-0">
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
          </span>
        </p>
      ) : null}

      {noVector ? (
        /*
         * Quiet, one line, no glyph. This is a statement about OUR data — the
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
