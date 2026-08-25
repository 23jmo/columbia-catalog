import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
import { pageIdentityContentClass } from "@/components/shell/page-hero-layout";
import { PageContent } from "@/components/shell/page-content";
import { CURRENT_TERM, termLabel } from "@/lib/constants";
import { listInstructors, loadInstructorProfile } from "@/lib/data/instructors";
import { getInstructorReputation } from "@/lib/db/reputation";

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
 * thousand of them. `loadInstructorProfile` resolves the slug against
 * `instructors` and joins through `section_instructors`, so each page is a
 * small targeted read rather than paging the whole term catalog.
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

  /*
   * The same call `/course/[courseId]` already makes. Until this landed the two
   * pages disagreed out loud: the course page rendered "Instructor quality,
   * n=93, Sources: CULPA (93)" for Adam H Cannon while his own instructor page
   * said "Not rated yet" — same person, same corpus, one of them hardcoded to
   * `null` behind a TODO that outlived the thing it was waiting for.
   *
   * Fetched once here and handed to both the hero and the reviews card so they
   * can never drift from each other either.
   */
  const reputation = await getInstructorReputation(data.name);

  return (
    <AppShell activeNav="search">
      <PageContent className={pageIdentityContentClass()}>
        <InstructorProfileCard
          data={data}
          reputation={reputation}
          backLink={{ href: "/search", label: "All courses" }}
        />

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
        <InstructorReviewsCard
          instructorName={data.name}
          reputation={reputation}
          showRmp={false}
        />

        {/*
          Below here is trivia, and is ordered as such. Nothing a reader needs
          in order to decide about a class lives past this point.
        */}
        <InstructorFunFacts data={data} />

        <InstructorClassroomMap data={data} />

        <TeachingRhythmCard months={data.months} />

        <ClassroomLoadCard data={data} />

        <InstructorDetailsCard data={data} />
      </PageContent>
    </AppShell>
  );
}
