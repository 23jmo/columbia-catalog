import {
  RiArrowRightLine,
  RiCompassDiscoverLine,
  RiShieldCheckLine,
} from "@remixicon/react";

import { ButtonLink } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { SignInPrompt } from "@/components/home/sign-in-prompt";
import type { FeedResult } from "@/lib/recommend/feed";
import { cx } from "@/utils/cx";

import { FeedCardView } from "./feed-card";

/**
 * The feed — the top of the home page and, from this change onward, the reason
 * the app exists.
 *
 * Vergil is a search box over 8,189 courses that only helps if you already know
 * the course you want. Everything below this block on `/` — the week grid, the
 * watchlist — is a good planner, and a planner is what you use AFTER you have
 * decided. This block is the deciding.
 *
 * ── The header states which feed you are looking at ────────────────────────
 *
 * A cold feed and a personalized feed look identical if you only render cards,
 * and that ambiguity is corrosive: a visitor who thinks "here is what is
 * broadly on offer" is a personalized recommendation concludes the
 * recommendations are bad. So `personalized` travels all the way from the
 * engine to this heading, and the two states say different things out loud.
 *
 * ── The footer is honest about what the ranking used ───────────────────────
 *
 * How many courses fed the taste vector, how many requirement groups are open,
 * and how many courses the prerequisite filter held back. That last number is
 * the reassuring one — "we did not show you 40 courses you are not ready for"
 * is the claim that separates this from a search results page.
 */

export function FeedPanel({
  feed,
  className,
}: {
  feed: FeedResult;
  className?: string;
}) {
  return (
    <section aria-labelledby="feed-heading" className={cx("flex flex-col gap-4", className)}>
      <FeedHeader feed={feed} />

      {feed.cards.length === 0 ? <EmptyFeed feed={feed} /> : <FeedRail feed={feed} />}

      {feed.cards.length > 0 ? <FeedFooter feed={feed} /> : null}
    </section>
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
 * turns the page back into something you scroll before you can use, which is
 * the exact failure the last rewrite of `/` was undoing.
 *
 * A rail spends one card-height of vertical space no matter how many cards
 * there are. It also states the right thing about the content: these twelve are
 * peers, ranked but not ordered into steps, and you are meant to browse across
 * them rather than read down them.
 *
 * ── The partly-visible card is the affordance ──────────────────────────────
 *
 * `min(85vw,22rem)` leaves the next card clipped by the container edge at every
 * width, which is the only reliable signal that a rail scrolls — a scrollbar is
 * invisible on macOS until you are already scrolling, and arrows are chrome
 * that a touch device does not need. The scrollbar is hidden for the same
 * reason it cannot be relied on: on Windows it is a permanent grey band under
 * an otherwise clean row.
 *
 * Keyboard access comes free and is worth stating, because a scroll container
 * that only responds to a mouse is a WCAG 2.1.1 failure: every card holds real
 * links — the title, the section, Vergil — so Tab walks into the rail and the
 * browser scrolls each one into view as it goes.
 *
 * `-m-1 p-1` is not spacing. `overflow-x-auto` also clips vertically, and a
 * focus ring is drawn outside its element's box; without the inset the ring on
 * the first card's title would be sliced off along the top edge.
 */
function FeedRail({ feed }: { feed: FeedResult }) {
  return (
    <div
      className={cx(
        "-m-1 overflow-x-auto overscroll-x-contain p-1",
        "snap-x snap-mandatory scroll-p-1",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {/*
        `role="list"` restores what `display: flex` takes away — Safari drops
        list semantics from a flexed `ul`, and "list, 12 items" is exactly the
        orientation a screen reader user needs before walking a rail.
      */}
      <ul role="list" className="flex w-max items-stretch gap-3">
        {feed.cards.map((card) => (
          <li
            key={card.courseId}
            className="flex w-[min(85vw,22rem)] shrink-0 snap-start"
          >
            <FeedCardView card={card} className="w-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ==========================================================================
 * Header
 * ========================================================================== */

function FeedHeader({ feed }: { feed: FeedResult }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2lg bg-accent-500/10"
          >
            <RiCompassDiscoverLine className="size-4 text-accent-500" />
          </span>
          <div className="min-w-0">
            <h2
              id="feed-heading"
              className="text-title-2-semibold -tracking-[0.01em] text-text-primary"
            >
              {feed.personalized ? "Courses to take next" : "Where students start"}
            </h2>
            <p className="mt-1 max-w-[62ch] text-caption-1-regular text-pretty text-text-secondary">
              {feed.personalized
                ? "Ranked against your record and what your degree still needs."
                : "Broadly what is on offer — not yet what is right for you."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {feed.personalized ? (
            <Chip variant="caption" color="lime">
              Personalized
            </Chip>
          ) : (
            <Chip variant="caption" color="neutral">
              Not personalized yet
            </Chip>
          )}
        </div>
      </div>

      {!feed.personalized ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-2lg border border-border-table bg-background-secondary-default p-3">
          <p className="min-w-0 flex-1 text-body-regular text-text-primary">
            Two minutes of setup turns this into six classes you should actually take.
          </p>
          <ButtonLink
            size="small"
            href="/onboarding"
            trailingIcon={RiArrowRightLine}
            className="shrink-0"
          >
            Set up my profile
          </ButtonLink>
          {/*
            Sign-in is offered but never required to get here. Spec: guests are
            allowed through the first feed and gated on the second action, so a
            wall at this point would be the one thing that stops a visitor ever
            seeing what the product does.
          */}
          {!feed.signedIn ? <SignInPrompt label="Sign in" /> : null}
        </div>
      ) : null}
    </header>
  );
}

/* ==========================================================================
 * Empty and footer
 * ========================================================================== */

function EmptyFeed({ feed }: { feed: FeedResult }) {
  return (
    <div className="rounded-[20px] border border-border-table bg-background-primary-default p-5 shadow-card">
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

function FeedFooter({ feed }: { feed: FeedResult }) {
  const parts: string[] = [];

  if (feed.takenCount > 0) {
    parts.push(
      `${feed.takenCount} ${feed.takenCount === 1 ? "course" : "courses"} on your record`,
    );
  }
  if (feed.outstandingCount > 0) {
    parts.push(
      `${feed.outstandingCount} outstanding requirement ${
        feed.outstandingCount === 1 ? "group" : "groups"
      }`,
    );
  }
  if (feed.withheldCount > 0) {
    parts.push(`${feed.withheldCount} held back on prerequisites`);
  }
  /*
   * Named rather than silently absent. A feed running without semantics is a
   * materially worse feed, and hiding that would make a data problem look like
   * a taste problem.
   */
  if (!feed.vectorModel) {
    parts.push("semantic matching unavailable for this build");
  }

  /*
   * One clause, not a paragraph.
   *
   * This used to also promise that "seat counts carry the directory's own
   * timestamp" — which stopped being true on the card when the printed stamp
   * came off it, so the sentence had to go rather than be re-worded around.
   * The timestamp is on the meter's hover title and on the course page; the
   * claim belongs where it is still literally visible.
   *
   * What is kept is the held-back count, because "we did not show you 200
   * courses you are not ready for" is the one line here that says something a
   * search results page cannot.
   */
  return (
    <div className="flex items-start gap-2 text-caption-1-regular text-text-tertiary">
      <RiShieldCheckLine
        className="mt-px size-3.5 shrink-0 text-foreground-icon-quaternary"
        aria-hidden
      />
      <p className="min-w-0">
        Ranked from {parts.length > 0 ? parts.join(", ") : "what is on offer in the active terms"}.
        Vergil links open Columbia&rsquo;s own page — we never register or drop anyone.
      </p>
    </div>
  );
}
