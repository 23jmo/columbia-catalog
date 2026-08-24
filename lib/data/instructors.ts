/**
 * Instructor read API — the seam behind `/instructor/[slug]`.
 *
 * Everything here is DERIVED from the catalog seam (`@/lib/data/catalog`).
 * There is no instructor table and no instructor ingest: the registrar
 * publishes instructors only as a string array on each section, so a "profile"
 * is an aggregation over the sections that name the same person.
 *
 * Two consequences worth stating, because they shape every number below:
 *
 *   · **The identity is the printed name.** We have no UNI, no ORCID, no
 *     employee id. `Adam H Cannon` and `A. Cannon` would be two people to us.
 *     `instructorSlug` is therefore a display-name slug, not a stable key, and
 *     `resolveInstructor` matches back against the live catalog rather than
 *     trusting the slug to round-trip.
 *
 *   · **Every seat-derived number carries the directory's own "as of".** Seat
 *     counts here are sums of section counts, so the provenance that travels
 *     with a section travels with the sum: `seatsAsOf` is the OLDEST `sourceAsOf`
 *     among the contributing sections, because a total is only as fresh as its
 *     stalest term. Nothing rounds that away.
 *
 * Nothing in this file reads the seed JSON directly, and nothing in it touches
 * the network — RateMyProfessor is fetched live in the browser (see
 * `app/api/rmp/[instructor]/route.ts`) and never enters this path.
 */

import { getAllCourses } from "@/lib/data/catalog";
import { CURRENT_TERM, GRID_END_MINUTE, GRID_START_MINUTE, termLabel, WEEKDAYS } from "@/lib/constants";
import { parseCalendarDate, termBounds, type TermBounds } from "@/lib/schedule/term-dates";
import type { CourseWithSections, Meeting, Section, TermCode, Weekday } from "@/lib/types";
import { creditsLabel, meetingSummary, placeSummary, prettyTitle } from "@/components/course/format";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * "Adam H Cannon" → "adam-h-cannon".
 *
 * Diacritics are folded so a pasted URL survives a copy through a system that
 * mangles them, and everything non-alphanumeric collapses to a single hyphen.
 */
export function instructorSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface InstructorSectionRef {
  sectionId: string;
  courseId: string;
  /** "COMS 4118" — the code a student says out loud. */
  code: string;
  title: string;
  sectionCode: string;
  callNumber: string;
  component: string | null;
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  waitlistCount: number | null;
  waitlistCap: number | null;
  status: Section["status"];
  /** The directory's own timestamp. Travels with every number derived from it. */
  sourceAsOf: string | null;
  detailUrl: string | null;
  meetings: Meeting[];
  meetingSummary: string | null;
  placeSummary: string | null;
  /** Everyone else listed on this section. */
  coInstructors: string[];
}

export interface InstructorCourseRef {
  courseId: string;
  subjectCode: string;
  code: string;
  title: string;
  credits: string | null;
  department: string | null;
  sections: InstructorSectionRef[];
  /** Sums across only the sections THIS instructor teaches. */
  enrolled: number | null;
  capacity: number | null;
}

/** One day of the term. The unit behind both the heatmap and the bar chart. */
export interface TeachingDay {
  /** `YYYY-MM-DD`. */
  date: string;
  weekday: Weekday;
  /** Minutes of scheduled class time on this day. */
  minutes: number;
  /** Students enrolled in the sections meeting this day. */
  students: number;
  /** Distinct sections meeting this day. */
  sections: number;
}

/** One sample of "how many students are in a room right now". */
export interface LoadSample {
  /** Index across the plotted week, so a single series can span Mo–Fr. */
  t: number;
  weekday: Weekday;
  /** Minutes from midnight. */
  minute: number;
  students: number;
}

export interface InstructorPageData {
  name: string;
  slug: string;
  termCode: TermCode;
  termLabel: string;

  /** Subject codes taught, e.g. ["COMS"]. */
  subjects: string[];
  /** Departments as the registrar prints them. */
  departments: string[];

  courses: InstructorCourseRef[];
  courseCount: number;
  sectionCount: number;

  /** Sum of enrolled students across their sections. Null when unpublished. */
  studentsTaught: number | null;
  totalCapacity: number | null;
  /** 0–1. Null when either half is unknowable. */
  fillRatio: number | null;
  /** Oldest `sourceAsOf` among contributing sections — see the file header. */
  seatsAsOf: string | null;

  /** Scheduled class minutes in a full teaching week. */
  weeklyMinutes: number;
  /** Weekdays they are in front of a room. */
  teachingDays: Weekday[];
  /** Distinct buildings, most-used first. */
  buildings: string[];
  largestSection: { code: string; sectionCode: string; enrolled: number } | null;
  /** Anyone co-listed on a section with them. */
  coTeachers: string[];

  bounds: TermBounds;
  calendar: TeachingDay[];
  /** Months of the term that contain at least one calendar day, in order. */
  months: { key: string; label: string; days: TeachingDay[] }[];
  weekLoad: LoadSample[];
  /** Peak concurrent students, and when. Null when no meeting times published. */
  peakLoad: { students: number; weekday: Weekday; minute: number } | null;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function sectionsOf(courses: CourseWithSections[], termCode: TermCode, name: string) {
  const out: { course: CourseWithSections; section: Section }[] = [];
  for (const course of courses) {
    for (const section of course.sections) {
      if (section.termCode !== termCode) continue;
      if (!section.instructors.includes(name)) continue;
      out.push({ course, section });
    }
  }
  return out;
}

/**
 * Sums that stay `null` when nothing was published, rather than collapsing an
 * absent number to zero. "0 students" and "the registrar has not said" are
 * different claims and the page renders them differently.
 */
function sumOrNull(values: (number | null)[]): number | null {
  let total: number | null = null;
  for (const value of values) {
    if (value == null) continue;
    total = (total ?? 0) + value;
  }
  return total;
}

/** The oldest of a set of directory timestamps — a total is as stale as its worst part. */
function oldestAsOf(stamps: (string | null)[]): string | null {
  let oldest: string | null = null;
  let oldestTime = Infinity;
  for (const stamp of stamps) {
    if (!stamp) continue;
    const cleaned = stamp.replace(/\s*\/\s*\w+\s*$/, "").trim();
    const time = new Date(cleaned).getTime();
    // Unparseable stamps still beat having none at all.
    if (Number.isNaN(time)) {
      if (oldest == null) oldest = stamp;
      continue;
    }
    if (time < oldestTime) {
      oldestTime = time;
      oldest = stamp;
    }
  }
  return oldest;
}

const JS_DAY_TO_WEEKDAY: Weekday[] = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Walks `startsOn`…`endsOn` inclusive as UTC calendar days — no timezone drift. */
function eachDay(bounds: TermBounds): { date: string; weekday: Weekday }[] {
  const [sy, sm, sd] = parseCalendarDate(bounds.startsOn);
  const [ey, em, ed] = parseCalendarDate(bounds.endsOn);
  const end = Date.UTC(ey, em - 1, ed);
  const days: { date: string; weekday: Weekday }[] = [];
  for (let t = Date.UTC(sy, sm - 1, sd); t <= end; t += 86_400_000) {
    const day = new Date(t);
    days.push({
      date: day.toISOString().slice(0, 10),
      weekday: JS_DAY_TO_WEEKDAY[day.getUTCDay()],
    });
  }
  return days;
}

const MONTH_LABEL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 10-minute sampling. Fine enough to show a 75-minute class, coarse enough to plot. */
const LOAD_STEP_MINUTES = 10;

function buildWeekLoad(sections: Section[]): { samples: LoadSample[]; peak: InstructorPageData["peakLoad"] } {
  const samples: LoadSample[] = [];
  let peak: InstructorPageData["peakLoad"] = null;
  let t = 0;

  for (const weekday of WEEKDAYS) {
    for (let minute = GRID_START_MINUTE; minute <= GRID_END_MINUTE; minute += LOAD_STEP_MINUTES) {
      let students = 0;
      for (const section of sections) {
        if (section.enrollmentCount == null) continue;
        const inClass = section.meetings.some(
          (m) => m.weekday === weekday && minute >= m.startMinute && minute < m.endMinute,
        );
        if (inClass) students += section.enrollmentCount;
      }
      samples.push({ t, weekday, minute, students });
      if (students > 0 && (peak == null || students > peak.students)) {
        peak = { students, weekday, minute };
      }
      t += 1;
    }
  }
  return { samples, peak };
}

/**
 * Build the profile, or `null` when nobody by that slug teaches in the term.
 *
 * `slugOrName` accepts either, so `/instructor/adam-h-cannon` and a programmatic
 * call with the printed name both work.
 */
/**
 * Is this `department` value fit to show a reader?
 *
 * The bulletin ingest does not always land a department NAME in this field —
 * on some course rows it carries the bulletin's own URL path, e.g.
 * "/columbia-college/departments-instruction/cognitive-science/". Those sort
 * before every real name ("/" precedes letters), so taking `departments[0]`
 * blind put a raw URL under the instructor's name where their department
 * belongs, and named the wrong department while doing it.
 *
 * We do not try to prettify the slug back into a name: the path is attached to
 * the course, not the person, so a COMS instructor was being labelled
 * "Cognitive Science". Dropping the value and falling back to the subject is
 * the honest read — better to say less than to say something wrong.
 */
function isDepartmentName(value: string | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !trimmed.includes("/");
}

export async function loadInstructorProfile(
  slugOrName: string,
  termCode: TermCode = CURRENT_TERM,
): Promise<InstructorPageData | null> {
  const courses = await getAllCourses(termCode);
  const wanted = instructorSlug(decodeURIComponent(slugOrName));

  // Resolve against live catalog names rather than trusting the slug to invert.
  const names = new Set<string>();
  for (const course of courses) {
    for (const section of course.sections) {
      if (section.termCode !== termCode) continue;
      for (const person of section.instructors) names.add(person);
    }
  }
  const name = [...names].find((candidate) => instructorSlug(candidate) === wanted);
  if (!name) return null;

  const taught = sectionsOf(courses, termCode, name);
  if (taught.length === 0) return null;

  // ---- courses -----------------------------------------------------------
  const byCourse = new Map<string, InstructorCourseRef>();
  for (const { course, section } of taught) {
    const code = `${course.subjectCode} ${course.number}`;
    let entry = byCourse.get(course.courseId);
    if (!entry) {
      entry = {
        courseId: course.courseId,
        subjectCode: course.subjectCode,
        code,
        title: prettyTitle(course.title),
        credits: creditsLabel(course.pointsMin, course.pointsMax),
        department: course.department,
        sections: [],
        enrolled: null,
        capacity: null,
      };
      byCourse.set(course.courseId, entry);
    }
    entry.sections.push({
      sectionId: section.sectionId,
      courseId: course.courseId,
      code,
      title: prettyTitle(course.title),
      sectionCode: section.sectionCode,
      callNumber: section.callNumber,
      component: section.component,
      enrollmentCount: section.enrollmentCount,
      enrollmentCap: section.enrollmentCap,
      waitlistCount: section.waitlistCount,
      waitlistCap: section.waitlistCap,
      status: section.status,
      sourceAsOf: section.sourceAsOf,
      detailUrl: section.detailUrl,
      meetings: section.meetings,
      meetingSummary: meetingSummary(section.meetings),
      placeSummary: placeSummary(section.meetings),
      coInstructors: section.instructors.filter((person) => person !== name),
    });
  }

  const courseRefs = [...byCourse.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  for (const course of courseRefs) {
    course.sections.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true }));
    course.enrolled = sumOrNull(course.sections.map((s) => s.enrollmentCount));
    course.capacity = sumOrNull(course.sections.map((s) => s.enrollmentCap));
  }

  const sections = taught.map((entry) => entry.section);

  // ---- headline numbers --------------------------------------------------
  const studentsTaught = sumOrNull(sections.map((s) => s.enrollmentCount));
  const totalCapacity = sumOrNull(sections.map((s) => s.enrollmentCap));
  const fillRatio =
    studentsTaught != null && totalCapacity != null && totalCapacity > 0
      ? studentsTaught / totalCapacity
      : null;

  const weeklyMinutes = sections.reduce(
    (total, section) =>
      total + section.meetings.reduce((sum, m) => sum + Math.max(0, m.endMinute - m.startMinute), 0),
    0,
  );

  const dayFlags = new Set<Weekday>();
  for (const section of sections) for (const m of section.meetings) dayFlags.add(m.weekday);

  const buildingCounts = new Map<string, number>();
  for (const section of sections) {
    for (const m of section.meetings) {
      if (!m.buildingName) continue;
      buildingCounts.set(m.buildingName, (buildingCounts.get(m.buildingName) ?? 0) + 1);
    }
  }

  let largestSection: InstructorPageData["largestSection"] = null;
  for (const course of courseRefs) {
    for (const section of course.sections) {
      if (section.enrollmentCount == null) continue;
      if (largestSection == null || section.enrollmentCount > largestSection.enrolled) {
        largestSection = {
          code: section.code,
          sectionCode: section.sectionCode,
          enrolled: section.enrollmentCount,
        };
      }
    }
  }

  const coTeachers = [
    ...new Set(courseRefs.flatMap((c) => c.sections.flatMap((s) => s.coInstructors))),
  ].sort();

  // ---- term calendar -----------------------------------------------------
  const bounds = termBounds(termCode);
  const calendar: TeachingDay[] = eachDay(bounds).map(({ date, weekday }) => {
    let minutes = 0;
    let students = 0;
    let meeting = 0;
    for (const section of sections) {
      const today = section.meetings.filter((m) => m.weekday === weekday);
      if (today.length === 0) continue;
      meeting += 1;
      if (section.enrollmentCount != null) students += section.enrollmentCount;
      for (const m of today) minutes += Math.max(0, m.endMinute - m.startMinute);
    }
    return { date, weekday, minutes, students, sections: meeting };
  });

  const monthBuckets = new Map<string, TeachingDay[]>();
  for (const day of calendar) {
    const key = day.date.slice(0, 7);
    const bucket = monthBuckets.get(key);
    if (bucket) bucket.push(day);
    else monthBuckets.set(key, [day]);
  }
  const months = [...monthBuckets.entries()].map(([key, days]) => ({
    key,
    label: `${MONTH_LABEL[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`,
    days,
  }));

  const { samples, peak } = buildWeekLoad(sections);

  return {
    name,
    slug: instructorSlug(name),
    termCode,
    termLabel: termLabel(termCode),
    subjects: [...new Set(courseRefs.map((c) => c.subjectCode))].sort(),
    departments: [
      ...new Set(courseRefs.map((c) => c.department).filter(isDepartmentName)),
    ].sort(),
    courses: courseRefs,
    courseCount: courseRefs.length,
    sectionCount: sections.length,
    studentsTaught,
    totalCapacity,
    fillRatio,
    seatsAsOf: oldestAsOf(sections.map((s) => s.sourceAsOf)),
    weeklyMinutes,
    teachingDays: WEEKDAYS.filter((day) => dayFlags.has(day)),
    buildings: [...buildingCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name_]) => name_),
    largestSection,
    coTeachers,
    bounds,
    calendar,
    months,
    weekLoad: samples,
    peakLoad: peak,
  };
}

/** Every instructor in a term, for `generateStaticParams` and directory listings. */
export async function listInstructors(
  termCode: TermCode = CURRENT_TERM,
): Promise<{ name: string; slug: string; sectionCount: number; subjects: string[] }[]> {
  const courses = await getAllCourses(termCode);
  const byName = new Map<string, { sectionCount: number; subjects: Set<string> }>();
  for (const course of courses) {
    for (const section of course.sections) {
      if (section.termCode !== termCode) continue;
      for (const person of section.instructors) {
        let entry = byName.get(person);
        if (!entry) {
          entry = { sectionCount: 0, subjects: new Set() };
          byName.set(person, entry);
        }
        entry.sectionCount += 1;
        entry.subjects.add(course.subjectCode);
      }
    }
  }
  return [...byName.entries()]
    .map(([name, entry]) => ({
      name,
      slug: instructorSlug(name),
      sectionCount: entry.sectionCount,
      subjects: [...entry.subjects].sort(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
