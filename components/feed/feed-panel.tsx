import Link from "next/link";

import type { FeedResult } from "@/lib/recommend/feed";
import { cx } from "@/utils/cx";

import { FeedDeck } from "./feed-deck";

/**
 * The feed — a grid of sections, and nothing around it.
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
      className={cx("flex min-w-0 flex-col gap-2.5", className)}
    >
      {!feed.personalized ? <OnboardingNudge /> : null}

      {feed.cards.length === 0 ? <EmptyFeed feed={feed} /> : <FeedGridBody feed={feed} />}
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
 * The grid
 * ========================================================================== */

/**
 * The cards, as a list you read down.
 *
 * ── Why this is no longer a rail ───────────────────────────────────────────
 *
 * It was a rail because the feed shared the home page with the assistant's
 * box, and the box had to stay on screen. A rail spends one card-height no
 * matter how many cards it holds; a column of twelve pushed the box below the
 * fold and turned the page into something you scroll before you can use.
 *
 * The box has its own page now (`/chat`) and these recommendations ARE the
 * home page, so the constraint that bought the rail is gone — and what the
 * rail cost is worth naming, because it is the reason the owner asked for
 * this. Eleven of twelve recommendations lived off the right edge behind a
 * gesture the reader had to guess at, and the cards had to stay narrow enough
 * to peek the next one, which is why "why we picked this" was one clamped grey
 * line. A feed whose recommendations are invisible and unexplained is not a
 * feed, it is a carousel.
 *
 * Reading order also states the right thing now. The rail said "these twelve
 * are peers, browse across them"; ranking is real here — `assembleFeedCards`
 * sorts by score and caps one per subject — so a numbered-feeling column that
 * you read from the top is the honest shape.
 *
 * The grid lives in `feed-layout.tsx` so the skeleton sits in identical
 * chrome. Changing it there changes both, which is the point of extracting it.
 *
 * ── Why the body is one line now ───────────────────────────────────────────
 *
 * The list became swipeable, and a swipe needs a pointer, so the rows moved
 * into `FeedDeck`, a client island. This panel stays a server component and
 * hands it the cards: everything above — the heading, the nudge, the empty
 * state — is still rendered on the server and shipped as HTML, and the only
 * JavaScript the feed costs is the part that has to react to a thumb.
 */
function FeedGridBody({ feed }: { feed: FeedResult }) {
  return <FeedDeck cards={feed.cards} />;
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
