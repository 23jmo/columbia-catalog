/**
 * The guess-and-confirm deck: "you've definitely taken these / you might have".
 *
 * ── What this is really doing ───────────────────────────────────────────────
 *
 * The recommendation engine answers "what should this student take next".
 * Onboarding needs the mirror question — "what has this student already taken"
 * — and the two are not the same query, so this module is an adapter rather
 * than a wrapper. It uses `recommend()` for the parts that genuinely transfer
 * and adds the parts that do not:
 *
 *   FROM THE ENGINE  requirement fit (a course your major requires is a course
 *                    you are far more likely to have taken than an arbitrary
 *                    one), taste, and the prerequisite evaluation.
 *
 *   ADDED HERE       seniority (a second-year has not taken a 4000-level
 *                    seminar), backward prerequisite inference (if you
 *                    confirmed Data Structures, you took the intro course),
 *                    and typical-year priors (a CC sophomore has usually
 *                    finished Lit Hum; a SEAS first-year has usually started
 *                    Calc I). The maybe-strip ranks those above future
 *                    required 3000-level core, because this is "what have you
 *                    taken", not "what should you take next".
 *
 * Everything stays a pure function over injected sources, matching
 * `lib/recommend/types.ts`'s reasoning: the deck has to be testable against ten
 * courses in memory or the tiering rules cannot be asserted at all.
 *
 * ── Why tiering matters more than ranking ───────────────────────────────────
 *
 * Tier 1 arrives PRE-CHECKED. That is a claim about a student's transcript made
 * by us, on their behalf, that they will accept by not reading it. A false
 * positive there puts a course on a degree audit that the student never took
 * and never noticed us adding — so tier 1 is deliberately narrow: required by a
 * declared program, prerequisites satisfied by what is already confirmed, and
 * at or below the level their class year implies. Everything else that is
 * plausible goes to tier 2, unchecked, where a false positive costs nothing but
 * a glance.
 *
 * ── Degrading without vectors ───────────────────────────────────────────────
 *
 * The semantic vectors are decoded from `public/index/`, and that artifact can
 * be absent — a fresh checkout, a deploy that skipped the index build. The
 * engine already handles it (`VECTOR_SOURCE_UNAVAILABLE`): taste scores zero
 * and the blend falls back to requirement fit and unlock. Every tiering rule
 * below is requirement- and prerequisite-driven, so a vectorless deck contains
 * exactly the same cards in exactly the same tiers; only the ORDER within a
 * tier loses its taste component. That is the intended degradation, and it is
 * why this module never reads a vector directly.
 */

import { recommend, type CandidateCourse, type CourseVectorSource, type PrereqSource } from "@/lib/recommend";
import { formatCourseId, levelOf, toCourseId, type CourseId } from "@/lib/requirements/code";
import type { GroupResult, Program, RequirementRule, School } from "@/lib/requirements/types";

import type { GuestCourse } from "./state";
import { typicalGuesses } from "./typical";
import { titleForCourseId } from "./known-titles";

/*
 * The re-rank cadence lives in `./state.ts`, not here, and is re-exported for
 * callers that already import this module. `state.ts` imports nothing heavier
 * than `zod`, so a client component can read the constant without dragging the
 * engine — and its database client and filesystem vector loader — into the
 * browser bundle.
 */
export { RERANK_BATCH_SIZE, shouldRerank } from "./state";

/* ==========================================================================
 * Seniority
 * ========================================================================== */

/**
 * Years of coursework a student has behind them, from their expected
 * graduation year.
 *
 * Returns `null` when we cannot tell, and `null` is a real answer that the
 * tiering rule below treats conservatively — an unknown class year means
 * nothing gets pre-checked on seniority grounds alone.
 *
 * The arithmetic is deliberately crude (graduation minus now, against a
 * four-year degree) because it is only ever used to pick a course-level
 * ceiling, and no more precision would change which ceiling comes out. A
 * student who is off-cycle, transferred, or taking five years unticks a box.
 */
export function yearsCompleted(
  classYear: string | null,
  now: Date = new Date(),
): number | null {
  if (!classYear || !/^\d{4}$/.test(classYear)) return null;

  const graduation = Number(classYear);
  /*
   * The academic year turns over in the summer, so a student graduating in 2027
   * is "one year out" from September 2026 onward but two years out in the
   * spring of 2026. Months are zero-based; July (6) is the boundary.
   */
  const academicYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const yearsRemaining = graduation - academicYear;

  // Clamped to a four-year degree at both ends: a graduation year far in the
  // future is a typo, and one in the past is an alum, and both should get the
  // conservative answer rather than a negative ceiling.
  return Math.min(4, Math.max(0, 4 - yearsRemaining - 1));
}

/**
 * The highest course level a student of this seniority has plausibly finished.
 *
 * First-years get 1000, which means nothing above the intro band is ever
 * pre-checked for them — the correct conservative answer, since a first-year in
 * October has finished no courses at all and one in April has finished one
 * semester of them.
 */
export function expectedLevelCeiling(years: number | null): number {
  if (years === null) return 1000;
  return Math.min(4000, 1000 * (years + 1));
}

/* ==========================================================================
 * Candidates from a program
 * ========================================================================== */

/**
 * Every course a program's rules NAME, with whether the rule requires it.
 *
 * `all_of` names courses the degree requires outright — the strongest possible
 * evidence that a student in the program has taken one. `n_of` and
 * `sequence_choice` name alternatives, which is real evidence but weaker: the
 * student took some of them, and we do not know which.
 *
 * `n_matching` and `points_matching` name no courses at all — they are
 * predicates over the catalog, and expanding them needs a database query. Those
 * arrive separately through `outstanding`, so this function does not pretend to
 * handle them.
 */
export function namedCoursesOf(program: Program): Map<CourseId, { required: boolean }> {
  const named = new Map<CourseId, { required: boolean }>();

  const add = (code: string, required: boolean) => {
    const courseId = toCourseId(code);
    if (!courseId) return;
    const existing = named.get(courseId);
    // Required wins: a course listed both as required by one group and as an
    // option in another is required.
    named.set(courseId, { required: required || (existing?.required ?? false) });
  };

  for (const group of program.groups) {
    const rule: RequirementRule = group.rule;
    switch (rule.kind) {
      case "all_of":
        for (const code of rule.courses) add(code, true);
        break;
      case "n_of":
        // `n_of` with a single option is an `all_of` wearing a different hat,
        // and treating it as optional would lose a genuinely required course.
        for (const code of rule.courses) add(code, rule.courses.length === 1);
        break;
      case "sequence_choice":
        for (const sequence of rule.sequences) {
          const onlySequence = rule.sequences.length === 1;
          for (const code of sequence.courses) add(code, onlySequence);
        }
        break;
      case "n_matching":
      case "points_matching":
      case "attested":
        // Nothing named. Open-ended groups reach the deck through `outstanding`.
        break;
    }
  }

  return named;
}

/* ==========================================================================
 * Backward prerequisite inference
 * ========================================================================== */

/**
 * Courses a student must have taken, deduced from what they already confirmed.
 *
 * If someone ticks Data Structures and the prerequisite graph says Data
 * Structures needs Intro to CS, then they took Intro to CS — regardless of
 * whether it appears in any of their programs' rules, and regardless of the
 * level ceiling. This is the highest-confidence guess the flow can make and it
 * comes free from the `PrereqSource` the engine already needs.
 *
 * Only UNAMBIGUOUS gates count. `outstanding` is a list of choices, each
 * satisfied by any one of its options; a choice with three options tells us the
 * student took one of three, which is not a course we can pre-check. A choice
 * with exactly one option tells us precisely which course they took.
 */
export function impliedPrerequisites(
  confirmed: readonly CourseId[],
  prereqs: PrereqSource,
): Set<CourseId> {
  const completed = new Set<string>(confirmed);
  const implied = new Set<CourseId>();

  for (const courseId of confirmed) {
    const status = prereqs.statusFor(courseId, completed);
    for (const choice of status.outstanding) {
      if (choice.length !== 1) continue;
      const only = choice[0];
      if (!completed.has(only)) implied.add(only as CourseId);
    }
  }

  return implied;
}

/**
 * Unambiguous prerequisites of one course, as if nothing else were confirmed.
 *
 * A choice with one option is a course we can name. A choice with three is
 * not — "they took one of these" is not a chip.
 */
export function unambiguousPrereqsOf(courseId: CourseId, prereqs: PrereqSource): CourseId[] {
  const status = prereqs.statusFor(courseId, new Set());
  const implied: CourseId[] = [];
  for (const choice of status.outstanding) {
    if (choice.length !== 1) continue;
    implied.push(choice[0] as CourseId);
  }
  return implied;
}

/**
 * The same walk, followed through every unique hop.
 *
 * Confirming Operating Systems should name Data Structures AND Intro, not
 * only the course that sits immediately under it. Cycles are skipped.
 */
export function unambiguousPrereqChain(courseId: CourseId, prereqs: PrereqSource): CourseId[] {
  const out: CourseId[] = [];
  const seen = new Set<string>([courseId]);
  const queue: CourseId[] = [courseId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const prereqId of unambiguousPrereqsOf(current, prereqs)) {
      if (seen.has(prereqId)) continue;
      seen.add(prereqId);
      out.push(prereqId);
      queue.push(prereqId);
    }
  }

  return out;
}

/* ==========================================================================
 * The deck
 * ========================================================================== */

/** Why a course is on the deck. Rendered as a one-line chip on the card. */
export type GuessReason =
  /** A prerequisite of something the student already confirmed. */
  | { kind: "implied_by"; courseIds: CourseId[] }
  /** Named as required by one of their declared programs. */
  | { kind: "required_by"; programName: string }
  /**
   * A first-year / typical-schedule prior. Never enough to pre-check —
   * "students like you usually took this" is a glance, not a transcript.
   */
  | { kind: "typical"; label: string }
  /** One of several options a program's rule offers. */
  | { kind: "option_in"; programName: string; groupLabel: string }
  /** Expanded from an open-ended requirement group. */
  | { kind: "counts_toward"; groupLabel: string };

export interface GuessCandidate {
  courseId: CourseId;
  code: string;
  title: string | null;
  points: number | null;
  /** 1 = pre-checked ("you've definitely taken these"). 2 = offered, unchecked. */
  tier: 1 | 2;
  reasons: GuessReason[];
  /** The blend that ordered it. Kept so a test can assert without a magic total. */
  score: number;
}

/** Code/title we can put on a chip without another round trip. */
export interface GuessFacts {
  courseId: CourseId;
  code: string;
  title: string | null;
  points: number | null;
}

export interface GuessDeck {
  tier1: GuessCandidate[];
  tier2: GuessCandidate[];
  /**
   * Confirming the key means we think they also took these — unambiguous
   * single-option prerequisites. Applied on the client immediately, so the
   * strip does not wait for a re-rank round trip to say "and therefore Intro".
   */
  impliesTaken: Record<string, GuessFacts[]>;
}

export interface GuessDeckInput {
  /** Declared programs, INCLUDING the school's Core. */
  programs: readonly Program[];
  /** Drives the school-year typical schedule. */
  school?: School | null;
  classYear: string | null;
  /** What the student has confirmed so far. */
  confirmed: readonly GuestCourse[];
  /**
   * Courses they said they did not take. Kept off the deck so a dismissed
   * chip cannot come back as a "you might have" on the next re-rank.
   */
  dismissed?: readonly string[];
  /** Catalog facts for anything the deck might show. Missing ids still render. */
  catalog: ReadonlyMap<string, { code: string; title: string | null; points: number | null }>;
  prereqs: PrereqSource;
  vectors: CourseVectorSource;
  /**
   * Audit groups with candidates already expanded, when the caller could run
   * the database query. Open-ended requirements — Global Core, the Science
   * requirement, electives — reach the deck only through this.
   */
  outstanding?: readonly GroupResult[];
  /** Cap on tier-2 suggestions only. Tier 1 is never truncated. */
  limit?: number;
  now?: Date;
}

/**
 * Cap on the tier-2 maybe-strip only. Tier 1 — the pre-checked "we think
 * you've taken" set — is returned in full so a rising senior sees every
 * required course the engine would pre-fill, not the first 48.
 */
export const DEFAULT_TIER_LIMIT = 48;

export function buildGuessDeck(input: GuessDeckInput): GuessDeck {
  const limit = input.limit ?? DEFAULT_TIER_LIMIT;
  const confirmedIds = input.confirmed.map((course) => course.courseId);
  const confirmedSet = new Set<string>(confirmedIds);
  const dismissedSet = new Set(input.dismissed ?? []);

  const years = yearsCompleted(input.classYear, input.now);
  const ceiling = expectedLevelCeiling(years);
  const implied = impliedPrerequisites(confirmedIds, input.prereqs);

  /*
   * Collect every id worth showing, with the evidence behind it, before any
   * scoring happens. Evidence is accumulated rather than overwritten: a course
   * that is both implied by a confirmed course AND required by the major
   * carries both chips, and the student reads two independent reasons instead
   * of whichever one this loop saw last.
   */
  const evidence = new Map<CourseId, { required: boolean; reasons: GuessReason[] }>();

  const note = (courseId: CourseId, reason: GuessReason, required: boolean) => {
    if (confirmedSet.has(courseId) || dismissedSet.has(courseId)) return;
    const existing = evidence.get(courseId) ?? { required: false, reasons: [] };
    existing.required = existing.required || required;
    existing.reasons.push(reason);
    evidence.set(courseId, existing);
  };

  for (const courseId of implied) {
    note(
      courseId,
      {
        kind: "implied_by",
        // Which confirmed courses required it. Capped at three; the chip is one
        // line and "and 14 others" is not evidence a student can check.
        courseIds: confirmedIds
          .filter((confirmedId) => {
            const status = input.prereqs.statusFor(confirmedId, confirmedSet);
            return status.outstanding.some(
              (choice) => choice.length === 1 && choice[0] === courseId,
            );
          })
          .slice(0, 3) as CourseId[],
      },
      // An implied prerequisite is the strongest evidence the flow has, and it
      // is required in the only sense that matters here: the student cannot
      // have taken what they confirmed without it.
      true,
    );
  }

  for (const program of input.programs) {
    for (const [courseId, { required }] of namedCoursesOf(program)) {
      const group = program.groups.find((candidate) =>
        groupNames(candidate.rule).includes(courseId),
      );
      note(
        courseId,
        required
          ? { kind: "required_by", programName: program.name }
          : {
              kind: "option_in",
              programName: program.name,
              groupLabel: group?.label ?? program.name,
            },
        required,
      );
    }
  }

  /*
   * Typical-year priors, then the unique prereqs of anything already
   * plausible. Calc III on a CC CS strip should pull Calc I with it even
   * before the student ticks anything — "first year is mostly prerequisites"
   * is the whole recall complaint.
   */
  const typical = typicalGuesses({
    school: input.school ?? null,
    yearsCompleted: years,
    ceiling,
    programs: input.programs,
  });
  for (const guess of typical) {
    note(guess.courseId, { kind: "typical", label: guess.label }, false);
  }
  for (const courseId of [...evidence.keys()]) {
    if ((levelOf(courseId) ?? 9000) > ceiling) continue;
    for (const prereqId of unambiguousPrereqChain(courseId, input.prereqs)) {
      note(prereqId, { kind: "typical", label: "Usually taken first" }, false);
    }
  }

  for (const group of input.outstanding ?? []) {
    if (group.status === "satisfied") continue;
    for (const courseId of group.candidates) {
      note(
        courseId as CourseId,
        { kind: "counts_toward", groupLabel: group.group.label },
        false,
      );
    }
  }

  /*
   * Score with the real engine.
   *
   * The engine is asked about the SAME candidate set, with the student's
   * confirmations as their record, so its requirement-fit and taste terms rank
   * the deck. Its prerequisite hard filter is doing different work here than it
   * does in a feed: a course whose prerequisites are provably unsatisfied by
   * the confirmed set is one the student cannot have taken *in that order*, so
   * it belongs in tier 2 rather than pre-checked — see `withheldIds` below.
   *
   * `limit` is the full evidence set because we are tiering, not truncating:
   * dropping candidates before the tier split would let the engine's ranking
   * decide what a student is never offered.
   */
  const candidates: CandidateCourse[] = [...evidence.keys()].map((courseId) => {
    const facts = input.catalog.get(courseId);
    return {
      courseId,
      /*
       * `formatCourseId`, not the raw id, when the catalog has no row. Ids are
       * stored as `COCI1102CC` and printed as `COCI CC1102`; a requirement can
       * name a course our catalog does not carry — an archived Core section, a
       * course not offered in either active term — and falling back to the
       * stored spelling puts a string on screen that a student has never seen
       * on a transcript or a Bulletin page and cannot search for.
       */
      code: facts?.code ?? formatCourseId(courseId),
      title: facts?.title || titleForCourseId(courseId) || "",
      points: facts?.points ?? null,
    };
  });

  const result = recommend({
    profile: {
      taken: input.confirmed.map((course) => ({
        courseId: course.courseId,
        liked: course.liked,
        termCode: null,
      })),
    },
    candidates,
    vectors: input.vectors,
    prereqs: input.prereqs,
    outstanding: input.outstanding,
    limit: candidates.length,
    withheldLimit: candidates.length,
  });

  const scoreById = new Map<string, number>(
    result.recommendations.map((entry) => [entry.course.courseId, entry.score]),
  );
  const withheldIds = new Set(result.withheld.map((entry) => entry.course.courseId));

  const tier1: GuessCandidate[] = [];
  const tier2: GuessCandidate[] = [];

  for (const [courseId, { required, reasons }] of evidence) {
    const facts = input.catalog.get(courseId);
    const level = levelOf(courseId) ?? 9000;

    /*
     * THE tier-1 rule, and the only place a course becomes pre-checked.
     *
     * An implied prerequisite bypasses both the level ceiling and the withheld
     * check on purpose: the student told us they took the successor course, and
     * that testimony beats our estimate of their seniority and our own
     * prerequisite ordering. Everything else must clear all three tests.
     */
    const isImplied = reasons.some((reason) => reason.kind === "implied_by");
    const tier: 1 | 2 =
      isImplied || (required && level <= ceiling && !withheldIds.has(courseId)) ? 1 : 2;

    const candidate: GuessCandidate = {
      courseId,
      // Printed spelling even without a catalog row; see the note above.
      code: facts?.code ?? formatCourseId(courseId),
      title: facts?.title || titleForCourseId(courseId),
      points: facts?.points ?? null,
      tier,
      reasons,
      score: scoreById.get(courseId) ?? 0,
    };

    (tier === 1 ? tier1 : tier2).push(candidate);
  }

  /*
   * Per-course implications, from the FULL evidence set rather than the
   * sliced tiers. A confirmation of a course that did not fit on the strip
   * should still instantly name its intro.
   */
  const impliesTaken: Record<string, GuessFacts[]> = {};
  for (const courseId of evidence.keys()) {
    const prereqIds = unambiguousPrereqChain(courseId, input.prereqs);
    if (prereqIds.length === 0) continue;
    impliesTaken[courseId] = prereqIds.map((id) => {
      const facts = input.catalog.get(id);
      return {
        courseId: id,
        code: facts?.code ?? formatCourseId(id),
        title: facts?.title || titleForCourseId(id),
        points: facts?.points ?? null,
      };
    });
  }

  return {
    tier1: order(tier1, ceiling),
    tier2: order(tier2, ceiling).slice(0, limit),
    impliesTaken,
  };
}

/**
 * Plausible-already first, then evidence kind, then lowest level, then score.
 *
 * The maybe-strip is "what have you taken", not "what should you take next".
 * Engine score ranks the latter, so a 3000-level required course the student
 * will take as a junior used to outrank Intro to CS (an `n_of`, so not
 * required) on a sophomore's strip. Level before score is what puts first-year
 * cores in front of the major's future core.
 */
function order(candidates: GuessCandidate[], ceiling: number): GuessCandidate[] {
  return [...candidates].sort((a, b) => {
    const reasonDelta = reasonPriority(a, ceiling) - reasonPriority(b, ceiling);
    if (reasonDelta !== 0) return reasonDelta;
    return (
      (levelOf(a.courseId) ?? 9000) - (levelOf(b.courseId) ?? 9000) ||
      b.score - a.score ||
      a.courseId.localeCompare(b.courseId)
    );
  });
}

/**
 * Why this is on the strip, as a sort key. Lower is closer to the student's
 * actual transcript.
 *
 * Courses at or below the seniority ceiling are "already plausible". Future
 * required courses (Advanced Programming on a first-year strip) still appear,
 * but after the intros the student has actually had time to take.
 */
function reasonPriority(candidate: GuessCandidate, ceiling: number): number {
  const kinds = new Set(candidate.reasons.map((reason) => reason.kind));
  const plausible = (levelOf(candidate.courseId) ?? 9000) <= ceiling;
  if (kinds.has("implied_by")) return 0;
  if (plausible && kinds.has("typical")) return 1;
  if (plausible && kinds.has("required_by")) return 2;
  if (plausible && kinds.has("option_in")) return 3;
  if (kinds.has("required_by")) return 4;
  if (kinds.has("typical")) return 5;
  if (kinds.has("option_in")) return 6;
  return 7;
}

/** Course ids a single rule names, for attributing a candidate to its group. */
function groupNames(rule: RequirementRule): CourseId[] {
  switch (rule.kind) {
    case "all_of":
    case "n_of":
      return rule.courses.map(toCourseId).filter((id): id is CourseId => id !== null);
    case "sequence_choice":
      return rule.sequences
        .flatMap((sequence) => sequence.courses)
        .map(toCourseId)
        .filter((id): id is CourseId => id !== null);
    default:
      return [];
  }
}
