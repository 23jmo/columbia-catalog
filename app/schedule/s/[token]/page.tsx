/**
 * `/schedule/s/[token]` — a shared schedule, read-only.
 *
 * The page a friend opens. No account, no shell, no controls: the week, the
 * classes on it, whose it is, and one button to make your own. The token in
 * the URL is the whole credential (migration 0038), so a revoked link 404s
 * rather than explaining itself.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RiBookShelfLine } from "@remixicon/react";

import { ButtonLink } from "@/components/base/buttons/button";
import { SharedScheduleView } from "@/components/schedule/shared-schedule-view";
import { termLabel } from "@/lib/constants";
import { loadSharedSchedule } from "@/lib/db/shared-schedule";
import { SITE_ORIGIN } from "@/lib/marketing/site";
import { cx } from "@/utils/cx";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ token: string }>;
}

function possessive(name: string | null): string {
  if (!name) return "A";
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.endsWith("s") ? `${first}’` : `${first}’s`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const shared = await loadSharedSchedule(token);
  if (!shared) return { title: "Schedule not found · LionPlan", robots: { index: false } };
  const title = `${possessive(shared.ownerName)} ${termLabel(shared.termCode)} schedule`;
  return {
    title: `${title} · LionPlan`,
    description: `${shared.sections.length} ${shared.sections.length === 1 ? "class" : "classes"} on the week, shared from LionPlan.`,
    robots: { index: false, follow: false },
    openGraph: { title, url: `${SITE_ORIGIN}/schedule/s/${token}`, type: "website" },
    twitter: { card: "summary_large_image", title },
  };
}

export default async function SharedSchedulePage({ params }: Params) {
  const { token } = await params;
  const shared = await loadSharedSchedule(token);
  if (!shared) notFound();

  const heading = `${possessive(shared.ownerName)} ${termLabel(shared.termCode)} schedule`;

  return (
    <div className="flex min-h-dvh flex-col bg-background-full">
      <header className="border-b border-border-table">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            aria-label="LionPlan"
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
            Make your own
          </ButtonLink>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-4 px-3 py-5 sm:gap-5 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-1 px-1">
          <h1 className="text-title-2-semibold -tracking-[0.01em] text-text-primary">{heading}</h1>
          <p className="text-caption-1-regular text-text-secondary">
            Read-only. {shared.sections.length} {shared.sections.length === 1 ? "class" : "classes"}
            {shared.customBlocks.length > 0 ? ` and ${shared.customBlocks.length} busy ${shared.customBlocks.length === 1 ? "block" : "blocks"}` : ""}.
          </p>
        </div>

        <SharedScheduleView shared={shared} />
      </main>

      <footer className="border-t border-border-table">
        <p className="mx-auto w-full max-w-[1100px] px-4 py-4 text-caption-1-regular text-text-tertiary sm:px-6">
          Shared from LionPlan, the course planner for Columbia and Barnard.{" "}
          <Link href="/about" className="text-text-secondary underline underline-offset-2 hover:text-text-primary">
            About
          </Link>
        </p>
      </footer>
    </div>
  );
}
