import Link from "next/link";

import { PrefetchLink } from "@/components/catalog/prefetch-link";

import { loadSectionDetail } from "@/components/course/load-section-detail";
import { meetingLines } from "@/components/course/format";
import { CURRENT_TERM, termLabel } from "@/lib/constants";

import { DRAWER_TITLE_ID, DrawerCloseButton, DrawerFrame } from "@/app/course/[courseId]/course-drawer";
import { SectionDetail } from "@/app/course/[courseId]/section-detail";

/**
 * `/course/[courseId]?section=NNN`, intercepted — the SECTION drawer.
 *
 * When the navigation starts inside the app, Next renders this into the root
 * `drawer` slot instead of replacing the page, so the overlay opens over
 * whatever the student was on and their search results and filters survive
 * untouched (spec §7: "Opens over search. Never loses the student's results or
 * filters."). A cold load of the same URL skips interception and gets the
 * standalone `app/course/[courseId]/page.tsx`.
 *
 * ── Why this is not the course ─────────────────────────────────────────────
 *
 * The drawer shows one section, never a whole course. Search results are
 * sections now: a single-section course IS its section, and a multi-section
 * course expands in place into its sections rather than opening anything. So
 * every click that reaches this route has already named a specific class, and
 * answering it with a course-level overlay would discard the choice the student
 * just made — most visibly on container courses, where "Physical Education
 * Activities" is a filing category and "PHED: Swim (Beginner)" is the class.
 *
 * That is also why this route is fast. It resolves one course record and picks
 * a section out of it; it does not assemble similar courses or eight terms of
 * offering history, which is what made the old course-level drawer take
 * seconds to answer a click.
 *
 * The standalone page keeps the full course view. Two surfaces, two questions.
 */

interface InterceptedSectionPageProps {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ section?: string | string[] }>;
}

/** `?section=001&section=002` is not a thing anyone means; take the first. */
function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function InterceptedSectionPage({
  params,
  searchParams,
}: InterceptedSectionPageProps) {
  const [{ courseId }, query] = await Promise.all([params, searchParams]);
  const sectionCode = firstParam(query.section);

  const { data, course, sections } = await loadSectionDetail(
    courseId,
    sectionCode,
    CURRENT_TERM,
  );

  /*
   * Deliberately NOT `notFound()`.
   *
   * A not-found thrown from a slot escapes the drawer and replaces the whole
   * screen — which would destroy the results the student was standing on to
   * report a bad link. Inside the overlay, "this isn't offered" is a message,
   * and closing it puts them back exactly where they were. The standalone
   * route still does the real 404, because there is nothing behind it to
   * preserve.
   */
  if (!course) {
    return (
      <DrawerFrame>
        <div className="flex flex-col items-start gap-3">
          <div className="flex w-full items-start justify-between gap-3">
            <h1 id={DRAWER_TITLE_ID} className="text-title-2-semibold text-balance text-text-primary">
              No such course in {termLabel(CURRENT_TERM)}
            </h1>
            <DrawerCloseButton className="shrink-0" />
          </div>
          <p className="text-body-regular text-text-secondary">
            Nothing in this term matches{" "}
            <code className="font-mono text-text-primary">{courseId}</code>. Either the code
            is wrong or the course is not being offered — close this to go back to your
            results.
          </p>
          <Link
            href="/search"
            className="inline-flex h-9 items-center rounded-2lg bg-background-secondary-default px-3 text-body-medium text-text-primary transition-colors outline-none hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            Search the catalog
          </Link>
        </div>
      </DrawerFrame>
    );
  }

  /*
   * The course exists but no section was named — a similar-course link, a
   * hand-edited URL, a stale bookmark from when this drawer was course-level.
   *
   * The answer is a chooser, not a course page. Falling back to course detail
   * here would quietly reintroduce exactly the thing this route exists to stop,
   * and on the courses where it would happen most (the many-section ones) a
   * course-level overlay is least useful. `loadSectionDetail` has already
   * resolved a lone section on its own, so reaching here means there is a real
   * choice to make.
   */
  if (!data) {
    const code = `${course.subjectCode} ${course.number}`;
    return (
      <DrawerFrame>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            <span className="text-caption-1-semibold tracking-[0.04em] tabular-nums text-accent-600">
              {code}
            </span>
            <h1 id={DRAWER_TITLE_ID} className="text-title-2-semibold text-balance text-text-primary">
              {sectionCode ? `No section ${sectionCode}` : "Which section?"}
            </h1>
            <p className="text-body-regular text-text-secondary">
              {sectionCode
                ? `${code} has no section ${sectionCode} in ${termLabel(CURRENT_TERM)}. Here are the ones it does have.`
                : `${code} has ${sections.length} sections in ${termLabel(CURRENT_TERM)}. Pick the class you mean.`}
            </p>
            </div>
            <DrawerCloseButton className="shrink-0" />
          </div>

          {sections.length > 0 ? (
            <ul className="flex list-none flex-col">
              {sections.map((section) => {
                const when = meetingLines(section.meetings)[0];
                return (
                  <li key={section.sectionId}>
                    <PrefetchLink
                      href={`/course/${course.courseId}?section=${encodeURIComponent(section.sectionCode)}`}
                      className="flex flex-col gap-0.5 rounded-lg px-2 py-2 transition-colors outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                    >
                      <span className="text-body-medium text-text-primary">
                        <span className="tabular-nums">{section.sectionCode}</span>
                        <span className="ml-2 font-normal text-text-secondary">
                          {section.instructors.length > 0
                            ? section.instructors.join(" · ")
                            : "Instructor TBA"}
                        </span>
                      </span>
                      {when ? (
                        <span className="text-caption-1-regular tabular-nums text-text-tertiary">
                          {when.daysLabel} {when.timeLabel}
                        </span>
                      ) : null}
                    </PrefetchLink>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-body-regular text-text-secondary">
              No sections are published for this course in {termLabel(CURRENT_TERM)}.
            </p>
          )}
        </div>
      </DrawerFrame>
    );
  }

  return (
    <DrawerFrame>
      <SectionDetail data={data} titleId={DRAWER_TITLE_ID} showClose />
    </DrawerFrame>
  );
}
