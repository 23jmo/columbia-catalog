import {
  RiCalendarCheckLine,
  RiErrorWarningLine,
  RiFileList2Line,
  RiScales2Line,
  RiShieldCheckLine,
} from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import { sectionHasOpenSeats } from "@/components/catalog/search-source";
import type {
  CourseDetailIntegrations,
  PlannedMeeting,
  WeekGridBlock,
} from "@/components/course/contracts";
import { CourseHeroCard } from "@/components/course/course-hero-card";
import { guessCampusZone, meetingLines, prettyTitle } from "@/components/course/format";
import { CourseSubjectIcon } from "@/components/course/subject-icon";
import type { CourseDetailData } from "@/components/course/load-course-detail";
import { CourseLevelPanels, CourseReviewsPanel } from "@/components/course/course-level-panels";
import { ExpandableText } from "@/components/course/expandable-text";
import { EmptyNote, LanePlaceholder } from "@/components/course/panel";
import { ReferenceBlock } from "@/components/course/reference-block";
import { REQUIREMENT_FILTERS, WEEKDAY_LABEL, ZONE_LABEL } from "@/lib/constants";
import type { ScheduleConflict, Section } from "@/lib/types";
import { cx } from "@/utils/cx";

import { CourseSeatSummary } from "./course-seat-summary";
import { loadPrimaryPlanSnapshot } from "@/lib/db/primary-plan-snapshot";
import { courseDetailIntegrations } from "./integrations";
import { SectionsPanel } from "./sections-panel";

/**
 * The course surface, assembled once.
 *
 * `/course/[courseId]` (cold link, refresh, share) and the intercepted drawer
 * over search render THIS component. Factoring the assembly here is not tidying
 * — it is the only way the two presentations cannot drift, and drift between
 * "what a link shows" and "what a click shows" is the exact bug that makes a
 * URL feel like a lie.
 *
 * Reading order: everything needed to decide sits above the fold, then
 * Description → Sections → Schedule preview → Reviews → Workload/grading →
 * Similar → Offering history.
 *
 * ── What this page deliberately does NOT show ──────────────────────────────
 *
 * Instructor, location and seat history used to sit in that list, between
 * Schedule preview and Reviews. They are gone, because none of them is a fact
 * about a course — they are facts about a section, and this page is the one
 * surface that cannot name a section.
 *
 * The old versions papered over that by aggregating. The header printed every
 * instructor across every section as if the course had them all; the "Where"
 * fact joined every room with a middle dot; the seat chart drew a series per
 * section under a single capacity line that only existed when the caps
 * happened to agree. On a one-section course each was accidentally right, and
 * on a twenty-four-section course each was a sentence no registrar would sign.
 * `SectionDetail` answers all three per section, which is where the question
 * was always aimed.
 *
 * That deletion also took the page's two most expensive awaits with it: a
 * `loadReputation` per instructor, and `getAllCourses` — the whole term, ~4,600
 * courses — which existed only to tell each instructor card what else that
 * person teaches.
 *
 * Spec §7 still lists all nine panels in its old order. It describes a
 * course-level drawer that no longer exists either (the drawer is section-
 * scoped now; see `app/@drawer/(.)course/[courseId]/page.tsx`), so it is stale
 * on both counts and should be rewritten rather than treated as the contract.
 *
 * This is a server component. The only client leaf left is compare selection
 * (`SectionsPanel`).
 */

const REQUIREMENT_LABEL_BY_KEY = new Map(REQUIREMENT_FILTERS.map((r) => [r.key, r.label]));

/**
 * Meeting patterns printed in the glance row before it defers to the count.
 * Three fits one line at the drawer's width and still reads as a set.
 */
const GLANCE_PATTERN_CAP = 3;

export interface CourseDetailProps {
  data: CourseDetailData;
  /** `page` is the standalone route; `drawer` is the overlay over search. */
  variant?: "page" | "drawer";
  /** The drawer points `aria-labelledby` at the course title. */
  titleId?: string;
  integrations?: CourseDetailIntegrations;
  /** Back navigation, rendered inside the page hero cover. */
  backLink?: { href: string; label: string };
}

export async function CourseDetail({
  data,
  variant = "page",
  titleId = "course-title",
  integrations = courseDetailIntegrations,
  backLink,
}: CourseDetailProps) {
  const { course, sections, code, credits, termLabel: term } = data;
  const title = prettyTitle(course.title);

  /*
   * The reader's own plan, resolved per request (spec §7). `integrations`
   * wins if a caller supplied one — a test or a story passes a fixed plan and
   * must not have it replaced by whoever happens to be signed in.
   *
   * With no session, no plan, or a failed read this is null and the conflict
   * panel says it has nothing to check against, which is the honest answer.
   */
  const planTermCode = sections[0]?.termCode ?? null;
  const primaryPlan =
    integrations.primaryPlan !== undefined
      ? integrations.primaryPlan
      : planTermCode
        ? await loadPrimaryPlanSnapshot(planTermCode)
        : null;
  const resolvedIntegrations: CourseDetailIntegrations = { ...integrations, primaryPlan };
  const sectionsWithSeats = sections.filter(sectionHasOpenSeats).length;
  const restrictions = distinct(sections.map((s) => s.openTo));
  const notes = distinct(sections.map((s) => s.note));
  const requirementLabels = Object.entries(course.requirementFlags)
    .filter(([, on]) => on === true)
    .map(([key]) => REQUIREMENT_LABEL_BY_KEY.get(key) ?? key);

  /*
   * Does ANY section have a published time? The week grid and its agenda
   * fallback both need something to place, and on this catalog that is the
   * minority case — so the block asks before it renders rather than drawing an
   * empty state (.plans/BLOCKERS.md #5).
   */
  const anySectionMeets = sections.some((section) => section.meetings.length > 0);

  const meetingsByPattern = distinct(
    sections.flatMap((section) =>
      meetingLines(section.meetings).map((line) => `${line.daysLabel} ${line.timeLabel}`),
    ),
  );
  /*
   * Two summaries, fetched apart and rendered apart (spec §12). The instructor
   * half is keyed to the FIRST instructor because that is who the subtitle
   * names — attributing an aggregate to a person the reader cannot see would
   * be worse than showing one professor's.
   */
  const reputation = integrations.loadReputation
    ? await integrations.loadReputation({
        courseId: course.courseId,
        instructorName: data.instructors[0] ?? null,
      })
    : null;

  const conflictReport = evaluateAgainstPrimaryPlan(data, resolvedIntegrations);

  const identityHeader = (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {variant === "drawer" ? (
          <CourseSubjectIcon subjectCode={course.subjectCode} variant="inline" />
        ) : null}
        <div className="min-w-0 flex-1 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-1-medium text-text-secondary">
        <span className="text-caption-1-semibold tracking-[0.04em] tabular-nums text-accent-600">
          {code}
        </span>
        <span aria-hidden>·</span>
        <span>{term}</span>
        {credits ? (
          <>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{credits}</span>
          </>
        ) : null}
      </div>

      <h1
        id={titleId}
        className="text-display-4-semibold -tracking-[0.02em] text-balance text-text-primary"
      >
        {title}
      </h1>

      {requirementLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {requirementLabels.map((label) => (
            <Chip key={label} variant="caption" color="soft">
              {label}
            </Chip>
          ))}
        </div>
      ) : null}

      {/*
        ── No "Add to schedule" here, deliberately ──────────────────────
        You cannot add a COURSE to a schedule; you add a section, at a
        time, in a room. This page used to offer both an add button and a
        bookmark that silently targeted whichever section happened to sort
        first — so on a five-section lab, pressing the most prominent
        button on the page scheduled section 001 without ever saying so.
        A control that has to guess what you meant is worse than no
        control: the guess is invisible and the reader only finds out
        later, looking at a plan they did not build.

        Both now live on the section rows below, where the choice is
        explicit, and this is the link that gets you to them in one click
        on a course with two dozen sections.
      */}
      <div className="-ml-0.5 flex flex-wrap items-center gap-2">
        <a
          href="#sections"
          className="inline-flex h-9 items-center gap-1.5 rounded-2lg px-2.5 text-caption-1-medium text-text-secondary transition-colors outline-none hover:bg-background-primary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <RiScales2Line aria-hidden className="size-4" />
          Compare sections
        </a>
      </div>
        </div>
      </div>
    </header>
  );

  return (
    <article
      className={cx("flex w-full flex-col gap-5", variant === "page" && "mx-auto max-w-4xl")}
    >
      {/* ================================================================== */}
      {/* The decision                                                        */}
      {/* ================================================================== */}
      {/*
        Same grammar as the section view: an identity block, then ONE hairline
        rule carrying the facts a reader weighs, then reference blocks. The
        earlier arrangement wrapped those facts in a bordered, shadowed card and
        put an icon-and-title `Panel` around every block below it, which on this
        course produced a shadowed card holding five more bordered cards. A card
        inside a card says "these are separate things" twice and means it
        neither time.
      */}
      <div className={cx("flex flex-col", variant === "page" ? "gap-2 sm:gap-4" : "gap-3 sm:gap-4")}>
        {variant === "page" ? (
          <CourseHeroCard
            seed={code}
            subjectCode={course.subjectCode}
            backLink={backLink}
          >
            {identityHeader}
          </CourseHeroCard>
        ) : (
          identityHeader
        )}

        {/* --------------------------------------------------------------- */}
        {/* When it meets, and whether there is room                         */}
        {/* --------------------------------------------------------------- */}
        {/*
          The course-level echo of the section view's glance row. "When does it
          meet" and "can I get in" are one question here too — the difference is
          that a course answers both in the plural, so the left side is the set
          of distinct patterns across sections rather than one section's week.

          On most Fall 2026 courses that set is empty, because Columbia stopped
          publishing meeting times in the public directory after Spring 2025
          (.plans/BLOCKERS.md #5). Saying so plainly, once, beats five section
          rows each repeating "Meeting time not published by the directory".
        */}
        <div
          className={cx(
            "flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-t border-border-table pt-4",
            variant === "page" && "sm:border-x sm:border-border-ai-profile-card sm:px-4",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {meetingsByPattern.length > 0 ? (
              <>
                {/*
                  Capped at three. This line is a GLANCE — "roughly when does
                  this thing meet" — and past a few patterns there is no glance
                  answer to give: BIOL 1501 printed eight patterns across two
                  wrapped lines, and a 24-section course would print twenty.
                  Beyond the cap the count in the subline is the real summary
                  and the sections list below is the authoritative answer, so
                  the row says how many there are and stops.
                */}
                <p className="text-headline-medium tabular-nums text-text-primary">
                  {meetingsByPattern.slice(0, GLANCE_PATTERN_CAP).join(" · ")}
                  {meetingsByPattern.length > GLANCE_PATTERN_CAP ? (
                    <span className="text-text-tertiary">
                      {" "}
                      +{meetingsByPattern.length - GLANCE_PATTERN_CAP} more
                    </span>
                  ) : null}
                </p>
                <p className="text-caption-1-regular text-text-tertiary">
                  {meetingsByPattern.length === 1
                    ? "Every section meets at this time."
                    : `${meetingsByPattern.length} distinct times across ${sections.length} sections.`}
                </p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-headline-medium text-text-tertiary">
                  <RiCalendarCheckLine aria-hidden className="size-4 shrink-0" />
                  Times not published
                </p>
                <p className="text-caption-1-regular text-text-tertiary">
                  The directory no longer prints meeting days and rooms; Vergil has them.
                </p>
              </>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {/* Seat numbers never render without the directory's own stamp. */}
            <CourseSeatSummary sections={sections} />
            {/*
              The aggregate hides the thing you actually need. "50 of 230
              seats" on this course is five sections, three of which are full —
              a reader who takes the total at face value goes to register and
              finds two real options, not a comfortable half-empty course. The
              count of sections you can still get into is the honest form of
              the same fact, so it rides directly under the total.
            */}
            {sections.length > 1 ? (
              <p className="text-caption-1-regular tabular-nums text-text-tertiary">
                {sectionsWithSeats === 0
                  ? "No section has room"
                  : `${sectionsWithSeats} of ${sections.length} sections have room`}
              </p>
            ) : null}
          </div>
        </div>

        {/* Conflict and commute warnings against the primary plan. */}
        <ConflictNotice report={conflictReport} />
      </div>

      {/* ================================================================== */}
      {/* Eligibility — the thing that can disqualify you outright            */}
      {/* ================================================================== */}
      {/*
        A left rule, matching `RegistrarNotes` on the section view, rather than
        the tinted box this used to be. "Open to: SEAS majors only" has to lift
        out of the fine-print band without becoming the fifth bounded surface on
        the page.
      */}
      {course.prerequisiteText || restrictions.length > 0 || notes.length > 0 ? (
        <div className="flex gap-2.5 border-l-2 border-border-table py-0.5 pl-3">
          <RiFileList2Line
            aria-hidden
            className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
          />
          <div className="flex min-w-0 flex-col gap-1.5 text-caption-1-regular text-text-secondary">
            {course.prerequisiteText ? (
              <p>
                <span className="text-caption-1-semibold text-text-primary">
                  Prerequisites{" "}
                </span>
                {course.prerequisiteText}
              </p>
            ) : null}
            {restrictions.map((restriction) => (
              <p key={restriction}>
                <span className="text-caption-1-semibold text-text-primary">Open to </span>
                {restriction}
              </p>
            ))}
            {notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </div>
      ) : null}

      {/* ================================================================== */}
      {/* Reference                                                           */}
      {/* ================================================================== */}
      <ReferenceBlock title="Description">
        {course.description ? (
          /*
           * Capped, like the section view's. These blurbs run to a full
           * paragraph of registrar prose — corequisites, lab fees, check-in
           * dates — and at full height the description alone pushed the
           * sections list, which is the reason anyone opens a course page,
           * below the fold.
           */
          <ExpandableText text={course.description} className="w-full" />
        ) : (
          <EmptyNote>
            The directory publishes no description for this course. The bulletin sometimes
            carries one; we surface it as soon as ingest finds it.
          </EmptyNote>
        )}
      </ReferenceBlock>

      {/*
        Reviews, before the section list rather than after the week grid.

        The section list is still the centrepiece for a reader who has decided
        to take this course and is choosing between four of them. But this page
        is now also the app's front door — `/course/` is open to signed-out
        visitors, and a link to it gets pasted into a group chat or a reddit
        reply to answer one question: is this any good. That answer used to sit
        two thousand pixels down, under the description, the sections and the
        week grid, which is another way of saying nobody who came for it ever
        found it.

        Above the description was the other candidate and it goes too far: a
        reader who does not already know what the course IS cannot use a rating
        of it. Description, then verdict, then the sections.
      */}
      <CourseReviewsPanel reputation={reputation} variant="section" />

      {/*
        The centrepiece. A course page exists to answer "which of these do I
        take", so the section list gets the count badge and everything below it
        is genuinely reference.
      */}
      <ReferenceBlock id="sections" title="Sections" count={sections.length}>
        <SectionsPanel sections={sections} courseCode={code} courseTitle={title} />
      </ReferenceBlock>

      {/*
        Only drawn when there is something to draw. The grid used to render
        unconditionally and, on the ~82% of Fall 2026 courses with no published
        meeting pattern, spent a full block saying "Nothing scheduled yet" —
        an empty state answering a question nobody could have asked, since the
        glance row above has already said the times are not published.
      */}
      {anySectionMeets ? (
        <ReferenceBlock title="In your week">
          {integrations.weekGrid ? (
            <integrations.weekGrid blocks={weekGridBlocks(data, resolvedIntegrations)} />
          ) : (
            <LanePlaceholder
              what="The week grid with this course dropped in"
              contract="components/schedule → WeekGridComponent"
            >
              {/* The real meeting pattern still renders — an agenda list is the
                  same information the grid would draw, and spec §18 wants this
                  degradation on narrow viewports anyway. */}
              <AgendaFallback sections={sections} />
            </LanePlaceholder>
          )}
        </ReferenceBlock>
      ) : null}

      {/* Workload, neighbours, offering history — reviews were hoisted above
          the section list, so this bundle must not draw them twice. */}
      {/* `variant="section"` so they wear the same hairline heading as the
          blocks above — the whole point of sharing the component. */}
      <CourseLevelPanels
        data={data}
        reputation={reputation}
        variant="section"
        includeReviews={false}
      />
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  Conflicts                                                                 */
/* -------------------------------------------------------------------------- */

interface ConflictReport {
  hasPlan: boolean;
  planName: string | null;
  bySection: { sectionCode: string; conflicts: ScheduleConflict[] }[];
}

/**
 * Warnings against the student's primary plan, per section — because "does
 * this course fit" is really "does any section of it fit", and answering with
 * one aggregated verdict would hide the section that does.
 */
function evaluateAgainstPrimaryPlan(
  data: CourseDetailData,
  integrations: CourseDetailIntegrations,
): ConflictReport {
  const plan = integrations.primaryPlan ?? null;
  const evaluate = integrations.evaluateCandidate;
  if (!plan || !evaluate) return { hasPlan: false, planName: null, bySection: [] };

  const resolveZone = integrations.resolveCampusZone ?? guessCampusZone;
  const bySection = data.sections
    .map((section) => ({
      sectionCode: section.sectionCode,
      conflicts: evaluate(candidateMeetings(data, section, resolveZone), plan).conflicts,
    }))
    .filter((entry) => entry.conflicts.length > 0);

  return { hasPlan: true, planName: plan.name, bySection };
}

function candidateMeetings(
  data: CourseDetailData,
  section: Section,
  resolveZone: NonNullable<CourseDetailIntegrations["resolveCampusZone"]>,
): PlannedMeeting[] {
  return section.meetings.map((meeting) => ({
    ownerId: section.sectionId,
    label: `${data.code} §${section.sectionCode}`,
    courseId: data.course.courseId,
    weekday: meeting.weekday,
    startMinute: meeting.startMinute,
    endMinute: meeting.endMinute,
    buildingName: meeting.buildingName,
    campusZone: resolveZone(meeting.buildingName),
  }));
}

function ConflictNotice({ report }: { report: ConflictReport }) {
  /*
   * No plan, nothing to say. This used to render a dashed box explaining that
   * conflicts WOULD be checked once a plan existed — an advertisement for a
   * feature, sitting above the description on every course page a signed-out
   * reader opened, which is most of them. The section view has no equivalent
   * and does not miss it. A warning earns its space by warning.
   */
  if (!report.hasPlan) return null;

  if (report.bySection.length === 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-2lg border border-border-table bg-background-secondary-default p-3">
        <RiShieldCheckLine
          className="mt-0.5 size-4 shrink-0 text-status-lime-text"
          aria-hidden
        />
        <p className="text-body-regular text-text-secondary">
          Every section fits {report.planName} — no overlaps and no walk you cannot make.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2lg border border-border-table bg-background-primary-default p-3">
      <p className="flex items-center gap-2 text-body-semibold text-text-primary">
        <RiErrorWarningLine aria-hidden className="size-4 text-status-rose-text" />
        Conflicts with {report.planName}
      </p>
      <ul className="flex list-none flex-col gap-1.5">
        {report.bySection.map((entry) =>
          entry.conflicts.map((conflict) => (
            <li
              key={`${entry.sectionCode}-${conflict.kind}-${conflict.weekday}-${conflict.message}`}
              className="flex items-start gap-2 text-body-regular text-text-secondary"
            >
              <Chip
                variant="caption"
                color={conflict.severity === "hard" ? "rose" : "yellow"}
                className="mt-0.5 shrink-0"
              >
                §{entry.sectionCode}
              </Chip>
              <span>
                <span className="sr-only">{WEEKDAY_LABEL[conflict.weekday]}: </span>
                {conflict.message}
              </span>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Schedule preview fallback                                                 */
/* -------------------------------------------------------------------------- */

function weekGridBlocks(
  data: CourseDetailData,
  integrations: CourseDetailIntegrations,
): WeekGridBlock[] {
  const resolveZone = integrations.resolveCampusZone ?? guessCampusZone;
  const planBlocks = (integrations.primaryPlan?.meetings ?? []).map((meeting) => ({
    blockId: `${meeting.ownerId}-${meeting.weekday}-${meeting.startMinute}`,
    label: meeting.label,
    sublabel: meeting.buildingName,
    weekday: meeting.weekday,
    startMinute: meeting.startMinute,
    endMinute: meeting.endMinute,
    tone: "plan" as const,
  }));

  const candidateBlocks = data.sections.flatMap((section) =>
    section.meetings.map((meeting) => ({
      blockId: `${section.sectionId}-${meeting.weekday}-${meeting.startMinute}`,
      label: `${data.code} §${section.sectionCode}`,
      sublabel: meeting.buildingName
        ? `${meeting.buildingName} · ${ZONE_LABEL[resolveZone(meeting.buildingName)]}`
        : null,
      weekday: meeting.weekday,
      startMinute: meeting.startMinute,
      endMinute: meeting.endMinute,
      tone: "candidate" as const,
    })),
  );

  return [...planBlocks, ...candidateBlocks];
}

/** The same information a week grid would draw, as a list. */
function AgendaFallback({ sections }: { sections: Section[] }) {
  const rows = sections.flatMap((section) =>
    meetingLines(section.meetings).map((line) => ({
      key: `${section.sectionId}-${line.daysLabel}-${line.timeLabel}`,
      sectionCode: section.sectionCode,
      days: line.days.map((day) => WEEKDAY_LABEL[day]).join(", "),
      daysLabel: line.daysLabel,
      timeLabel: line.timeLabel,
      placeLabel: line.placeLabel,
    })),
  );

  if (rows.length === 0) {
    return (
      <EmptyNote>
        The directory publishes no meeting times for this course, so there is nothing to place
        on a week yet. The bulletin usually carries them.
      </EmptyNote>
    );
  }

  return (
    <ul className="flex list-none flex-col gap-1">
      {rows.map((row) => (
        <li
          key={row.key}
          className="flex flex-wrap items-baseline gap-x-2 text-body-regular text-text-primary"
        >
          <span className="text-caption-1-medium text-text-secondary">§{row.sectionCode}</span>
          <span className="text-body-medium">
            <span className="sr-only">{row.days}</span>
            <span aria-hidden>{row.daysLabel}</span>
          </span>
          <span className="tabular-nums">{row.timeLabel}</span>
          {row.placeLabel ? (
            <span className="text-caption-1-regular text-text-secondary">{row.placeLabel}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */

function distinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
