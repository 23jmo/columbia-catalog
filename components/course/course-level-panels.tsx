import Link from "next/link";
import { RiChat3Line, RiHistoryLine, RiScales2Line, RiShieldCheckLine } from "@remixicon/react";

import type { ReputationBundle } from "@/components/course/contracts";
import type { CourseDetailData } from "@/components/course/load-course-detail";
import { prettyTitle } from "@/components/course/format";
import { EmptyNote, Fact, Panel } from "@/components/course/panel";
import { ReferenceBlock } from "@/components/course/reference-block";
import { ReputationBlock } from "@/components/course/reputation";
import { InstructorLinks } from "@/components/instructor/instructor-link";
import { cx } from "@/utils/cx";

/**
 * The four claims that are honestly about a COURSE.
 *
 * Reviews, workload, neighbours and offering history are the residue left after
 * instructor, location and seat history moved to `SectionDetail` — they are the
 * things that stay true no matter which section you pick, because they are
 * aggregates over the course's whole life rather than facts about one class.
 *
 * They render on two surfaces and must not drift between them:
 *
 *   · the course page, for a course with more than one section, and
 *   · the section page, for a course with exactly one — where `/course/[id]`
 *     redirects to `?section=NNN` and there is no course page left to visit.
 *
 * ── Why a variant and not two copies ───────────────────────────────────────
 *
 * The two surfaces have genuinely different chrome. The course page is a stack
 * of carded `Panel`s with icons; the section page is a document of hairline-
 * ruled `ReferenceBlock`s. Rendering `Panel` inside the section page would put
 * two heading systems in one column, which reads as two pages stitched
 * together. So the *content* is written once and only the wrapper switches —
 * the alternative, two copies with different chrome, is exactly the drift this
 * project keeps paying to avoid.
 *
 * Deliberately NOT rendered in the drawer. The drawer is fast because it
 * resolves one section and stops; `similar` and `offeringHistory` come from
 * `loadCourseDetail`, which is the assembly that used to make a course-level
 * overlay take seconds to answer a click.
 */

export type CourseLevelVariant = "page" | "section";

export interface CourseLevelPanelsProps {
  data: CourseDetailData;
  /** Course and first-instructor summaries, fetched apart and rendered apart. */
  reputation: ReputationBundle | null;
  variant?: CourseLevelVariant;
}

function Block({
  variant,
  id,
  title,
  icon,
  children,
}: {
  variant: CourseLevelVariant;
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  if (variant === "section") {
    return <ReferenceBlock title={title}>{children}</ReferenceBlock>;
  }
  return (
    <Panel id={id} title={title} icon={icon}>
      {children}
    </Panel>
  );
}

export function CourseLevelPanels({
  data,
  reputation,
  variant = "page",
}: CourseLevelPanelsProps) {
  const { sections, credits } = data;
  const gradingModes = distinct(sections.map((section) => section.gradingMode));
  const formats = distinct(
    sections.flatMap((section) => [section.component, section.methodOfInstruction]),
  );

  return (
    <>
      <Block variant={variant} id="reviews" title="Reviews" icon={RiChat3Line}>
        <div className="grid gap-3 lg:grid-cols-2">
          {/*
            Both halves come from `loadReputation`, which is wired to the real
            aggregator. They are null today because no reviews have been
            ingested — the same null a genuinely unreviewed course returns,
            and `ReputationBlock` renders it as "no reviews matched" either way.
          */}
          <ReputationBlock
            title="Course experience"
            subtitle="Aggregated across everyone who has taught this course."
            summary={reputation?.course ?? null}
          />
          <ReputationBlock
            title="Instructor quality"
            subtitle={
              reputation?.instructorName
                ? `Aggregated across every course ${reputation.instructorName} has taught.`
                : "Aggregated per instructor."
            }
            summary={reputation?.instructor ?? null}
          />
        </div>
      </Block>

      <Block variant={variant} id="workload" title="Workload and grading" icon={RiScales2Line}>
        <div className="flex flex-col gap-4">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Fact label="Grading">
              {gradingModes.length > 0 ? (
                gradingModes.join(" · ")
              ) : (
                <span className="text-text-tertiary">Not published</span>
              )}
            </Fact>
            <Fact label="Format">
              {formats.length > 0 ? (
                formats.join(" · ")
              ) : (
                <span className="text-text-tertiary">Not published</span>
              )}
            </Fact>
            <Fact label="Credits">
              {credits ?? <span className="text-text-tertiary">Not published</span>}
            </Fact>
          </dl>
          <ReputationBlock
            title="Reported workload"
            subtitle="From CULPA and Reddit reviews matched to this course."
            summary={null}
            keys={["workload", "difficulty", "gradingFairness"]}
          />
        </div>
      </Block>

      <Block variant={variant} id="similar" title="Similar courses" icon={RiShieldCheckLine}>
        {data.similar.length === 0 ? (
          <EmptyNote>Nothing else in this term’s catalog is a close neighbour.</EmptyNote>
        ) : (
          <ul className="flex list-none flex-col gap-1.5">
            {data.similar.map((similar) => (
              <li key={similar.courseId}>
                <Link
                  href={`/course/${similar.courseId}`}
                  className="flex flex-col gap-0.5 rounded-lg border border-border-table px-3 py-2 transition-colors outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-caption-1-medium tabular-nums text-text-secondary">
                      {similar.code}
                    </span>
                    <span className="text-body-medium text-text-primary">
                      {prettyTitle(similar.title)}
                    </span>
                  </span>
                  <span className="text-caption-2-regular text-text-tertiary">
                    {similar.reason}
                    {similar.credits ? ` · ${similar.credits}` : ""}
                    {similar.instructors.length > 0 ? " · " : ""}
                    {similar.instructors.length > 0 ? (
                      <InstructorLinks names={similar.instructors} />
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block
        variant={variant}
        id="offering-history"
        title="Offering history"
        icon={RiHistoryLine}
      >
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-max border-separate border-spacing-0 text-body-regular">
            <caption className="sr-only">Past terms this course was offered</caption>
            <thead>
              <tr>
                {["Term", "Sections", "Instructors", "Enrolled"].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="border-b border-border-table px-3 py-2 text-left text-caption-2-medium tracking-wide text-text-tertiary uppercase"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.offeringHistory.map((record) => (
                <tr key={record.termCode} className={cx(!record.offered && "opacity-55")}>
                  <th
                    scope="row"
                    className="border-b border-border-table px-3 py-2 text-left text-body-medium whitespace-nowrap text-text-primary"
                  >
                    {record.label}
                  </th>
                  <td className="border-b border-border-table px-3 py-2 tabular-nums text-text-primary">
                    {record.offered ? record.sectionCount : "Not offered"}
                  </td>
                  <td className="border-b border-border-table px-3 py-2 text-text-secondary">
                    <InstructorLinks names={record.instructors} fallback="—" />
                  </td>
                  <td className="border-b border-border-table px-3 py-2 tabular-nums text-text-secondary">
                    {record.totalEnrolled !== null && record.totalCapacity !== null
                      ? `${record.totalEnrolled} / ${record.totalCapacity}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>
    </>
  );
}

function distinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
