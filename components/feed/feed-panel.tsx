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

      {feed.cards.length === 0 ? (
        <EmptyFeed feed={feed} />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {feed.cards.map((card) => (
            <li key={card.courseId} className="flex">
              <FeedCardView card={card} className="w-full" />
            </li>
          ))}
        </ul>
      )}

      {feed.cards.length > 0 ? <FeedFooter feed={feed} /> : null}
    </section>
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
              {feed.personalized ? (
                <>
                  Ranked against your record and what your degree still needs. Every card says
                  why it is here, and nothing you are not eligible for appears at all.
                </>
              ) : (
                <>
                  This is what is broadly on offer — not what is right for you. Tell us your
                  school, your major and a few courses you have taken and this becomes a real
                  list.
                </>
              )}
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

  return (
    <div className="flex items-start gap-2.5 text-caption-1-regular text-text-secondary">
      <RiShieldCheckLine
        className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
        aria-hidden
      />
      <p className="min-w-0">
        Ranked from {parts.length > 0 ? parts.join(", ") : "what is on offer in the active terms"}
        . Seat counts carry the directory&rsquo;s own timestamp. Every &ldquo;Open in
        Vergil&rdquo; link opens Columbia&rsquo;s own page in a new tab — we never register,
        drop, or waitlist anyone.
      </p>
    </div>
  );
}
