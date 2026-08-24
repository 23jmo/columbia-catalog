import {
  RiBookOpenLine,
  RiCalendarCheckLine,
  RiErrorWarningLine,
  RiFileList2Line,
  RiGroupLine,
  RiRoadMapLine,
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
import { guessCampusZone, meetingLines, prettyTitle } from "@/components/course/format";
import type { CourseDetailData } from "@/components/course/load-course-detail";
import { CourseLevelPanels } from "@/components/course/course-level-panels";
import { EmptyNote, Fact, LanePlaceholder, Panel } from "@/components/course/panel";
import { RegistrationHandoff } from "@/components/course/registration-handoff";
import { AddToScheduleButton } from "@/components/schedule/add-to-schedule-button";
import { WatchButton } from "@/components/watch/watch-button";
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
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 4-7. Reviews, workload, neighbours, offering history                */}
      {/* ------------------------------------------------------------------ */}
      {/* Shared verbatim with the single-section page, where `/course/[id]`
          redirects and this is the only place these four still render. */}
      <CourseLevelPanels data={data} reputation={reputation} variant="page" />

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
