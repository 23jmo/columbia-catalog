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
 *     resolves the lone section and renders it in place, so there is no course
 *     page left to carry them.
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
  /**
   * False when the caller has already drawn `CourseReviewsPanel` higher up the
   * page. Defaults to true so a surface that has not thought about it still
   * shows reviews rather than silently dropping them.
   */
  includeReviews?: boolean;
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

/**
 * Reviews, as a block that can be placed on its own.
 *
 * ── Why this is separable and the other three are not ──────────────────────
 *
 * Workload, neighbours and offering history are reference: true about the
 * course, worth having, read by somebody who has already decided to take this
 * seriously. They belong at the bottom and they can stay there.
 *
 * Reviews are not reference. Since `/course/` opened to signed-out visitors,
 * this page is the app's front door for a link pasted into a reddit reply or a
 * group chat, and the question that link was posted to answer is almost always
 * "is this any good". Leaving the answer two thousand pixels down, under the
 * description and the section list and the week grid, means the person who
 * clicked never reaches it — the page answered them and they never found out.
 *
 * So the caller decides where this goes, and `CourseLevelPanels` keeps drawing
 * it by default for anything that has not been taught otherwise.
 *
 * ── The two summaries are never merged ─────────────────────────────────────
 *
 * Spec §12. "Course experience" and "instructor quality" measure different
 * populations answering different questions, they carry their own sample sizes
 * and date ranges, and nothing here averages them. Course coverage in
 * particular is thin — 126 rated courses against 10,582 — so the left half is
 * empty far more often than the right, and `ReputationBlock` says so rather
 * than borrowing the instructor's number to fill the gap.
 */
export function CourseReviewsPanel({
  reputation,
  variant = "page",
}: {
  reputation: ReputationBundle | null;
  variant?: CourseLevelVariant;
}) {
  return (
    <Block variant={variant} id="reviews" title="Reviews" icon={RiChat3Line}>
      <div className="grid gap-3 lg:grid-cols-2">
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
  );
}

export function CourseLevelPanels({
  data,
  reputation,
  variant = "page",
  includeReviews = true,
}: CourseLevelPanelsProps) {
  const { sections, credits } = data;
  const gradingModes = distinct(sections.map((section) => section.gradingMode));
  const formats = distinct(
    sections.flatMap((section) => [section.component, section.methodOfInstruction]),
  );

  return (
    <>
      {includeReviews ? <CourseReviewsPanel reputation={reputation} variant={variant} /> : null}

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
                  {/*
                    Plain text, not `InstructorLinks`.
                    
                    The whole card is already an <a> to the course, and an
                    anchor inside an anchor is invalid HTML — React reconciles
                    the nesting away on the client, the markup no longer matches
                    what the server sent, and the whole subtree is thrown out
                    and re-rendered with a hydration error. It also was not a
                    usable link: the outer card swallows the click.
                  */}
                  <span className="text-caption-2-regular text-text-tertiary">
                    {[
                      similar.reason,
                      similar.credits,
                      similar.instructors.length > 0 ? similar.instructors.join(", ") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
