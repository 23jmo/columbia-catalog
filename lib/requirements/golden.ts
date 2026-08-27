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
