import Link from "next/link";

import { LionMark } from "./landing-mark";

/**
 * The closing ask — left-aligned, on a tinted panel.
 *
 * Left-aligned and not centred, which is the one place this page breaks its
 * own symmetry on purpose. A centred block reads as a poster and gets
 * skimmed; a left-aligned headline with the button under its first character
 * reads as a sentence ending in an action, and the eye that has just finished
 * the FAQ is already at the left margin.
 *
 * The buttons repeat the hero's, in the same order and with the same labels.
 * That repetition is the point: a visitor who scrolled this far has
 * re-qualified themselves, and making them scroll back up is the cheapest
 * bounce on the page to lose. Rewording it to keep things "fresh" would only
 * make the reader stop and work out whether it is the same offer.
 */
export function LandingClosingCta() {
  return (
    <section className="mx-auto w-full max-w-[75rem] px-5 pb-16 sm:px-8 sm:pb-24">
      <div className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#eef3fb_0%,#e6edf9_45%,#f4f0fb_100%)] px-7 py-14 sm:px-14 sm:py-20">
        {/*
          The campus plate again, echoing the hero — masked so it reads as a
          watermark rather than a picture, and clipped to the right half so it
          never runs under the headline.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-[linear-gradient(to_bottom,#03225a,#7fb6e4)] opacity-[0.13] sm:block"
          style={{
            WebkitMaskImage: "url(/art/campus-plate.png)",
            maskImage: "url(/art/campus-plate.png)",
            WebkitMaskSize: "cover",
            maskSize: "cover",
            WebkitMaskPosition: "center right",
            maskPosition: "center right",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
          }}
        />

        <div className="relative flex max-w-[34rem] flex-col items-start gap-5">
          <h2 className="text-balance font-[family-name:var(--font-display-serif)] text-[clamp(2.25rem,4.6vw,3.5rem)] font-medium leading-[1.05] tracking-[-0.02em] text-[#03225a]">
            Registration week is easier with a list
          </h2>
          <p className="text-pretty text-[1.0625rem] leading-[1.5] tracking-[-0.011em] text-[#03225a]/75">
            I built LionPlan because I was tired of keeping the Bulletin,
            Vergil and CULPA open in three tabs and still not knowing what
            counted. Set up once and you have a ranked plan for next term.
          </p>
          <div className="mt-1 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/onboarding"
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#03225a] px-6 text-[0.9375rem] font-medium tracking-[-0.01em] text-white outline-none transition-colors duration-150 hover:bg-[#062f75] focus-visible:ring-2 focus-visible:ring-border-focus-ring sm:w-auto"
            >
              Get my list
            </Link>
            <Link
              href="/search"
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#03225a]/25 px-6 text-[0.9375rem] font-medium tracking-[-0.01em] text-[#03225a] outline-none transition-colors duration-150 hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-border-focus-ring sm:w-auto"
            >
              Browse the catalog
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Footer.
 *
 * ── The disclaimer is a footer element, not fine print ─────────────────────
 *
 * "Not affiliated with Columbia University or Barnard College" is the single
 * sentence this site is most obliged to say, and the About page and FAQ both
 * carry it. It sits at readable size and normal text colour rather than
 * shrunk into a grey legal line: a disclaimer styled to be skipped is one a
 * reader can fairly say they never saw.
 *
 * Four columns, matching the reference's shape — but the reference fills its
 * fourth column with twenty product links and this site does not have twenty
 * pages. Rather than pad it with links back to itself, the fourth column is
 * the disclaimer and the honest statement of what this is.
 */
const FOOTER_GROUPS = [
  {
    heading: "Product",
    links: [
      { href: "/search", label: "Course catalog" },
      { href: "/programs", label: "Programs" },
      { href: "/onboarding", label: "Get started" },
    ],
  },
  {
    heading: "About",
    links: [
      { href: "/about", label: "What LionPlan is" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-border-table bg-background-secondary-default">
      <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-12 px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex max-w-[30ch] flex-col gap-3">
            {/*
              The same `app/icon.png` the nav and the social card use. Serif
              beside it, because the footer is the one place on this page where
              the name is a signature rather than a control.
            */}
            <span className="flex items-center gap-2.5">
              <LionMark size={26} />
              <span className="font-[family-name:var(--font-display-serif)] text-[1.375rem] font-medium tracking-[-0.01em] text-text-primary">
                LionPlan
              </span>
            </span>
            <p className="text-pretty text-body-medium leading-[1.5] text-text-secondary">
              A course planner for Columbia College, Columbia Engineering and
              Barnard College. Built by a Columbia student.
            </p>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <div key={group.heading} className="flex flex-col gap-3">
              <span className="text-caption-1-semibold uppercase tracking-[0.08em] text-text-tertiary">
                {group.heading}
              </span>
              <ul className="flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-body-medium text-text-secondary outline-none transition-colors duration-150 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/*
          The rule spans the footer; the sentence is capped at 80ch. Those are
          two different jobs, and putting the border on the paragraph made the
          divider stop three quarters of the way across.
        */}
        <div className="border-t border-border-table pt-8">
          <p className="max-w-[80ch] text-pretty text-body-medium leading-[1.5] text-text-secondary">
            LionPlan is an unofficial student project. It is not affiliated with
            Columbia University or Barnard College, and it is not a substitute
            for your degree audit or for advising.
          </p>
        </div>
      </div>
    </footer>
  );
}
