import type { ReactNode } from "react";
import Link from "next/link";
import { RiBookShelfLine } from "@remixicon/react";

import { ButtonLink } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

/**
 * Chrome for the public, no-login pages.
 *
 * These routes must not wrap in `AppShell`. The shell is the signed-in app:
 * nav items, plan sync, the crawl worker. A journalist hitting /about does
 * not want any of that, and the nav targets would bounce them into the
 * wizard. This frame is a document: mark, legal links, one CTA.
 *
 * A small footer links About, FAQ, Privacy, and Terms so those pages are
 * not orphans. No author credit, no GitHub, no athletic mark.
 */

export function PublicDoc({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background-full">
      <header className="border-b border-border-table">
        <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/about"
            aria-label="LionPlan, about"
            className={cx(
              "flex min-w-0 items-center gap-2 rounded-2lg p-1 outline-none",
              "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-b from-accent-500 to-accent-600 shadow-xs">
              <RiBookShelfLine className="size-4 text-white" aria-hidden />
            </span>
            <span className="text-body-medium text-text-primary">LionPlan</span>
          </Link>

          <ButtonLink href="/onboarding" size="small">
            Get started
          </ButtonLink>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </main>

      <footer className="border-t border-border-table">
        <nav
          aria-label="About this site"
          className="mx-auto flex w-full max-w-[720px] flex-wrap gap-x-4 gap-y-2 px-4 py-4 sm:px-6"
        >
          <FooterLink href="/about">About</FooterLink>
          <FooterLink href="/faq">FAQ</FooterLink>
          <FooterLink href="/privacy">Privacy</FooterLink>
          <FooterLink href="/terms">Terms</FooterLink>
        </nav>
      </footer>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-caption-1-medium text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      {children}
    </Link>
  );
}

/** Section heading plus body stack, used by the legal pages. */
export function PublicSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title-3-semibold text-text-primary">{title}</h2>
      <div className="flex flex-col gap-3 text-headline-regular text-pretty text-text-secondary">
        {children}
      </div>
    </section>
  );
}
