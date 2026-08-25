import Link from "next/link";

import type { FeedResult } from "@/lib/recommend/feed";
import { cx } from "@/utils/cx";

import { FeedCardView } from "./feed-card";
import { FEED_CARD_SLOT, FeedRailScroller } from "./feed-rail";

/**
 * The feed — a rail of sections, and nothing around it.
 *
 * ── What used to be here ───────────────────────────────────────────────────
 *
 * A header with a compass badge, a heading, a two-line paragraph, a
 * Personalized / Not-personalized chip and a bordered call to action; and a
 * footer paragraph explaining what the ranking used. Both were cut by the owner
 * (2026-08-25). They were arguing for the cards instead of letting the cards
 * speak, and on a page that opens with a greeting they were a second and third
 * heading between the student and the thing they came for.
 *
 * The one claim worth keeping from the header survives as `OnboardingNudge`
 * below, because a cold feed and a personalized feed look identical if you only
 * render cards — and that ambiguity is corrosive. A visitor who mistakes "here
 * is what is broadly on offer" for a personalized recommendation concludes the
 * recommendations are bad. One quiet line prevents that; a bordered panel was
 * never needed to.
 */

export function FeedPanel({
  feed,
  className,
}: {
  feed: FeedResult;
  className?: string;
}) {
  return (
    <section
      aria-label="Recommended sections"
      className={cx("flex flex-col gap-2.5", className)}
    >
      {!feed.personalized ? <OnboardingNudge /> : null}

      {feed.cards.length === 0 ? <EmptyFeed feed={feed} /> : <FeedRail feed={feed} />}
    </section>
  );
}

/**
 * The only thing the feed says about itself.
 *
 * Deliberately a sentence and not a panel. The student is one line from the
 * cards, the cards are real either way, and a bordered box with a primary
 * button is a toll gate in front of a product that is supposed to be worth
 * using before you commit to it — the spec lets guests all the way through the
 * first feed for exactly that reason.
 */
function OnboardingNudge() {
  return (
    <p className="px-1 text-caption-1-regular text-text-tertiary">
      Broadly what is on offer —{" "}
      <Link
        href="/onboarding"
        className={cx(
          "rounded-sm text-accent-600 outline-none transition-colors duration-150",
          "hover:text-accent-700 hover:underline hover:underline-offset-2",
          "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        )}
      >
        set up your profile
      </Link>{" "}
      to make this list yours.
    </p>
  );
}

/* ==========================================================================
 * The rail
 * ========================================================================== */

/**
 * The cards, as one horizontal run.
 *
 * ── Why a rail and not a column ────────────────────────────────────────────
 *
 * The feed shares the home page with the assistant's box, and the box has to
 * stay on screen: it is the thing that answers the question the feed cannot
 * anticipate. A vertical list of twelve cards pushes it below the fold and
 * turns the page back into something you scroll before you can use.
 *
 * A rail spends one card-height of vertical space no matter how many cards
 * there are. It also states the right thing about the content: these twelve are
 * peers, ranked but not ordered into steps, and you are meant to browse across
 * them rather than read down them.
 *
 * The fade, the snap and the card width live in `feed-rail.tsx` so the
 * skeleton sits in the same chrome. Changing them there changes both, which
 * is the point of extracting them.
 *
 * Keyboard access comes free and is worth stating, because a scroll container
 * that only responds to a mouse is a WCAG 2.1.1 failure: every card holds real
 * links — the title, the instructor, the meter, Vergil — so Tab walks into the
 * rail and the browser scrolls each one into view as it goes.
 */
function FeedRail({ feed }: { feed: FeedResult }) {
  return (
    <FeedRailScroller>
      {feed.cards.map((card) => (
        <li key={card.courseId} className={FEED_CARD_SLOT}>
          <FeedCardView card={card} className="w-full" />
        </li>
      ))}
    </FeedRailScroller>
  );
}

/* ==========================================================================
 * Empty
 * ========================================================================== */

function EmptyFeed({ feed }: { feed: FeedResult }) {
  return (
    <div className="rounded-2xl border border-border-table bg-background-primary-default p-5">
      <p className="text-body-regular text-text-secondary">
        {feed.withheldCount > 0 ? (
          <>
            Nothing to recommend right now — every course we considered is one you have already
            taken, or one whose prerequisites you have not met yet ({feed.withheldCount} of
            those). Add more of your record and this will fill in.
          </>
        ) : (
          <>
            Nothing to recommend right now. The catalog for these terms has not been loaded, so
            there is nothing on offer to rank.
          </>
        )}
      </p>
    </div>
  );
}
