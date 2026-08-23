import Link from "next/link";
import {
  RiBookOpenLine,
  RiCalendarCheckLine,
  RiChat3Line,
  RiCompass3Line,
  RiErrorWarningLine,
  RiFileList2Line,
  RiGroupLine,
  RiHistoryLine,
  RiLineChartLine,
  RiRoadMapLine,
  RiScales2Line,
  RiShieldCheckLine,
} from "@remixicon/react";

import { Chip } from "@/components/base/badges/chip";
import { CampusCard } from "@/components/campus/campus-card";
import { sectionHasOpenSeats } from "@/components/catalog/search-source";
import type {
  CourseDetailIntegrations,
  PlannedMeeting,
  WeekGridBlock,
} from "@/components/course/contracts";
import { guessCampusZone, meetingLines, prettyTitle } from "@/components/course/format";
import type { CourseDetailData } from "@/components/course/load-course-detail";
import { EmptyNote, Fact, LanePlaceholder, Panel } from "@/components/course/panel";
import { RegistrationHandoff } from "@/components/course/registration-handoff";
import { AddToScheduleButton } from "@/components/schedule/add-to-schedule-button";
import { WatchButton } from "@/components/watch/watch-button";
import { ReputationBlock } from "@/components/course/reputation";
import { REQUIREMENT_FILTERS, WEEKDAY_LABEL, ZONE_LABEL } from "@/lib/constants";
import { getAllCourses } from "@/lib/data/catalog";
import type { ScheduleConflict, Section } from "@/lib/types";
import { cx } from "@/utils/cx";

import { CourseSeatSummary } from "./course-seat-summary";
import { courseDetailIntegrations } from "./integrations";
import { InstructorsPanel } from "./instructors-panel";
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
 * Reading order is spec §7, verbatim: everything needed to decide sits above
 * the fold, then Description → Sections → Schedule preview → Seat history →
 * Instructor → Reviews → Workload/grading → Similar → Offering history.
 *
 * This is a server component. The only client leaves are the two places that
 * genuinely need the browser: compare selection (`SectionsPanel`) and the live
 * RateMyProfessor read (`InstructorsPanel`).
 */

const REQUIREMENT_LABEL_BY_KEY = new Map(REQUIREMENT_FILTERS.map((r) => [r.key, r.label]));

export interface CourseDetailProps {
  data: CourseDetailData;
  /** `page` is the standalone route; `drawer` is the overlay over search. */
  variant?: "page" | "drawer";
  /** The drawer points `aria-labelledby` at the course title. */
  titleId?: string;
  integrations?: CourseDetailIntegrations;
}

export async function CourseDetail({
  data,
  variant = "page",
  titleId = "course-title",
  integrations = courseDetailIntegrations,
}: CourseDetailProps) {
  const { course, sections, code, credits, termLabel: term } = data;
  const title = prettyTitle(course.title);

  const primarySection = sections[0] ?? null;
  const sectionsWithSeats = sections.filter(sectionHasOpenSeats).length;
  const gradingModes = distinct(sections.map((s) => s.gradingMode));
  const formats = distinct(sections.flatMap((s) => [s.component, s.methodOfInstruction]));
  const restrictions = distinct(sections.map((s) => s.openTo));
  const notes = distinct(sections.map((s) => s.note));
  const requirementLabels = Object.entries(course.requirementFlags)
    .filter(([, on]) => on === true)
    .map(([key]) => REQUIREMENT_LABEL_BY_KEY.get(key) ?? key);

  const meetingsByPattern = distinct(
    sections.flatMap((section) =>
      meetingLines(section.meetings).map((line) => `${line.daysLabel} ${line.timeLabel}`),
    ),
  );
  const locations = distinct(
    sections.flatMap((section) => meetingLines(section.meetings).map((line) => line.placeLabel)),
  );
  // Raw, unnormalised building strings in meeting order — what the campus card
  // expects. `locations` above is the human-readable place label and is not a
  // substitute: it folds in the room number and is formatted for reading.
  // The chart lane's component, aliased so JSX can render it as a tag. Loading
  // the series is awaited here rather than in the client: it is one read, and
  // doing it on the server keeps Recharts off the critical path when a course
  // has no history to draw at all.
  const SeatHistory = integrations.seatHistoryChart;
  // `termCode` lives on Section, not Course — a course record is term-agnostic.
  // With no sections there is no term to ask about, so there is nothing to load.
  const historyTermCode = sections[0]?.termCode ?? null;
  const seatHistory =
    integrations.loadSeatHistory && historyTermCode
      ? await integrations.loadSeatHistory({
          sectionIds: sections.map((section) => section.sectionId),
          courseId: course.courseId,
          termCode: historyTermCode,
        })
      : null;

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

  /*
   * The instructor panel shows a card per instructor, so it needs a summary
   * per instructor rather than the single one the Reviews panel renders. One
   * `loadReputation` call each, in parallel — a course has a handful of
   * instructors, not hundreds.
   */
  const reputationByInstructor = integrations.loadReputation
    ? Object.fromEntries(
        await Promise.all(
          data.instructors.map(async (name) => {
            const bundle = await integrations.loadReputation!({
              courseId: course.courseId,
              instructorName: name,
            });
            return [name, bundle.instructor] as const;
          }),
        ),
      )
    : undefined;

  const meetingBuildingNames = distinct(
    sections.flatMap((section) => section.meetings.map((meeting) => meeting.buildingName)),
  ).filter((name): name is string => Boolean(name));

  // Instructor → the sections they teach here, plus their other courses this
  // term. `alsoTeaches` is read through the catalog seam rather than passed in,
  // so both routes get it without either having to remember to compute it.
  const catalog = await getAllCourses(data.termCode);
  const instructors = data.instructors.map((name) => ({
    name,
    sectionCodes: sections
      .filter((section) => section.instructors.includes(name))
      .map((section) => section.sectionCode),
    alsoTeaches: catalog
      .filter(
        (candidate) =>
          candidate.courseId !== course.courseId &&
          candidate.sections.some((section) => section.instructors.includes(name)),
      )
      .map((candidate) => `${candidate.subjectCode} ${candidate.number}`),
  }));

  const conflictReport = evaluateAgainstPrimaryPlan(data, integrations);

  return (
    <article
      className={cx(
        "flex w-full flex-col gap-10",
        variant === "page" && "mx-auto max-w-4xl",
      )}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Above the fold — everything a registration decision needs           */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-1-medium text-text-secondary">
            <span className="text-caption-1-semibold tracking-[0.04em] tabular-nums text-accent-600">
              {code}
            </span>
            <span aria-hidden>·</span>
            <span>{term}</span>
            {credits ? (
              <>
                <span aria-hidden>·</span>
                <span>{credits}</span>
              </>
            ) : null}
          </div>

          <h1
            id={titleId}
            className="text-display-4-semibold -tracking-[0.02em] text-balance text-text-primary"
          >
            {title}
          </h1>

          <p className="text-headline-regular text-text-secondary">
            {data.instructors.length > 0 ? data.instructors.join(" · ") : "Instructor TBA"}
          </p>

          {requirementLabels.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {requirementLabels.map((label) => (
                <Chip key={label} variant="caption" color="soft">
                  {label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 rounded-[20px] border border-border-table bg-background-primary-default p-5 shadow-card sm:grid-cols-2">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Meets">
              {meetingsByPattern.length > 0 ? (
                <span className="tabular-nums">{meetingsByPattern.join(" · ")}</span>
              ) : (
                <span className="text-text-tertiary">Not published</span>
              )}
            </Fact>
            <Fact label="Where">
              {locations.length > 0 ? (
                locations.join(" · ")
              ) : (
                <span className="text-text-tertiary">Not published</span>
              )}
            </Fact>
            <Fact label="Credits">
              {credits ?? <span className="text-text-tertiary">Not published</span>}
            </Fact>
            <Fact label="Sections">
              <span className="tabular-nums">{sections.length}</span>
              {sectionsWithSeats > 0 ? (
                <span className="text-text-secondary"> · {sectionsWithSeats} with room</span>
              ) : null}
            </Fact>
          </dl>

          <div className="flex flex-col gap-2 sm:border-l sm:border-border-table sm:pl-4">
            {/* Seat numbers never render without the directory's own stamp. */}
            <CourseSeatSummary sections={sections} />
          </div>
        </div>

        {/* Actions. Reads are free; every write needs an account (spec §15).
            Both target the FIRST section, because that is the one this header
            is describing — a course-level "add" would have to guess which of
            24 sections the reader meant, and the per-section controls in the
            sections panel below are where that choice actually belongs. */}
        <div className="flex flex-wrap items-center gap-2">
          {primarySection ? (
            <>
              <AddToScheduleButton
                sectionId={primarySection.sectionId}
                sectionCode={primarySection.sectionCode}
                termCode={primarySection.termCode}
              />
              <WatchButton
                sectionId={primarySection.sectionId}
                sectionCode={primarySection.sectionCode}
              />
            </>
          ) : null}
          <a
            href="#sections"
            className="inline-flex h-9 items-center gap-1.5 rounded-2lg px-3 text-body-medium text-text-secondary transition-colors outline-none hover:bg-background-primary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <RiScales2Line aria-hidden className="size-4" />
            Compare sections
          </a>
        </div>

        {/* Eligibility, prerequisites, restrictions. */}
        {course.prerequisiteText || restrictions.length > 0 || notes.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-2lg border border-border-table bg-background-secondary-default p-4">
            <h2 className="flex items-center gap-2 text-body-semibold text-text-primary">
              <RiFileList2Line aria-hidden className="size-4 text-foreground-icon-secondary" />
              Before you register
            </h2>
            {course.prerequisiteText ? (
              <p className="text-body-regular text-text-secondary">
                <span className="text-text-primary">Prerequisites: </span>
                {course.prerequisiteText}
              </p>
            ) : null}
            {restrictions.map((restriction) => (
              <p key={restriction} className="text-body-regular text-text-secondary">
                <span className="text-text-primary">Open to: </span>
                {restriction}
              </p>
            ))}
            {notes.map((note) => (
              <p key={note} className="text-body-regular text-text-secondary">
                {note}
              </p>
            ))}
          </div>
        ) : null}

        {/* Conflict and commute warnings against the primary plan. */}
        <ConflictNotice report={conflictReport} />
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Description                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Panel id="description" title="Description" icon={RiBookOpenLine}>
        {course.description ? (
          <p className="text-body-regular whitespace-pre-line text-text-primary">
            {course.description}
          </p>
        ) : (
          <EmptyNote>
            The directory publishes no description for this course. The bulletin sometimes
            carries one; we surface it as soon as ingest finds it.
          </EmptyNote>
        )}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Sections (with compare)                                          */}
      {/* ------------------------------------------------------------------ */}
      <Panel id="sections" title="Sections" icon={RiGroupLine}>
        <SectionsPanel sections={sections} courseCode={code} courseTitle={title} />
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Schedule preview                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Panel id="schedule-preview" title="Schedule preview" icon={RiRoadMapLine}>
        {integrations.weekGrid ? (
          <integrations.weekGrid blocks={weekGridBlocks(data, integrations)} />
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

        {/* "When" is above; this answers "where". The card takes the raw
            building strings straight off the parser — normalising them is the
            campus lane's job, and it is the lane that knows the alias table.
            It decides for itself between the 3D scene and the flat map based
            on WebGL support and prefers-reduced-motion, and lazy-loads three.js
            only if it picks the scene, so nothing here is on the search path. */}
        {meetingBuildingNames.length > 0 ? (
          <CampusCard
            className="mt-4"
            buildingNames={meetingBuildingNames}
            meta={meetingsByPattern[0] ?? null}
          />
        ) : null}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Seat history                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Panel id="seat-history" title="Seat history" icon={RiLineChartLine}>
        {SeatHistory && seatHistory && seatHistory.series.length > 0 ? (
          <SeatHistory
            series={seatHistory.series}
            milestones={seatHistory.milestones}
            capacity={sharedCapacity(sections)}
          />
        ) : (
          /* Not `EmptyNote` — that component IS a <p>, and this state needs
             two paragraphs. The copy matters: the chart component ships, so
             "not built yet" would be a lie, and saying nothing would imply
             these sections never moved. Neither is true — the crawl simply
             has not written a snapshot series for this term yet. */
          <div className="flex flex-col gap-2">
            <p className="text-body-regular text-text-secondary">
              We already hold today’s reading for every section above, each with the
              directory’s own “as of” stamp. History needs the snapshot series the crawl
              writes over a term, and none has been recorded for this term yet.
            </p>
            {data.offeringHistory.some((record) => record.offered) ? (
              <p className="text-caption-1-regular text-text-secondary">
                Past offerings are listed at the bottom of this page.
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Instructor profile                                               */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        id="instructors"
        title={instructors.length > 1 ? "Instructors" : "Instructor"}
        icon={RiCompass3Line}
      >
        <InstructorsPanel
          instructors={instructors}
          reputationByInstructor={reputationByInstructor}
        />
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Reviews                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Panel id="reviews" title="Reviews" icon={RiChat3Line}>
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
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 7. Workload and grading signals                                     */}
      {/* ------------------------------------------------------------------ */}
      <Panel id="workload" title="Workload and grading" icon={RiScales2Line}>
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
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 8. Similar and alternative courses                                  */}
      {/* ------------------------------------------------------------------ */}
      <Panel id="similar" title="Similar courses" icon={RiShieldCheckLine}>
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
                    {similar.instructors.length > 0
                      ? ` · ${similar.instructors.join(", ")}`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 9. Past-semester offering history                                   */}
      {/* ------------------------------------------------------------------ */}
      <Panel id="offering-history" title="Offering history" icon={RiHistoryLine}>
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
                    {record.instructors.length > 0 ? record.instructors.join(", ") : "—"}
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
      </Panel>

      {/* The last mile. We are a planner: this hands over a call number and a
          deep link and never writes anything to Columbia. */}
      {primarySection ? (
        <Panel id="register" title="Register" icon={RiCalendarCheckLine} bare>
          <RegistrationHandoff
            section={primarySection}
            courseCode={code}
            courseTitle={title}
          />
        </Panel>
      ) : null}
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
  if (!report.hasPlan) {
    return (
      <div className="flex items-start gap-2.5 rounded-2lg border border-dashed border-border-button-default bg-background-primary-default p-3">
        <RiCalendarCheckLine
          className="mt-0.5 size-4 shrink-0 text-foreground-icon-tertiary"
          aria-hidden
        />
        <p className="text-body-regular text-text-secondary">
          No primary plan to check against yet. Once you have one, conflicts and the walk
          between back-to-back rooms are checked here before you commit —{" "}
          <span className="text-text-primary">not</span> after.
        </p>
      </div>
    );
  }

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
        The directory publishes no meeting times for this course, so there is nothing to
        place on a week yet. The bulletin usually carries them.
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

/**
 * The capacity line the chart draws as its ceiling.
 *
 * Only meaningful when every section agrees on one — sections of the same
 * course routinely have different caps, and drawing one section's cap across
 * all of them would invent a ceiling that does not exist. Disagreement returns
 * null and the chart simply omits the line.
 */
function sharedCapacity(sections: readonly Section[]): number | null {
  // `distinct` is a string helper; caps are numbers, so dedupe directly.
  const caps = new Set(
    sections
      .map((section) => section.enrollmentCap)
      .filter((cap): cap is number => typeof cap === "number"),
  );
  return caps.size === 1 ? [...caps][0] : null;
}
