import Link from "next/link";
import { RiSearchEyeLine } from "@remixicon/react";

import { AppShell } from "@/components/shell/app-shell";
import { ALL_TERMS, CURRENT_TERM, termLabel } from "@/lib/constants";

/**
 * A course id that resolves to nothing in the current term.
 *
 * `resolveCourse` already forgives the things a pasted link usually gets wrong
 * — a missing qualifier letter (`COMS4118` for `COMS4118W`), spacing, case — so
 * reaching this page means the course really is not offered this term, not
 * that we were fussy about formatting. The copy says which, because "404" here
 * usually means "not offered", and that is real information a student can act
 * on.
 */

export default function CourseNotFound() {
  const archived = ALL_TERMS.filter((term) => term !== CURRENT_TERM).slice(0, 3);

  return (
    <AppShell activeNav="search">
      <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 rounded-2lg border border-border-table bg-background-primary-default p-6 shadow-card">
        <RiSearchEyeLine className="size-6 text-foreground-icon-secondary" aria-hidden />

        <div>
          <h1 className="text-title-2-semibold text-text-primary">
            No such course in {termLabel(CURRENT_TERM)}
          </h1>
          <p className="mt-1.5 text-body-regular text-text-secondary">
            We looked past the usual link damage — a dropped qualifier letter, spacing,
            lower case — and still found nothing. Either the code is wrong, or the course
            simply is not being offered this term.
          </p>
          <p className="mt-2 text-caption-1-regular text-text-tertiary">
            Our archive covers {archived.map((term) => termLabel(term)).join(", ")} and
            more; offering history appears on every course page once ingest reaches it.
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
