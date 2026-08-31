/**
 * Golden student records — synthetic transcripts with hand-stated outcomes.
 *
 * The existing requirement tests check rules one at a time: does `n_of` count
 * to n, does `sequence_choice` refuse a half-finished sequence. Those are unit
 * tests of the evaluator, and they all pass while a *program* is still wrong,
 * because a program is a transcription and a transcription can be faithful to
 * the wrong table.
 *
 * A golden record checks the other thing: given a whole person's coursework,
 * does the audit reach the conclusion a departmental adviser would reach. The
 * expected outcomes here are written by hand from the Bulletin, never generated
 * from the code under test — a golden record whose expectations were computed
 * by the evaluator would agree with the evaluator forever, including about its
 * mistakes.
 *
 * ── What these are for ──────────────────────────────────────────────────────
 *
 * Two jobs, in order of importance:
 *
 *   1. **Catching a wrong transcription.** `cc-major-economics` shipped a
 *      mathematics requirement that had no room for the honors sequence: a
 *      student who took MATH UN1207 + UN1208 — the *harder* path, and a
 *      complete one — was told they had failed two requirements and needed to
 *      go back and take calculus. Every unit test passed. `econ-honors-math`
 *      below is that student, and it fails against the old encoding.
 *
 *   2. **Executable documentation of the edge cases.** The interesting part of
 *      an audit is not the student who took the obvious courses; it is transfer
 *      credit, the mid-sequence student, the double major, and the record full
 *      of courses this catalog has never heard of. Each of those is a named
 *      record below with a comment saying what makes it hard.
 *
 * ── Reading a failure ───────────────────────────────────────────────────────
 *
 * A failure here means one of three things, and they need different fixes:
 *
 *   - The program transcription is wrong → fix the program file.
 *   - The evaluator is wrong → fix `evaluate.ts`, and expect other tests to go
 *     red with it.
 *   - The Bulletin changed → re-read the page, update the record AND the
 *     program, and move the `verified` date.
 *
 * Never edit an expectation to make a test pass without doing one of those.
 */

import { toCourseId, type CourseId } from "./code";
import { evaluateProgram, type CourseFacts, type CourseLookup } from "./evaluate";
import { getProgram } from "./programs";
import type { GroupStatus, Program, ProgramResult, RequirementRule } from "./types";

/* ==========================================================================
 * The synthetic catalog
 * ========================================================================== */

/**
 * Courses that carry a curriculum flag, listed explicitly.
 *
 * Flags cannot be derived from a course code — `requirement_flags` is written
 * by `scripts/ingest-core-flags.ts` from the Bulletin's approved-course pages,
 * and whether ASTR UN1403 counts for Science C is a curriculum decision, not a
 * property of the number 1403. So the handful the records below depend on are
 * named here, and everything else is flagless.
 *
 * Kept deliberately small. This is a fixture for auditing transcripts, not a
 * mirror of the catalog; a fixture that tried to be complete would rot.
 */
const FLAGGED: Record<string, Record<string, boolean>> = {
  // Global Core (from the Bulletin's approved list).
  "AFAS UN1001": { globalCore: true },
  "ASCE UN1359": { globalCore: true },
  "ASCE UN1361": { globalCore: true },
  "AHUM UN1400": { globalCore: true },
  // Science.
  "ASTR UN1403": { scienceRequirement: true, scienceC: true },
  "BIOL UN2005": { scienceRequirement: true, scienceB: true },
  "BIOL UN2006": { scienceRequirement: true, scienceB: true },
  "PSYC UN1001": { scienceRequirement: true, scienceC: true },
  "CHEM UN1403": { scienceRequirement: true, scienceC: true },
  "PHYS UN1401": { scienceRequirement: true, scienceC: true },
};

/** Points per course, where the default of 3 would make a record misleading. */
const POINTS: Record<string, number> = {
  // The Economics core and its math run at 4 points, and the major's elective
  // rules count points in several places.
  "ECON UN1105": 4,
  "ECON UN3211": 4,
  "ECON UN3213": 4,
  "ECON UN3412": 4,
  "MATH UN1101": 3,
  "MATH UN1201": 3,
  "MATH UN1205": 4,
  "MATH UN1207": 4,
  "MATH UN1208": 4,
  // Physical education is 1 point a term.
  "PHED UN1001": 1,
  "PHED UN1012": 1,
  // University Writing and the Core seminars.
  "ENGL CC1010": 3,
  /*
   * Psychology's companion lab sections really are worth zero points, and the
   * fixture has to say so. `eleven-courses` counts courses rather than points
   * so the value does not change that record's outcome today — but a fixture
   * that quietly called them 3-point courses would be lying about the exact
   * property the Bulletin's rule turns on.
   */
  "PSYC UN1421": 0,
  "PSYC UN1451": 0,
  "PSYC UN1456": 0,
  "PSYC UN1611": 0,
  /*
   * Philosophy is the one major here whose headline requirement is counted in
   * POINTS, and half of its rows are worth four. At the fixture default of 3
   * the `thirty-points` records would each be several points light and their
   * arithmetic would be untraceable to the Bulletin, which is the only thing
   * that makes them golden records rather than snapshots.
   *
   * PHIL UN2201 and PHIL UN3121 are worth stating twice over: our catalog
   * holds both rows with a NULL point value, so the live audit scores them at
   * zero. The Bulletin says four. These records are written against the
   * Bulletin — if the catalog is ever the thing under test, that is a separate
   * fixture and a separate assertion.
   */
  "PHIL UN2101": 4,
  "PHIL UN2201": 4,
  "PHIL UN3121": 4,
  "PHIL UN3411": 4,
  "PHIL UN3601": 4,
  "PHIL UN3701": 4,
  "PHIL UN3960": 4,
  // Barnard's senior seminar, so the exclusion record can say how many points
  // it is refusing to count rather than merely that it refuses.
  "PHIL BC4050": 4,
  /*
   * Organic chemistry's two half-labs, 1.5 points each.
   *
   * The pair is the whole reason Chemical Engineering's advanced laboratory is
   * `points_matching` and not `n_of`, and the two `cheme-*-lab` records below
   * are unwritable without these values: at the default of 3 a single half-lab
   * would satisfy a 3-point requirement on its own.
   *
   * Our live catalog stores CHEM UN2493 at 0.00 points, which is wrong — the
   * Bulletin and the department both publish 1.5. The fixture states the
   * Bulletin's number, and the catalog defect is named here rather than
   * encoded, because a fixture that mirrored the defect would quietly bless it.
   */
  "CHEM UN2493": 1.5,
  "CHEM UN2496": 1.5,
};

/**
 * Every course any registered program names, so the lookup cannot silently
 * disagree with the rules it is being used to check.
 *
 * Derived rather than hand-listed on purpose: a hand-listed catalog drifts the
 * moment someone adds a course to a program, and it drifts *silently* — the
 * missing course simply stops counting, and the record's expectation gets
 * "fixed" to match. Deriving the membership while hand-stating the flags and
 * points keeps the part that must be judged separate from the part that must
 * merely be present.
 */
function namedCoursesIn(rule: RequirementRule): string[] {
  switch (rule.kind) {
    case "all_of":
    case "n_of":
      return [...rule.courses];
    case "sequence_choice":
      return rule.sequences.flatMap((sequence) => sequence.courses);
    case "n_matching":
    case "points_matching":
      /*
       * `exclude` as well as `include`, added 2026-08-26.
       *
       * An excluded code is named by the rule as surely as an included one, and
       * leaving it out meant the synthetic catalog could not hold it — so no
       * golden record could put an excluded course on a transcript, and no
       * exclusion was testable at all. That is not a hypothetical gap: the
       * psychology over-count below is exactly the bug it hid.
       *
       * Adding them cannot make a record pass that should fail. A course in
       * `exclude` can never match the selector that excludes it; its presence
       * in the catalog only matters to a record that puts it in `taken`, which
       * is precisely the case we need to be able to write.
       */
      return [...(rule.select.include ?? []), ...(rule.select.exclude ?? [])];
    case "attested":
      return [];
  }
}

function buildCatalog(programs: readonly Program[]): Map<CourseId, CourseFacts> {
  const catalog = new Map<CourseId, CourseFacts>();

  const add = (code: string): void => {
    const courseId = toCourseId(code);
    if (!courseId) throw new Error(`golden fixture: unparseable code ${code}`);
    if (catalog.has(courseId)) return;
    catalog.set(courseId, {
      courseId,
      title: code,
      points: POINTS[code] ?? 3,
      requirementFlags: FLAGGED[code] ?? {},
    });
  };

  /*
   * Built per call from the programs handed in, rather than once into a module
   * constant. A record must not be able to pass because some *other* record's
   * program happened to name the course it needed — which is precisely what a
   * shared catalog would allow, silently and only sometimes, depending on the
   * order the records ran in.
   */
  for (const program of programs) {
    for (const group of program.groups) {
      for (const code of namedCoursesIn(group.rule)) add(code);
    }
  }
  // Flagged courses are mostly NOT named by any rule — that is the point of a
  // flag — so they have to be added on their own.
  for (const code of Object.keys(FLAGGED)) add(code);
  for (const code of Object.keys(POINTS)) add(code);
  // Extras the records reference that no rule names.
  for (const code of EXTRA_COURSES) add(code);

  return catalog;
}

/** Courses a record mentions that no program rule names. */
const EXTRA_COURSES = [
  // Economics electives at the 3000 level, used to fill `n_matching` rules.
  "ECON UN3025",
  "ECON UN3265",
  "ECON UN3535",
  "ECON UN3821",
  "ECON UN3951",
  // Computer science, for the CS records.
  "COMS W3134",
  "COMS W3157",
  "COMS W3203",
  "COMS W3251",
  "COMS W3261",
  "COMS W4111",
  "COMS W4118",
  "COMS W4160",
  "COMS W4995",
  "CSEE W3827",
  "STAT UN1201",
  "MATH UN2010",
  // Physical education.
  "PHED UN1012",
  // Psychology distribution courses, to fill the eleven-course total with a
  // transcript that looks like a real one rather than a list of prerequisites.
  "PSYC UN2280",
  "PSYC UN2450",
  "PSYC UN2630",
  "PSYC UN3280",
  "PSYC UN3450",
  "PSYC UN3630",
  // Mathematics electives — 3 points each, and named by no rule because the
  // elective block is a subject-and-level selector rather than a list.
  "MATH UN3020",
  "MATH GU4051",
  "MATH GU4053",
  "MATH UN3386",
  /*
   * Philosophy courses the records take but no rule names.
   *
   * `metaphysics-and-epistemology` is `attested`, so the Bulletin's own
   * examples for it — Philosophy of Science among them — appear in a note and
   * in no rule, which means `buildCatalog` never sees them and `pointsFor`
   * scores them zero. UN3352 is the ninth course that carries the substitution
   * record past thirty points rather than stopping one short.
   */
  "PHIL UN3551",
  "PHIL UN3352",
  // Sociology electives. None of the twelve the Bulletin prints as examples —
  // that is the point of the record that uses them.
  "SOCI UN3203",
  "SOCI UN3217",
  "SOCI UN3235",
  "SOCI UN3302",
  "SOCI UN3901",
  "SOCI UN3914",
  "SOCI UN3968",
  "SOCI GU4801",
  // The statistics course Neuroscience and Behavior refuses by name.
  "STAT UN1001",
  // Intermediate physics laboratory, taken twice on paper and countable once.
  "PHYS UN3081",
  "PHYS UN3083",
];

/* ==========================================================================
 * Records
 * ========================================================================== */

/**
 * What a record expects of one requirement group.
 *
 * `status` is the assertion that matters; `completed` is optional and pins the
 * count where getting it half-right would be its own bug (a student shown
 * "2 of 4" when they have 3 has been given wrong advice, even though the group
 * is correctly "in progress").
 */
export interface ExpectedGroup {
  status: GroupStatus;
  completed?: number;
}

export interface GoldenRecord {
  /** Stable id, used as the test name. */
  id: string;
  /** One line on who this student is and why they are interesting. */
  who: string;
  programId: string;
  /** Bulletin codes, as a student would read them. */
  taken: string[];
  /** Courses on a plan rather than finished. */
  planned?: string[];
  /**
   * Hand-stated outcome per group id. A group omitted here is not asserted —
   * use that for groups whose outcome the record is not about, rather than
   * padding every record with every group.
   */
  expect: Record<string, ExpectedGroup>;
  /**
   * Total groups the audit should call satisfied. Stated separately because it
   * is the number a student actually sees, and a per-group expectation set can
   * be individually right while the roll-up is wrong.
   */
  expectSatisfiedCount?: number;
  /** When a human last checked this against the Bulletin. */
  verified: string;
}

export const GOLDEN_RECORDS: GoldenRecord[] = [
  /* ---------------------------------------------------------------------- *
   * Economics
   * ---------------------------------------------------------------------- */
  {
    id: "econ-honors-math",
    who: "Economics major on the honors calculus track — MATH UN1207 + UN1208 instead of the standard sequence.",
    /*
     * THE regression record. Encoded as a required MATH UN1101 plus a choice of
     * UN1201/UN1205, this student fails two mathematics groups despite having
     * completed a sequence the Bulletin publishes as sufficient. They are also
     * the least likely student to doubt the app: an honors student told to take
     * Calculus I concludes the honors sequence doesn't count, and takes a
     * course they do not need.
     */
    programId: "cc-major-economics",
    taken: [
      "MATH UN1207",
      "MATH UN1208",
      "ECON UN1105",
      "ECON UN3211",
      "ECON UN3213",
      "ECON UN3412",
      "STAT UN1201",
    ],
    expect: {
      mathematics: { status: "satisfied" },
      "econ-core": { status: "satisfied", completed: 4 },
      statistics: { status: "satisfied" },
    },
    verified: "2026-08-24",
  },
  {
    id: "econ-standard-math",
    who: "Economics major on the ordinary calculus track. The control for the record above.",
    programId: "cc-major-economics",
    taken: ["MATH UN1101", "MATH UN1201", "ECON UN1105", "STAT UN1201"],
    expect: {
      mathematics: { status: "satisfied" },
      statistics: { status: "satisfied" },
      // One of four core courses.
      "econ-core": { status: "in_progress", completed: 1 },
    },
    verified: "2026-08-24",
  },
  {
    id: "econ-half-sequence",
    who: "Economics major who took Calculus I and stopped. Half of a sequence is not a sequence.",
    /*
     * The failure `sequence_choice` exists to prevent, from the other side. It
     * must read as in-progress rather than satisfied — and it must not read as
     * *unmet* either, because the student has genuinely started.
     */
    programId: "cc-major-economics",
    taken: ["MATH UN1101"],
    expect: {
      mathematics: { status: "in_progress" },
    },
    verified: "2026-08-24",
  },
  {
    id: "econ-mixed-sequence",
    who: "Economics major who took Calculus I and Honors Mathematics A — two courses, no completed sequence.",
    /*
     * The specific schedule that `n_of { n: 2 }` would wrongly pass. Both
     * courses are first-term courses from different tracks; the student has
     * done two terms of work and finished nothing. A real advising failure, and
     * exactly why the rule kind is `sequence_choice`.
     */
    programId: "cc-major-economics",
    taken: ["MATH UN1101", "MATH UN1207"],
    expect: {
      mathematics: { status: "in_progress" },
    },
    verified: "2026-08-24",
  },

  /* ---------------------------------------------------------------------- *
   * The Columbia College Core
   * ---------------------------------------------------------------------- */
  {
    id: "cc-core-first-year",
    who: "First-year who has taken nothing. Everything should be unmet, and nothing should crash.",
    /*
     * The empty record is worth pinning because it is the state every new user
     * starts in, and because an evaluator that divides by a match count will
     * only fail here.
     */
    programId: "cc-core",
    taken: [],
    expect: {
      "global-core": { status: "unmet", completed: 0 },
      "lit-hum": { status: "unmet", completed: 0 },
      science: { status: "unmet", completed: 0 },
    },
    expectSatisfiedCount: 0,
    verified: "2026-08-24",
  },
  {
    id: "cc-core-global-core-done",
    who: "Sophomore who has finished the Global Core with two approved courses.",
    /*
     * The flag path end to end: neither course is named by any rule, so this
     * only passes if `requirement_flags` is read and the shared selector agrees
     * with the one candidate generation uses.
     */
    programId: "cc-core",
    taken: ["AFAS UN1001", "ASCE UN1359"],
    expect: {
      "global-core": { status: "satisfied", completed: 2 },
    },
    verified: "2026-08-24",
  },
  {
    id: "cc-core-global-core-half",
    who: "Student one Global Core course in.",
    programId: "cc-core",
    taken: ["AFAS UN1001"],
    expect: {
      "global-core": { status: "in_progress", completed: 1 },
    },
    verified: "2026-08-24",
  },
  {
    id: "cc-core-unflagged-course",
    who: "Student who took a course with no Global Core flag and expects it to count.",
    /*
     * The over-acceptance guard. COMS W3157 is a real course, is in the
     * catalog, and carries no curriculum flag — so it must move nothing. An
     * audit that counted it would be worse than one that counted nothing,
     * because the student would stop looking.
     */
    programId: "cc-core",
    taken: ["COMS W3157"],
    expect: {
      "global-core": { status: "unmet", completed: 0 },
      science: { status: "unmet", completed: 0 },
    },
    verified: "2026-08-24",
  },
  {
    id: "cc-core-science-b-and-c",
    who: "Student who cleared the Science requirement with one B-list and one C-list course.",
    programId: "cc-core",
    taken: ["BIOL UN2005", "ASTR UN1403"],
    expect: {
      science: { status: "satisfied" },
    },
    verified: "2026-08-24",
  },

  /* ---------------------------------------------------------------------- *
   * Transfer, AP, and records this catalog cannot resolve
   * ---------------------------------------------------------------------- */
  {
    id: "transfer-unknown-courses",
    who: "Transfer student whose record is mostly courses from another university.",
    /*
     * `student_courses.course_id` is deliberately not a foreign key (migration
     * 0028) so transfer credit is storable. The audit's obligation is to ignore
     * what it cannot resolve WITHOUT counting it and without throwing: an
     * unresolvable row carries no flags, and "we have never seen this course"
     * must never round up to "it satisfies the Global Core".
     *
     * The one course we do recognise still has to count. A record that is 90%
     * unknown is the normal case for a transfer, not an error state.
     */
    programId: "cc-core",
    taken: ["XXXX 9999", "ZZZZ 1234", "QQQQ 4321", "AFAS UN1001"],
    expect: {
      "global-core": { status: "in_progress", completed: 1 },
      science: { status: "unmet", completed: 0 },
    },
    verified: "2026-08-24",
  },
  {
    id: "ap-credit-single-course",
    who: "Student who placed out of Calculus I with AP credit and started at Calculus III.",
    /*
     * AP credit arrives as the course it exempts, so this looks like a normal
     * record — the interesting part is that it must NOT satisfy the sequence.
     * The Bulletin's sequences are both terms; a student holding only UN1201
     * has not completed one, and telling them otherwise sends them into
     * Intermediate Micro underprepared.
     */
    programId: "cc-major-economics",
    taken: ["MATH UN1201"],
    expect: {
      mathematics: { status: "in_progress" },
    },
    verified: "2026-08-24",
  },

  /* ---------------------------------------------------------------------- *
   * Planned courses
   * ---------------------------------------------------------------------- */
  {
    id: "planned-counts-but-is-marked",
    who: "Student with one Global Core course taken and the second only planned.",
    /*
     * A planned course DOES close the requirement, and that is deliberate —
     * `evaluate.ts` argues that a student adding next term's course needs to
     * watch the requirement go green, or the screen cannot answer "what should
     * I take". This record was originally written expecting the opposite, on
     * the assumption that a plan is a hope; the assumption was wrong and the
     * documented design is better.
     *
     * But the whole safety of that decision rests on one thing: every match
     * carries `planned: true`, so no surface can render a plan as a finished
     * course. The status below is only half the assertion — see
     * "a group satisfied by a plan marks the plan" in golden.test.ts, which is
     * the half that actually protects the student.
     */
    programId: "cc-core",
    taken: ["AFAS UN1001"],
    planned: ["ASCE UN1359"],
    expect: {
      "global-core": { status: "satisfied", completed: 2 },
    },
    verified: "2026-08-24",
  },

  /* ---------------------------------------------------------------------- *
   * Computer science
   * ---------------------------------------------------------------------- */
  {
    id: "cs-mid-sequence",
    who: "CC computer science major partway through — data structures done, nothing toward calculus.",
    /*
     * The ordinary in-progress case, included because "in progress" is the
     * state almost every real student is in for almost every requirement, and
     * it is the value an audit is most likely to round to a neighbour.
     */
    programId: "cc-major-computer-science",
    taken: ["COMS W3134", "COMS W3203"],
    expect: {
      "data-structures": { status: "satisfied" },
      // Nothing from [MATH UN1201, MATH UN1205, APMA E2000] yet. Note MATH
      // UN1101 would NOT help: Calculus I is the prerequisite to all three
      // options, not one of them.
      calculus: { status: "unmet", completed: 0 },
      /*
       * Zero, and this record previously said six.
       *
       * When it was written, both of this student's courses counted toward the
       * electives block as well as toward the requirements that actually named
       * them — COMS W3203 is in `core-sequence` and COMS W3134 is
       * `data-structures`. It was recorded as-is at the time, flagged as
       * needing a look against the Bulletin, because `cc-major-economics`
       * excluded its required coursework from its elective selector and this
       * program did not.
       *
       * That look happened (2026-08-24) and the discrepancy was a bug, not a
       * difference of opinion. A student who had taken exactly the required
       * curriculum and not one elective was scored 12/12 on the SEAS major's
       * elective block — told a requirement was finished that they had not
       * started, which is the worst class of wrong answer an audit can give.
       * Both CS programs now carry `excludeGroups`, so nothing that satisfied a
       * named requirement can also be spent here.
       *
       * The record is kept rather than deleted precisely because it caught the
       * regression in the right direction: it failed the moment the fix landed.
       */
      electives: { status: "unmet", completed: 0 },
    },
    verified: "2026-08-24",
  },
  {
    id: "cs-electives-not-satisfied-by-the-core",
    who: "SEAS CS major who has finished the CS Core and four Area Foundation courses and taken no electives at all.",
    /*
     * The regression guard for the vacuous-elective bug (found 2026-08-24).
     *
     * Every course this student has taken is a COMS or CSEE course at the 3000
     * level or above, which is exactly the shape the elective selector matches.
     * Before `excludeGroups`, the audit scored them 12/12 and reported the
     * elective requirement DONE — for a student who had not taken one. They
     * would have registered for a final semester believing they were finished.
     *
     * This is the case to keep green. An audit that under-counts is annoying
     * and self-correcting: the student sees a number that is too low, takes
     * another course, and nothing is lost. An audit that over-counts is
     * discovered by the registrar after the add/drop deadline.
     */
    programId: "seas-major-computer-science",
    taken: [
      "COMS W3157", "COMS W3203", "COMS W3261", "CSEE W3827",
      "COMS W4111", "COMS W4118", "COMS W4701", "COMS W4705",
    ],
    expect: {
      "core-sequence": { status: "satisfied" },
      "area-foundation": { status: "satisfied" },
      "cs-electives": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-24",
  },
  {
    id: "cs-electives-surplus-area-foundation",
    who: "SEAS CS major who took SIX Area Foundation courses — the two beyond the required four are legitimately electives.",
    /*
     * The other half of the fix, and the reason `excludeGroups` names a group
     * rather than listing course codes.
     *
     * "Choose four of the following" consumes four. A static exclusion of all
     * twenty-one options would have been the obvious way to kill the bug above
     * and would have been wrong here — this student really has taken two
     * courses beyond what the requirement asked for, and the Bulletin gives no
     * reason they cannot be electives. Excluding what a group ACTUALLY matched
     * gets both cases right; excluding what it could have matched gets one.
     *
     * Six points rather than two courses because the block is `points_matching`
     * — the satisfying courses are variable-credit, and counting them as one
     * course each would let a student finish four courses and several points
     * short.
     */
    programId: "seas-major-computer-science",
    taken: [
      "COMS W3157", "COMS W3203", "COMS W3261", "CSEE W3827",
      "COMS W4111", "COMS W4118", "COMS W4701", "COMS W4705",
      "COMS W4115", "COMS W4160",
    ],
    expect: {
      "area-foundation": { status: "satisfied", completed: 4 },
      "cs-electives": { status: "in_progress", completed: 6 },
    },
    verified: "2026-08-24",
  },
  {
    id: "cs-calculus-cc",
    who: "College CS major holding APMA E2000 only — the College's calculus requirement is a choice of one, so this is done.",
    /*
     * Half of a divergence pair; read with `cs-calculus-seas` directly below.
     * Same single course, same group id, opposite correct answers.
     *
     * APMA E2000 is the probe because it appears in BOTH programs' calculus
     * rules, which makes the divergence purely structural: no argument about
     * which course belongs where can explain the two results apart.
     */
    programId: "cc-major-computer-science",
    taken: ["APMA E2000"],
    expect: {
      calculus: { status: "satisfied" },
    },
    verified: "2026-08-24",
  },
  {
    id: "cs-calculus-seas",
    who: "SEAS CS major holding APMA E2000 only — NOT enough, where the identically-named College requirement would be.",
    /*
     * The other half, and the reason both exist.
     *
     * The two programs share a name, a group id, and a label, and disagree
     * about the answer:
     *
     *   College: n_of 1 over [MATH UN1201, MATH UN1205, APMA E2000]
     *   SEAS:    all_of      [MATH UN1101, MATH UN1102, APMA E2000]
     *
     * Different rule kind AND a different course list, under the same heading.
     * Transcribing either program from the other's page — the obvious shortcut,
     * since the pages look alike — turns a three-course requirement into a
     * one-course one and sends a SEAS student to graduation two courses short.
     *
     * Pinned as a pair rather than as a comment, because the failure mode is
     * someone later noticing the duplication and "unifying" the two files.
     */
    programId: "seas-major-computer-science",
    taken: ["APMA E2000"],
    expect: {
      calculus: { status: "in_progress" },
    },
    verified: "2026-08-24",
  },
  {
    id: "cs-first-year-no-electives",
    who: "First-year CS major with an empty record. No 4000-level elective is reachable.",
    /*
     * The audit half of the assertion Lane B's prerequisite filter has to pass:
     * this student must never be recommended COMS W4111. Here the electives
     * group is genuinely unmet, which is exactly where a recommender that reads
     * `candidates` without checking prerequisites would go shopping.
     */
    programId: "cc-major-computer-science",
    taken: [],
    expect: {
      electives: { status: "unmet", completed: 0 },
      "core-sequence": { status: "unmet", completed: 0 },
    },
    expectSatisfiedCount: 0,
    verified: "2026-08-24",
  },
  {
    id: "psych-zero-point-lab-sections",
    who: "Columbia College psychology major with TEN real psychology courses and the two 0-point lab sections the registrar enrolled them in automatically.",
    /*
     * The regression guard for the phantom-course bug (found 2026-08-26).
     *
     * Psychology attaches a 0-point companion section to its statistics and
     * research-methods lectures, and each one carries its own PSYC course
     * record inside 1000–4999. `eleven-courses` is `n_matching` over that
     * subject and band, so both sections matched: this student's ten real
     * courses scored TWELVE and the audit reported an eleven-course major
     * DONE, for someone still a course short.
     *
     * The Bulletin's floor for this block is "3 or more points", which is
     * exactly what a 0-point section fails. `CourseSelector` has no points
     * field — so the floor itself stays unencodable, and the four rows in this
     * subject that fail it are named in `exclude` instead.
     *
     * Over-counting is the direction that matters here. A student told they
     * are one course short takes another course; a student told they are
     * finished registers for a final semester and hears otherwise from the
     * registrar after add/drop.
     *
     * `statistics` and `research-methods` are asserted alongside on purpose:
     * the exclusion is scoped to the elective count, and the named groups that
     * legitimately accept the lecture halves must stay green.
     */
    programId: "cc-major-psychology",
    taken: [
      // Ten real courses.
      "PSYC UN1001", "PSYC UN1021", "PSYC UN1610", "PSYC UN1420",
      "PSYC UN2280", "PSYC UN2450", "PSYC UN2630",
      "PSYC UN3280", "PSYC UN3450", "PSYC UN3630",
      // The two the registrar added on their behalf. Worth zero points each.
      "PSYC UN1611", "PSYC UN1421",
    ],
    expect: {
      statistics: { status: "satisfied" },
      "research-methods": { status: "satisfied" },
      "eleven-courses": { status: "in_progress", completed: 10 },
    },
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Mathematics
   * ---------------------------------------------------------------------- */
  {
    id: "math-honors-ap-sequence",
    who: "Mathematics major with a 5 on the BC exam who began at Honors Mathematics A, so Calculus I and II are AP credit and appear on no transcript.",
    /*
     * `econ-honors-math`, reproduced on the department that owns calculus.
     *
     * Against a literal transcription of the honors route —
     * `["MATH UN1101","MATH UN1102","MATH UN1207","MATH UN1208"]` and nothing
     * else — this student reads 2 of 4 and is told to go back and take
     * Calculus I. The Bulletin's own comment row is the alternative: "13-15
     * points INCLUDING Advanced Placement Credit", which is why the AP-shortened
     * branches are separate sequences rather than a footnote nobody encoded.
     */
    programId: "cc-major-mathematics",
    taken: [
      "MATH UN1207",
      "MATH UN1208",
      "MATH GU4041",
      "MATH GU4042",
      "MATH GU4061",
      "MATH GU4062",
      "MATH UN3951",
      // Twelve points of electives: four 3-point courses, none of them
      // consumed by a named group above.
      "MATH UN3020",
      "MATH GU4051",
      "MATH GU4053",
      "MATH UN3386",
    ],
    expect: {
      "calculus-sequence": { status: "satisfied", completed: 2 },
      "modern-algebra": { status: "satisfied", completed: 2 },
      "modern-analysis": { status: "satisfied", completed: 2 },
      seminar: { status: "satisfied", completed: 1 },
      electives: { status: "satisfied", completed: 12 },
    },
    expectSatisfiedCount: 5,
    verified: "2026-08-26",
  },
  {
    id: "math-mixed-sequence",
    who: "Mathematics major who took Calculus I, Calculus II, Accelerated Multivariable Calculus and Calculus IV — four calculus courses, no completed route.",
    /*
     * The schedule `n_of { n: 4 }` would wrongly pass, and it is buildable:
     * `UN1205` belongs to the accelerated route and `UN1202` to the ordinary
     * one, neither excludes the other, and both are offered.
     *
     * The electives line is the second half. `UN1202` and `UN1205` are below
     * the 2000 floor, so twelve points of genuine calculus buys nothing here —
     * which is the correct and counter-intuitive answer, and worth pinning
     * before someone "fixes" the floor to be kind.
     */
    programId: "cc-major-mathematics",
    taken: ["MATH UN1101", "MATH UN1102", "MATH UN1205", "MATH UN1202"],
    expect: {
      // Best alternative is the accelerated route at 3 of 4; Linear Algebra is
      // what is missing. Not satisfied, and not unmet either.
      "calculus-sequence": { status: "in_progress", completed: 3 },
      "modern-algebra": { status: "unmet", completed: 0 },
      electives: { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },
  {
    id: "math-analysis-substituted",
    who: "Mathematics major not contemplating graduate study who replaced BOTH terms of Modern Analysis, using Analysis and Optimization and Fourier Analysis, as footnote 2 allows.",
    /*
     * Footnote 2 is the MechE-footnote-3 shape on this page: a per-term
     * substitution that marks a complete student incomplete when it is missed.
     * It also pins the `n_of { n: 2 }` decision — had the block stayed one
     * `all_of` over four courses, this student reads 2 of 4.
     *
     * The load-bearing expectation is the last one. Every course this student
     * holds was consumed by a named group, and `MATH UN3952` is barred by
     * footnote 3 (only one seminar ever counts), so the elective block reads
     * ZERO of twelve. Without `excludeGroups` it reads satisfied and reports a
     * major finished a full year early.
     */
    programId: "cc-major-mathematics",
    taken: [
      "MATH UN1101",
      "MATH UN1102",
      "MATH UN1201",
      "MATH UN1202",
      "MATH UN2010",
      "MATH GU4041",
      "MATH GU4042",
      "MATH UN2500",
      "MATH GU4032",
      "MATH UN3952",
    ],
    expect: {
      "calculus-sequence": { status: "satisfied", completed: 5 },
      "modern-algebra": { status: "satisfied", completed: 2 },
      "modern-analysis": { status: "satisfied", completed: 2 },
      // `n_of { n: 1 }`, not `all_of` — one seminar is the requirement.
      seminar: { status: "satisfied", completed: 1 },
      electives: { status: "unmet", completed: 0 },
    },
    expectSatisfiedCount: 4,
    verified: "2026-08-26",
  },
  {
    id: "math-cognate-elective",
    who: "Mathematics major who filled part of the elective block with two approved cognates from outside the department.",
    /*
     * Two things at once, and a third that was found by writing it.
     *
     * First: the `include` list. A selector of `subjects: ["MATH"]` alone
     * silently drops all 79 approved cognates, and this student's COMS and PHIL
     * courses would count for nothing.
     *
     * Second: points, not courses. Three elective courses is not twelve points,
     * and this record must read IN PROGRESS. A transcriber who writes
     * `n_matching { n: 4 }` fails here and nowhere else.
     *
     * Third, and the reason the arithmetic below is not the obvious one: this
     * student holds THREE courses acceptable to `modern-analysis`, which needs
     * two. `evaluateGroup` reports `matched.slice(0, required)` and `ordered`
     * sorts by course id, so the two it consumes are `MATH UN3007` and
     * `MATH GU4061` — and `MATH GU4062`, the surplus, falls through into the
     * elective pool. Which of the three is freed is decided by string order and
     * nothing else. It happens not to matter here because all three are worth
     * 3 points, but it is arbitrary, and this record is where that shows.
     *
     *   COMS W3203 (3) + MATH GU4062 (3) + PHIL UN3411 (4) = 10 of 12.
     *
     * Separately: the student has used 7 points from outside the department
     * against a 6-point cap the audit does not enforce and the group note warns
     * about.
     */
    programId: "cc-major-mathematics",
    taken: [
      "MATH UN1101",
      "MATH UN1102",
      "MATH UN1201",
      "MATH UN1202",
      "MATH UN2010",
      "MATH GU4041",
      "MATH GU4042",
      "MATH GU4061",
      "MATH GU4062",
      "MATH UN3951",
      "COMS W3203",
      "PHIL UN3411",
      "MATH UN3007",
    ],
    expect: {
      "calculus-sequence": { status: "satisfied", completed: 5 },
      "modern-analysis": { status: "satisfied", completed: 2 },
      electives: { status: "in_progress", completed: 10 },
    },
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Statistics
   * ---------------------------------------------------------------------- */
  {
    id: "stat-honors-math",
    who: "Statistics major who satisfied the mathematics prerequisite with Honors Mathematics A and B, as the bullet under the table permits.",
    /*
     * The honors route on this page is a bullet with no footnote marker, sitting
     * BELOW a four-row block that looks exactly like an `all_of`. Encoded that
     * way, this student reads 0 of 4 on the largest block of the major and is
     * told to take four courses they have surpassed.
     *
     * `advanced-electives` is asserted deliberately: an `attested` group is
     * unmet until the student ticks it, however much coursework they hold. That
     * is the tier working as designed and not a bug to be optimised away.
     */
    programId: "cc-major-statistics",
    taken: [
      "MATH UN1207",
      "MATH UN1208",
      "COMS W1004",
      "STAT UN1201",
      "STAT GU4203",
      "STAT GU4204",
      "STAT GU4205",
      "STAT GU4206",
      "STAT GU4207",
      "STAT GU4221",
      "STAT GU4224",
      "MATH GU4061",
    ],
    expect: {
      "mathematics-prerequisite": { status: "satisfied", completed: 2 },
      computing: { status: "satisfied", completed: 1 },
      "statistics-prerequisite": { status: "satisfied", completed: 1 },
      "statistics-core": { status: "satisfied", completed: 5 },
      "statistics-elective": { status: "satisfied", completed: 1 },
      "advanced-electives": { status: "unmet", completed: 0 },
    },
    expectSatisfiedCount: 5,
    verified: "2026-08-26",
  },
  {
    id: "stat-mixed-math",
    who: "Statistics major who took Calculus I and Honors Mathematics A — two first-term courses from different tracks.",
    /*
     * The schedule `n_of { n: 2 }` would wrongly pass. Two terms of work,
     * nothing finished, and the group must report against the HONORS route:
     * 1 of 2 beats 1 of 4, and finishing the honors route is the shorter road
     * from where this student stands.
     */
    programId: "cc-major-statistics",
    taken: ["MATH UN1101", "MATH UN1207"],
    expect: {
      "mathematics-prerequisite": { status: "in_progress", completed: 1 },
      "statistics-core": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },
  {
    id: "stat-accelerated-math",
    who: "Statistics major who took Accelerated Multivariable Calculus — the route this same department endorses for Data Science and Economics-Statistics, and does not print for this major.",
    /*
     * A deliberately CONSERVATIVE expectation, written down so that the day the
     * DUS answers, the answer lands as a visible test change rather than a
     * quiet edit.
     *
     * The Statistics page prints two mathematics routes and `MATH UN1205` is in
     * neither, so this student matches alternative 1 on three of four courses
     * and owes `MATH UN1201`. If UN1205 is confirmed acceptable, this flips to
     * satisfied and a third alternative joins the rule. Until then the audit
     * under-counts on purpose: that sends the student to their adviser, where
     * the question can actually be answered.
     */
    programId: "cc-major-statistics",
    taken: [
      "MATH UN1101",
      "MATH UN1102",
      "MATH UN1205",
      "MATH UN2010",
      "STAT UN1201",
    ],
    expect: {
      "mathematics-prerequisite": { status: "in_progress", completed: 3 },
      "statistics-prerequisite": { status: "satisfied", completed: 1 },
    },
    verified: "2026-08-26",
  },
  {
    id: "stat-computing-via-stat",
    who: "Statistics major who satisfied the Computer Science Requirement with STAT UN2102 Applied Statistical Computing rather than a COMS course.",
    /*
     * Pins two boundaries that a reflex transcription gets wrong.
     *
     * The computing list is `n_of` over three NAMED courses, one of which is a
     * STAT course — not a COMS-subject selector, which is the shape the heading
     * "Computer Science Requirement" invites and which reports this student
     * unmet.
     *
     * And `STAT UN2102` is numbered well below the 4221-4291 band, so it cannot
     * leak into the elective. Eleven courses done, three electives owed: this
     * is the record that catches an elective block accidentally satisfied by
     * the core.
     */
    programId: "cc-major-statistics",
    taken: [
      "MATH UN1101",
      "MATH UN1102",
      "MATH UN1201",
      "MATH UN2010",
      "STAT UN2102",
      "STAT UN1201",
      "STAT GU4203",
      "STAT GU4204",
      "STAT GU4205",
      "STAT GU4206",
      "STAT GU4207",
    ],
    expect: {
      "mathematics-prerequisite": { status: "satisfied", completed: 4 },
      computing: { status: "satisfied", completed: 1 },
      "statistics-prerequisite": { status: "satisfied", completed: 1 },
      "statistics-core": { status: "satisfied", completed: 5 },
      "statistics-elective": { status: "unmet", completed: 0 },
      "advanced-electives": { status: "unmet", completed: 0 },
    },
    expectSatisfiedCount: 4,
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Physics
   * ---------------------------------------------------------------------- */
  {
    id: "physics-honors-math",
    who: "Physics major on the honors mathematics track — MATH UN1207 + UN1208 instead of Calculus I, II and Accelerated Multivariable.",
    /*
     * `econ-honors-math` again, and harder to see: the substitution that permits
     * this route is a bare `<sup>` welded into the `MATH UN1205` title cell. A
     * transcriber reading the rendered page sees a three-course `all_of` and
     * writes one, and this student is told they have completed NONE of their
     * calculus.
     *
     * The record also exercises the all-APMA side of the three mathematics
     * either/ors; `physics-laboratory-two-semesters` below takes the all-MATH
     * side, so the pair covers both.
     */
    programId: "cc-major-physics",
    taken: [
      "MATH UN1207",
      "MATH UN1208",
      "APMA E2101",
      "APMA E3101",
      "APMA E4204",
      "PHYS UN1601",
      "PHYS UN1602",
      "PHYS UN2601",
    ],
    expect: {
      calculus: { status: "satisfied", completed: 2 },
      "differential-equations": { status: "satisfied", completed: 1 },
      "linear-algebra": { status: "satisfied", completed: 1 },
      "complex-variables": { status: "satisfied", completed: 1 },
      "introductory-sequence": { status: "satisfied", completed: 3 },
      "core-physics": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },
  {
    id: "physics-mixed-intro-sequence",
    who: "Physics major who took PHYS UN1401, then PHYS UN1602, then PHYS UN2601 — three terms of introductory physics, no completed sequence.",
    /*
     * The sharpest mixed-sequence case in the repo, because `PHYS UN2601` is the
     * third term of BOTH Sequence A and Sequence B. A student who switched
     * tracks after their first term lands on a shared endpoint and LOOKS
     * finished: `n_of { n: 3 }` over the union reports satisfied. The department
     * writes the warning itself — "Mixing courses across the sequences is
     * strongly discouraged" — which is prose the rule language cannot hold, so
     * the encoding has to hold it instead.
     *
     * Both A and B score 2 of 3, so the tie-break does not matter to the
     * assertion: completed is 2 and required is 3 under either.
     */
    programId: "cc-major-physics",
    taken: ["PHYS UN1401", "PHYS UN1602", "PHYS UN2601"],
    expect: {
      "introductory-sequence": { status: "in_progress", completed: 2 },
    },
    verified: "2026-08-26",
  },
  {
    id: "physics-laboratory-two-semesters",
    who: "Physics senior who has finished the entire major on paper and has done PHYS UN3081 once and PHYS UN3083 once — two of the three laboratory semesters Option 1 requires.",
    /*
     * The record that catches the tempting wrong encoding
     * `n_of { n: 2, courses: ["PHYS UN3081", "PHYS UN3083"] }`, which looks
     * exactly like Option 1 and reports this student's laboratory finished a
     * semester early. Option 1 is THREE semesters — `UN3081` twice plus
     * `UN3083` — and two facts make that unencodable: the rule language cannot
     * ask for the same course twice, and `student_courses`' primary key
     * `(user_id, course_id)` means a record could not evidence a repeat even if
     * it could ask.
     *
     * So the group is `attested` and reads unmet until the student ticks it,
     * with eight of nine groups green around it. Under-counting sends someone
     * to their adviser; over-counting sends them to the registrar after
     * add/drop.
     */
    programId: "cc-major-physics",
    taken: [
      "PHYS UN2801",
      "PHYS UN2802",
      "PHYS UN3003",
      "PHYS UN3007",
      "PHYS UN3008",
      "PHYS GU4021",
      "PHYS GU4022",
      "PHYS GU4023",
      "PHYS GU4018",
      "PHYS GU4040",
      "PHYS UN3072",
      "PHYS UN3081",
      "PHYS UN3083",
      "MATH UN1101",
      "MATH UN1102",
      "MATH UN1205",
      "MATH UN2030",
      "MATH UN2010",
      "MATH UN3007",
    ],
    expect: {
      "introductory-sequence": { status: "satisfied", completed: 2 },
      "core-physics": { status: "satisfied", completed: 6 },
      "physics-electives": { status: "satisfied", completed: 2 },
      "senior-seminar": { status: "satisfied", completed: 1 },
      calculus: { status: "satisfied", completed: 3 },
      "differential-equations": { status: "satisfied", completed: 1 },
      "linear-algebra": { status: "satisfied", completed: 1 },
      "complex-variables": { status: "satisfied", completed: 1 },
      "intermediate-laboratory": { status: "unmet", completed: 0 },
    },
    expectSatisfiedCount: 8,
    verified: "2026-08-26",
  },
  {
    id: "physics-electives-in-an-include-list",
    who: "Physics major whose two electives are PHYS UN3002 and PHYS GU4011 — both named by the Bulletin, neither held by our live catalog.",
    /*
     * The elective block is `n_matching` over an `include` list rather than
     * `points_matching`, and this record is why.
     *
     * `matchesCompiledSelector` checks `exclude`, then `include`, then
     * `hasShape` — an include hit returns true before the catalog is consulted
     * at all, so a course we hold no row for still matches by course id. Under
     * `points_matching`, `lookup` returns undefined for both, `pointsFor` falls
     * through to 0, and this student is credited 0 of 6 points: two completed
     * courses counted for nothing. That is `transfer-unknown-courses`' failure
     * pointed at a requirement instead of at the Core.
     *
     * The synthetic catalog cannot reproduce the live gap — `buildCatalog`
     * derives its membership from the courses each program NAMES, and an
     * include list names them — so this record pins the include list and the
     * satisfied outcome, and the paragraph above is what carries the reason.
     * If it is ever changed to expect in_progress, someone switched the rule;
     * fix the rule, not the expectation.
     */
    programId: "cc-major-physics",
    taken: [
      "PHYS UN1601",
      "PHYS UN1602",
      "PHYS UN2601",
      "PHYS UN3002",
      "PHYS GU4011",
    ],
    expect: {
      "introductory-sequence": { status: "satisfied", completed: 3 },
      "physics-electives": { status: "satisfied", completed: 2 },
      "core-physics": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Philosophy
   * ---------------------------------------------------------------------- */
  {
    id: "phil-six-required-only",
    who: "Philosophy major who took exactly the six courses the Bulletin names by row, and nothing else.",
    /*
     * Every named row is green and the student is seven points and two courses
     * short of the major. A transcription that stopped at the six rows scores
     * them 100% complete.
     *
     * By hand, from the Bulletin: UN2101 (4) + UN2201 (4) + UN3411 (4) +
     * UN3601 (4) + UN3701 (4) + UN3912 (3) = 23 of 30.
     *
     * `metaphysics-and-epistemology` is `attested` and stays unmet even though
     * `PHIL UN3601 Metaphysics` is sitting right there on the transcript — the
     * category is open and the DUS decides it, so no course number may. The
     * record does not tick it, on purpose.
     */
    programId: "cc-major-philosophy",
    taken: [
      "PHIL UN2101",
      "PHIL UN2201",
      "PHIL UN3411",
      "PHIL UN3601",
      "PHIL UN3701",
      "PHIL UN3912",
    ],
    expect: {
      "history-of-philosophy-i": { status: "satisfied", completed: 1 },
      "history-of-philosophy-ii": { status: "satisfied", completed: 1 },
      logic: { status: "satisfied", completed: 1 },
      "ethics-social-and-political-philosophy": { status: "satisfied", completed: 1 },
      "major-seminar": { status: "satisfied", completed: 1 },
      "metaphysics-and-epistemology": { status: "unmet", completed: 0 },
      "thirty-points": { status: "in_progress", completed: 23 },
    },
    verified: "2026-08-26",
  },
  {
    id: "phil-substituted-ancient",
    who: "Philosophy major who took Plato instead of History of Philosophy I — the substitution the Bulletin itself names in parentheses.",
    /*
     * Fails against the obvious wrong encoding, `all_of ["PHIL UN2101"]`, which
     * tells a student holding a course the Bulletin offers as a substitute that
     * they must go back and take the course they substituted for.
     *
     * By hand: UN3121 (4) + UN2201 (4) + UN3411 (4) + UN3751 (3) + UN3912 (3) +
     * UN3551 (3) + UN3960 (4) + UN3601 (4) = 29, one point short — so the
     * record carries a ninth course, UN3352 (3), for 32. The block reports 30,
     * because `points_matching` caps `completed` at what was asked for rather
     * than claiming "32 of 30".
     */
    programId: "cc-major-philosophy",
    taken: [
      "PHIL UN3121",
      "PHIL UN2201",
      "PHIL UN3411",
      "PHIL UN3751",
      "PHIL UN3912",
      "PHIL UN3551",
      "PHIL UN3960",
      "PHIL UN3601",
      "PHIL UN3352",
    ],
    expect: {
      "history-of-philosophy-i": { status: "satisfied", completed: 1 },
      "history-of-philosophy-ii": { status: "satisfied", completed: 1 },
      logic: { status: "satisfied", completed: 1 },
      "ethics-social-and-political-philosophy": { status: "satisfied", completed: 1 },
      "thirty-points": { status: "satisfied", completed: 30 },
    },
    verified: "2026-08-26",
  },
  {
    id: "phil-barnard-senior-seminar",
    who: "Philosophy major padding their points with Barnard's senior seminar and senior essay, and with Introduction to Logic — three courses the department excludes by name.",
    /*
     * The only record here that tests an `exclude` list, and the exclusions are
     * the easiest thing in this transcription to leave out.
     *
     * `numberRange` reads the four-digit number irrespective of prefix, so
     * `[1000, 4999]` matches `PHIL BC4050` and `PHIL BC4051` unless they are
     * named — and `PHIL UN1401`, which the page says twice does not count.
     *
     * By hand: UN2101 (4) + UN2201 (4) + UN3411 (4) + UN3701 (4) + UN3912 (3)
     * = 19 of 30. Without the three exclusions the same student reads 29 of 30
     * — ten points of coursework the Bulletin refuses, and a major reported one
     * point from done.
     */
    programId: "cc-major-philosophy",
    taken: [
      "PHIL UN2101",
      "PHIL UN2201",
      "PHIL UN3411",
      "PHIL UN3701",
      "PHIL UN3912",
      "PHIL BC4050",
      "PHIL BC4051",
      "PHIL UN1401",
    ],
    expect: {
      "thirty-points": { status: "in_progress", completed: 19 },
    },
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Sociology
   * ---------------------------------------------------------------------- */
  {
    id: "soci-core-is-not-electives",
    who: "Sociology major who has finished all three core courses and taken no other sociology course.",
    /*
     * A bare `n_matching { n: 6, select: { subjects: ["SOCI"] } }` counts the
     * three core courses as three of the six electives and reports this student
     * 3 of 6 on a requirement they have not begun — a three-course overstatement
     * of a nine-course major. Only `excludeGroups: ["soci-core"]` gets it right.
     */
    programId: "cc-major-sociology",
    taken: ["SOCI UN1000", "SOCI UN3000", "SOCI UN3010"],
    expect: {
      "soci-core": { status: "satisfied", completed: 3 },
      "soci-electives": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },
  {
    id: "soci-discussion-sections-are-not-courses",
    who: "Sociology major registered for the three core courses, their three required 0-point discussion sections, and two genuine electives.",
    /*
     * Every Columbia sociology major is auto-registered for these discussion
     * sections; they are not courses the student chose and not courses the
     * department counts. Without the `exclude` list they read as three more
     * electives and this student is scored 5 of 6 instead of 2 of 6 — one
     * course from being told a nine-course major is finished.
     *
     * The count is asserted, not just the status: a group can be correctly
     * in-progress and still be lying about the number the student reads.
     */
    programId: "cc-major-sociology",
    taken: [
      "SOCI UN1000",
      "SOCI UN1100",
      "SOCI UN3000",
      "SOCI UN3001",
      "SOCI UN3010",
      "SOCI UN3011",
      "SOCI UN3235",
      "SOCI UN3914",
    ],
    expect: {
      "soci-core": { status: "satisfied", completed: 3 },
      "soci-electives": { status: "in_progress", completed: 2 },
    },
    verified: "2026-08-26",
  },
  {
    id: "soci-electives-beyond-the-examples",
    who: "Sociology major who has finished the core and six electives, none of which is one of the twelve courses the Bulletin prints as examples.",
    /*
     * The student an `n_of` over the twelve printed examples fails completely:
     * six real sociology electives, zero matches, a finished major reported as
     * not started. The Bulletin's list is illustrative and the rule has to be
     * a selector.
     *
     * Two secondary behaviours ride along. A GU 4000-level course counts — it
     * is inside `[1000, 4999]` and the department's own course tab lists it —
     * and the two `attested` groups stay unmet until the student ticks them,
     * which is why the satisfied count is 2 and not 4.
     */
    programId: "cc-major-sociology",
    taken: [
      "SOCI UN1000",
      "SOCI UN3000",
      "SOCI UN3010",
      "SOCI UN3203",
      "SOCI UN3217",
      "SOCI UN3302",
      "SOCI UN3901",
      "SOCI UN3968",
      "SOCI GU4801",
    ],
    expect: {
      "soci-core": { status: "satisfied", completed: 3 },
      "soci-electives": { status: "satisfied", completed: 6 },
      "soci-lecture-courses": { status: "unmet", completed: 0 },
      "soci-seminars": { status: "unmet", completed: 0 },
    },
    expectSatisfiedCount: 2,
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Neuroscience and Behavior
   * ---------------------------------------------------------------------- */
  {
    id: "nb-biology-electives-not-free",
    who: "Neuroscience and Behavior major who has finished the required biology year and the required neurobiology year, and has taken no other biology course.",
    /*
     * `BIOL UN3004` and `BIOL UN3005` are the first two rows of the Biology
     * major's Upper-Level Elective list AND the two courses this major requires
     * by name. Written as `n_of { n: 2 }` over that list — the obvious
     * transcription — this student reads 2 of 2 DONE on two courses they have
     * not taken. Only `excludeGroups: ["neurobiology"]` gets it right. It is the
     * same failure `cc-major-biology` shipped and fixed.
     */
    programId: "cc-major-neuroscience-and-behavior",
    taken: [
      "BIOL UN2005",
      "BIOL UN2006",
      "BIOL UN3004",
      "BIOL UN3005",
      "PSYC UN1001",
      "PSYC UN2430",
      "STAT UN1201",
    ],
    expect: {
      "introductory-biology": { status: "satisfied", completed: 2 },
      neurobiology: { status: "satisfied", completed: 2 },
      "biology-electives": { status: "unmet", completed: 0 },
      "psychology-introduction": { status: "satisfied", completed: 1 },
      "neuroscience-lecture": { status: "satisfied", completed: 1 },
      "statistics-or-research-methods": { status: "satisfied", completed: 1 },
    },
    verified: "2026-08-26",
  },
  {
    id: "nb-stat-un1001-does-not-count",
    who: "Neuroscience and Behavior major who took STAT UN1001 Introduction to Statistical Reasoning for the statistics requirement.",
    /*
     * The Bulletin is explicit: "Please note, STAT UN1001 does not count towards
     * the Neuroscience & Behavior major." `cc-major-psychology`'s statistics
     * group DOES include `STAT UN1001`, so the cheapest way to write this group
     * is to copy that list — and the copy passes a student who has not met the
     * requirement.
     *
     * This record fails against the copied list and passes against the
     * Bulletin's, which is the only difference between the two.
     */
    programId: "cc-major-neuroscience-and-behavior",
    taken: [
      "PSYC UN1001",
      "PSYC UN2450",
      "STAT UN1001",
      "BIOL UN2005",
      "BIOL UN2006",
    ],
    expect: {
      "statistics-or-research-methods": { status: "unmet", completed: 0 },
      "psychology-introduction": { status: "satisfied", completed: 1 },
      "neuroscience-lecture": { status: "satisfied", completed: 1 },
      "introductory-biology": { status: "satisfied", completed: 2 },
      neurobiology: { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },
  {
    id: "nb-alternative-intro-psych",
    who: "Neuroscience and Behavior major who took PSYC UN1021, the Bulletin's alternative version of the introductory course, and is one term into introductory biology with the second term planned.",
    /*
     * Two things at once.
     *
     * The N&B block names only `PSYC UN1001`, so an over-literal transcription
     * marks this student unmet on a requirement they have finished — the
     * `econ-honors-math` failure mode applied to an "alternative version"
     * rather than an honors one.
     *
     * And `PSYC UN1021` has no row in our catalog, so the record also pins what
     * happens to a named course we cannot resolve: `n_of` matches by course id
     * and never consults the lookup, so it counts. A rule that needed points or
     * a flag would not, and should not.
     *
     * `BIOL UN2006` is PLANNED. A planned course counts toward the group and is
     * marked as planned in the result — which is what makes the audit useful
     * for choosing next term's courses rather than only for grading last one.
     */
    programId: "cc-major-neuroscience-and-behavior",
    taken: ["PSYC UN1021", "PSYC UN1610", "BIOL UN2005"],
    planned: ["BIOL UN2006"],
    expect: {
      "psychology-introduction": { status: "satisfied", completed: 1 },
      "statistics-or-research-methods": { status: "satisfied", completed: 1 },
      "introductory-biology": { status: "satisfied", completed: 2 },
      neurobiology: { status: "unmet", completed: 0 },
      "biology-electives": { status: "unmet", completed: 0 },
      "neuroscience-lecture": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Electrical Engineering
   * ---------------------------------------------------------------------- */
  {
    id: "ee-track3-physics-and-lab",
    who: "Electrical Engineering major on the accelerated physics track — PHYS UN2801, PHYS UN2802, and PHYS UN3081 as their laboratory.",
    /*
     * The third cell of the sequence-3 physics row is a LABORATORY, not a
     * lecture, and where it goes decides two groups at once. Fold `PHYS UN3081`
     * into the physics sequence and this student's laboratory requirement is
     * permanently unmet; take the laboratory list from the sibling SEAS files
     * and it works, but it also accepts `CHEM UN1507` and `CHEM UN3085`, which
     * the EE page never prints.
     */
    programId: "seas-major-electrical-engineering",
    taken: [
      "PHYS UN2801",
      "PHYS UN2802",
      "PHYS UN3081",
      "MATH UN1101",
      "MATH UN1102",
      "APMA E2000",
      "CHEM UN1403",
    ],
    expect: {
      // Sequence 3 is two courses, not three.
      physics: { status: "satisfied", completed: 2 },
      "science-laboratory": { status: "satisfied", completed: 1 },
      calculus: { status: "satisfied", completed: 3 },
      chemistry: { status: "satisfied", completed: 1 },
      "applied-mathematics": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },
  {
    id: "ee-mixed-physics-sequence",
    who: "Electrical Engineering major who took PHYS UN1401 (sequence 1, term 1) and PHYS UN1602 (sequence 2, term 2).",
    /*
     * Two terms of physics done, no sequence properly started. As
     * `n_of { n: 2 }` this passes. It must read in progress — and not unmet
     * either, because the student has genuinely done a term.
     */
    programId: "seas-major-electrical-engineering",
    taken: ["PHYS UN1401", "PHYS UN1602"],
    expect: {
      physics: { status: "in_progress", completed: 1 },
    },
    verified: "2026-08-26",
  },
  {
    id: "ee-ode-route-and-comms-choice",
    who: "Electrical Engineering major who replaced APMA E2101 with MATH UN2030 + MATH UN2010, and satisfied the communications requirement with CSEE W4119 rather than ELEN E3701.",
    /*
     * The applied-mathematics footnote is a one-course-versus-two branch, which
     * is why the group is `sequence_choice` and not a flat list: `all_of
     * ["APMA E2101"]` marks this complete student incomplete, and
     * `n_of { n: 1 }` over the union of all three branches passes a student
     * holding `MATH UN2030` alone — half a route.
     *
     * The communications cell is the other half: a genuine either/or, not two
     * required courses.
     *
     * `technical-electives` is `attested` and unticked. Worth noting what the
     * audit cannot see: taking the two-course applied-mathematics route reduces
     * this student's elective target from 18 points to 15, a footnote no rule
     * kind in this language can express.
     */
    programId: "seas-major-electrical-engineering",
    taken: [
      "MATH UN2030",
      "MATH UN2010",
      "CSEE W4119",
      "ENGI E1006",
      "ENGI E1102",
      "ELEN E1201",
    ],
    expect: {
      "applied-mathematics": { status: "satisfied", completed: 2 },
      "communications-or-networks": { status: "satisfied", completed: 1 },
      "engineering-foundations": { status: "satisfied", completed: 3 },
      "technical-electives": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Computer Engineering
   * ---------------------------------------------------------------------- */
  {
    id: "compe-two-term-physics-and-track3-lab",
    who: "Computer Engineering major on the accelerated physics track — PHYS UN2801, PHYS UN2802, then PHYS UN3081 as their laboratory.",
    /*
     * The two shapes most likely to be got wrong at once, and both come from
     * copying the sibling page. Copy physics from Electrical or Mechanical
     * Engineering and it becomes a THREE-term sequence, so this student reads
     * 2 of 3; copy the laboratory from the shared SEAS five-course list and it
     * accepts `CHEM UN1507` and `CHEM UN3085`, which this page never prints.
     *
     * It also pins that `PHYS UN3081` lives in the laboratory group and not
     * inside the physics sequence — the same course may not pay for both.
     */
    programId: "seas-major-computer-engineering",
    taken: [
      "PHYS UN2801",
      "PHYS UN2802",
      "PHYS UN3081",
      "CHEM UN1403",
      "MATH UN1101",
      "MATH UN1102",
      "APMA E2000",
    ],
    expect: {
      physics: { status: "satisfied", completed: 2 },
      "science-laboratory": { status: "satisfied", completed: 1 },
      chemistry: { status: "satisfied", completed: 1 },
      calculus: { status: "satisfied", completed: 3 },
      "applied-mathematics": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },
  {
    id: "compe-honors-track",
    who: "Computer Engineering major who took every honors variant the page offers — COMS W1007, COMS W3137, STAT GU4203 — and who still holds ENGI E1006, because this degree requires it AS WELL AS the Java course.",
    /*
     * Three honors substitutions in one record, plus the `ENGI E1006`-and-a-Java
     * -course distinction that no other SEAS file in this repo has. Every other
     * major treats those two as alternatives; Computer Engineering requires
     * both. Encode `intro-programming` as `all_of ["COMS W1004"]`, or fold
     * `ENGI E1006` into it the way Mechanical Engineering and IEOR do, and this
     * complete student is told they are missing two requirements.
     *
     * `COMS W1007` and `COMS W3137` are not in our live catalog. They resolve
     * here because `buildCatalog` derives membership from the courses the
     * program names — which is exactly the "we cannot tell whether it was
     * retired or merely never scheduled" case, and why the codes stay.
     */
    programId: "seas-major-computer-engineering",
    taken: [
      "COMS W1007",
      "COMS W3137",
      "STAT GU4203",
      "ENGI E1006",
      "ENGI E1102",
      "ELEN E1201",
      "COMS W3203",
    ],
    expect: {
      "intro-programming": { status: "satisfied", completed: 1 },
      "data-structures": { status: "satisfied", completed: 1 },
      probability: { status: "satisfied", completed: 1 },
      "engineering-foundations": { status: "satisfied", completed: 3 },
      "discrete-mathematics": { status: "satisfied", completed: 1 },
    },
    verified: "2026-08-26",
  },
  {
    id: "compe-surplus-core-electives-and-mixed-physics",
    who: "Computer Engineering major who took five of the six choose-three Core Required Courses, and who took PHYS UN1601 and PHYS UN2802 — the first term of sequence 2 and the second term of sequence 3.",
    /*
     * Two independent edge cases in one record.
     *
     * The `n_of { n: 3 }` must report satisfied AT 3, not 5 of 3 — the card
     * cannot claim a number larger than the requirement. The two leftovers are
     * genuine technical-elective points, and this program cannot say so:
     * `technical-electives` is `attested`, so the audit deliberately does not
     * claim credit it cannot prove. `seas-major-computer-science` guards the
     * same shape with `excludeGroups`; there is nothing here to exclude from.
     *
     * Meanwhile the physics pair is the mixed-sequence schedule `n_of { n: 2 }`
     * would wrongly pass: two terms of physics done, no sequence finished.
     */
    programId: "seas-major-computer-engineering",
    taken: [
      "CSEE W4119",
      "CSEE W4823",
      "CSEE W4824",
      "CSEE W4840",
      "CSEE W4868",
      "PHYS UN1601",
      "PHYS UN2802",
    ],
    expect: {
      "ce-core-electives": { status: "satisfied", completed: 3 },
      physics: { status: "in_progress", completed: 1 },
      "technical-electives": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Chemical Engineering
   * ---------------------------------------------------------------------- */
  {
    id: "cheme-accelerated-chemistry",
    who: "Chemical Engineering major on chemistry sequence 3 — intensive organic chemistry in the first year instead of general chemistry.",
    /*
     * The regression record for this program, and the direct analogue of
     * `econ-honors-math`. A student on the HARDEST chemistry route holds no
     * `CHEM UN1403`, no `CHEM UN1404` and no `CHEM UN2443`. Transcribed as a
     * one-lecture `n_of` (the MechE and IEOR shape) or as a two-course
     * BME-style sequence, they are told to go back and take general chemistry
     * after completing a harder sequence the Bulletin publishes as sufficient.
     *
     * The `physics-laboratory` line is a deliberate second check: `PHYS UN3081`
     * must satisfy the laboratory group and must NOT also count as a third term
     * of physics sequence 3.
     */
    programId: "seas-major-chemical-engineering",
    taken: [
      "CHEM UN2045",
      "CHEM UN2046",
      "CHEM UN1507",
      "PHYS UN2801",
      "PHYS UN2802",
      "PHYS UN3081",
      "MATH UN1101",
      "MATH UN1102",
      "APMA E2000",
      "APMA E2101",
    ],
    expect: {
      chemistry: { status: "satisfied", completed: 3 },
      physics: { status: "satisfied", completed: 2 },
      "physics-laboratory": { status: "satisfied", completed: 1 },
      calculus: { status: "satisfied", completed: 3 },
      "differential-equations": { status: "satisfied", completed: 1 },
      "advanced-natural-science-laboratory": { status: "unmet", completed: 0 },
      "chemical-engineering-core": { status: "unmet", completed: 0 },
      "engineering-foundations": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },
  {
    id: "cheme-mixed-chemistry-sequence",
    who: "Chemical Engineering major who took the first term of chemistry sequence 1 and then the second and third terms of sequence 3 — three chemistry courses, no completed sequence.",
    /*
     * The schedule a flat `n_of { n: 3 }` would wrongly pass. Every course is
     * real, the student has done three terms of chemistry, and they have
     * finished no sequence the department recognises.
     *
     * `sequence_choice` scores sequence 3 at 2 of 3 and sequence 1 at 1 of 4,
     * reports sequence 3, and leaves `CHEM UN2045` as what remains.
     */
    programId: "seas-major-chemical-engineering",
    taken: ["CHEM UN1403", "CHEM UN2046", "CHEM UN1507"],
    expect: {
      chemistry: { status: "in_progress", completed: 2 },
    },
    verified: "2026-08-26",
  },
  {
    id: "cheme-half-points-lab",
    who: "Chemical Engineering major who satisfied the advanced natural-science laboratory with the two 1.5-point organic half-labs.",
    /*
     * The record that distinguishes `points_matching` from `n_of`. Two half
     * labs are three points and finish the requirement; `n_of { n: 1 }` would
     * finish it after one, and `n_of { n: 2 }` would refuse a student who took
     * a single 3-point laboratory instead.
     *
     * A live-catalog defect sits underneath this, named rather than encoded:
     * our `courses` row for `CHEM UN2493` carries 0.00 points where the
     * Bulletin publishes 1.5, so the LIVE audit scores this student 1.5 of 3
     * and tells them to take another laboratory. The fixture states the
     * Bulletin's number (see `POINTS` above). Fixing the catalog is what closes
     * the gap; softening this expectation would only hide it.
     */
    programId: "seas-major-chemical-engineering",
    taken: ["CHEM UN2493", "CHEM UN2496"],
    expect: {
      "advanced-natural-science-laboratory": { status: "satisfied", completed: 3 },
    },
    verified: "2026-08-26",
  },
  {
    id: "cheme-one-half-lab-is-not-enough",
    who: "Chemical Engineering major who has taken one of the two organic half-labs and stopped.",
    /*
     * The control for the record above, and the half that actually pins the
     * rule kind: 1.5 of 3 points, in progress. Under `n_of { n: 1 }` — the
     * shape every other laboratory group in the SEAS files uses — this student
     * is told they are finished half a laboratory early.
     */
    programId: "seas-major-chemical-engineering",
    taken: ["CHEM UN2493"],
    expect: {
      "advanced-natural-science-laboratory": { status: "in_progress", completed: 1.5 },
    },
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Applied Mathematics
   * ---------------------------------------------------------------------- */
  {
    id: "apmath-math-department-track",
    who: "Applied Mathematics major who took every footnote-5 substitution — the Mathematics Department's courses rather than APAM's.",
    /*
     * The regression record for this program. One footnote offers four
     * one-for-one substitutions, and this student took all four: they hold none
     * of `APMA E3101`, `APMA E3102`, `APMA E4204` or `MATH GU4061`, and against
     * a naive `all_of` transcription of the grid they fail FOUR requirements at
     * once and are told to retake four courses they have already covered.
     *
     * The last expectation is the second thing this record protects. All seven
     * courses are MATH or APMA and every one is consumed by a named group, so
     * `math-apma-stat-elective` must read 0 of 3 points — not 3 of 3. Without
     * `excludeGroups` it reads satisfied and tells a student a senior-year
     * requirement is finished before they have taken a single extra course.
     * That is the `cs-electives` bug, reproduced.
     */
    programId: "seas-major-applied-mathematics",
    taken: [
      "MATH UN2010",
      "MATH UN3028",
      "MATH UN3007",
      "MATH UN2500",
      "APMA E4300",
      "APMA E4101",
      "APMA E4901",
    ],
    expect: {
      "linear-algebra": { status: "satisfied", completed: 1 },
      "partial-differential-equations": { status: "satisfied", completed: 1 },
      "complex-variables": { status: "satisfied", completed: 1 },
      analysis: { status: "satisfied", completed: 1 },
      "applied-mathematics-core": { status: "satisfied", completed: 2 },
      // E4901 done, E4903 not. Both are required, including the 0-point one.
      seminars: { status: "in_progress", completed: 1 },
      "math-apma-stat-elective": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-26",
  },
  {
    id: "apmath-accelerated-physics",
    who: "Applied Mathematics major on physics sequence 3 — Accelerated Physics, with the intermediate laboratory instead of a third lecture.",
    /*
     * The guard against folding `PHYS UN3081` into the physics sequence.
     * Sequence 3 is two courses, the laboratory is a separate requirement, and
     * the same course must not pay for both. If someone helpfully adds
     * `PHYS UN3081` as a third term, this record still passes but the course
     * starts showing up as cross-counted — which is what
     * `crossCountedCourseIds` is for.
     */
    programId: "seas-major-applied-mathematics",
    taken: ["PHYS UN2801", "PHYS UN2802", "PHYS UN3081"],
    expect: {
      physics: { status: "satisfied", completed: 2 },
      "physics-laboratory": { status: "satisfied", completed: 1 },
    },
    verified: "2026-08-26",
  },
  {
    id: "apmath-mixed-physics-sequence",
    who: "Applied Mathematics major who took the first term of physics sequence 1 and the second and third of sequence 2 — three terms of physics, no completed sequence.",
    /*
     * The schedule `n_of { n: 3 }` would wrongly pass. The student has genuinely
     * started sequence 2 and is two thirds through it, and has finished nothing.
     */
    programId: "seas-major-applied-mathematics",
    taken: ["PHYS UN1401", "PHYS UN1602", "PHYS UN2601"],
    expect: {
      physics: { status: "in_progress", completed: 2 },
    },
    verified: "2026-08-26",
  },
  {
    id: "apmath-transfer-physics",
    who: "Applied Mathematics transfer student who finished the physics sequence with the Barnard classical-waves course footnote 2 allows.",
    /*
     * Footnote 2 is the MechE footnote-3 failure in its Applied Mathematics
     * form: a per-term substitution that, if missed, marks a complete student
     * incomplete. `PHYS BC3001` replaces the third term of sequence 1 and
     * nothing else, which is why it is its own branch rather than an extra
     * course dropped into sequence 1's list.
     */
    programId: "seas-major-applied-mathematics",
    taken: ["PHYS UN1401", "PHYS UN1402", "PHYS BC3001", "PHYS UN1494"],
    expect: {
      physics: { status: "satisfied", completed: 3 },
      "physics-laboratory": { status: "satisfied", completed: 1 },
    },
    verified: "2026-08-26",
  },

  /* ---------------------------------------------------------------------- *
   * Barnard — Psychology
   *
   * Barnard's tables are not Columbia's with different codes; they are shaped
   * differently, and the shapes below are the three that a faithful-looking
   * transcription still gets wrong. All read from catalog.barnard.edu, which
   * is a different host on its own edition year.
   * ---------------------------------------------------------------------- */
  {
    id: "bc-psyc-lectures-one-sided",
    who: "Barnard Psychology major who took three lectures, all of them from Group 1.",
    /*
     * Barnard asks for "three lectures, at least one from each group". That is
     * one requirement in the catalogue and three groups here — Group 1, Group 2,
     * and a third from either — because the rule language has no way to say
     * "spanning". This student is the reason the split has to exist: three
     * lectures is the right COUNT and the wrong SPREAD, and an encoding that
     * only counted to three would call her finished while she still owes a
     * Group 2 lecture.
     *
     * The third-lecture group must still read satisfied. `excludeGroups`
     * removes what Group 1 actually CONSUMED — one course — not everything
     * Group 1 could have drawn from, so her two remaining Group 1 lectures are
     * hers to count here. Reading this as unmet would be the mirror error:
     * telling a student who has done three lectures that she has done one.
     */
    programId: "bc-major-psychology",
    taken: ["PSYC BC2107", "PSYC BC2110", "PSYC BC2115"],
    expect: {
      "lecture-group-1": { status: "satisfied", completed: 1 },
      "lecture-group-2": { status: "unmet", completed: 0 },
      "lecture-third": { status: "satisfied", completed: 1 },
    },
    verified: "2026-08-30",
  },
  {
    id: "bc-psyc-lectures-both-groups",
    who: "Barnard Psychology major with two Group 1 lectures and one Group 2. The control for the record above.",
    /*
     * The same three-lecture count, spread the way the catalogue asks. All
     * three groups close. If this record and the one above ever agree, the
     * split has stopped doing its job.
     */
    programId: "bc-major-psychology",
    taken: ["PSYC BC2107", "PSYC BC2110", "PSYC BC2125"],
    expect: {
      "lecture-group-1": { status: "satisfied", completed: 1 },
      "lecture-group-2": { status: "satisfied", completed: 1 },
      "lecture-third": { status: "satisfied", completed: 1 },
    },
    verified: "2026-08-30",
  },

  /* ---------------------------------------------------------------------- *
   * Barnard — Computer Science
   * ---------------------------------------------------------------------- */
  {
    id: "bc-cs-linear-algebra-and-probability-in-one-course",
    who: "Barnard Computer Science major who took MATH UN2015, the one course the department lets double count.",
    /*
     * Barnard publishes this in its own words: "MATH UN2015 can double count
     * for Linear Algebra and Probability requirements. This is the ONLY
     * instance a course can double count."
     *
     * So the two mathematics groups deliberately carry no `excludeGroups`
     * toward each other, and this record is what stops someone adding them
     * back as an obvious-looking tidy-up. The guard would be right everywhere
     * else in the major and wrong here, and its failure mode is the expensive
     * direction: a student who has satisfied both is told she still owes a
     * probability course, and takes a semester of one she does not need.
     */
    programId: "bc-major-computer-science",
    taken: ["MATH UN2015"],
    expect: {
      "math-linear-algebra": { status: "satisfied", completed: 1 },
      "math-probability": { status: "satisfied", completed: 1 },
    },
    verified: "2026-08-30",
  },
  {
    id: "bc-cs-separate-math-courses",
    who: "Barnard Computer Science major who took linear algebra and probability as two separate courses.",
    /*
     * The ordinary route, and the control that shows the record above is about
     * UN2015 specifically rather than about the two groups being loose. One
     * course each, both closed, nothing borrowed.
     */
    programId: "bc-major-computer-science",
    taken: ["MATH UN2010", "STAT UN1201"],
    expect: {
      "math-linear-algebra": { status: "satisfied", completed: 1 },
      "math-probability": { status: "satisfied", completed: 1 },
      "math-multivariable": { status: "unmet", completed: 0 },
    },
    verified: "2026-08-30",
  },

  /* ---------------------------------------------------------------------- *
   * Barnard — Economics
   * ---------------------------------------------------------------------- */
  {
    id: "bc-econ-half-thesis",
    who: "Barnard Economics major one term into the two-term senior thesis.",
    /*
     * The senior requirement is a choice between a year-long thesis
     * (ECON BC3061 then BC3062) and a one-term seminar (BC3063). A student who
     * has done the first half of the thesis has genuinely started and has
     * finished nothing — in progress, never satisfied. Getting this wrong in
     * the generous direction tells a senior in her last term that she is done.
     */
    programId: "bc-major-economics",
    taken: ["ECON BC3061"],
    expect: {
      "senior-requirement": { status: "in_progress" },
    },
    verified: "2026-08-30",
  },
  {
    id: "bc-econ-seminar-route",
    who: "Barnard Economics major who took the one-term Senior Seminar instead of the thesis.",
    /*
     * The other branch, which is one course long. It must close on that one
     * course — a `sequence_choice` that quietly required the longer branch
     * would fail every student who chose the published shorter one.
     *
     * NOT shown to her by any rule: choosing the seminar also obliges an
     * ADDITIONAL upper-level elective beyond the three the electives group
     * counts. That is in the group's note, because the rule cannot hold a
     * requirement whose size depends on which branch was taken.
     */
    programId: "bc-major-economics",
    taken: ["ECON BC3063"],
    expect: {
      "senior-requirement": { status: "satisfied" },
    },
    verified: "2026-08-30",
  },

  /* ---------------------------------------------------------------------- *
   * Barnard — Foundations
   * ---------------------------------------------------------------------- */
  {
    id: "bc-foundations-first-year",
    who: "Barnard first-year one term in: First-Year Writing, First-Year Seminar, and a PE class.",
    /*
     * The three groups of Foundations that are actually checkable. Nine of the
     * thirteen are `attested` — the Distributionals and the six Modes of
     * Thinking are certified by approved lists that live in a client-rendered
     * Slate portal, and `courses.requirement_flags` holds no Barnard flag, so
     * an `n_matching` over a Barnard flag would match zero courses forever
     * while rendering exactly like a finished requirement.
     *
     * This record pins the part we do not have to apologise for. Physical
     * Education matters more than it looks: it is `n_matching` over a subject
     * rather than a course list, so a wrong subject string matches nothing and
     * fails silently and permanently rather than erroring.
     *
     * Every code here was checked against the live `courses` table on
     * 2026-08-30. That check earned its keep: this record first used
     * `PHED BC1001`, which does not exist — Barnard's physical education row
     * is `PHED BC1004`. The group still went green, because an `n_matching`
     * over PHED cannot tell an invented PHED course from a real one. A
     * synthetic transcript is allowed to be synthetic; it is not allowed to
     * name courses that do not exist, or it stops being evidence.
     */
    programId: "bc-foundations",
    taken: ["FYWB BC1001", "FYSB BC1001", "PHED BC1004"],
    expect: {
      "first-year-writing": { status: "satisfied", completed: 1 },
      "first-year-seminar": { status: "satisfied", completed: 1 },
      "physical-education": { status: "satisfied", completed: 1 },
      "distributional-languages": { status: "unmet" },
    },
    verified: "2026-08-30",
  },
];

/* ==========================================================================
 * Running a record
 * ========================================================================== */

export interface GoldenRun {
  record: GoldenRecord;
  program: Program;
  result: ProgramResult;
}

/**
 * Evaluate one record.
 *
 * Throws rather than returns on a missing program or an unparseable code: both
 * mean the fixture itself is broken, and a broken fixture that degrades to a
 * passing test is worse than no fixture.
 */
export function runGolden(record: GoldenRecord): GoldenRun {
  const program = getProgram(record.programId);
  if (!program) {
    throw new Error(`golden record ${record.id}: no program "${record.programId}" is registered`);
  }

  const catalog = buildCatalog([program]);
  const lookup: CourseLookup = (courseId) => catalog.get(courseId);

  const entries = [
    ...record.taken.map((code) => ({ code, planned: false })),
    ...(record.planned ?? []).map((code) => ({ code, planned: true })),
  ];

  const taken = entries.map(({ code, planned }) => {
    const courseId = toCourseId(code);
    if (!courseId) {
      /*
       * A code we cannot even parse is different from one we cannot resolve.
       * The `transfer-unknown-courses` record relies on unresolvable-but-
       * parseable codes reaching the evaluator, so this only fires on genuine
       * fixture typos.
       */
      throw new Error(`golden record ${record.id}: unparseable code "${code}"`);
    }
    return { courseId, termCode: null, planned };
  });

  return { record, program, result: evaluateProgram(program, { taken, lookup }) };
}
