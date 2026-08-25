import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { prettyTitle } from "@/components/course/format";
import { loadCourseDetail, resolveCourse } from "@/components/course/load-course-detail";
import { loadSectionDetail } from "@/components/course/load-section-detail";
import { CourseLevelPanels } from "@/components/course/course-level-panels";
import { courseDetailIntegrations } from "./integrations";
import { AppShell } from "@/components/shell/app-shell";
import { pageIdentityContentClass } from "@/components/shell/page-hero-layout";
import { PageContent } from "@/components/shell/page-content";
import { CURRENT_TERM, termLabel } from "@/lib/constants";

import { CourseDetail } from "./course-detail";
import { SectionDetail } from "./section-detail";

/**
 * The standalone course page — what a cold link, a refresh, or a shared URL
 * renders. Its intercepted twin (`app/@drawer/(.)course/[courseId]`) draws the
 * same assembled `CourseDetail` as an overlay for in-app navigation, so the
 * two can never say different things about the same course.
 *
 * `generateMetadata` matters here more than on most routes: this URL gets
 * pasted into group chats during registration week, and a link preview that
 * says the course code, title, term and seat situation is the difference
 * between a link people click and a link people ignore.
 */

interface CoursePageProps {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ section?: string | string[] }>;
}

/** `?section=001&section=002` is not a thing anyone means; take the first. */
function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { courseId } = await params;
  // Metadata only needs the course record, not the full detail bundle
  // (similar courses, offering history) that the page body assembles.
  const course = await resolveCourse(courseId, CURRENT_TERM);
  if (!course) {
    return {
      title: "Course not found — Columbia Catalog",
      description: "No course in this term matches that code.",
    };
  }

  const code = `${course.subjectCode} ${course.number}`;
  const title = prettyTitle(course.title);
  const sections = course.sections.filter((section) => section.termCode === CURRENT_TERM);

  /*
   * ── Why a canonical and not a redirect ───────────────────────────────────
   *
   * A course with exactly one section renders AS that section at the bare URL
   * (see the page component). Two URLs therefore answer with the same page,
   * and this is the tag that says which one is the real one.
   *
   * Redirecting was the first attempt and it is not available. `redirect()`
   * from a Server Component — or from here — does not produce a 307 in Next
   * 16: by the time it fires the response is committed, so Next falls back to
   * `<meta http-equiv="refresh" content="1;url=…">`. Measured against
   * `next start`, not just dev: the reader gets a full second of the old
   * course page and then a jump, and anything that reads HTML without running
   * it never follows at all. Rendering in place costs one page instead of two
   * and has no flash; the canonical does the job the Location header would.
   */
  const canonicalSection = sections.length === 1 ? sections[0] : null;
  const canonical = canonicalSection
    ? `/course/${course.courseId}?section=${encodeURIComponent(canonicalSection.sectionCode)}`
    : `/course/${course.courseId}`;
  const description = course.description
    ? truncate(course.description, 180)
    : `${sections.length} section${sections.length === 1 ? "" : "s"} in ${termLabel(
        CURRENT_TERM,
      )}. Seats, instructors, meeting times and reviews.`;

  return {
    title: `${code} ${title} — Columbia Catalog`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${code} · ${title}`,
      description,
      type: "article",
    },
  };
}

export default async function CoursePage({ params, searchParams }: CoursePageProps) {
  const [{ courseId }, query] = await Promise.all([params, searchParams]);
  const sectionCode = firstParam(query.section);

  /*
   * `?section=NNN` makes this URL a SECTION url, and it renders as one.
   *
   * The drawer this page backs is section-specific, and its "Full page" link
   * carries the section along. If this route ignored the parameter, refreshing
   * the drawer or sharing its link would silently swap a specific class for the
   * container it is filed under -- which on PHED1001UN means someone sent a
   * link to "PHED: Swim (Beginner)" and their friend opened "Physical Education
   * Activities". A URL that names a section shows that section.
   *
   * ── The collapse ─────────────────────────────────────────────────────────
   *
   * `loadSectionDetail` is now asked with a null code too, and it resolves a
   * lone section on its own. That is what collapses the bare URL: 3,433 of Fall
   * 2026's 4,428 courses have exactly one section, and for those the course and
   * the class are the same object. `/course/CHEM1UN` used to answer with a page
   * that said "Sections: 1" above a table of one row, a schedule preview of
   * that one section, and a seat summary that was that section's seat count
   * wearing a course-level label. It is not a different view of the class, it
   * is the same view with the specifics filed off.
   *
   * So a single-section course renders as its section, at either URL, and
   * carries the four course-level blocks down with it — there is no other page
   * left to hold them. `generateMetadata` names the section URL canonical.
   * This is the same rule the drawer has always followed; it just took until
   * now to reach the page.
   *
   * Bare `/course/[courseId]` on a MULTI-section course is still the course:
   * the aggregate view, every section listed, similar courses, offering
   * history.
   */
  {
    const { data, course } = await loadSectionDetail(courseId, sectionCode, CURRENT_TERM);
    // An unknown section on a known course is a bad URL, not a bad course —
    // fall through to the course page rather than 404ing the whole thing.
    if (data) {
      /*
       * A course with exactly one section has no course page any more — the
       * bare URL lands on this branch and renders the section — so this page
       * inherits the four blocks that are claims about the course rather than
       * about the class. That costs a `loadCourseDetail`, which is why it is
       * behind the sibling check and not paid on every section page.
       */
      const isOnlySection = data.siblings.length === 0;
      const courseData = isOnlySection
        ? await loadCourseDetail(courseId, CURRENT_TERM)
        : null;
      const reputation =
        courseData && courseDetailIntegrations.loadReputation
          ? await courseDetailIntegrations.loadReputation({
              courseId: courseData.course.courseId,
              instructorName: courseData.instructors[0] ?? null,
            })
          : null;

      return (
        <AppShell activeNav="search">
          <PageContent className={pageIdentityContentClass("gap-0 sm:gap-5")}>
            <SectionDetail
              data={data}
              titleId="course-title"
              surface="page"
              backLink={{
                href: isOnlySection ? "/search" : `/course/${data.course.courseId}`,
                label: isOnlySection ? "All courses" : `All sections of ${data.code}`,
              }}
              courseLevel={
                courseData ? (
                  <CourseLevelPanels
                    data={courseData}
                    reputation={reputation}
                    variant="section"
                  />
                ) : null
              }
            />
          </PageContent>
        </AppShell>
      );
    }
    if (!course) notFound();
  }

  /*
   * ── The collapse ─────────────────────────────────────────────────────────
   *
   * 3,433 of Fall 2026's 4,428 courses have exactly one section. For those the
   * course and the class are the same object, and two URLs described it in two
   * ways: `/course/CHEM1UN` listed "Sections: 1" above a table with one row,
   * a schedule preview of that one section, and a seat summary that was that
   * section's seat count wearing a course-level label.
   *
   * So the bare URL is not a page for those courses, it is a synonym. It
   * renders the section, which carries the course-level blocks with it, and
   * declares `?section=NNN` as its canonical so crawlers collapse the pair.
   * `loadSectionDetail` with a null code already resolves a lone section —
   * asking someone to pick from a list of one is a dead click — so this is the
   * same rule the drawer has always followed, finally applied to the page.
   *
   * Temporary, not permanent: the registrar adds sections during registration
   * week, and a 308 cached in someone's browser would outlive the fact.
   */
  const data = await loadCourseDetail(courseId, CURRENT_TERM);
  // `resolveCourse` already forgives a missing qualifier letter and spacing;
  // a null here means the course genuinely is not in this term.
  if (!data) notFound();

  return (
    <AppShell activeNav="search">
      <PageContent className={pageIdentityContentClass("gap-0 sm:gap-5")}>
        <CourseDetail
          data={data}
          variant="page"
          backLink={{ href: "/search", label: "All courses" }}
        />
      </PageContent>
    </AppShell>
  );
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
