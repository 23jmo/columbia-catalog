import Link from "next/link";
import { RiUserSearchLine } from "@remixicon/react";

import { AppShell } from "@/components/shell/app-shell";
import { CURRENT_TERM, termLabel } from "@/lib/constants";

/**
 * A slug that matches nobody teaching this term.
 *
 * The copy is specific about *why*, because the reason is almost always
 * informative rather than a dead end: we identify instructors by the name the
 * registrar prints on a section, so a person exists to us only while they are
 * listed on a section in a term we have ingested. Someone on leave, someone
 * teaching a subject we have not crawled yet, and a genuinely mistyped URL all
 * land here — and the first two are facts a student can act on.
 */

export default function InstructorNotFound() {
  return (
    <AppShell activeNav="search">
      <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 rounded-2lg border border-border-table bg-background-primary-default p-6 shadow-card">
        <RiUserSearchLine className="size-6 text-foreground-icon-secondary" aria-hidden />

        <div>
          <h1 className="text-title-2-semibold text-text-primary">
            No instructor by that name in {termLabel(CURRENT_TERM)}
          </h1>
          <p className="mt-1.5 text-body-regular text-pretty text-text-secondary">
            We know an instructor only by the name the registrar prints on a section, so
            someone appears here only while they are listed on a class we have ingested.
            They may be on leave, teaching a subject we have not crawled yet, or listed
            under a different form of their name.
          </p>
          <p className="mt-2 text-caption-1-regular text-text-tertiary">
            Searching the catalog by name will find every section they are on.
          </p>
        </div>

        <Link
          href="/search"
          className="inline-flex h-9 items-center rounded-2lg bg-background-secondary-default px-3 text-body-medium text-text-primary transition-colors outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Search the catalog
        </Link>
      </div>
    </AppShell>
  );
}
