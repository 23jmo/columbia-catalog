/**
 * Everything `/profile` renders, assembled on the server.
 *
 * The audit engine and the recommender are both pure functions over data a
 * caller supplies (`lib/requirements/evaluate.ts`, `./recommend.ts`). This is
 * the module that goes and gets that data — the seam between the domain logic
 * and the catalog.
 *
 * ── Why the catalog lookup spans two terms ──────────────────────────────────
 *
 * `getCoursesByIds` is term-scoped: it returns courses with sections in the
 * term you name. A student's record is mostly *past* courses, and we hold no
 * archive of retired offerings, so the only honest source of facts about
 * `MATH1201UN` is the fact that MATH1201UN is still taught. Both active terms
 * are queried and merged.
 *
 * Courses that appear in neither come back unresolved, and that is a real
 * answer rather than a gap to paper over: `matchesSelector` refuses to credit a
 * course it cannot see toward a *flagged* requirement, because the flag is a
 * property of the catalog record and we do not have one. Named requirements
 * still match, because those compare course ids. The screen says which courses
 * were unresolved so the student can see why a Science requirement did not move.
 *
 * ── Why recommendations are scoped to candidate ids ─────────────────────────
 *
 * The alternative is to score the whole term — thousands of courses — against
 * every outstanding requirement on every profile render. The requirements that
 * name a finite set already tell us exactly which courses could possibly
 * qualify, so only those are fetched. Flag-matched requirements produce no
 * candidates by design, and the card says so rather than pretending the list is
 * complete.
 */

import { getCoursesByIds } from "@/lib/data/catalog";
import { loadPrimaryPlanSnapshot } from "@/lib/db/primary-plan-snapshot";
import { loadStudentProfile } from "@/lib/db/student-profile";
import { evaluateCandidateLocally } from "@/components/course/plan-conflicts";
import { resolveCampusZone } from "@/lib/campus/zones";
import { NEXT_TERM, CURRENT_TERM, termLabel } from "@/lib/constants";
import { listPrograms } from "@/lib/requirements/programs";
import { formatCourseId, type CourseId } from "@/lib/requirements/code";
import type { CourseFacts } from "@/lib/requirements/evaluate";
import type { CourseWithSections, Section, TermCode } from "@/lib/types";

import { auditProfile, overallProgress, type ProfileAudit } from "./audit";
import { recommend, type Offering, type Recommendation } from "./recommend";
import { EMPTY_PROFILE, type StudentProfile } from "./types";

export interface ProfilePageData {
  /** `null` when Supabase is unconfigured or nobody is signed in. */
  profile: StudentProfile | null;
  audit: ProfileAudit;
  progress: number;
  recommendations: Recommendation[];
  /** Catalog titles for courses on the record, keyed by course id. */
  titles: Record<string, string>;
  /**
   * `courseId` → the term the student says they took it, for the audit tree.
   *
   * Read off `TakenCourse`, not off the audit: `GroupMatch` carries no term,
   * and giving it one would push a fact about the student's record into a type
   * that describes a rule being satisfied.
   */
  termLabels: Record<string, string | null>;
  /** Courses on the record that no requirement counted, resolved for display. */
  uncounted: { courseId: string; code: string; title: string | null }[];
  /**
   * Catalog titles for courses an outstanding requirement NAMES, keyed by
   * course id — what the audit tree's "still needed" chips print.
   *
   * Separate from `titles` because that map is built from the student's own
   * record and a candidate is by definition not on it.
   */
  candidateTitles: Record<string, string>;
  /** Courses named by outstanding requirements, for the picker. */
  suggestions: {
    courseId: string;
    code: string;
    title: string | null;
    requirement: string;
  }[];
  /** Programs offered in the degree editor. */
  programOptions: {
    id: string;
    name: string;
    kind: string;
    school: string;
    origin: "authored" | "parsed";
  }[];
  /** The term recommendations are drawn from. */
  recommendTermCode: TermCode;
  recommendTermLabel: string;
}

/** The shape `auditProfile` wants, built from a catalog record. */
function toFacts(course: CourseWithSections): CourseFacts {
  return {
    courseId: course.courseId,
    title: course.title,
    // `pointsMin` rather than the midpoint: a variable-credit course counted at
    // its maximum would let a points requirement go green on credit the student
    // may not have earned. The student's own number overrides this when they
    // gave one (`pointsFor` in the engine).
    points: course.pointsMin ?? course.pointsMax,
    requirementFlags: course.requirementFlags,
  };
}

async function loadFacts(courseIds: string[]): Promise<Map<CourseId, CourseFacts>> {
  const facts = new Map<CourseId, CourseFacts>();
  if (courseIds.length === 0) return facts;

  const perTerm = await Promise.all(
    [CURRENT_TERM, NEXT_TERM].map((term) => getCoursesByIds(courseIds, term)),
  );

  for (const courses of perTerm) {
    for (const course of courses) {
      // First term to supply a record wins; both describe the same course.
      if (!facts.has(course.courseId)) facts.set(course.courseId, toFacts(course));
    }
  }

  return facts;
}

/**
 * The empty profile, so a signed-out visitor gets a real page rather than a
 * redirect. Reads are free (spec §15) — the screen explains what signing in
 * would add instead of refusing to render.
 */
function anonymousProfile(): StudentProfile {
  return { ...EMPTY_PROFILE, userId: "" };
}

export async function loadProfilePageData(): Promise<ProfilePageData> {
  const loaded = await loadStudentProfile();
  const profile = loaded ?? anonymousProfile();

  const facts = await loadFacts(profile.courses.map((course) => course.courseId));
  const audit = auditProfile({ profile, catalog: facts });

  const titles: Record<string, string> = {};
  for (const course of profile.courses) {
    const title = facts.get(course.courseId)?.title;
    if (title) titles[course.courseId] = title;
  }

  const termLabels: Record<string, string | null> = {};
  for (const course of profile.courses) {
    termLabels[course.courseId] = course.termLabel;
  }

  const uncounted = audit.uncountedCourseIds.map((courseId) => ({
    courseId,
    code: formatCourseId(courseId),
    title: facts.get(courseId)?.title ?? null,
  }));

  const candidateIds = [
    ...new Set(audit.remaining.flatMap((requirement) => requirement.candidates)),
  ];

  const offeringsTerm = NEXT_TERM;
  /*
   * Candidates are fetched from both terms, for the same reason `loadFacts`
   * does it: `getCoursesByIds` is term-scoped, and a requirement names the
   * courses the Bulletin lists without regard to which term they run in. Half
   * of them are simply not taught next spring, and the next-term query alone
   * returned no record for those — so their chips could only ever print a bare
   * course code.
   *
   * Only the NEXT_TERM records become `offerings`. Ranking a course a student
   * cannot register for would put it in the recommendation strip, which is a
   * list of things to enroll in.
   */
  const [candidateCourses, alsoOfferedNow, plan] = await Promise.all([
    candidateIds.length > 0
      ? getCoursesByIds(candidateIds, offeringsTerm)
      : Promise.resolve([] as CourseWithSections[]),
    candidateIds.length > 0
      ? getCoursesByIds(candidateIds, CURRENT_TERM)
      : Promise.resolve([] as CourseWithSections[]),
    loadPrimaryPlanSnapshot(offeringsTerm),
  ]);

  const candidateTitles: Record<string, string> = {};
  // Next term last, so a course taught in both is described by the record a
  // student would actually enroll in.
  for (const course of [...alsoOfferedNow, ...candidateCourses]) {
    candidateTitles[course.courseId] = course.title;
  }

  const offerings: Offering[] = candidateCourses.map((course) =>
    toOffering(course, plan),
  );

  const recommendations = recommend({
    remaining: audit.remaining,
    offerings,
    excludeCourseIds: profile.courses.map((course) => course.courseId),
  });

  const suggestions = audit.remaining
    .flatMap((requirement) =>
      requirement.candidates.map((courseId) => ({
        courseId,
        code: formatCourseId(courseId),
        title: candidateTitles[courseId] ?? null,
        requirement: `${requirement.label} · ${requirement.programName}`,
      })),
    )
    // One row per course: a course named by two requirements is still one thing
    // to add, and listing it twice makes a short picker look padded.
    .filter(
      (suggestion, index, all) =>
        all.findIndex((other) => other.courseId === suggestion.courseId) === index,
    );

  return {
    profile: loaded,
    audit,
    progress: overallProgress(audit),
    recommendations,
    titles,
    termLabels,
    uncounted,
    candidateTitles,
    suggestions,
    programOptions: listPrograms().map((program) => ({
      id: program.id,
      name: program.name,
      kind: program.kind,
      school: program.school,
      origin: program.origin,
    })),
    recommendTermCode: offeringsTerm,
    recommendTermLabel: termLabel(offeringsTerm),
  };
}

/**
 * Reduce a catalog course to what ranking needs, including how it would sit in
 * the student's own week.
 *
 * `conflictsWithPlan` is true only when EVERY section clashes. A course with
 * one impossible lecture slot and three fine ones is not a conflict, it is a
 * course you take at a different hour, and demoting it would hide a real option
 * behind a warning that is false for the section they would actually pick.
 */
function toOffering(
  course: CourseWithSections,
  plan: Awaited<ReturnType<typeof loadPrimaryPlanSnapshot>>,
): Offering {
  const withMeetings = course.sections.filter((section) => section.meetings.length > 0);

  let conflictsWithPlan = false;
  let commuteWarning = false;

  if (plan && withMeetings.length > 0) {
    const evaluations = withMeetings.map((section) =>
      evaluateCandidateLocally(meetingsOf(section), plan),
    );
    conflictsWithPlan = evaluations.every((evaluation) =>
      evaluation.conflicts.some((conflict) => conflict.severity === "hard"),
    );
    commuteWarning = evaluations.some((evaluation) => evaluation.commuteLegs.length > 0);
  }

  const seats = course.sections.reduce(
    (totals, section) => {
      if (section.enrollmentCap == null) return totals;
      const cap = section.enrollmentCap;
      const enrolled = section.enrollmentCount ?? 0;
      return {
        open: (totals.open ?? 0) + Math.max(0, cap - enrolled),
        total: (totals.total ?? 0) + cap,
        // The oldest crawl in the set: a total is only as fresh as its stalest
        // component, and claiming the newest would overstate it.
        asOf:
          totals.asOf == null || (section.sourceAsOf ?? "") < totals.asOf
            ? (section.sourceAsOf ?? totals.asOf)
            : totals.asOf,
      };
    },
    { open: null as number | null, total: null as number | null, asOf: null as string | null },
  );

  return {
    courseId: course.courseId,
    code: formatCourseId(course.courseId),
    title: course.title,
    points: course.pointsMin ?? course.pointsMax,
    seatsOpen: seats.open,
    seatsTotal: seats.total,
    conflictsWithPlan,
    commuteWarning,
    seatsAsOf: seats.asOf,
  };
}

function meetingsOf(section: Section) {
  return section.meetings.map((meeting) => ({
    ownerId: section.sectionId,
    label: `${section.courseId} · ${section.sectionCode}`,
    courseId: section.courseId,
    weekday: meeting.weekday,
    startMinute: meeting.startMinute,
    endMinute: meeting.endMinute,
    buildingName: meeting.buildingName,
    campusZone: resolveCampusZone(meeting.buildingName),
  }));
}
