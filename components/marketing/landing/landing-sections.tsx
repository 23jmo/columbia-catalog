import { RiArrowRightLine } from "@remixicon/react";

import { OutstandingCard } from "@/components/profile/outstanding-card";
import { cx } from "@/utils/cx";

import { LANDING_OUTSTANDING } from "./landing-fixtures";
import { LandingCourseworkShot } from "./landing-coursework-shot";
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
        title="What a course catalog cannot tell you"
        blurb="Vergil lists every class at Columbia. It has no idea which rules you are under, or which of those classes you are allowed to take."
      />

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

/* ── Band 2: setup, as three steps ───────────────────────────────────────── */

const STEPS = [
  {
    title: "School and major",
    body: "Columbia College, Columbia Engineering, or Barnard, plus your graduation year. Then the fork questions: Lit Hum or CC, and which physics sequence you are on.",
  },
  {
    title: "What you have taken",
    body: "It guesses your transcript first, including the classes most people with your record have already taken. Fix it inline, or import a file.",
  },
  {
    title: "Your ranked list",
    body: "Sections for next term, ranked against your own record. Each one shows what it counts for and when it meets.",
  },
];

export function LandingSetup() {
  return (
    <section className="mx-auto flex w-full max-w-[75rem] flex-col items-center gap-12 px-5 py-16 sm:px-8 sm:py-24">
      {/*
        The heading used to be "Setup is three screens". That is a fact about
        the wizard, and the note on it was "no one cares". What the reader
        cares about is the thing the second screen actually does: it fills in
        the transcript before they type a course, so the ask is "fix what is
        wrong" rather than "list four semesters from memory".
      */}
      <SectionHeading
        title="You do not type your transcript"
        blurb="Pick your school and major, and it fills in the courses most people with your record have already taken. Fix what it got wrong, and your list is ready."
      />

      {/*
        Steps on the left, the actual second screen on the right.

        This band used to be three cards with a generic icon each, which is the
        page describing a wizard rather than showing one. `LandingCourseworkShot`
        is onboarding's own chips, so the claim in step 2 — that the transcript
        arrives already guessed — is made by the thing itself.

        The shot gets the narrower track. It is a wrap of pills and it reads
        best at roughly the measure the wizard gives it; handed half of 75rem
        it spreads into two long lines and stops looking like a screen.
      */}
      <div className="grid w-full items-center gap-10 sm:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] sm:gap-14">
        <ol className="flex flex-col gap-7">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background-secondary-default text-caption-1-semibold tabular-nums text-text-secondary">
                {index + 1}
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-[1.1875rem] font-medium leading-[1.3] tracking-[-0.02em] text-text-primary">
                  {step.title}
                </h3>
                <p className="text-pretty text-body-medium leading-[1.5] text-text-secondary">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <LandingCourseworkShot />
      </div>
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
