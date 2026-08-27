import type { ReactNode } from "react";

import { PrefetchLink } from "@/components/catalog/prefetch-link";
import { RiArrowRightUpLine, RiInformationLine } from "@remixicon/react";

import { Avatar } from "@/components/base/avatar/avatar";
import { CampusCard } from "@/components/campus/campus-card";
import { Chip, type ChipProps } from "@/components/base/badges/chip";
import { ExpandableText } from "@/components/course/expandable-text";
import { ReferenceBlock } from "@/components/course/reference-block";
import { CourseHeroCard } from "@/components/course/course-hero-card";
import {
  meetingLines,
  prettyTitle,
  readSeats,
  type SeatReading,
} from "@/components/course/format";
import { CourseSubjectIcon } from "@/components/course/subject-icon";
import { EnrollmentChip } from "@/components/course/enrollment-chip";
import { InstructorChip } from "@/components/course/instructor-chip";
import type { SectionDetailData } from "@/components/course/load-section-detail";
import { MeetingSchedule } from "@/components/course/meeting-schedule";
import { RegistrationHandoff } from "@/components/course/registration-handoff";
import { BookmarkControls } from "@/components/bookmarks/bookmark-controls";
import { SectionWeekPreview } from "@/components/course/section-week-preview";
import { ProvenanceStamp, SeatPill } from "@/components/course/seat-state";
import { ButtonLink } from "@/components/base/buttons/button";
import { REQUIREMENT_FILTERS, vergilSectionUrl } from "@/lib/constants";
import type { Section } from "@/lib/types";
import { cx } from "@/utils/cx";

import { DrawerCloseButton, ExpandTitleLink } from "./course-drawer";

/**
 * One section, as the drawer draws it.
 *
 * The drawer is section-specific by rule: clicking a class opens THAT class,
 * never the container it is filed under. On PHED1001UN — 64 sections named
 * "PHED: Swim (Beginner)", "PHED: Diving", "PHED: Walk to Run" — a course-level
 * overlay answers a question nobody asked, because "Physical Education
 * Activities" is a filing category, not a class anyone attends.
 *
 * So the section's own name is the `<h1>` when it has one, and the course
 * becomes a context line underneath rather than the subject of the page.
 *
 * ── The order is the order the questions arrive in ─────────────────────────
 *
 * A student opening this panel asks four things, always in this sequence:
 * is this the right class, does it fit my week, can I still get in, and how do
 * I register. The layout answers them in that order and gives each answer a
 * different visual form, so none of them has to be hunted for:
 *
 *   1. identity   — a heading, an instructor with a face, what it counts for
 *   2. the week   — a drawn strip, not a "Meets: TuTh" label/value pair
 *   3. seats      — a number, a meter, and the directory's own timestamp
 *   4. handoff    — a call number you can copy and a link out to Vergil
 *
 * Everything below that line is reference material — description, the sibling
 * sections, the way out — and is separated from the decision by hairlines
 * rather than by cards, because a card promises interaction and these are
 * things to read.
 *
 * ── Why this is not `CourseDetail` with a filter ───────────────────────────
 *
 * `CourseDetail` aggregates: meeting patterns unioned across sections, a
 * distinct-instructor roll-up, similar courses, eight terms of history. Every
 * one of those is a course-level claim, and narrowing them to one section would
 * mean either recomputing them (a second implementation of the same ideas) or
 * printing course-level numbers under a section-level heading — which is how a
 * page ends up saying "3 sections" while showing one. A separate component is
 * the honest shape; the standalone page keeps the aggregate view, and this
 * shows the specific one.
 *
 * Everything here is a fact about `data.section`. Course-level values appear
 * only where they are labelled as such.
 */

const REQUIREMENT_LABEL_BY_KEY = new Map(REQUIREMENT_FILTERS.map((r) => [r.key, r.label]));

const SEAT_CHIP_COLOR: Record<SeatReading["tone"], NonNullable<ChipProps["color"]>> = {
  open: "lime",
  tight: "yellow",
  full: "rose",
  waitlist: "purple",
  unknown: "neutral",
};

/**
 * The one-word verdict that belongs beside the title.
 *
 * The seat card below states the numbers; this states the conclusion, and it
 * is deliberately different wording rather than the same string twice. A
 * section reading "0 seats left" in rose never actually says the word "Full"
 * anywhere on the page, and "89 / 80 enrolled" is a sentence you have to do
 * arithmetic on before it means anything.
 *
 * Returns null for a section that is simply open, because a green "34 seats
 * left" chip at the top of every ordinary section trains the reader to stop
 * seeing the chip — and then the full ones stop registering too. The badge
 * earns attention by being absent most of the time.
 */
function seatVerdict(reading: SeatReading): string | null {
  if (reading.tone === "full") return "Full";
  if (reading.tone === "waitlist") {
    return reading.waitlistCount != null
      ? `Waitlist · ${reading.waitlistCount} waiting`
      : "Waitlist open";
  }
  if (reading.tone === "tight") return "Almost full";
  return null;
}

export interface SectionDetailProps {
  data: SectionDetailData;
  /** The drawer points `aria-labelledby` at the heading. */
  titleId?: string;
  /** Overlay mode: close button sits beside the section heading. */
  showClose?: boolean;
  /**
   * Course-level blocks to render below the reference material — reviews,
   * workload, neighbours, offering history.
   *
   * A slot rather than a flag, because the caller is the only one that can
   * afford to decide. Filling it costs a `loadCourseDetail`, which assembles
   * similar courses and eight terms of history; the standalone page pays that
   * for a course with exactly one section (there is no course page left to
   * carry them) and the drawer never does, which is the whole reason the
   * drawer answers a click in milliseconds.
   */
  courseLevel?: ReactNode;
  /**
   * The course's reviews, hoisted to sit under the description.
   *
   * Filled on every standalone section page — including a multi-section
   * course, which is where a student is actually choosing between sections and
   * therefore where this is worth the most. Left empty by the DRAWER, which is
   * a different trade: reviews cost two reads, and the drawer's whole promise
   * is answering a click in milliseconds. The "Full page" link is one tap away
   * for the reader who wants them.
   */
  courseReviews?: ReactNode;
  /** Standalone page: draw the instructor-profile hero. Drawer: plain header. */
  surface?: "page" | "drawer";
  /** Back navigation, rendered inside the page hero cover. */
  backLink?: { href: string; label: string };
}

/* -------------------------------------------------------------------------- */
/*  Shared shapes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The registrar's own restrictions on who may take this section.
 *
 * These used to render as two loose grey paragraphs at the bottom of the
 * header, in the same tertiary caption as the provenance stamp and the planner
 * disclaimer — so "Open to: SEAS majors only", which can disqualify the reader
 * outright, looked exactly like fine print they were right to skip.
 *
 * The fix for that was a bordered, tinted box, which worked and then became
 * part of the problem: it was the fourth bounded surface in a panel already
 * accused of card spam. A left rule is the cheapest mark that still says "this
 * is set apart, read it" — it lifts the text out of the fine-print band without
 * claiming to be a component you can interact with.
 */
function RegistrarNotes({ section }: { section: Pick<Section, "openTo" | "note"> }) {
  if (!section.openTo && !section.note) return null;
  return (
    <div className="flex gap-2.5 border-l-2 border-border-table py-0.5 pl-3">
      <RiInformationLine
        aria-hidden
        className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
      />
      <div className="flex min-w-0 flex-col gap-1.5 text-caption-1-regular text-text-secondary">
        {section.openTo ? (
          <p>
            <span className="text-caption-1-semibold text-text-primary">Open to </span>
            {section.openTo}
          </p>
        ) : null}
        {section.note ? <p>{section.note}</p> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  The surface                                                               */
/* -------------------------------------------------------------------------- */

export function SectionDetail({
  data,
  titleId = "section-title",
  showClose = false,
  courseLevel,
  courseReviews,
  surface = "drawer",
  backLink,
}: SectionDetailProps) {
  const { course, section, siblings, code, credits, headline, ownTitle, courseTitle } = data;

  const seats = readSeats(section);
  const verdict = seatVerdict(seats);

  // Where this surface lives on its own.
  // standalone page is already here and renders that title as plain text.
  const sectionHref = `/course/${course.courseId}?section=${encodeURIComponent(section.sectionCode)}`;

  /*
   * Where and when THIS section meets — the map's whole input.
   *
   * The course page hands the campus card the union of every building across
   * every section, because there it is answering "where does this course
   * happen". Here the section is the subject, so the card gets one section's
   * rooms and one section's time, and the pin lands on the building the reader
   * would actually walk to.
   */
  const sectionMeetingLines = meetingLines(section.meetings);
  const sectionBuildingNames = [
    ...new Set(
      section.meetings
        .map((meeting) => meeting.buildingName)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const sectionRoom = section.meetings.find((meeting) => meeting.room)?.room ?? null;
  const firstMeeting = sectionMeetingLines[0];

  // Course-level, and labelled as such below — a Core requirement is satisfied
  // by the course, not by which section of it you sit in.
  const requirementLabels = Object.entries(course.requirementFlags)
    .filter(([, on]) => on === true)
    .map(([key]) => REQUIREMENT_LABEL_BY_KEY.get(key) ?? key);

  /*
   * Qualifiers, not headline facts. "Lecture", "In person" and "Standard
   * letter grade" each got a labelled cell in the old two-column grid, at the
   * same weight as the meeting time — which is how a spec sheet is laid out,
   * not how a decision is made. As one quiet dot-separated line they stay
   * available without competing with the week strip above them, and the rows
   * that would have been empty simply do not exist.
   */
  const qualifiers = [section.component, section.methodOfInstruction, section.gradingMode]
    .filter((value): value is string => Boolean(value))
    // The registrar shouts these: "RECITATION", "LECTURE". Title case is not
    // cosmetic here — a line of caps outweighs the meeting time above it, and
    // this line is deliberately the quietest thing in the card.
    .map(prettyTitle);

  const eyebrowRow = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption-1-medium text-text-secondary">
      <span className="text-caption-1-semibold tracking-[0.04em] tabular-nums text-accent-600">
        {code}
      </span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">Section {section.sectionCode}</span>
      <span aria-hidden>·</span>
      <span>{data.termLabel}</span>
      {credits ? (
        <>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{credits}</span>
        </>
      ) : null}
      {verdict ? (
        <Chip variant="caption" color={SEAT_CHIP_COLOR[seats.tone]}>
          {verdict}
        </Chip>
      ) : null}
    </div>
  );

  /*
   * The header's one high-emphasis action is the hand-off to Vergil, not a
   * save to our own schedule.
   *
   * "Add to schedule" put our planner at the top of a screen a student opens
   * when they are deciding whether to REGISTER. The next thing they do is
   * open Vergil, and making them find that link three rows down — at `xs`,
   * in secondary — ranked our bookkeeping above their actual errand.
   *
   * `RegistrationHandoff`'s compact row below keeps the call number, because
   * SSOL wants it typed and Vergil wants it clicked; those are different
   * errands. Its own Vergil link is gone, since it would now be the second
   * copy of this one in the same header — `compact` is rendered here and
   * nowhere else, so that removal is local.
   */
  const scheduleButton = (
    <ButtonLink
      href={vergilSectionUrl(section.termCode, section.callNumber)}
      target="_blank"
      rel="noopener noreferrer"
      size="medium"
      trailingIcon={RiArrowRightUpLine}
      className="shrink-0"
    >
      Open in Vergil
    </ButtonLink>
  );

  const titleHeading = (
    <h1
      id={titleId}
      className="min-w-0 text-display-4-semibold -tracking-[0.02em] text-balance text-text-primary"
    >
      {/*
        Inside the drawer the title is the handle for "show me all of this":
        clicking it grows the rail into the full page rather than swapping one
        screen for another, because it is the same section either way -- just
        with room around it. On the standalone page it renders as plain text;
        see the component.

        The id stays on the <h1>, not the link. `aria-labelledby` wants the
        heading, and moving it inside would label the dialog with a link.
      */}
      <ExpandTitleLink href={sectionHref}>{headline}</ExpandTitleLink>
    </h1>
  );

  const partOfLine = ownTitle ? (
    <p className="text-body-regular text-text-secondary">
      Part of{" "}
      {/*
        A real anchor, not a <Link>. `/course/[courseId]` is an intercepted
        route, so a client-side navigation to it from inside the overlay would
        be caught by the drawer slot and answered with the section chooser --
        leaving the reader in the drawer they were trying to leave. A document
        navigation exits the overlay and lands on the standalone course page,
        which is what "part of" is offering. Same reasoning as the drawer's own
        "Full page" link.
      */}
      {/*
        Text, not a link, when this is the only section. The course page
        redirects straight back here, so the link would be a click that returns
        you to where you already are. "Part of CHEM 1" is still worth saying —
        it names the thing this class is filed under — it just has nowhere else
        to go.
      */}
      {siblings.length === 0 ? (
        <span>
          {code} {courseTitle}
        </span>
      ) : (
        <a
          href={`/course/${course.courseId}`}
          className="underline decoration-border-table underline-offset-2 transition-colors hover:text-text-primary"
        >
          {code} {courseTitle}
        </a>
      )}
    </p>
  ) : null;

  const identityHeader = (
    <header className="flex flex-col gap-3">
      {surface === "drawer" ? (
        <>
          {/*
            Eyebrow row: subject icon sits on the metadata line (not beside the
            title), so it aligns with code · section · term instead of floating
            against a multi-line heading. Schedule + close share the right edge.
          */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <CourseSubjectIcon
                subjectCode={course.subjectCode}
                variant="inline"
                className="shrink-0"
              />
              {eyebrowRow}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {scheduleButton}
              {showClose ? <DrawerCloseButton /> : null}
            </div>
          </div>
          {titleHeading}
          {partOfLine}
        </>
      ) : (
        <>
          {eyebrowRow}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 flex flex-col gap-1.5">
              {titleHeading}
              {partOfLine}
            </div>
            {scheduleButton}
          </div>
        </>
      )}

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
            A name with a face beside it, even a generated one. Two co-teachers
            in a run-on "A · B" string are one blur; two badges are two people,
            which is the shape of the fact.

            Each name is also the handle for that person's ratings — ours and
            RateMyProfessor's, kept separate — behind the same hover the seat
            number uses for its history. The course page gives an instructor a
            full-width card because "who teaches this" is one of its subjects;
            here it is one line of an identity block, and a reader deciding
            about a class should not have to scroll past a ratings table to
            reach the description.
          */}
          {section.instructors.length > 0 ? (
            <div className="-ml-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {section.instructors.map((name) => (
                <InstructorChip
                  key={name}
                  name={name}
                  role={`Section ${section.sectionCode} · ${code}`}
                />
              ))}
            </div>
          ) : (
            <span className="flex items-center gap-2">
              <Avatar size="sm" initials="?" />
              <span className="text-headline-medium text-text-tertiary">Instructor TBA</span>
            </span>
          )}

          {/*
            The call number belongs to the identity block, not to a panel of
            its own: it is the name Columbia's own systems use for this class,
            so it reads under the title the way a serial number reads under a
            product name. Copy chip, Vergil link and the bookmark ride along
            at the same weight, because the ways of acting on this section —
            paste into SSOL, click through to Vergil, or save it to decide
            later — are equally likely, and the one left below the seat card
            read as an afterthought rather than a peer.

            The bell lives inside the bookmark's overflow menu rather than
            here, because a watch is a child of a save: there is nothing to be
            notified about on a class you have not shortlisted.
          */}
          <RegistrationHandoff
            section={section}
            courseCode={code}
            courseTitle={courseTitle}
            variant="compact"
            actions={
              <BookmarkControls
                sectionId={section.sectionId}
                sectionCode={section.sectionCode}
                courseLabel={code}
              />
            }
          />
    </header>
  );

  return (
    <article
      className={cx(
        "flex w-full flex-col",
        surface === "page" ? "gap-3 sm:gap-5" : "gap-4 sm:gap-5",
      )}
    >
      {/* ================================================================== */}
      {/* The decision                                                        */}
      {/* ================================================================== */}
      <div className="flex flex-col gap-4">
        {surface === "page" ? (
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
          A hairline, not a card. These two facts used to sit in a bordered,
          shadowed panel, which on a section with no published meeting pattern
          was 174px of chrome around "Time TBD" and "0 seats left" — and it was one of four bounded surfaces stacked down a drawer
          that is 88dvh tall. A card is a promise that something substantial is
          inside it; spend one here and every other card on the page is worth
          less. The rule above does the same separating job for the price of one
          pixel, and it is the treatment the reference blocks below already use.
        */}
        <div
          className={cx(
            "flex flex-col gap-3 border-t border-border-table pt-4",
            surface === "page" && "sm:border-x sm:border-border-ai-profile-card sm:px-4",
          )}
        >
          {/*
            "When does it meet" and "can I get in" are one row, because they are
            one question — a student weighing this section reads the time and the
            seat count in a single glance and only then decides whether to keep
            reading. Stacked, the chip sat a line below the fold of that glance
            and read as a separate topic.

            `flex-wrap` matters: the drawer is 672px and the standalone page is
            896px, and a long room name plus a waitlist count will not share 672
            with the week strip. When they cannot, the chip drops to its own line
            rather than crushing the meeting text.

            Seats for THIS section. `EnrollmentChip` ends with the directory's
            own "as of" stamp (spec §3: a seat number never renders without it),
            so this must NOT add a second one — two identical timestamps under
            one number reads as two readings that happen to agree.
          */}
          {/*
            Stack on narrow viewports: the chip is `shrink-0` and the schedule
            is `min-w-0 flex-1`, so a side-by-side row lets the schedule crush
            to nothing while the chip keeps its width — the two overlap. Below
            `sm` they are one column; from `sm` up the original wrap row returns.
          */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-4 sm:gap-y-1">
            <MeetingSchedule meetings={section.meetings} className="min-w-0 sm:col-start-1 sm:row-start-1" />
            <EnrollmentChip
              section={section}
              termLabel={data.termLabel}
              hideProvenance
              className="sm:col-start-2 sm:row-start-1 sm:justify-self-end sm:self-start"
            />
            <ProvenanceStamp
              sourceAsOf={section.sourceAsOf}
              className="truncate sm:col-start-2 sm:row-start-2 sm:justify-self-end sm:text-right"
            />
          </div>

          {qualifiers.length > 0 ? (
            <p className="text-caption-1-regular text-text-tertiary">
              {qualifiers.join(" · ")}
            </p>
          ) : null}
        </div>

        <RegistrarNotes section={section} />
      </div>

      {/* ================================================================== */}
      {/* Reference: what the course is about — context, not the subject      */}
      {/* ================================================================== */}
      {course.description ? (
        <ReferenceBlock title="Description">
          {/*
            Full width, by decision.

            This used to carry `max-w-[68ch]` for a comfortable measure, which
            on the 896px standalone page left the paragraph ending well short of
            every other element in the column — the hairlines, the seat chip and
            the meeting row all run to the edge, so a short text block read as a
            layout mistake rather than as typographic restraint. `w-full` is
            explicit rather than merely dropping the cap, because
            `ExpandableText`'s wrapper is `items-start`: without it the
            paragraph is sized `fit-content`, which fills for a long
            description and silently does not for a short one.

            The trade is real — the drawer stays a comfortable ~85 characters,
            but the standalone page now sets around 110 per line, which is past
            the point where the eye starts losing its place on the return sweep.
            If that reads badly on a long description, the middle option is a
            cap that only binds at page width (`max-w-none lg:max-w-[90ch]`).
          */}
          <ExpandableText text={course.description} className="w-full" />
        </ReferenceBlock>
      ) : null}

      {/* ================================================================== */}
      {/* Is it any good — the question a shared link was posted to answer     */}
      {/* ================================================================== */}
      {/*
        Directly under the description, and above everything else, for the same
        reason the description sits above the week grid: answer "what is this"
        first, then "is it worth it", then the mechanics.

        This matters most here. 78% of the courses offered in Fall 2026 have
        exactly one section, so this surface — not the multi-section course
        page — is what nearly every `/course/[id]` link resolves to, and
        `/course/` is now open to signed-out visitors. Someone answering "is
        Cannon's 3134 brutal" with a link needs the link to answer it before
        the reader gives up scrolling.

        Every standalone section page fills this, not only the single-section
        ones. See the prop's own note and `page.tsx`: the left half is a claim
        about the course and says so, and the right half is scoped to THIS
        section's instructor, which is the half a student picking between six
        sections of one course is actually reading for.

        Empty in the drawer, which trades these two reads for its latency.
      */}
      {courseReviews}

      {/* ================================================================== */}
      {/* Does it fit, and where would you be                                 */}
      {/* ================================================================== */}
      {/*
        Both of these are only answerable because the surface is about ONE
        section. A course-level version of either is a different, weaker claim:
        a week with eight sections laid over it, and a map with a pin for every
        building the course has ever used. Narrowing them to the section is not
        a simplification — it is what turns them from a survey into an answer.

        They sit below the description, not above it. The earlier arrangement
        argued that fit is decision material and the blurb is reference, so fit
        should come first — but that assumed a reader who already knows what
        the course is. Most arrivals here are from a search result, where all
        they have seen is a title, and asking "does it collide with my Tuesday"
        before "what is this" is answering the second question first. The
        description is short and capped in the rail, so it costs little to pass
        on the way down.
      */}
      {section.meetings.length > 0 ? (
        <ReferenceBlock title="In your week">
          <SectionWeekPreview section={section} termCode={data.termCode} />
        </ReferenceBlock>
      ) : null}

      {sectionBuildingNames.length > 0 ? (
        <ReferenceBlock title="Where it meets">
          {/*
            The card takes the raw building strings straight off the parser —
            normalising them is the campus lane's job, and it is the lane that
            knows the alias table. It decides for itself between the 3D scene
            and the flat map based on WebGL support and prefers-reduced-motion,
            and lazy-loads three.js only if it picks the scene, so none of this
            is on the drawer's open path.
          */}
          <CampusCard
            buildingNames={sectionBuildingNames}
            roomLabel={sectionRoom}
            meta={firstMeeting ? `${firstMeeting.daysLabel} ${firstMeeting.timeLabel}` : null}
          />
        </ReferenceBlock>
      ) : null}

      {/* ================================================================== */}
      {/* Reference: sideways movement to the sibling sections                */}
      {/* ================================================================== */}
      {siblings.length > 0 ? (
        <ReferenceBlock title={`Other sections of ${code}`} count={siblings.length}>
          {/*
            Links, not an expandable list. Each one swaps the drawer to that
            section in place, which is the movement a student actually makes
            here — "same class, different time" — without ever passing through
            a course-level view.

            Each row now carries its own seat state, because the reason anyone
            looks at this list is that the section they are on is full or
            clashes. A list of alternatives that does not say which ones are
            open makes the reader open every one of them to find out.
          */}
          <ul className="-mx-2 flex list-none flex-col">
            {siblings.map((sibling) => {
              const when = meetingLines(sibling.meetings)[0];
              const siblingSeats = readSeats(sibling);
              /*
               * Same restraint as the verdict chip, for the same reason. Nine
               * saturated green pills down the right edge of this list read as
               * decoration and pull the eye off the section codes, which are
               * the things being navigated to. Only the sections you might not
               * get into get a coloured pill; the rest state their count and
               * stay out of the way.
               */
              const isNotable = siblingSeats.tone !== "open" && siblingSeats.tone !== "unknown";
              return (
                <li key={sibling.sectionId}>
                  <PrefetchLink
                    href={`/course/${course.courseId}?section=${encodeURIComponent(sibling.sectionCode)}`}
                    className={cx(
                      "group flex min-h-14 items-center gap-3 rounded-xl px-2 py-2",
                      "transition-colors duration-150 outline-none",
                      "hover:bg-background-primary-hover",
                      "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 items-baseline gap-2 text-body-medium text-text-primary">
                        <span className="tabular-nums">{sibling.sectionCode}</span>
                        <span className="truncate text-body-regular text-text-secondary">
                          {sibling.instructors.length > 0
                            ? sibling.instructors.join(" · ")
                            : "Instructor TBA"}
                        </span>
                      </span>
                      <span className="text-caption-1-regular tabular-nums text-text-tertiary">
                        {when
                          ? `${when.daysLabel} ${when.timeLabel}`
                          : "Time TBD"}
                      </span>
                    </span>
                    {isNotable ? (
                      <SeatPill section={sibling} className="shrink-0 whitespace-nowrap" />
                    ) : (
                      <span className="shrink-0 text-caption-1-regular tabular-nums whitespace-nowrap text-text-tertiary">
                        {siblingSeats.remaining != null
                          ? `${siblingSeats.remaining} left`
                          : "Seats unknown"}
                      </span>
                    )}
                    <RiArrowRightUpLine
                      aria-hidden
                      className={cx(
                        "size-4 shrink-0 text-text-tertiary",
                        "transition-transform duration-150 ease-in-out motion-reduce:transition-none",
                        "group-hover:-translate-y-px group-hover:translate-x-px",
                      )}
                    />
                  </PrefetchLink>
                </li>
              );
            })}
          </ul>
        </ReferenceBlock>
      ) : null}

      {/* ================================================================== */}
      {/* The course this section belongs to, when nothing else carries it    */}
      {/* ================================================================== */}
      {/*
        Only ever filled on the standalone page of a course with exactly one
        section. Reviews, workload, neighbours and offering history are claims
        about the course, and with one section the course and the section are
        the same object — so they are as true here as they were on the page
        that used to hold them, and that page no longer exists to be visited.
      */}
      {courseLevel}

      {/* ================================================================== */}
      {/* The way out                                                         */}
      {/* ================================================================== */}
      {/*
        Suppressed when there is nothing on the other side. `/course/[id]`
        redirects to this URL for a single-section course, so the link would
        round-trip the reader back to the page they are reading — and it would
        promise a "full course page" that has strictly less on it than this
        one, since the four course-level blocks are already above.
      */}
      {siblings.length > 0 ? (
        <footer className="border-t border-border-table pt-5">
          {/* Also a document navigation — see the note on "Part of" above. */}
          <a
            href={`/course/${course.courseId}`}
            className={cx(
              "inline-flex items-center gap-1.5 self-start text-body-medium text-text-secondary",
              "underline decoration-border-table underline-offset-4",
              "transition-colors outline-none hover:text-text-primary",
              "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            Full course page for {code}
            <RiArrowRightUpLine aria-hidden className="size-4" />
          </a>
        </footer>
      ) : null}
    </article>
  );
}
