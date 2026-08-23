import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RiArrowLeftLine } from "@remixicon/react";

import { prettyTitle } from "@/components/course/format";
import { loadCourseDetail, resolveCourse } from "@/components/course/load-course-detail";
import { AppShell } from "@/components/shell/app-shell";
import { CURRENT_TERM, termLabel } from "@/lib/constants";

import { CourseDetail } from "./course-detail";

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
  const description = course.description
    ? truncate(course.description, 180)
    : `${sections.length} section${sections.length === 1 ? "" : "s"} in ${termLabel(
        CURRENT_TERM,
      )}. Seats, instructors, meeting times and reviews.`;

  return {
    title: `${code} ${title} — Columbia Catalog`,
    description,
    openGraph: {
      title: `${code} · ${title}`,
      description,
      type: "article",
    },
  };
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { courseId } = await params;
  const data = await loadCourseDetail(courseId, CURRENT_TERM);
  // `resolveCourse` already forgives a missing qualifier letter and spacing;
  // a null here means the course genuinely is not in this term.
  if (!data) notFound();

  return (
    <AppShell activeNav="search">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <Link
          href="/search"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1.5 py-1 text-caption-1-medium text-text-secondary transition-colors outline-none hover:bg-background-primary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <RiArrowLeftLine aria-hidden className="size-4" />
          All courses
        </Link>

        <CourseDetail data={data} variant="page" />
      </div>
    </AppShell>
  );
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
