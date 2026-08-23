/**
 * Deliberately-minimal implementations for the ports whose real lane is not
 * available at a given call site.
 *
 * Two of them exist for different reasons and it is worth keeping them apart.
 *
 * ── `fallbackSearch` — a degraded mode, not a design ───────────────────────
 *
 * `adapters.ts` runs the app's real `SearchEngine` over the prebuilt index.
 * This scan exists only for the case where that artifact is not on disk — a
 * fresh clone that has not run `npm run build:index`. It matches substrings and
 * applies the structural filters honestly, and it will rank differently from
 * the website. That is acceptable for "the index has not been built"; it would
 * not be acceptable as the shipped behaviour, which is why it is not.
 *
 * ── `requirementReportFrom` — the honest answer to a hard question ─────────
 *
 * `check_requirements(sections, program)` is the one tool where the temptation
 * to bluff is strongest. A real degree audit needs each program's own
 * requirement structure — how many Global Core courses, which count as a pair,
 * what a major substitution allows — and this repository does not hold that
 * data for any program. What it does hold is a per-course flag for each
 * requirement the Core and the Ways of Knowing publish.
 *
 * So the report says exactly what it knows: which flagged requirements these
 * courses touch, which they do not, and — crucially — a `notApplicable` list
 * naming every requirement the program tracks that we cannot evaluate.
 * Requirements are never silently dropped, because a degree audit that
 * silently omits a requirement is worse than no degree audit: a student reads
 * "unsatisfied: none" as "I can graduate".
 */

import { REQUIREMENT_FILTERS } from "../constants";
import type { CourseWithSections, SearchFilters } from "../types";

import type { CatalogPort, RequirementOutcome, RequirementReport } from "./contracts";

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function fallbackSearch(
  catalog: CatalogPort,
  filters: SearchFilters,
  limit: number,
): Promise<{ courses: CourseWithSections[]; total: number; elapsedMs: number }> {
  const started = Date.now();
  const all = await catalog.getAllCourses(filters.termCode);
  const needle = filters.q?.trim().toLowerCase() ?? "";

  const matched = all.filter((course) => {
    if (needle && !haystack(course).includes(needle)) return false;
    if (filters.subjects?.length && !filters.subjects.includes(course.subjectCode)) return false;
    if (filters.levelRange) {
      const [low, high] = filters.levelRange;
      if (course.number < low || course.number > high) return false;
    }
    if (filters.creditsMin !== undefined && (course.pointsMax ?? 0) < filters.creditsMin) {
      return false;
    }
    if (filters.creditsMax !== undefined && (course.pointsMin ?? 0) > filters.creditsMax) {
      return false;
    }
    if (filters.requirements?.length) {
      const satisfiesAll = filters.requirements.every(
        (key) => course.requirementFlags?.[key] === true,
      );
      if (!satisfiesAll) return false;
    }
    if (filters.instructors?.length) {
      const names = course.sections.flatMap((section) => section.instructors);
      const wanted = filters.instructors.map((name) => name.toLowerCase());
      if (!names.some((name) => wanted.includes(name.toLowerCase()))) return false;
    }
    if (filters.openSeatsOnly && !course.sections.some(hasOpenSeat)) return false;
    return true;
  });

  return {
    // Course id is a stable, meaningful order (subject then number), which is
    // a better default than the catalog's arbitrary one when there is no
    // relevance score to sort by.
    courses: [...matched]
      .sort((a, b) => a.courseId.localeCompare(b.courseId))
      .slice(0, limit),
    total: matched.length,
    elapsedMs: Date.now() - started,
  };
}

function haystack(course: CourseWithSections): string {
  return [
    course.courseId,
    `${course.subjectCode} ${course.number}`,
    course.title,
    course.description ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function hasOpenSeat(section: { enrollmentCount: number | null; enrollmentCap: number | null }) {
  if (section.enrollmentCap === null || section.enrollmentCount === null) return false;
  return section.enrollmentCount < section.enrollmentCap;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

/**
 * Which requirement groups each program actually uses. A Columbia College
 * student is not audited against Barnard's Ways of Knowing, and reporting
 * those as "unsatisfied" would invent obligations.
 *
 * Unknown programs get every group, with everything they do not touch reported
 * as unsatisfied — a superset is a survivable error here, whereas guessing a
 * narrower set would quietly excuse a real requirement.
 */
const PROGRAM_GROUPS: Record<string, string[]> = {
  cc: ["Core Curriculum"],
  "columbia college": ["Core Curriculum"],
  seas: ["Core Curriculum"],
  engineering: ["Core Curriculum"],
  gs: ["Nine Ways of Knowing"],
  "general studies": ["Nine Ways of Knowing"],
  barnard: ["Ways of Knowing"],
  bc: ["Ways of Knowing"],
};

export function requirementReportFrom(
  courses: CourseWithSections[],
  program: string,
): RequirementReport {
  const groups = PROGRAM_GROUPS[program.trim().toLowerCase()] ?? [
    "Core Curriculum",
    "Ways of Knowing",
    "Nine Ways of Knowing",
  ];

  const satisfied: RequirementOutcome[] = [];
  const unsatisfied: RequirementOutcome[] = [];

  for (const filter of REQUIREMENT_FILTERS) {
    if (!groups.includes(filter.group)) continue;

    const satisfiedBy = courses
      .filter((course) => course.requirementFlags?.[filter.key] === true)
      .map((course) => course.courseId);

    const outcome: RequirementOutcome = {
      key: filter.key,
      label: filter.label,
      satisfiedBy,
      satisfied: satisfiedBy.length > 0,
    };
    (outcome.satisfied ? satisfied : unsatisfied).push(outcome);
  }

  return {
    program,
    satisfied,
    unsatisfied,
    /*
     * Everything a real audit covers that a per-course flag cannot answer.
     * These are not edge cases — they are most of what makes a degree audit
     * hard — and naming them is what stops this tool being read as one.
     */
    notApplicable: [
      "major and concentration requirements",
      "minimum credit totals and residency",
      "course sequences and prerequisites already completed",
      "Core courses taken in previous terms",
      "how many courses each requirement needs (this reports touched, not fulfilled)",
      "approved substitutions and departmental exceptions",
    ],
  };
}
