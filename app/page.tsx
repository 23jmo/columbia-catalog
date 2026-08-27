/**
 * Home — the recommendations.
 *
 * ── Why this page exists ───────────────────────────────────────────────────
 *
 * The home page has been a planner, a feed above a planner, an assistant above
 * a feed, the assistant alone, and then the assistant with a feed rail on top
 * of it. Every one of those shapes made the same bet: that the student arrives
 * with a question. They do not. "What should I take" is the state of not
 * having formed a question yet, and an empty box answers it with homework.
 *
 * So the split is now down the middle. This page is the answer we can give
 * without being asked — a ranked list of specific sections, each one saying in
 * its own words why it is on the list. `/chat` is the box, one nav item over,
 * for everything a ranked list cannot anticipate ("which of these leaves
 * Friday free", "fastest way to finish the Core"). Two pages rather than two
 * halves of one, because a conversation and a set of recommendations both want
 * to be the thing on screen, and stacking them made the student choose which
 * to read before either had said anything.
 *
 * The rail is gone with it. A rail was the right compromise while the box had
 * to stay above the fold; it put eleven of twelve recommendations off the
 * right edge and squeezed the reason for each one into a single clamped grey
 * line. Nothing about that survives contact with "the main value add is
 * showing recommended courses."
 *
 * Nothing was deleted. `/search`, `/schedule` and `/progression` still exist
 * and still work — they are just no longer in the nav, because a student who
 * wanted to browse a catalog would already be in Vergil.
 *
 * ── The streaming boundary is the whole reason for `HomeFeed` ──────────────
 *
 * `buildFeed` pages the active catalog and builds a prerequisite graph over
 * 8,189 courses; cold, that is seconds, and even memoised it is a database
 * round trip. `<Suspense>` boundaries wrap COMPONENTS, so the await has to
 * live in a child — a promise awaited in `HomePage` itself suspends
 * `HomePage`, and the header, the shell and the nav would wait behind the
 * engine for no reason.
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { RiChat3Line } from "@remixicon/react";

import { FeedPanel } from "@/components/feed/feed-panel";
import { FeedSkeleton } from "@/components/feed/feed-skeleton";
import { AppShell } from "@/components/shell/app-shell";
import { AuthErrorNotice } from "@/components/shell/auth-error-notice";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { HOME_FEED_LIMIT, buildFeed } from "@/lib/recommend/feed";
import { cx } from "@/utils/cx";

export const metadata: Metadata = {
  title: "Recommended courses — LionPlan",
  description:
    "Classes worth your next term, ranked against your own record and what past students said about them — each one saying why it is on the list.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  return (
    <AppShell activeNav="home">
      {/*
        720px, which is the width these same cards already render at on the
        last onboarding screen — the first feed a student sees and every feed
        after it are the same object, so they should not be two different
        shapes. `max-w-5xl` was sized for two columns; left alone under a
        single column it would stretch one card, and its seat meter, to 1024px.
      */}
      <PageContent className="max-w-[720px] gap-5">
        <AuthErrorNotice reason={params.auth_error} />

        {/*
          A title and nothing else.

          The eyebrow said "Fall 2026 & Spring 2027" and the description
          explained how the ranking works. Both were cut, and the cut is right:
          the terms are printed on every card already, and a paragraph about
          the ranking is the page arguing for itself before the reader has seen
          a single recommendation. The cards make that argument better — each
          one now says why it is there, in its own words, which is what the
          description was standing in for.
        */}
        <PageHeader title="Recommendations" hideTitleOnMobile />

        <Suspense fallback={<FeedSkeleton />}>
          <HomeFeed />
        </Suspense>

        <AskInstead />
      </PageContent>
    </AppShell>
  );
}

/**
 * The feed, awaited behind the boundary. See the note at the top of the file.
 *
 * Asks for `HOME_FEED_LIMIT` rather than taking the default: the default is
 * sized for the agent's tool call, where every extra card is tokens spent on
 * something the reader may never ask about. Here the cards ARE the page and
 * the cost of one more is a scroll.
 */
async function HomeFeed() {
  const feed = await buildFeed({ limit: HOME_FEED_LIMIT });
  return <FeedPanel feed={feed} />;
}

/**
 * The way out to `/chat`, at the bottom, on purpose.
 *
 * The box is the long tail — genuinely useful, and useful precisely to the
 * student who has already read the list and found it did not cover their case.
 * Putting it above the cards would ask a question of someone who came here to
 * be handed an answer; putting it below is where the reader who exhausted the
 * list actually is.
 *
 * ── Still a door, and now shaped like one ──────────────────────────────────
 *
 * This was one sentence with an inline link in it, and the constraint that
 * produced it is right and is kept: it must not read as an eleventh
 * recommendation. But "not a card" had been implemented as "not anything" —
 * a bare line of text left-aligned under a column of bordered cards, which
 * reads as a caption belonging to the card above rather than as its own
 * offer, gives no sign the list has ended, and puts the only tap target on a
 * run of inline text about four words wide.
 *
 * Three cheap things fix all of that without turning it into a destination.
 * A hairline that fades out at both ends punctuates the end of the list —
 * a full-strength rule would read as a table divider, and the taper says
 * "this is the edge of the content" instead. Centring breaks the column's
 * left-aligned rhythm, which is what stops it reading as more card. And the
 * link becomes an outline pill: a real target, and the same shape the
 * transcript control in onboarding uses, so the app has one way of drawing
 * "a secondary action you may not need".
 *
 * Outline rather than filled accent specifically because the chat FAB is
 * filled accent and floats over this same corner below `xl`. Two identical
 * loud buttons to one destination, one of them a hundred pixels from the
 * other, is a duplicate rather than a choice — so the persistent shortcut
 * stays the loud one and the contextual explanation stays quiet.
 */
function AskInstead() {
  return (
    <div className="flex flex-col items-center gap-5 px-1 pb-2">
      {/*
        Held at full strength across the middle and tapered only at the ends.
        A linear fade from the centre — the obvious `via-` gradient — peaked at
        the one hairline value the cards already use and averaged well under
        it, so the rule was fainter than every border above it and stopped
        reading as a boundary at all.
      */}
      <div
        aria-hidden
        className="h-px w-full bg-[linear-gradient(to_right,transparent,var(--color-border-table)_20%,var(--color-border-table)_80%,transparent)]"
      />
      <div className="flex flex-col items-center gap-2.5">
        <p className="text-center text-pretty text-headline-regular text-text-secondary">
          Something here not covered?
        </p>
        <Link
          href="/chat"
          className={cx(
            "inline-flex items-center gap-2 rounded-full border border-border-button-default",
            "px-4 py-2 text-body-medium text-text-secondary outline-none",
            "transition-colors duration-150",
            "hover:bg-background-secondary-hover hover:text-text-primary",
            "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            "pointer-coarse:py-2.5",
          )}
        >
          <RiChat3Line
            className="size-[1.125rem] shrink-0 text-accent-600"
            aria-hidden
          />
          Ask about your own case
        </Link>
      </div>
    </div>
  );
}
