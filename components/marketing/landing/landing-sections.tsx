import Link from "next/link";
import { RiArrowRightLine, RiSearchLine } from "@remixicon/react";

import { ReputationBlock } from "@/components/course/reputation";
import { RmpBlock } from "@/components/course/rmp-block";
import { OutstandingCard } from "@/components/profile/outstanding-card";
import { cx } from "@/utils/cx";

import {
  LANDING_OUTSTANDING,
  LANDING_REPUTATION,
  LANDING_RMP,
  LANDING_SEARCHES,
} from "./landing-fixtures";
import { LandingReasonCard } from "./landing-product-shot";

/*
 * Type scale, lifted from the reference and applied by hand.
 *
 * `styles/typography.css` is the Figma export and is not ours to extend, and
 * its ramp is built on different numbers (display-1 is 56/72, display-2 is
 * 48/64) with normal leading. The landing page wants tighter tracking and
 * sub-1.2 leading at display sizes, so the headings below use arbitrary
 * values instead of the ramp. That is deliberate and confined to this page —
 * every signed-in surface still uses the tokens.
 *
 * Named here rather than repeated inline so the bands cannot drift into three
 * slightly different "section headings", which is what happened to the
 * spacing before it was pulled into `SectionHeading`.
 */
const H2 =
  "text-balance text-[clamp(2rem,4.4vw,3.5rem)] font-medium leading-[1.12] tracking-[-0.03em] text-text-primary";
const H3 =
  "text-balance text-[clamp(1.375rem,2.2vw,1.75rem)] font-medium leading-[1.22] tracking-[-0.02em] text-text-primary";
const LEAD =
  "text-pretty text-[1.0625rem] leading-[1.5] tracking-[-0.011em] text-text-secondary";

function SectionHeading({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <div className="mx-auto flex max-w-[44rem] flex-col items-center gap-4 text-center">
      <h2 className={H2}>{title}</h2>
      {blurb ? <p className={cx(LEAD, "max-w-[46ch]")}>{blurb}</p> : null}
    </div>
  );
}

/* ── Band 1: alternating text / visual ───────────────────────────────────── */

/**
 * Both illustrations here are real product components.
 *
 * `OutstandingCard` is what the profile page prints, and `LandingReasonCard`
 * wraps the same `FeedCardView` the feed renders. They replaced two drawings —
 * a fake audit panel and a fake prerequisite chain — and the drawings were
 * wrong in the way drawings are: the audit list had five identical rows, when
 * the real one's whole argument is that a requirement naming specific courses
 * is a different job from one you certify with an adviser, and the chain
 * implied a linear ladder the prerequisite graph does not have.
 *
 * A landing page whose screenshots are drawings is making a promise it has
 * not checked. These two cannot fall out of date, because there is nothing to
 * keep in sync.
 */
const HELP_BLOCKS = [
  {
    title: "It works out which requirements you are under",
    body: "Core, Foundations, your major, your minor. All of it mapped by hand from the Bulletin and Barnard's catalogue instead of guessed at. It also knows the fork questions a requirement list cannot answer for you, like Lit Hum or CC, and asks them once.",
    visual: (
      <OutstandingCard
        remaining={[...LANDING_OUTSTANDING]}
        className="shadow-[0_1px_3px_rgba(3,34,90,0.08),0_24px_50px_-30px_rgba(3,34,90,0.45)] ring-1 ring-black/[0.06]"
      />
    ),
    /*
      A wider track than its text, unlike the block below.

      `OutstandingCard` switches to its side-by-side row at `sm` — a VIEWPORT
      query, which on a laptop is true no matter how narrow the column it has
      actually been given. In an even split it got 540px, took the wide layout
      anyway, and wrapped "Science Requirement (Category A)" over four lines.
      This is the tax on reusing a real product component in a marketing
      layout, and the fix is to give it the measure it was designed at rather
      than to fork the component for this page.
    */
    columns: "sm:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]",
  },
  {
    title: "Then it ranks what you can actually get into",
    body: "A prerequisite graph over the whole catalog works out what is open to you this term, and what taking it opens up later. Every card writes down its reasons, so you can tell a bad recommendation from a bad assumption.",
    visual: <LandingReasonCard />,
    // A single card is comfortable at half, and an even split is what makes
    // the reversal below read as a mirror of the block above it.
    columns: "sm:grid-cols-2",
  },
];

export function LandingHowItHelps() {
  return (
    <section className="mx-auto flex w-full max-w-[75rem] flex-col gap-14 px-5 py-16 sm:gap-20 sm:px-8 sm:py-24">
      <SectionHeading
        title="Find the class you actually need"
        blurb="Ask for it the way you would ask a friend who had read the whole Bulletin. It knows which rules you are under, what you have taken, and what is still open."
      />

      <LandingSearches />

      {HELP_BLOCKS.map((block, index) => (
        <div
          key={block.title}
          className={cx("grid items-center gap-8 sm:gap-14", block.columns)}
        >
          <div
            className={cx(
              "flex flex-col gap-4",
              // Second block reverses, so the eye zig-zags down the page
              // instead of running along one column.
              index % 2 === 1 ? "sm:order-2" : undefined,
            )}
          >
            <h3 className={H3}>{block.title}</h3>
            <p className={LEAD}>{block.body}</p>
          </div>
          <div className={index % 2 === 1 ? "sm:order-1" : undefined}>
            {block.visual}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ── Band 1, the figure: three searches, as typed ────────────────────────── */

/**
 * A search box with three real questions in it, and nothing typed for you.
 *
 * ── Why questions and not filters ──────────────────────────────────────────
 *
 * The catalog has a filter panel and so does Vergil. What a filter panel
 * cannot take is "easy Global Core" or "like the ones I have already taken",
 * because those are questions about the student, not about the course, and
 * they are the questions students actually have. The three lines here are
 * the ones a student would type, in their own words.
 *
 * ── Why it links to the chat and not to the catalog ────────────────────────
 *
 * `/search` is lexical and semantic over course text; it does not know a
 * transcript. The questions above need the record, and the chat is the
 * surface that reads it (see the advisor band). `/chat` takes no query
 * parameter, so the box is a figure and the whole thing is one link.
 */
function LandingSearches() {
  return (
    <Link
      href="/chat"
      aria-label="Ask the chat what to take"
      className="group mx-auto flex w-full max-w-[40rem] flex-col gap-2 rounded-[1.25rem] border border-border-table bg-background-primary-default p-2 shadow-[0_1px_3px_rgba(3,34,90,0.08),0_24px_50px_-30px_rgba(3,34,90,0.45)] outline-none transition-shadow duration-150 hover:shadow-[0_1px_3px_rgba(3,34,90,0.10),0_28px_56px_-28px_rgba(3,34,90,0.5)] focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <div className="flex items-center gap-3 rounded-[0.875rem] bg-background-secondary-default px-4 py-3">
        <RiSearchLine className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <span className="text-body-regular text-text-placeholder">What are you looking for?</span>
      </div>
      <ul className="flex flex-col">
        {LANDING_SEARCHES.map((query) => (
          <li
            key={query}
            className="flex items-center gap-3 rounded-[0.875rem] px-4 py-3 text-body-regular text-text-primary transition-colors duration-150 group-hover:bg-background-secondary-default/60"
          >
            <RiSearchLine className="size-4 shrink-0 text-text-tertiary" aria-hidden />
            <span className="text-pretty">{query}</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}

/* ── Band 2: every review, one place ─────────────────────────────────────── */

/**
 * The reviews band, built from the instructor page's own two blocks.
 *
 * `ReputationBlock` is what `instructor-profile.tsx` renders for CULPA and
 * Reddit, with the same per-source count under it, and `RmpBlock` is the
 * RateMyProfessor block with a pre-resolved snapshot — no `lookup`, so it
 * never fetches. Together they are the claim in the heading, made by the
 * thing itself rather than by three logos in a row.
 *
 * ── RMP is read live, and the band says so ─────────────────────────────────
 *
 * The RateMyProfessor block's compliance rules (see its header) mean we never
 * store that data; we read it when a student opens the page. The blurb says
 * "read live" rather than "collected" for exactly that reason, and the block
 * itself prints its fetch time, which is the same thing said in the product's
 * own voice.
 *
 * `inert` and `role="img"`: the RMP block carries a real link out and this is
 * a figure, not a place to leave the page from.
 */
export function LandingReviews() {
  return (
    <section className="mx-auto flex w-full max-w-[75rem] flex-col items-center gap-12 px-5 py-16 sm:px-8 sm:py-24">
      <SectionHeading
        title="Every review, in one place"
        blurb="CULPA, Reddit and RateMyProfessor, read for every instructor and folded into one summary: how they teach, how much work it is, and whether people would take it again. No more six tabs per class."
      />

      <figure
        role="img"
        aria-label="An instructor's reviews on LionPlan: a CULPA and Reddit summary showing teaching quality, workload, difficulty and grading fairness out of five with the number of reviews behind each, beside the live RateMyProfessor rating for the same person."
        className="w-full max-w-[46rem]"
      >
        <div
          inert
          className="grid gap-3 rounded-[1.25rem] bg-background-primary-default p-3 shadow-[0_2px_10px_rgba(3,34,90,0.10),0_36px_70px_-32px_rgba(3,34,90,0.42)] ring-1 ring-black/[0.07] sm:grid-cols-2 sm:p-4"
        >
          <ReputationBlock
            title="Instructor quality"
            subtitle="Aggregated from CULPA and Reddit reviews of this person."
            summary={LANDING_REPUTATION}
          />
          <RmpBlock instructorName="this instructor" snapshot={LANDING_RMP} />
        </div>
      </figure>
    </section>
  );
}

/* ── Band 4: the catalog is open, in four figures ────────────────────────── */

/**
 * Four figures, every one checkable in this repository: the catalog row count
 * the recommender pages, the authored program registry, the majors inside it,
 * and the schools that complete onboarding today.
 *
 * Deliberately no user count. The About page's copy rules forbid it, and a
 * student project quoting a user number invites the reader to work out how
 * small it is.
 *
 * ── No illustration ────────────────────────────────────────────────────────
 *
 * This band used to carry a drawn list of four invented search results beside
 * the numbers. The claim it was illustrating is "the catalog is open" — and
 * the honest way to make that claim is the link at the bottom, which is one
 * click from the actual catalog with no account. A picture of a search page
 * next to a button that opens the search page is the picture losing.
 */
const STATS = [
  { figure: "8,189", label: "courses in the catalog" },
  { figure: "37", label: "requirement programs" },
  { figure: "32", label: "majors mapped" },
  { figure: "3", label: "schools live today" },
];

export function LandingCatalogSplit() {
  return (
    <section className="mx-auto flex w-full max-w-[75rem] flex-col items-center gap-12 px-5 py-16 sm:px-8 sm:py-24">
      <SectionHeading
        title="Look around before you sign up"
        blurb="The whole catalog is readable without an account, down to the seat counts. Decide whether this is worth your time before you tell it anything about yourself."
      />

      <dl className="grid w-full max-w-[54rem] grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center gap-1.5 text-center">
            <dt className="sr-only">{stat.label}</dt>
            <dd className="flex flex-col items-center gap-1.5">
              <span className="text-[clamp(2.25rem,4.5vw,3.25rem)] font-medium tabular-nums leading-none tracking-[-0.035em] text-text-primary">
                {stat.figure}
              </span>
              <span className="text-body-2-regular text-text-tertiary">
                {stat.label}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <a
        href="/search"
        className="inline-flex items-center gap-1.5 text-[0.9375rem] font-medium tracking-[-0.01em] text-accent-600 outline-none transition-colors duration-150 hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        Browse the catalog
        <RiArrowRightLine className="size-4" aria-hidden />
      </a>
    </section>
  );
}
