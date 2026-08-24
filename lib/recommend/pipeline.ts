/**
 * The server pipeline: everything between "a request arrived" and `recommend()`.
 *
 * `lib/recommend/index.ts` is pure — it takes candidates, vectors and a
 * prerequisite source as interfaces and never learns where any of them came
 * from. That purity is what makes the scoring rules testable, and it means
 * SOMEONE has to do the loading. This is that someone, for every server
 * surface: the feed, the server actions, and (in time) the agent's tools.
 *
 * ── Why this exists as its own module ──────────────────────────────────────
 *
 * `lib/agent/tools.ts` already assembled this pipeline by hand for its three
 * engine tools. Building a second copy inside the feed would create exactly the
 * divergence the spec warns about in blocker #4 — the chatbot and the home page
 * disagreeing about what a student still needs is a trust failure that costs
 * more than the feature earns. So the assembly lives here once, and the agent's
 * copy should collapse onto it.
 *
 * ── The audit path is not negotiable ───────────────────────────────────────
 *
 * `loadStudentProfile()` → `auditProfile()` → `expandCandidatesForPrograms()`
 * is the same path the profile page renders from. Every subtlety it already
 * handles — attestations re-keyed per program, planned courses counting toward
 * reachability but not toward completion, cross-counted courses reported rather
 * than silently resolved, and above all candidate expansion for `n_matching`
 * groups — is inherited rather than reimplemented. Skipping the expansion is
 * the specific mistake that makes a feed look "oddly taste-driven": every
 * open-ended requirement comes back with an empty candidate list, so nothing
 * carries a `required` reason.
 */

import { getAllCourses, getCoursesByIds } from "@/lib/data/catalog";
import { loadStudentProfile } from "@/lib/db/student-profile";
import { ACTIVE_TERMS } from "@/lib/constants";
import { auditProfile, type ProfileAudit } from "@/lib/profile/audit";
import type { StudentProfile as AppStudentProfile } from "@/lib/profile/types";
import {
  graphPrereqSource,
  unknownPrereqSource,
} from "@/lib/recommend/sources";
import { expandCandidatesForPrograms } from "@/lib/requirements/candidates";
import { createSupabaseCandidateProvider } from "@/lib/db/candidate-source";
import type { CourseFacts } from "@/lib/requirements/evaluate";
import type { CourseId } from "@/lib/requirements/code";
import type { GroupResult } from "@/lib/requirements/types";
import type { CourseWithSections, TermCode } from "@/lib/types";

import { loadCourseVectorSource, type CourseVectorIndex } from "./course-vectors";
import { loadProgressionGraph } from "./sources";
import type {
  CandidateCourse,
  PrereqSource,
  StudentProfile as EngineStudentProfile,
} from "./types";

/* ==========================================================================
 * The student
 * ========================================================================== */

export interface LoadedStudent {
  /** The app's profile record. `null` when nobody is signed in. */
  app: AppStudentProfile | null;
  /** The engine's view of the same student. Empty when signed out. */
  engine: EngineStudentProfile;
  /** The degree audit, or `null` when there is no profile to audit. */
  audit: ProfileAudit | null;
  /**
   * Outstanding groups with their candidate sets expanded — exactly what
   * `RecommendInput.outstanding` wants. Empty for a signed-out visitor, which
   * is honest: we do not know their degree, so nothing can be called required.
   */
  outstanding: GroupResult[];
}

/** The engine's `StudentProfile`, built from the app's. */
export function toEngineProfile(profile: AppStudentProfile): EngineStudentProfile {
  return {
    taken: profile.courses
      // Planned courses are not "taken" — they belong in `planned`, where they
      // unlock prerequisites without being recommended back to the student.
      .filter((course) => course.source !== "plan")
      .map((course) => ({
        courseId: course.courseId,
        liked: course.liked,
        termCode: course.termCode,
      })),
    planned: profile.courses
      .filter((course) => course.source === "plan")
      .map((course) => course.courseId),
    interestTags: profile.interestTags,
  };
}

/** The engine profile of someone we know nothing about. */
export const ANONYMOUS_PROFILE: EngineStudentProfile = { taken: [], planned: [] };

/**
 * Catalog facts for the courses on a student's record.
 *
 * Mirrors `loadFacts` in `lib/profile/page-data.ts` — same two terms, same
 * first-term-wins rule, same `pointsMin` choice — because the feed's idea of a
 * student's credit total has to match the number on their profile page.
 * Courses in neither active term simply come back absent, which is how transfer
 * and archived credit stay on the record while counting for less, honestly.
 */
async function loadCourseFacts(courseIds: string[]): Promise<Map<CourseId, CourseFacts>> {
  const facts = new Map<CourseId, CourseFacts>();
  if (courseIds.length === 0) return facts;

  const perTerm = await Promise.all(
    ACTIVE_TERMS.map((termCode) => getCoursesByIds(courseIds, termCode)),
  );

  for (const courses of perTerm) {
    for (const course of courses) {
      if (facts.has(course.courseId)) continue;
      facts.set(course.courseId, {
        courseId: course.courseId,
        title: course.title,
        points: course.pointsMin ?? course.pointsMax,
        requirementFlags: course.requirementFlags,
      });
    }
  }

  return facts;
}

/**
 * `loadStudentProfile()`, but "we could not find out" collapses into "signed
 * out" rather than into an exception.
 *
 * Two failures land here and both must degrade rather than throw:
 *
 *   - `createServerSupabaseClient` calls Next's `cookies()`, which throws
 *     outright when this code runs outside a request scope — a cron job, a
 *     script, a test harness, a cache-warming call. None of those has a student
 *     and all of them are legitimate callers of the engine.
 *   - The auth read itself can fail on a network hiccup.
 *
 * In both cases the correct feed is the guest feed. Rendering "here is what is
 * broadly on offer" beats rendering an error page, and the result is honestly
 * labelled `personalized: false` either way.
 */
async function loadStudentProfileOrNull(): Promise<AppStudentProfile | null> {
  try {
    return await loadStudentProfile();
  } catch (cause) {
    console.error("recommend: could not read the student profile, treating as guest:", cause);
    return null;
  }
}

/**
 * The signed-in student, audited — or a usable stand-in for a visitor.
 *
 * Never throws for "signed out". A feed that 500s because nobody is logged in
 * is worse than one that shows what is on offer, and the whole point of the
 * spec's guest path is that the first feed renders before the sign-in gate.
 */
export async function loadStudent(): Promise<LoadedStudent> {
  const app = await loadStudentProfileOrNull();
  if (!app) {
    return { app: null, engine: ANONYMOUS_PROFILE, audit: null, outstanding: [] };
  }

  const facts = await loadCourseFacts(app.courses.map((course) => course.courseId));
  const audit = auditProfile({ profile: app, catalog: facts });

  /*
   * Candidate expansion. Without it every `n_matching` and `points_matching`
   * group — Global Core, the Science requirement, PE, CS electives, i.e. every
   * requirement a student actually needs help with — carries an empty candidate
   * list, so `indexOutstanding` finds nothing and not one card can say "this
   * clears the Global Core".
   */
  const programs = await expandCandidatesForPrograms(audit.programs, {
    provider: createSupabaseCandidateProvider({ terms: ACTIVE_TERMS }),
    // Never suggest what the student has already done.
    exclude: app.courses.map((course) => course.courseId),
  });

  const outstanding = programs.flatMap((program) =>
    program.groups.filter((group) => group.status !== "satisfied"),
  );

  return {
    app,
    engine: toEngineProfile(app),
    audit: { ...audit, programs },
    outstanding,
  };
}

/* ==========================================================================
 * The catalog side
 * ========================================================================== */

export interface LoadedCatalog {
  /** One entry per course offered in `terms`, sections attached. */
  courses: CourseWithSections[];
  /** The same courses, narrowed to what the engine scores. */
  candidates: CandidateCourse[];
}

/**
 * Every course on offer in the active terms, with its sections.
 *
 * The sections come along because the feed's card is a SECTION card — the
 * instructor and the time slot are most of the decision — and re-fetching them
 * per recommendation would be twenty round trips to re-read rows this call
 * already returned. `getAllCourses` memoises per term for 60 seconds, so the
 * cost here is amortised across every request in that window.
 *
 * Narrowed to the active terms BEFORE scoring, never after: scoring the whole
 * 8,189-course catalog and filtering afterwards would rank a course the student
 * cannot register for above one they can, and the ranking is the product.
 */
export async function loadCatalog(
  terms: readonly TermCode[] = ACTIVE_TERMS,
): Promise<LoadedCatalog> {
  const byId = new Map<string, CourseWithSections>();

  for (const termCode of terms) {
    for (const course of await getAllCourses(termCode)) {
      const existing = byId.get(course.courseId);
      if (!existing) {
        byId.set(course.courseId, course);
        continue;
      }
      /*
       * A course offered in both terms arrives twice, each copy carrying only
       * that term's sections. Merging rather than first-wins is what lets a
       * card say "also offered in Spring" and lets section selection consider
       * both terms' meeting patterns instead of silently seeing half of them.
       */
      byId.set(course.courseId, {
        ...existing,
        sections: [...existing.sections, ...course.sections],
      });
    }
  }

  const courses = [...byId.values()];

  return {
    courses,
    candidates: courses.map((course) => ({
      courseId: course.courseId,
      code: `${course.subjectCode} ${course.number}${course.qualifier ?? ""}`,
      title: course.title,
      // `pointsMin`, matching the audit: counting a variable-credit course at
      // its maximum would let a points requirement look satisfied on credit the
      // student may not earn.
      points: course.pointsMin ?? course.pointsMax,
    })),
  };
}

/* ==========================================================================
 * The two injected sources
 * ========================================================================== */

/**
 * The prerequisite graph is memoised, and the memo is a PROMISE.
 *
 * `loadProgressionGraph` pages all 8,189 courses — nine round trips and a few
 * MB — to build a structure that is identical for every student and changes
 * only when an ingest runs. Paying that per request would put seconds on the
 * feed. Caching the in-flight promise also coalesces the concurrent misses a
 * cold process sees during a reload storm.
 *
 * The TTL matches `lib/data/catalog.ts`'s catalog memo for the same reason it
 * gives: the underlying rows move on an ingest cadence measured in hours, so a
 * short window bounds staleness without re-reading the catalog per navigation.
 * A rejection is never memoised — `load` resolves to a degraded source instead.
 */
const PREREQ_TTL_MS = 300_000;

let prereqMemo: { expiresAt: number; source: Promise<PrereqSource> } | null = null;

/** Drop the memo. For tests and for an ingest that rewrote the formulas. */
export function invalidatePrereqCache(): void {
  prereqMemo = null;
}

/**
 * The prerequisite source, with its degradation made explicit.
 *
 * `loadProgressionGraph` throws rather than returning an empty graph, because
 * an empty graph reports every course as `met` and would silently disable the
 * hard filter — recommending COMS W4111 to a first-year on the strength of a
 * failed query. Catching that here and falling back to `unknownPrereqSource` is
 * the other half of the contract: the feed keeps working, every course carries
 * a "we could not check this" caveat, and nothing is ever presented as eligible
 * because a query failed.
 */
export function loadPrereqSource(): Promise<PrereqSource> {
  const now = Date.now();
  if (prereqMemo && prereqMemo.expiresAt > now) return prereqMemo.source;

  const source = (async () => {
    try {
      return graphPrereqSource(await loadProgressionGraph());
    } catch (cause) {
      console.error("recommend: prerequisite graph unavailable, degrading to unknown:", cause);
      /*
       * Evict, so a transient outage is not remembered as an answer for five
       * minutes. The next caller retries and gets the real graph.
       */
      prereqMemo = null;
      return unknownPrereqSource();
    }
  })();

  prereqMemo = { expiresAt: now + PREREQ_TTL_MS, source };
  return source;
}

/**
 * The semantic source. Already degrades internally, so this is a re-export with
 * a name that matches its siblings rather than a wrapper with behaviour.
 */
export function loadVectorSource(): Promise<CourseVectorIndex> {
  return loadCourseVectorSource();
}
