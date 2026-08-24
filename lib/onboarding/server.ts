/**
 * Where the onboarding flow meets the database.
 *
 * `./guess.ts` and `./migrate.ts` are pure so their rules can be tested against
 * ten courses in memory. This module is the other half — it fetches the catalog
 * facts, builds the prerequisite source, and runs the audit that expands
 * open-ended requirement groups into real candidate ids.
 *
 * ── It uses the SAME audit path as the profile page ─────────────────────────
 *
 *     auditProfile() → expandCandidatesForPrograms()
 *
 * That is not convenience. If onboarding evaluated requirements by its own
 * route it would eventually disagree with the audit on `/profile`, and "the
 * setup wizard said I still need Global Core but my audit says I don't" costs
 * more trust than the whole flow earns. Every subtlety that path already
 * handles — the Core resolved from the school rather than picked, planned
 * courses counting, cross-counted courses reported rather than silently
 * resolved — is inherited instead of reimplemented.
 *
 * The one difference from `/profile`: there is no signed-in student. Everything
 * here takes a guest state and returns a result, so the exact same code path
 * serves a visitor with no account.
 *
 * ── Two degradations, both deliberate ───────────────────────────────────────
 *
 *   PREREQUISITES  `loadProgressionGraph` throws rather than returning an empty
 *                  graph, because an empty graph reports every course as `met`
 *                  and would silently disable the hard filter. Caught here and
 *                  degraded to `unknownPrereqSource()`, which reports every
 *                  course as `unknown` — the safe direction.
 *
 *   VECTORS        `loadCourseVectorSource()` decodes the LSA artifacts under
 *                  `public/index/`. When they are missing it resolves to
 *                  `VECTOR_SOURCE_UNAVAILABLE` rather than throwing, and the
 *                  engine then scores taste at zero and falls back to
 *                  requirement fit and unlock — a real, useful deck, just
 *                  without the "you might like this" half. Nothing in the
 *                  tiering rules depends on a vector, so the degradation costs
 *                  only the ORDER within a tier.
 */

import { getAllCourses, getCoursesByIds } from "@/lib/data/catalog";
import { createSupabaseCandidateProviderWithIncludes } from "@/lib/db/candidate-source";
import { ACTIVE_TERMS } from "@/lib/constants";
import { auditProfile, programsFor } from "@/lib/profile/audit";
import { EMPTY_PROFILE, type StudentProfile as AppStudentProfile } from "@/lib/profile/types";
import {
  graphPrereqSource,
  loadCourseVectorSource,
  loadProgressionGraph,
  noVectorSource,
  unknownPrereqSource,
  type CourseVectorSource,
  type PrereqSource,
} from "@/lib/recommend";
import { expandCandidatesForPrograms } from "@/lib/requirements/candidates";
import { formatCourseId, toCourseId, type CourseId } from "@/lib/requirements/code";
import type { CourseFacts } from "@/lib/requirements/evaluate";
import type { GroupResult, Program } from "@/lib/requirements/types";
import type { CourseWithSections } from "@/lib/types";

import { buildGuessDeck, type GuessDeck } from "./guess";
import type { GuestOnboardingState } from "./state";

/* ==========================================================================
 * Catalog facts
 * ========================================================================== */

export interface CatalogFact {
  code: string;
  title: string | null;
  points: number | null;
}

/**
 * Catalog rows for a set of course ids, across both active terms.
 *
 * Two terms because a student's record is mostly PAST courses and we hold no
 * archive of retired offerings — the only honest source of facts about
 * `MATH1201UN` is that MATH1201UN is still taught. First term to supply a
 * record wins; both describe the same course. Mirrors `loadFacts` in
 * `lib/profile/page-data.ts` so the two cannot report different titles.
 */
export async function loadCatalogFacts(
  courseIds: readonly string[],
): Promise<Map<string, CatalogFact>> {
  const facts = new Map<string, CatalogFact>();
  const wanted = [...new Set(courseIds)];
  if (wanted.length === 0) return facts;

  const perTerm = await Promise.all(
    ACTIVE_TERMS.map((termCode) => getCoursesByIds(wanted, termCode)),
  );

  for (const courses of perTerm) {
    for (const course of courses) {
      if (facts.has(course.courseId)) continue;
      facts.set(course.courseId, toCatalogFact(course));
    }
  }

  return facts;
}

function toCatalogFact(course: CourseWithSections): CatalogFact {
  return {
    code: formatCourseId(course.courseId),
    title: course.title,
    // `pointsMin`, matching the audit. Counting a variable-credit course at its
    // maximum would let a points requirement look satisfied on credit the
    // student may not have earned.
    points: course.pointsMin ?? course.pointsMax,
  };
}

/* ==========================================================================
 * The audit, for a guest
 * ========================================================================== */

/**
 * The guest state as the audit engine's `StudentProfile`.
 *
 * `source` is coerced to `"picker"` because `lib/profile/types.ts`'s
 * `CourseSource` union predates migration 0032 and does not yet carry
 * `onboarding_guess`. Nothing in the audit reads `source` except to check for
 * `"plan"`, and onboarding never produces a planned course, so the coercion
 * changes no outcome — it is a type-level accommodation, and widening that
 * union belongs to whoever owns that file.
 */
function toAuditProfile(state: GuestOnboardingState): AppStudentProfile {
  return {
    ...EMPTY_PROFILE,
    userId: "",
    school: state.school,
    programIds: state.programIds,
    classYear: state.classYear,
    interestTags: state.interestTags,
    courses: state.courses.map((course) => ({
      courseId: course.courseId,
      termCode: null,
      termLabel: course.termLabel,
      points: course.points,
      liked: course.liked,
      source: "picker" as const,
      addedAt: state.updatedAt,
    })),
  };
}

export interface GuestAudit {
  programs: Program[];
  /** Every group still outstanding, with open-ended ones expanded. */
  outstanding: GroupResult[];
  /** Courses on the record our catalog could not resolve. */
  unmatchedCourseIds: string[];
}

/**
 * Audit a guest's declared programs against their confirmed coursework.
 *
 * The expansion pass is what makes this worth running at all: without it every
 * `n_matching` group — Global Core, the Science requirement, CS electives, i.e.
 * every requirement a student actually needs help with — comes back with an
 * empty candidate list, and the guess grid can only ever offer the handful of
 * courses a program names outright.
 */
export async function auditGuest(state: GuestOnboardingState): Promise<GuestAudit> {
  const profile = toAuditProfile(state);
  const programs = programsFor(profile);

  const factsForRecord = await loadCatalogFacts(
    profile.courses.map((course) => course.courseId),
  );

  const catalog = new Map<CourseId, CourseFacts>();
  const perTerm = await Promise.all(
    ACTIVE_TERMS.map((termCode) =>
      getCoursesByIds(
        profile.courses.map((course) => course.courseId),
        termCode,
      ),
    ),
  );
  for (const courses of perTerm) {
    for (const course of courses) {
      if (catalog.has(course.courseId)) continue;
      catalog.set(course.courseId, {
        courseId: course.courseId,
        title: course.title,
        points: course.pointsMin ?? course.pointsMax,
        requirementFlags: course.requirementFlags,
      });
    }
  }

  const audit = auditProfile({ profile, catalog });

  const expanded = await expandCandidatesForPrograms(audit.programs, {
    provider: createSupabaseCandidateProviderWithIncludes({ terms: ACTIVE_TERMS }),
    // Never guess at something the student has already confirmed.
    exclude: profile.courses.map((course) => course.courseId),
  });

  return {
    programs,
    outstanding: expanded
      .flatMap((result) => result.groups)
      .filter((group) => group.status !== "satisfied"),
    unmatchedCourseIds: profile.courses
      .map((course) => course.courseId)
      .filter((courseId) => !factsForRecord.has(courseId)),
  };
}

/* ==========================================================================
 * Prerequisites
 * ========================================================================== */

/**
 * The prerequisite source, with its degradation made explicit at the call site.
 *
 * Never returns a source that reports `met` on a failed load. `unknown` shows
 * the course with a caveat, which is the same answer the engine gives for the
 * 43% of prerequisites the parser could not resolve — a state the UI already
 * handles — whereas `met` would quietly turn the hard filter off.
 */
export async function prereqSourceOrDegrade(): Promise<PrereqSource> {
  try {
    return graphPrereqSource(await loadProgressionGraph());
  } catch (cause) {
    console.error("onboarding: prerequisite graph unavailable, degrading to unknown:", cause);
    return unknownPrereqSource();
  }
}

/* ==========================================================================
 * The deck
 * ========================================================================== */

/** Per tier. Two dozen cards is a screen a student will actually read. */
const DECK_TIER_LIMIT = 18;

/**
 * The semantic vector source, degraded rather than fatal.
 *
 * `loadCourseVectorSource` already answers `VECTOR_SOURCE_UNAVAILABLE` when the
 * artifacts are absent, so this only catches the genuinely unexpected — a
 * corrupt artifact, a filesystem that is not there. Onboarding must not fail on
 * it: a deck ranked by requirement fit alone is exactly what shipped before
 * vectors existed, and it is still the half of the product that matters most.
 */
async function vectorSourceOrDegrade(): Promise<CourseVectorSource> {
  try {
    return await loadCourseVectorSource();
  } catch (cause) {
    console.error("onboarding: course vectors unavailable, ranking without taste:", cause);
    return noVectorSource();
  }
}

export async function loadGuessDeck(state: GuestOnboardingState): Promise<GuessDeck> {
  const [audit, prereqs, vectors] = await Promise.all([
    auditGuest(state),
    prereqSourceOrDegrade(),
    vectorSourceOrDegrade(),
  ]);

  /*
   * Facts for everything the deck might name: the courses the programs list
   * outright, the ids the expansion produced, and the student's own record —
   * the last because the "implied by" chip prints the code of a confirmed
   * course.
   */
  const wanted = new Set<string>(state.courses.map((course) => course.courseId));
  for (const program of audit.programs) {
    for (const group of program.groups) {
      const rule = group.rule;
      if (rule.kind === "all_of" || rule.kind === "n_of") {
        for (const code of rule.courses) {
          const courseId = toCourseId(code);
          if (courseId) wanted.add(courseId);
        }
      } else if (rule.kind === "sequence_choice") {
        for (const sequence of rule.sequences) {
          for (const code of sequence.courses) {
            const courseId = toCourseId(code);
            if (courseId) wanted.add(courseId);
          }
        }
      }
    }
  }
  for (const group of audit.outstanding) {
    for (const courseId of group.candidates) wanted.add(courseId);
  }

  const catalog = await loadCatalogFacts([...wanted]);

  return buildGuessDeck({
    programs: audit.programs,
    classYear: state.classYear,
    confirmed: state.courses,
    catalog,
    prereqs,
    vectors,
    outstanding: audit.outstanding,
    limit: DECK_TIER_LIMIT,
  });
}

/* ==========================================================================
 * The search escape hatch
 * ========================================================================== */

export interface CourseHit {
  courseId: string;
  code: string;
  title: string;
  points: number | null;
}

const SEARCH_LIMIT = 20;

/**
 * Find a course by code or title, for the grid's "I took something else" box.
 *
 * Runs against the in-process catalog memo (`getAllCourses`, 60-second TTL)
 * rather than the lexical search index: the index is a browser artifact, this
 * is a server action, and a substring scan over two terms of already-cached
 * rows is well under a millisecond. It is also the same corpus the audit sees,
 * which matters more here than ranking quality — a student searching for a
 * course the audit cannot resolve should not find it and then wonder why it
 * counts for nothing.
 */
export async function searchCourses(query: string): Promise<CourseHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const normalized = trimmed.toLowerCase().replace(/\s+/g, "");
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

  const hits = new Map<string, CourseHit>();

  for (const termCode of ACTIVE_TERMS) {
    for (const course of await getAllCourses(termCode)) {
      if (hits.has(course.courseId)) continue;

      const idMatch = course.courseId.toLowerCase().includes(normalized);
      const titleMatch = words.every((word) => course.title.toLowerCase().includes(word));
      if (!idMatch && !titleMatch) continue;

      hits.set(course.courseId, {
        courseId: course.courseId,
        code: formatCourseId(course.courseId),
        title: course.title,
        points: course.pointsMin ?? course.pointsMax,
      });
    }
  }

  /*
   * Code matches first, then shorter titles. Someone who typed "COMS 3134"
   * wants that course and nothing else; someone who typed "algorithms" is
   * browsing, and the shortest title is the least specialised course, which is
   * the better first guess.
   */
  return [...hits.values()]
    .sort((a, b) => {
      const aCode = a.courseId.toLowerCase().includes(normalized) ? 0 : 1;
      const bCode = b.courseId.toLowerCase().includes(normalized) ? 0 : 1;
      return aCode - bCode || a.title.length - b.title.length || a.code.localeCompare(b.code);
    })
    .slice(0, SEARCH_LIMIT);
}

/* ==========================================================================
 * Resolving what a student typed or a transcript produced
 * ========================================================================== */

export interface ResolvedCourse {
  courseId: string;
  code: string;
  title: string | null;
  points: number | null;
  /**
   * False when our catalog holds no row for this id.
   *
   * The row is still returned, and the caller still stores it. Transfer credit,
   * AP credit, study abroad and un-backfilled archived terms all land here, and
   * they are exactly the coursework a student most needs recorded —
   * `student_courses.course_id` is deliberately not a foreign key so they fit.
   * The UI marks them "not in our catalog"; nothing rejects them.
   */
  inCatalog: boolean;
}

/**
 * Turn typed codes into storable rows.
 *
 * Anything `toCourseId` cannot even shape into a course id is dropped, because
 * that is a typo rather than a course — but anything code-SHAPED survives
 * whether or not the catalog knows it.
 */
export async function resolveCourseCodes(codes: readonly string[]): Promise<ResolvedCourse[]> {
  const parsed = codes
    .map((code) => ({ raw: code, courseId: toCourseId(code) }))
    .filter((entry): entry is { raw: string; courseId: CourseId } => entry.courseId !== null);

  if (parsed.length === 0) return [];

  const facts = await loadCatalogFacts(parsed.map((entry) => entry.courseId));

  const seen = new Set<string>();
  const resolved: ResolvedCourse[] = [];

  for (const { courseId } of parsed) {
    if (seen.has(courseId)) continue;
    seen.add(courseId);

    const fact = facts.get(courseId);
    resolved.push({
      courseId,
      code: fact?.code ?? formatCourseId(courseId),
      title: fact?.title ?? null,
      points: fact?.points ?? null,
      inCatalog: fact !== undefined,
    });
  }

  return resolved;
}
