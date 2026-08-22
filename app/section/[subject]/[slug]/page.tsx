import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentMeter } from "@/components/EnrollmentMeter";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { loadCatalog, loadSectionDetail } from "@/lib/catalog";
import { normalizeSubject, sectionPageUrl } from "@/lib/constants";
import { formatCredits, formatFetchedAt, formatMeeting } from "@/lib/format";

export const revalidate = 600;

export default async function SectionPage({
  params,
}: {
  params: Promise<{ subject: string; slug: string }>;
}) {
  const { subject: rawSubject, slug } = await params;
  const subject = normalizeSubject(rawSubject);
  const catalog = await loadCatalog(subject);
  const listed = catalog.sections.find((row) => row.classIdentifier === slug);
  const detail = await loadSectionDetail(subject, slug, listed);

  if (!detail) notFound();

  const directoryUrl = sectionPageUrl(detail.subject, detail.classIdentifier);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link href={`/?subject=${detail.subject}`} className="text-sm text-gold">
          ← {detail.subject} catalog
        </Link>

        <p className="mt-6 font-mono text-sm text-gold">
          {detail.courseIdentifier} · Section {detail.section}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-tight text-navy-deep">
          {detail.title}
        </h1>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-card p-5">
          <dl className="grid flex-1 grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[10px] tracking-[0.14em] text-ink-soft uppercase">Call</dt>
              <dd className="tabular-nums">{detail.callNumber}</dd>
            </div>
            <div>
              <dt className="text-[10px] tracking-[0.14em] text-ink-soft uppercase">Points</dt>
              <dd>{formatCredits(detail.credits)}</dd>
            </div>
            <div>
              <dt className="text-[10px] tracking-[0.14em] text-ink-soft uppercase">Term</dt>
              <dd>{detail.term}</dd>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-[10px] tracking-[0.14em] text-ink-soft uppercase">Instructors</dt>
              <dd>{detail.instructors.join(", ") || "TBA"}</dd>
            </div>
          </dl>
          <EnrollmentMeter enrollment={detail.enrollment} />
        </div>

        {detail.meetings[0] && (
          <p className="mt-4 text-sm text-ink">{formatMeeting(detail.meetings[0])}</p>
        )}

        {detail.prerequisites && (
          <section className="mt-8">
            <h2 className="font-display text-2xl text-navy-deep">Prerequisites</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{detail.prerequisites}</p>
          </section>
        )}

        {detail.description && (
          <section className="mt-8">
            <h2 className="font-display text-2xl text-navy-deep">Description</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{detail.description}</p>
          </section>
        )}

        <dl className="mt-8 grid gap-3 text-sm text-ink-soft">
          {detail.type && (
            <div>
              <dt className="text-[10px] tracking-[0.14em] uppercase">Type</dt>
              <dd className="text-ink">{detail.type}</dd>
            </div>
          )}
          {detail.instructionMethod && (
            <div>
              <dt className="text-[10px] tracking-[0.14em] uppercase">Instruction</dt>
              <dd className="text-ink">{detail.instructionMethod}</dd>
            </div>
          )}
          {detail.openTo && (
            <div>
              <dt className="text-[10px] tracking-[0.14em] uppercase">Open to</dt>
              <dd className="text-ink">{detail.openTo}</dd>
            </div>
          )}
          {detail.gradingMode && (
            <div>
              <dt className="text-[10px] tracking-[0.14em] uppercase">Grading</dt>
              <dd className="text-ink">{detail.gradingMode}</dd>
            </div>
          )}
          {detail.notes && (
            <div>
              <dt className="text-[10px] tracking-[0.14em] uppercase">Notes</dt>
              <dd className="text-ink">{detail.notes}</dd>
            </div>
          )}
        </dl>

        <p className="mt-8 text-xs text-ink-soft">
          Status {detail.enrollment.status}
          {detail.enrollment.asOf ? ` · as of ${detail.enrollment.asOf}` : ""}
          {" · "}
          <a className="underline decoration-gold/60" href={directoryUrl}>
            Public directory page
          </a>
        </p>
      </article>
      <SiteFooter fetchedAt={formatFetchedAt(detail.fetchedAt)} />
    </div>
  );
}
