import Link from "next/link";

import { LionMark } from "./landing-mark";

/**
 * The landing header, floating over the hero.
 *
 * Transparent and absolutely positioned rather than sticky: the hero owns the
 * top of the page and the nav sits inside its colour, which is what makes the
 * gradient read as a full-bleed backdrop instead of a band under a toolbar.
 * That also means every control here is white-on-gradient, so the wordmark is
 * rebuilt locally instead of reusing `ShellWordmark` — that component paints a
 * blue glyph tile and `text-text-primary`, both of which vanish against the
 * hero.
 *
 * ── The mark is the real one ───────────────────────────────────────────────
 *
 * `app/icon.png`: the lion, white on #03225a, the same file the favicon and
 * the social card use. Imported as a module rather than copied into `public/`
 * so there is one mark in this repository and it cannot drift from the tab
 * icon; `LionMark` owns the crop it needs. See that file.
 *
 * The hero's sky starts at exactly that navy, so the disc dissolves into the
 * gradient and what is left over the sky is the lion itself. That is the whole
 * reason the nav has no ring or tile around it — a border here would draw the
 * disc back on and make the mark look pasted onto the photograph.
 *
 * It does not follow the scroll. A sticky bar would need an opaque background
 * the moment it left the gradient, and the page is short enough that the
 * closing CTA is the natural second chance to convert.
 */

const LINKS = [
  { href: "/search", label: "Catalog" },
  { href: "/programs", label: "Programs" },
  { href: "/about", label: "About" },
] as const;

export function LandingNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <nav
        aria-label="Main"
        className="mx-auto flex h-[4.5rem] w-full max-w-[75rem] items-center justify-between gap-4 px-5 sm:px-8"
      >
        <Link
          href="/"
          aria-label="LionPlan — home"
          className="flex items-center gap-2.5 rounded-lg py-1 outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <LionMark size={26} priority />
          <span className="text-[1.0625rem] font-medium tracking-[-0.02em] text-white">
            LionPlan
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-0.5 sm:flex">
            {LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-[0.875rem] font-medium tracking-[-0.01em] text-white/70 outline-none transition-colors duration-150 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/*
            A white pill on the gradient. The app's `Button` is not used here
            for the same reason the wordmark is not: every variant it has is
            built for a light surface, and `secondary` would put a white card
            with a grey border on top of a photograph.
          */}
          <Link
            href="/onboarding"
            className="inline-flex h-9 items-center rounded-full bg-white px-4 text-[0.875rem] font-medium tracking-[-0.01em] text-[#03225a] outline-none transition-colors duration-150 hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
