import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RiArrowLeftLine } from "@remixicon/react";

import {
  ClassroomLoadCard,
  CoursesTaught,
  InstructorClassroomMap,
  InstructorDetailsCard,
  InstructorFunFacts,
  InstructorProfileCard,
  InstructorReviewsCard,
  TeachingRhythmCard,
} from "@/components/instructor";
import { AppShell } from "@/components/shell/app-shell";
import { CURRENT_TERM, termLabel } from "@/lib/constants";
import { listInstructors, loadInstructorProfile } from "@/lib/data/instructors";

/**
 * The instructor page.
 *
 * One centred column of stacked cards, ordered by what the reader came for:
 *
 *   1. **Who, and are they any good.** The identity hero, whose headline figure
 *      is the RATING. This is the question the page exists to answer.
 *   2. **What do they teach.** The sections, as a clean list.
 *   3. **The reviews in full** — both sources, side by side, with their sample
 *      sizes and date ranges.
 *   4. **Everything else**, labelled as trivia: seat counts, teaching rhythm,
 *      classroom load, a map of the rooms they stand in.
 *
 * That order is a change. The hero used to lead with "students taught" — a sum
 * over the registrar's seat table — and the reviews sat at the very bottom.
 * Both were backwards.
 *
 * Everything on the page is derived from the registrar's published sections
 * (`lib/data/instructors.ts`) except the RateMyProfessor numbers, which are
 * read live in the browser and never stored.
 *
 * ── The headline rating and spec §12 ───────────────────────────────────────
 *
 * §12's own display example leads with `Instructor 4.4 / 5 · n=38`, so a
 * headline number is the spec, not a departure from it. What §12 forbids is
 * merging *course* quality with *instructor* quality, and averaging CULPA and
 * RMP into a single figure. Neither happens here: when both sources have a
 * number, both are printed, each with its own denominator and its own link out.
 *
 * ── Coverage ───────────────────────────────────────────────────────────────
 *
 * Most instructors will show no rating, and the page says so plainly rather
 * than inventing one. RMP lists roughly 1,700 professors across Columbia,
 * Barnard and Teachers College against several thousand instructors a term; a
 * 40-name sample of Fall 2026 COMS instructors matched 20%, at a median of two
 * ratings each. CULPA is the only source that would move that number, and it is
 * being pursued as a partnership rather than a scrape.
 *
 * `generateStaticParams` prerenders the term's instructors — about four
 * thousand of them, not the "tens per subject" this comment used to claim.
 * That claim was true against the COMS seed and quietly stopped being true when
 * the database grew to the full catalog, at which point the build began dying
 * on a Postgres `statement_timeout`: every one of those pages calls
 * `loadInstructorProfile`, which reads the WHOLE term to find one person's
 * sections. `getAllCourses` now memoises per process, which is what makes
 * prerendering a set this size cost one catalog read per build worker instead
 * of one per page. Keep that in mind before adding another per-item caller of a
 * whole-collection read.
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

  return (
    <AppShell activeNav="search">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4">
        <Link
          href="/search"
          className="mr-auto inline-flex w-fit items-center gap-1.5 rounded-lg px-1.5 py-1 text-caption-1-medium text-text-secondary transition-colors outline-none hover:bg-background-primary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <RiArrowLeftLine aria-hidden className="size-4" />
          All courses
        </Link>

        {/*
          TODO(reviews): pass `summarizeInstructor(reviews)` from
          `lib/reviews/aggregate` once a CULPA feed lands. `null` renders the
          honest "not rated yet" state, which is the truth today — and it is the
          same prop on both the hero and the reviews card, so one wiring lights
          up the whole page.
        */}
        <InstructorProfileCard data={data} reputation={null} />

        <CoursesTaught
          courses={data.courses}
          termCode={data.termCode}
          termLabel={data.termLabel}
        />

        {/*
          `showRmp={false}`: the hero above already carries the RMP rating,
          difficulty, would-take-again and sample size. This card is where the
          Columbia corpus goes when it lands.
        */}
        <InstructorReviewsCard instructorName={data.name} reputation={null} showRmp={false} />

        {/*
          Below here is trivia, and is ordered as such. Nothing a reader needs
          in order to decide about a class lives past this point.
        */}
        <InstructorFunFacts data={data} />

        <InstructorClassroomMap data={data} />

        <TeachingRhythmCard months={data.months} />

        <ClassroomLoadCard data={data} />

        <InstructorDetailsCard data={data} />
      </div>
    </AppShell>
  );
}
