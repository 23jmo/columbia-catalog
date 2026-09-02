import { FeedCardView } from "@/components/feed/feed-card";

import { LANDING_FEED_CARDS } from "./landing-fixtures";
import { LionMark } from "./landing-mark";

/**
 * The product shot: the actual feed, in a frame, under the headline.
 *
 * ── It renders the real component ──────────────────────────────────────────
 *
 * `FeedCardView` — the same export `app/page.tsx` renders for a signed-in
 * student, with the same reason rows, the same week strip, the same instructor
 * chip and the same seat meter. It replaced a hand-drawn approximation, which
 * was wrong in the way approximations always are: it had three cards across
 * when the real feed is one column at every width (`feed-layout.tsx` says so
 * in its own comment), it invented a rating pill the card does not have, and
 * every subsequent change to the card would have widened the gap silently.
 * A promise on a landing page is worth what the screenshot behind it is worth.
 *
 * The data is a typed `FeedCard[]` — see `landing-feed-fixture.ts` for why it
 * is a fixture and what in it is real.
 *
 * ── `readOnly`, and `inert` around the lot ─────────────────────────────────
 *
 * `readOnly` drops the save control, whose store fires a server action the
 * moment it mounts; on a page that only ever renders for a visitor with no
 * session, that round trip can only answer "signed out". Everything else the
 * card mounts is already lazy — the seat history and the instructor ratings
 * load on first open, and recharts arrives with them.
 *
 * `inert` on the frame takes the rest: without it the shot would insert six
 * tab stops and two course links between the headline and the buttons, and the
 * first thing a keyboard visitor met on this page would be a detour into the
 * catalog. `role="img"` plus a label is how the whole frame reaches a screen
 * reader as one described picture instead of a list of half-true courses.
 *
 * ── The frame ──────────────────────────────────────────────────────────────
 *
 * A window, not a browser: a title bar with the mark and the term, and no
 * address bar. A fake URL is a claim, and it would be a false one. The list
 * fades out at the bottom rather than ending on the third card, because the
 * claim is "a ranked list" and a list that stops at three looks like all there
 * was.
 */

const SHOT_LABEL =
  "LionPlan's ranked recommendations for a Columbia College computer science student. " +
  "First, COMS W3134 Data Structures in Java — satisfies the Computer Science major core, " +
  "opens up 14 more courses, Mondays and Wednesdays at 10:10am, 87 of 175 seats left. " +
  "Then COMS W4160 Computer Graphics — satisfies a track elective and resembles a course " +
  "already taken. Then HUMA W1001 Literature Humanities I — satisfies the Core Curriculum, " +
  "1 of 20 seats left, prerequisites unverified.";

export function LandingProductShot() {
  return (
    <figure
      role="img"
      aria-label={SHOT_LABEL}
      className="relative mt-12 w-full max-w-[46rem] sm:mt-16"
      /*
        The frame runs off the bottom of the hero rather than ending inside it.

        Three cards at full size made the hero about a screen and a half, so
        the second band began below anything a visitor was likely to reach
        — and the shot ended on a hard rounded edge with a drop shadow, which
        reads as "that is the whole product" rather than "the list continues".

        A mask does both jobs at once. It is `mask-image` and not another
        gradient overlay because the frame is opaque and sits over the sky: an
        overlay would have to paint SOMETHING, and whatever colour it painted
        would be wrong against a gradient that changes down the page. A mask
        removes the pixels instead, so the sky behind shows through and the
        cards dissolve into it. `to bottom, black 70%, transparent` keeps the
        whole first card — the seat meter included, which is the row this shot
        exists to show — and most of the second; the cap is what stops the
        third from setting the height.

        The shadow goes with it, masked along with everything else, which is
        why the `ring` is dropped too — a rim on three sides of a shape that
        has no fourth side reads as a clipping bug.
      */
      style={{
        WebkitMaskImage:
          "linear-gradient(to bottom, #000 0%, #000 70%, transparent 100%)",
        maskImage:
          "linear-gradient(to bottom, #000 0%, #000 70%, transparent 100%)",
      }}
    >
      <div
        inert
        className="max-h-[26rem] overflow-hidden rounded-t-[1.25rem] bg-background-secondary-default sm:max-h-[30rem] sm:rounded-t-[1.75rem]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-table bg-background-primary-default px-4 py-3 sm:px-5">
          <span className="flex items-center gap-2">
            <LionMark size={22} />
            <span className="text-body-2-medium text-text-primary">
              Recommended for you
            </span>
          </span>
          <span className="rounded-full bg-background-secondary-default px-2.5 py-1 text-caption-1-medium tabular-nums text-text-secondary">
            Fall 2026
          </span>
        </div>

        {/*
          The real container's own numbers: one column, `gap-3 sm:gap-4`. The
          bottom padding is deliberately short of the gap because the fade
          below eats the last few pixels anyway.
        */}
        <div className="relative grid grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4">
          {LANDING_FEED_CARDS.map((card) => (
            <FeedCardView key={card.courseId} card={card} readOnly />
          ))}

        </div>
      </div>
    </figure>
  );
}

/**
 * One card, close up, for the band that claims the ranking explains itself.
 *
 * Same component, same fixture, same `readOnly` and `inert` reasoning as the
 * frame above — the difference is that here nothing surrounds it, because the
 * point being made is about the card's own contents rather than about a list.
 * A student reading this band should be looking at the three reason rows.
 */
export function LandingReasonCard() {
  const card = LANDING_FEED_CARDS[1]!;

  return (
    <figure
      role="img"
      aria-label={
        "A LionPlan recommendation card for COMS W4160 Computer Graphics. It says the course " +
        "satisfies a Computer Science track elective, that it is like COMS W3134, which the " +
        "student took, and that it opens up 5 more courses. Below that: Tuesdays and Thursdays " +
        "at 4:10pm, Silvia Sellan, 4.7 out of 5 teaching from 21 reviews, 14 of 80 seats left."
      }
      className="w-full"
    >
      <div
        inert
        className="rounded-[1.25rem] bg-background-secondary-default p-3 shadow-[0_1px_3px_rgba(3,34,90,0.08),0_24px_50px_-30px_rgba(3,34,90,0.45)] ring-1 ring-black/[0.06] sm:p-4"
      >
        <FeedCardView card={card} readOnly />
      </div>
    </figure>
  );
}
