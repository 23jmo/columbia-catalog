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
import { likelyChoiceFor } from "./likely-choice";
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
  return Math.min(MAX_EXPECTED_LEVEL, 1000 * (years + 1));
}

/**
 * Where the year-based prior tops out. A student four years in is assumed to
 * have reached the 4000 band and no further; anything past that has to be
 * EVIDENCED, which is what `levelCeilingFor` is for.
 */
const MAX_EXPECTED_LEVEL = 4000;

/**
 * The level ceiling, with the student's own record allowed to raise it.
 *
 * `expectedLevelCeiling` is a prior — one year, one level band — and as a prior
 * it is fine. As the last word it is wrong, and wrong in a direction that
 * matters: engineering students front-load. A CS sophomore who has already
 * taken COMS W4111 is not rare, and against a 3000 ceiling every 4000-level
 * course in their own major reads as implausible — pushed out of the plausible
 * bands in `reasonPriority`, barred from tier 1 by the `level <= ceiling` test,
 * and dropped from the choose-one questions by the seniority floor. The strip
 * then offers them a first-year's transcript. A humanities student on the same
 * formula may never exceed 3000 and is served correctly by it, which is the
 * tell that the pace is program-dependent and the formula is not.
 *
 * Rather than a per-major table of expected paces — which would need writing,
 * maintaining, and defending for every program in the registry — the ceiling
 * takes the strongest evidence available: what the student has already told us
 * they took. Confirming one 4000-level course establishes that they work at
 * that level, and the deck is rebuilt on every re-rank, so the ceiling lifts
 * the moment the record justifies it rather than on a schedule.
 *
 * The prior still floors it. A first-year who has confirmed nothing gets 1000,
 * because with no record there is nothing to argue with.
 *
 * Deliberately uncapped above `MAX_EXPECTED_LEVEL`: a student who has confirmed
 * a 6000-level course has evidenced a 6000-level ceiling, and clamping it back
 * to 4000 would discard the very thing that makes this more trustworthy than
 * the prior.
 */
export function levelCeilingFor(years: number | null, confirmed: readonly string[]): number {
  let observed = 0;
  for (const courseId of confirmed) {
    const level = levelOf(courseId);
    if (level != null && level > observed) observed = level;
  }
  return Math.max(expectedLevelCeiling(years), observed);
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

/**
 * Courses that appear ONLY in requirement groups the student has already
 * finished.
 *
 * The deck's membership passes walk requirement tables, and a requirement
 * table has no idea what the student has done. So a SEAS CS junior who
 * finished the physics requirement with PHYS UN1401+UN1402 was still offered
 * PHYS UN2801 and UN2802 — the *third* rail of the same `sequence_choice` —
 * because the rule names them and nothing downstream asked whether the rule
 * was still open. Same for the other option of every satisfied `n_of`:
 * EEEB UN2005 against a finished CHEM UN1403, APMA E3101 against a finished
 * MATH UN2010. On one real profile that was every non-major suggestion on the
 * strip, and the student read it as the app not listening.
 *
 * ONLY is the whole point of the name. A course is suppressed when every group
 * that names it is done — never merely because *a* group that names it is
 * done. MATH UN2015 satisfies both Linear Algebra and Probability/Statistics;
 * finishing one of those must not hide it while the other is open. Candidates
 * expanded onto still-open groups count as naming it too, so an elective that
 * an open `n_matching` reaches keeps its place.
 *
 * Not a substitute for the engine's `requirementFit`, which already scores
 * these at zero. This is the membership half: scoring a course zero does not
 * take it off a strip that was never filtered.
 */
export function satisfiedOnlyCourseIds(groups: readonly GroupResult[]): Set<CourseId> {
  const finished = new Set<CourseId>();
  const live = new Set<CourseId>();

  for (const group of groups) {
    const target = group.status === "satisfied" ? finished : live;
    for (const courseId of groupNames(group.group.rule)) target.add(courseId);
    // Expanded candidates only ever hang off open-ended groups, which is
    // exactly the case `groupNames` returns nothing for.
    if (group.status !== "satisfied") {
      for (const courseId of group.candidates) live.add(courseId as CourseId);
    }
  }

  for (const courseId of live) finished.delete(courseId);
  return finished;
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
  /**
   * The option we defaulted to when a rule offered a choice and one of them is
   * what almost everybody takes. See `./likely-choice.ts` — this is the one
   * reason kind that names a course the student never told us about and that no
   * rule strictly requires, so it is deliberately the narrowest.
   */
  | { kind: "likely_choice"; groupLabel: string; alternatives: CourseId[] }
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

/**
 * One way to satisfy a choose-one requirement.
 *
 * A route is a LIST of courses, not one course, because `sequence_choice`
 * branches are two-term sequences: picking "Literature Humanities" says you
 * took both halves of it, and modelling a route as a single course would make
 * that unrepresentable.
 */
export interface GuessChoiceRoute {
  routeId: string;
  /** The sequence's name, or the course code for a single-course route. */
  label: string;
  courses: GuessFacts[];
}

/**
 * A requirement we are confident the student finished exactly one way.
 *
 * ── Why this is separate from both tiers ────────────────────────────────────
 *
 * Tier 1 is a claim and tier 2 is a suggestion; this is a QUESTION, and it is
 * the honest shape for what we actually know. "This senior completed the
 * Physics requirement" is near-certain. "It was Sequence 2" is a coin flip. The
 * two tiers can only express those together — assert a specific course, or say
 * nothing — so the certainty about the requirement was being thrown away with
 * the uncertainty about the route. Asking costs the student one tap and carries
 * no risk of putting a course they never took on their record.
 *
 * A group with a default in `./likely-choice.ts` never reaches here: its pick
 * is already in tier 1, and asking a question we would answer the same way 95%
 * of the time is worse than answering it.
 */
export interface GuessChoice {
  choiceId: string;
  /** The requirement's name — "Physics", "Chemistry or Biology". */
  label: string;
  programName: string;
  routes: GuessChoiceRoute[];
}

export interface GuessDeck {
  tier1: GuessCandidate[];
  tier2: GuessCandidate[];
  /**
   * Choose-one requirements, asked rather than guessed. Rendered above the
   * suggestion strip and NOT counted against its cap — these are questions we
   * know the student can answer, and burning the strip's eight slots on four
   * spellings of one requirement is what made them worth separating.
   *
   * Their courses are removed from `tier2` so the same question is not put
   * twice on one screen.
   */
  choices: GuessChoice[];
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
  /**
   * Courses named only by groups the student has already finished — see
   * `satisfiedOnlyCourseIds`. Optional, and absent means "no audit ran", not
   * "nothing is finished": a caller that cannot audit suppresses nothing
   * rather than guessing.
   */
  satisfiedOnly?: ReadonlySet<string>;
  /** Per tier, not in total. */
  limit?: number;
  now?: Date;
}

/**
 * Per-tier cap. Typical first-year options plus a major's named alternatives
 * already run past two dozen for a rising senior; 48 leaves reserve chips
 * the strip can append after a dismiss without a round trip.
 */
export const DEFAULT_TIER_LIMIT = 48;

/** Shared empty set, so the no-audit path allocates nothing per deck. */
const EMPTY_ID_SET: ReadonlySet<string> = new Set<string>();

export function buildGuessDeck(input: GuessDeckInput): GuessDeck {
  const limit = input.limit ?? DEFAULT_TIER_LIMIT;
  const confirmedIds = input.confirmed.map((course) => course.courseId);
  const confirmedSet = new Set<string>(confirmedIds);
  const dismissedSet = new Set(input.dismissed ?? []);

  const years = yearsCompleted(input.classYear, input.now);
  const ceiling = levelCeilingFor(years, confirmedIds);
  const implied = impliedPrerequisites(confirmedIds, input.prereqs);

  /*
   * Collect every id worth showing, with the evidence behind it, before any
   * scoring happens. Evidence is accumulated rather than overwritten: a course
   * that is both implied by a confirmed course AND required by the major
   * carries both chips, and the student reads two independent reasons instead
   * of whichever one this loop saw last.
   */
  const evidence = new Map<CourseId, { required: boolean; reasons: GuessReason[] }>();

  const satisfiedOnly = input.satisfiedOnly ?? EMPTY_ID_SET;

  const note = (courseId: CourseId, reason: GuessReason, required: boolean) => {
    if (confirmedSet.has(courseId) || dismissedSet.has(courseId)) return;
    /*
     * Suppressed on the two passes that walk requirement tables blind. Both
     * say "your degree mentions this", which stops being evidence the moment
     * the mention is spent — the requirement it belonged to is finished, and
     * a course whose only claim on the strip was a finished requirement has
     * no claim left.
     *
     * The other kinds are deliberately exempt. `counts_toward` is built from
     * the outstanding list and is already satisfaction-aware; `implied_by` is
     * a prerequisite of something the student CONFIRMED, which is a fact
     * about their transcript rather than a claim from a table; `required_by`
     * comes from an `all_of`, and an `all_of` is only satisfied when every
     * one of its courses is confirmed, which the line above already caught.
     */
    if ((reason.kind === "option_in" || reason.kind === "typical") && satisfiedOnly.has(courseId)) {
      return;
    }
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
   * Choose-one groups, defaulted to the option almost everybody takes.
   *
   * See `./likely-choice.ts` for what is on the allowlist and why it is so
   * short. Two guards sit here rather than in the table:
   *
   * FIRST YEARS ARE EXEMPT. Defaulting compounds two guesses — that the student
   * finished the requirement at all, and which way they finished it. The level
   * ceiling already handles the first for 3000-level choices, but it would let
   * a 1000-level default through for somebody five weeks into their first
   * semester, who is more likely to be sitting in Intro to CS right now than to
   * have finished it. One completed year is the floor for compounding.
   *
   * A GROUP THE STUDENT HAS ALREADY ANSWERED IS LEFT ALONE. If they ticked the
   * honors course themselves, defaulting the standard one would put both on
   * their record — two courses for a requirement that takes one, and the
   * likelier of the two is the one we made up.
   *
   * A default the student then removes does not come back and does not swap to
   * the alternative: `note` skips dismissed ids, and the table names one pick
   * with no fallback. Being corrected once is a correction; being corrected
   * twice on the same requirement is an argument.
   */
  const likelyPicks = new Set<CourseId>();
  if ((years ?? 0) >= 1) {
    for (const program of input.programs) {
      for (const group of program.groups) {
        const options = choiceOptionsOf(group.rule);
        if (options.length === 0) continue;
        if (options.some((option) => confirmedSet.has(option))) continue;

        const choice = likelyChoiceFor(options);
        if (!choice) continue;

        likelyPicks.add(choice.courseId);
        note(
          choice.courseId,
          {
            kind: "likely_choice",
            groupLabel: group.label,
            alternatives: choice.alternatives,
          },
          true,
        );
      }
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

  /*
   * The engine evaluates prerequisites against the defaults too.
   *
   * This is what makes the fix reach past the ambiguous course itself. Marking
   * Data Structures required puts it in tier 1, but COMS W3157 and COMS W3261
   * are gated ON Data Structures, and the hard filter reads the confirmed set —
   * which does not contain it, because the student has not ticked anything yet.
   * Without this wrapper the two courses that the whole problem was about stay
   * withheld and stay in tier 2.
   *
   * Deliberately a wrapped `PrereqSource` rather than extra entries in
   * `profile.taken`. The defaults are an assumption about ordering, not
   * testimony, and they have no business reaching the taste model, the
   * already-taken filter, or the scores — only the question "could this student
   * have taken that yet".
   *
   * `input.prereqs` stays raw everywhere else. `impliedPrerequisites` and
   * `unambiguousPrereqChain` are how the deck states things as fact, and
   * inferring a fact from an assumption is how a guess launders itself into a
   * transcript.
   */
  const assumedComplete = new Set<string>([...confirmedIds, ...likelyPicks]);
  const prereqsAssumingDefaults: PrereqSource =
    likelyPicks.size === 0
      ? input.prereqs
      : {
          statusFor: (courseId, completed) =>
            input.prereqs.statusFor(courseId, new Set([...completed, ...assumedComplete])),
          newlyUnlockedBy: (courseId, completed) =>
            input.prereqs.newlyUnlockedBy(courseId, new Set([...completed, ...assumedComplete])),
        };

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
    prereqs: prereqsAssumingDefaults,
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

  /*
   * Choose-one requirements, turned into a question instead of a guess.
   *
   * Built after the tier split rather than alongside the evidence, because
   * whether a group still needs asking depends on where its options LANDED. A
   * group is dropped when any of its courses reached tier 1 — the student
   * confirmed it, `./likely-choice.ts` defaulted it, or a prerequisite implied
   * it — and in all three cases the question is already answered.
   *
   * The seniority floor matches the defaults'. Asking is cheaper than
   * asserting, but asking a first-year in week five which physics sequence
   * they finished is still a question with no true answer.
   */
  const tier1Ids = new Set(tier1.map((candidate) => candidate.courseId));
  const choices: GuessChoice[] = [];
  const seenRouteSets = new Set<string>();

  if ((years ?? 0) >= 1) {
    for (const program of input.programs) {
      for (const group of program.groups) {
        const routes = choiceRoutesOf(group.rule);
        if (routes.length < 2 || routes.length > MAX_CHOICE_ROUTES) continue;

        const everyCourse = routes.flatMap((route) => route.courses);
        if (everyCourse.some((id) => confirmedSet.has(id) || tier1Ids.has(id))) continue;

        // The screen renders one chip per COURSE, so that is the number the
        // "worse than the search box" cap has to count. See the constant.
        if (new Set(everyCourse).size > MAX_CHOICE_COURSES) continue;

        // Declined: every route contains something they told us they did not
        // take, so there is no route left to offer.
        if (routes.every((route) => route.courses.some((id) => dismissedSet.has(id)))) continue;

        // Not senior enough to have reached even the earliest route.
        const earliest = Math.min(...everyCourse.map((id) => levelOf(id) ?? 9000));
        if (earliest > ceiling) continue;

        /*
         * Two declared programs often spell the same requirement identically —
         * the CS major and the CS minor both offer Intro as W1004-or-W1007.
         * Keyed on the routes themselves so it is asked once, whichever
         * programs happen to name it.
         */
        const key = routes
          .map((route) => [...route.courses].sort().join("+"))
          .sort()
          .join("|");
        if (seenRouteSets.has(key)) continue;
        seenRouteSets.add(key);

        choices.push({
          choiceId: `${program.name}:${group.label}`,
          label: group.label,
          programName: program.name,
          routes: routes.map((route) => ({
            routeId: route.courses.join("+"),
            label: route.label,
            courses: route.courses.map((id) => factsFor(id, input.catalog)),
          })),
        });
      }
    }
  }

  /*
   * The strip loses what the picker took. Otherwise the eight slots fill with
   * the same options the question above already lists — which is the state
   * this whole mechanism exists to get out of.
   */
  const asked = new Set(
    choices.flatMap((choice) =>
      choice.routes.flatMap((route) => route.courses.map((facts) => facts.courseId)),
    ),
  );
  const strip = tier2.filter((candidate) => !asked.has(candidate.courseId));

  return {
    tier1: order(tier1, ceiling).slice(0, limit),
    tier2: order(strip, ceiling).slice(0, limit),
    choices,
    impliesTaken,
  };
}

/**
 * Plausible-already first, then evidence kind, then engine score, then level.
 *
 * The maybe-strip is "what have you taken", not "what should you take next",
 * and that is why `reasonPriority` leads: it sorts by how close the evidence
 * sits to an actual transcript, which engine score knows nothing about.
 *
 * Level used to come BEFORE score, to stop a 3000-level course the student
 * will take as a junior outranking Intro to CS on a sophomore's strip. That
 * job has since moved: `reasonPriority` splits on `plausible`, so the junior's
 * course is already three bands down and never reaches the level comparison.
 * Inside a band every candidate is on the same side of the ceiling, so level
 * had stopped standing in for seniority and become a bare preference for
 * smaller numbers — which for a senior, whose ceiling saturates and makes
 * everything plausible, buried the courses that advance their degree under
 * ones that do not. A CS junior saw the spare rail of a finished physics
 * sequence (2000-level, requirement fit 0) above an Area Foundation course
 * they genuinely still need (4000-level, requirement fit 1). The engine had
 * scored that difference correctly and the sort never read it.
 *
 * Level stays as the tiebreak under score, where "prefer the earlier course"
 * is a fair way to break a genuine tie rather than a claim about seniority.
 */
function order(candidates: GuessCandidate[], ceiling: number): GuessCandidate[] {
  return [...candidates].sort((a, b) => {
    const reasonDelta = reasonPriority(a, ceiling) - reasonPriority(b, ceiling);
    if (reasonDelta !== 0) return reasonDelta;
    return (
      b.score - a.score ||
      (levelOf(a.courseId) ?? 9000) - (levelOf(b.courseId) ?? 9000) ||
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
  if (plausible && kinds.has("likely_choice")) return 3;
  if (plausible && kinds.has("option_in")) return 4;
  if (kinds.has("required_by")) return 5;
  if (kinds.has("likely_choice")) return 6;
  if (kinds.has("typical")) return 7;
  if (kinds.has("option_in")) return 8;
  return 9;
}

/**
 * The distinct routes through a rule the student picked exactly ONE of.
 *
 * `n === 1` is the whole test, and it is doing more work than it looks like.
 * An `n_of` with n=4 over 21 options — CS Area Foundation courses — is a menu
 * a student worked through, not a fork they took one branch of, and we could
 * not guess which four anyway. Requiring n=1 excludes it, along with the CC
 * Biology core (n=2) and the Political Science introductory pair (n=2),
 * without any of them needing to be named.
 */
function choiceRoutesOf(rule: RequirementRule): { label: string; courses: CourseId[] }[] {
  if (rule.kind === "n_of") {
    if (rule.n !== 1 || rule.courses.length <= 1) return [];
    return rule.courses.flatMap((code) => {
      const courseId = toCourseId(code);
      return courseId ? [{ label: code, courses: [courseId] }] : [];
    });
  }

  if (rule.kind === "sequence_choice") {
    if (rule.sequences.length <= 1) return [];
    return rule.sequences.flatMap((sequence) => {
      const courses = sequence.courses
        .map(toCourseId)
        .filter((id): id is CourseId => id !== null);
      return courses.length > 0 ? [{ label: sequence.label, courses }] : [];
    });
  }

  return [];
}

/**
 * Above this many routes, a picker is worse than the search box.
 *
 * CC Political Science offers seventeen ways to satisfy Research Methods. That
 * is a catalogue, and rendering it as seventeen buttons above the suggestions
 * would bury the screen to ask one question. Groups over the cap keep today's
 * behaviour and stay in the strip.
 */
const MAX_CHOICE_ROUTES = 6;

/**
 * The same judgement, counted in the unit the screen actually draws.
 *
 * The route cap alone used to be the whole guard, and it was, while a route was
 * one button. It is not any more: `CourseChoices` flattens the routes and gives
 * every course its own chip, so a group's cost is its distinct COURSE count and
 * the two numbers can diverge badly. CC Biology's Chemistry group is four
 * routes — comfortably under the route cap — and fifteen courses, which is a
 * wall of call numbers above a question the student is meant to answer at a
 * glance. Applied Mathematics' Physics group is four routes and nine.
 *
 * Eight is where the real data separates: of the fifty-six groups that reach
 * this screen, fifty-four are eight courses or fewer and those two are the
 * outliers. Both caps are kept rather than replaced — the course count is the
 * rendering cost, but a group with seven single-course routes is still a
 * catalogue, and dropping the route cap would start ASKING questions that have
 * never been asked rather than only narrowing what already is.
 *
 * Over either cap the behaviour is unchanged: no question, and the courses stay
 * in the suggestion strip.
 */
const MAX_CHOICE_COURSES = 8;

/** Chip-ready facts, with the same catalog-miss fallbacks used everywhere else. */
function factsFor(
  courseId: CourseId,
  catalog: GuessDeckInput["catalog"],
): GuessFacts {
  const facts = catalog.get(courseId);
  return {
    courseId,
    code: facts?.code ?? formatCourseId(courseId),
    title: facts?.title || titleForCourseId(courseId),
    points: facts?.points ?? null,
  };
}

/**
 * The options of a rule that is genuinely a choice, or nothing.
 *
 * Only `n_of` with more than one course qualifies. `all_of` is not a choice;
 * a one-course `n_of` is an `all_of` wearing a hat and `namedCoursesOf`
 * already marks it required. `sequence_choice` is left out because picking a
 * default there means asserting two or three courses off one guess, which is a
 * bigger claim than this mechanism is built to make.
 *
 * Note this does NOT filter on `n`: an `n_of` with n=4 and 21 options reaches
 * `likelyChoiceFor`, which declines it because no such option set is on the
 * allowlist. Breadth is checked by the table, not by a rule of thumb here.
 */
function choiceOptionsOf(rule: RequirementRule): CourseId[] {
  if (rule.kind !== "n_of" || rule.courses.length <= 1) return [];
  return rule.courses.map(toCourseId).filter((id): id is CourseId => id !== null);
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
