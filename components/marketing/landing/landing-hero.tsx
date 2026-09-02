import Link from "next/link";

import { LandingNav } from "./landing-nav";
import { LandingProductShot } from "./landing-product-shot";

/**
 * The hero: a sky, a skyline, one claim, and the actual feed under it.
 *
 * ── The bounce this page exists to fix ─────────────────────────────────────
 *
 * `/` used to 307 straight to `/onboarding`. A stranger arriving from a search
 * result or a shared link was handed a five-screen wizard about their degree
 * before being told what the site was. That is the bounce — not a slow page or
 * a weak headline, but a form where the answer to "what is this" should have
 * been. So the order here is claim, evidence, then ask.
 *
 * ── How the backdrop is built ──────────────────────────────────────────────
 *
 * Three stacked layers, no photograph:
 *
 *   1. A sky gradient, starting at #03225a — the navy of `app/icon.png`, so
 *      the mark in the nav sits in its own colour and reads as the lion rather
 *      than as a badge dropped on a background.
 *   2. `/art/campus-plate.png` used as a MASK, not as an image. The plate is
 *      8-bit gray+alpha (see `scripts/build-signin-art.ts`), so its alpha is
 *      building *coverage* — feed that to `mask-image` and the massing of
 *      Morningside Heights can be painted any colour we like. Shipping it as
 *      an `<img>` instead would paint the greys it was authored in, which are
 *      tuned for a dither over a light card and read as smog over a sunrise.
 *   3. A fade to the page background, so the section ends without an edge.
 *
 * This is why the answer to "we want a Columbia photographic backdrop" is a
 * 29 KB asset already in the repository rather than a licensed stock photo: it
 * is the actual campus, it is ours, and it costs the page almost nothing —
 * which matters on the one page whose job is to not be left.
 *
 * ── Type ───────────────────────────────────────────────────────────────────
 *
 * The headline is the display serif at a `clamp()` that tops out at 80px with
 * leading below 1. Tight leading is what makes a large serif read as a
 * masthead instead of a paragraph; at `leading-normal` the same size just
 * looks like body copy that got away.
 */

const SKY =
  "bg-[linear-gradient(to_bottom,#03225a_0%,#0c3f86_24%,#2f74c4_46%,#7fb6e4_66%,#cfe4f3_82%,#ffffff_100%)]";

const PLATE = "bg-[linear-gradient(to_bottom,#03225a_0%,#17457f_55%,#6d9cc9_100%)]";

export function LandingHero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* 1. The sky. */}
      <div aria-hidden className={`absolute inset-0 -z-30 ${SKY}`} />

      {/* 2. Morningside Heights, as a mask over a single tone. */}
      <div
        aria-hidden
        className={`absolute inset-x-0 bottom-0 -z-20 h-[42%] opacity-70 ${PLATE}`}
        style={{
          WebkitMaskImage: "url(/art/campus-plate.png)",
          maskImage: "url(/art/campus-plate.png)",
          WebkitMaskSize: "cover",
          maskSize: "cover",
          WebkitMaskPosition: "bottom center",
          maskPosition: "bottom center",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        }}
      />

      {/* 3. Dissolve into the page rather than ending on a line. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-56 bg-[linear-gradient(to_bottom,transparent,var(--color-background-full))]"
      />

      <LandingNav />

      <div className="mx-auto flex w-full max-w-[75rem] flex-col items-center px-5 pb-0 pt-28 sm:px-8 sm:pt-36">
        <div className="flex max-w-[52rem] flex-col items-center gap-6 text-center">
          <h1 className="text-balance font-[family-name:var(--font-display-serif)] text-[clamp(2.75rem,7vw,5rem)] font-medium leading-[0.96] tracking-[-0.015em] text-white">
            Know what to take next, and why
          </h1>

          <p className="max-w-[44ch] text-pretty text-[1.0625rem] font-medium leading-[1.45] tracking-[-0.02em] text-white/80 sm:text-[1.1875rem]">
            Tell it your major and what you have already taken. It ranks the
            sections on offer next term against the Bulletin&rsquo;s
            requirements, and every card says why it is on the list.
          </p>

          <div className="mt-2 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/onboarding"
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-white px-6 text-[0.9375rem] font-medium tracking-[-0.01em] text-[#03225a] shadow-[0_10px_30px_-8px_rgba(3,34,90,0.6)] outline-none transition-colors duration-150 hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/70 sm:w-auto"
            >
              Get my list
            </Link>
            <Link
              href="/search"
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-white/35 px-6 text-[0.9375rem] font-medium tracking-[-0.01em] text-white outline-none transition-colors duration-150 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 sm:w-auto"
            >
              Browse the catalog
            </Link>
          </div>

          {/*
            The most load-bearing sentence on the page. A visitor's working
            assumption, formed by every other student tool, is that the second
            button is a login in disguise. Saying otherwise costs less than
            letting them find out by leaving.
          */}
          <p className="text-[0.8125rem] tracking-[-0.01em] text-white/65">
            No account needed to browse all 8,189 courses.
          </p>
        </div>

        <LandingProductShot />
      </div>
    </section>
  );
}
