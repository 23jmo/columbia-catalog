import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RiArrowLeftLine } from "@remixicon/react";

import {
  ClassroomLoadCard,
  CoursesTaught,
  InstructorDetailsCard,
  InstructorProfileCard,
  InstructorReviewsCard,
  TeachingRhythmCard,
} from "@/components/instructor";
import { AppShell } from "@/components/shell/app-shell";
import { CURRENT_TERM, subjectTermUrl, termLabel } from "@/lib/constants";
import { listInstructors, loadInstructorProfile } from "@/lib/data/instructors";

/**
 * The instructor page.
 *
 * Layout is the BoardUI ai-profile template: one centred 680px column of
 * stacked cards — identity hero, then charts, then substance. Nothing about a
 * person's teaching benefits from a second column, and the narrow measure is
 * what makes the page feel like a profile rather than a dashboard.
 *
 * Everything on it is derived from the registrar's published sections
 * (`lib/data/instructors.ts`) except the RateMyProfessor block, which is read
 * live in the browser and never stored. There is deliberately no single
 * "instructor score" anywhere on the page: course quality and instructor
 * quality are scored separately (spec §12) and CULPA and RMP are never
 * averaged into one number.
 *
 * `generateStaticParams` prerenders the term's instructors. The set is small
 * (tens per subject) and entirely derived from data we already hold, so this
 * costs nothing and makes a pasted link render instantly.
 */

interface InstructorPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const instructors = await listInstructors(CURRENT_TERM);
  return instructors.map((instructor) => ({ slug: instructor.slug }));
}

export async function generateMetadata({ params }: InstructorPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadInstructorProfile(slug, CURRENT_TERM);
  if (!data) {
    return {
      title: "Instructor not found — Columbia Catalog",
      description: `No one by that name is teaching in ${termLabel(CURRENT_TERM)}.`,
    };
  }

  const courses = data.courses.map((course) => course.code).join(", ");
  const description = `${data.name} teaches ${data.courseCount} course${
    data.courseCount === 1 ? "" : "s"
  } in ${data.termLabel}${courses ? ` — ${courses}` : ""}. Sections, seats, meeting times and reviews.`;

  return {
    title: `${data.name} — Columbia Catalog`,
    description,
    openGraph: { title: data.name, description, type: "profile" },
  };
}

export default async function InstructorPage({ params }: InstructorPageProps) {
  const { slug } = await params;
  const data = await loadInstructorProfile(slug, CURRENT_TERM);
  if (!data) notFound();

  const directoryUrl = data.subjects[0]
    ? subjectTermUrl(data.subjects[0], data.termCode)
    : null;

  return (
    <AppShell activeNav="search">
      {/*
        The template centres a single 680px column. Kept exactly: the cards are
        designed against that measure and widen badly.
      */}
      <div className="mx-auto flex w-full max-w-[680px] flex-col items-center gap-4">
        <Link
          href="/search"
          className="mr-auto inline-flex w-fit items-center gap-1.5 rounded-lg px-1.5 py-1 text-caption-1-medium text-text-secondary transition-colors outline-none hover:bg-background-primary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <RiArrowLeftLine aria-hidden className="size-4" />
          All courses
        </Link>

        <InstructorProfileCard data={data} directoryUrl={directoryUrl} />

        <TeachingRhythmCard months={data.months} />

        <ClassroomLoadCard data={data} />

        <CoursesTaught
          courses={data.courses}
          termCode={data.termCode}
          termLabel={data.termLabel}
        />

        <InstructorDetailsCard data={data} />

        {/*
          TODO(reviews): pass `summarizeInstructor(reviews)` from
          `lib/reviews/aggregate` once a CULPA feed lands. `null` renders the
          honest "nothing aggregated yet" state, which is the truth today.
        */}
        <InstructorReviewsCard instructorName={data.name} reputation={null} />
      </div>
    </AppShell>
  );
}
