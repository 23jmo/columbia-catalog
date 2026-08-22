import Link from "next/link";
import { EnrollmentMeter } from "./EnrollmentMeter";
import { formatCredits, formatMeeting } from "@/lib/format";
import type { Section } from "@/lib/types";

export function SectionCard({ section }: { section: Section }) {
  const href = section.detailPath ?? `/section/${section.subject}/${section.classIdentifier}`;
  const isVideo = /^V/i.test(section.section);

  return (
    <Link
      href={href}
      className="block rounded-2xl border border-line bg-card px-4 py-4 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-gold/40"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-wide text-gold">
            {section.courseIdentifier} · {section.section}
          </p>
          <h3 className="mt-1 font-display text-xl leading-tight text-navy-deep">
            {section.title}
          </h3>
        </div>
        <EnrollmentMeter enrollment={section.enrollment} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-ink-soft sm:grid-cols-4">
        <div>
          <dt className="text-[10px] tracking-[0.14em] uppercase">Call</dt>
          <dd className="tabular-nums text-ink">{section.callNumber || "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.14em] uppercase">Points</dt>
          <dd className="text-ink">{formatCredits(section.credits)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] tracking-[0.14em] uppercase">Instructors</dt>
          <dd className="text-ink">
            {section.instructors.length > 0 ? section.instructors.join(", ") : "TBA"}
          </dd>
        </div>
      </dl>

      {section.meetings[0] && (
        <p className="mt-3 text-sm text-ink">{formatMeeting(section.meetings[0])}</p>
      )}
      {section.notes && (
        <p className="mt-2 text-xs text-ink-soft">{section.notes}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-soft">
        {isVideo && (
          <span className="rounded-full border border-line px-2 py-0.5">CVN</span>
        )}
        <span>{section.enrollment.status === "open" ? "Open" : section.enrollment.status === "full" ? "Full" : "Status unknown"}</span>
        {section.enrollment.asOf && <span>as of {section.enrollment.asOf}</span>}
      </div>
    </Link>
  );
}
