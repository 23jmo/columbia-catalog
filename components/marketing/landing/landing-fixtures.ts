import { vergilSectionUrl } from "@/lib/constants";
import { formatCourseId } from "@/lib/requirements/code";
import type { RemainingRequirement } from "@/lib/profile/audit";
import type { FeedCard, FeedSectionView } from "@/lib/recommend/feed";
import { toolLabel } from "@/lib/agent/transcript";
import type { CitedCourse, ToolActivity } from "@/lib/agent/transcript";
import type { Meeting, ReputationSummary, ReviewDimensions } from "@/lib/types";

/**
 * What the landing page shows, typed as the real product types.
 *
 * ── Why a fixture and not a query ──────────────────────────────────────────
 *
 * `buildFeed` ranks against one student's record, and on `/` there is no such
 * student — the page only renders when `getSessionUser()` came back empty. A
 * "live" feed here could only be the feed for nobody, which is undifferentiated
 * catalog order and the least persuasive thing this page could show, and it
 * would put a Supabase round trip on the paint path of the one page whose job
 * is to keep a stranger from leaving.
 *
 * ── Why it is typed rather than drawn ──────────────────────────────────────
 *
 * Because the landing page renders `FeedCardView` and `OutstandingCard` — the
 * components the signed-in feed and the signed-in profile render — and these
 * are their inputs. Anything the card learns to show, the hero
 * shows too, and nothing here can describe a card the feed cannot produce:
 * the reason kinds, the caveats, the seat fields and the meeting shapes are
 * the real unions, so a change to any of them fails the typecheck here first.
 * The previous hero was a hand-drawn imitation, and imitations drift.
 *
 * ── What is real and what is illustrative ──────────────────────────────────
 *
 * The courses, instructors, call numbers and enrollment figures are Columbia's
 * Fall 2026 offerings as ingested (`lib/seed/coms-fall2026.json`). The
 * reasons, the reputation summaries and the two Core meeting patterns are
 * illustrative: a reason is a claim about a specific student's audit, so there
 * is no true value for a visitor we have never met. The frame says so.
 *
 * Nothing here implies a rating we do not have. Every reputation summary
 * carries its own `sampleSize`, because the card prints it and "4.6 off 88
 * reviews" is a different statement from "4.6 off two".
 */

const TERM_CODE = "20263";
const TERM_LABEL = "Fall 2026";

/** The stamp the seat chip prints beside every count. Spec §3. */
const AS_OF = "2026-08-22T21:00:00Z";

function reviews(
  dimensions: Partial<ReviewDimensions>,
  sampleSize: number,
): ReputationSummary {
  return {
    dimensions: {
      workload: null,
      difficulty: null,
      teachingQuality: null,
      gradingFairness: null,
      sentiment: null,
      wouldTakeAgain: null,
      ...dimensions,
    },
    sampleSize,
    dateRange: ["2021-09-14", "2026-05-02"],
    bySource: { culpa: sampleSize, reddit: 0 },
  };
}

/** Same time, several days — the shape `meetingLines` folds into one row. */
function weekly(
  weekdays: Meeting["weekday"][],
  startMinute: number,
  endMinute: number,
  buildingName: string,
  room: string,
): Meeting[] {
  return weekdays.map((weekday) => ({
    weekday,
    startMinute,
    endMinute,
    buildingName,
    room,
  }));
}

function section(
  courseId: string,
  sectionCode: string,
  callNumber: string,
  fields: Omit<
    FeedSectionView,
    | "sectionId"
    | "sectionCode"
    | "callNumber"
    | "termCode"
    | "termLabel"
    | "sourceAsOf"
    | "vergilUrl"
  >,
): FeedSectionView {
  return {
    sectionId: `${TERM_CODE}${courseId}${sectionCode}`,
    sectionCode,
    callNumber,
    termCode: TERM_CODE,
    termLabel: TERM_LABEL,
    sourceAsOf: AS_OF,
    vergilUrl: vergilSectionUrl(TERM_CODE, callNumber),
    ...fields,
  };
}

/**
 * Ranked, and deliberately not three of the same thing.
 *
 * Card 1 is the plain case — it counts, and it opens things up. Card 2 is the
 * strongest kind the engine emits, `interesting_and_counts`, where taste and
 * the audit agree. Card 3 is the honest one: the Core requirement everybody
 * has to clear, nearly full, carrying the prerequisite disclosure the card is
 * required to print. A hero of three flattering cards would be a worse
 * advertisement for a product whose pitch is that it tells you the truth.
 */
export const LANDING_FEED_CARDS: readonly FeedCard[] = [
  {
    courseId: "COMS3134W",
    code: formatCourseId("COMS3134W"),
    title: "DATA STRUCTURES IN JAVA",
    points: 3,
    score: 0.91,
    components: { requirementFit: 0.62, taste: 0.21, unlock: 0.08, offering: 0 },
    reasons: [
      {
        kind: "required",
        groupId: "cc-major-computer-science:core",
        groupLabel: "the Computer Science major core",
      },
      { kind: "unlocks", courseIds: ["COMS3157W", "COMS3261W", "COMS4111W"], unlockedCount: 14 },
    ],
    caveats: [],
    instructorReputation: reviews({ teachingQuality: 4.4, workload: 3.9 }, 63),
    best: section("COMS3134W", "001", "13534", {
      title: null,
      instructors: ["Brian Borowski"],
      meetings: weekly(["Mo", "We"], 610, 685, "Mudd Hall", "833"),
      timeKind: "published",
      estimatedFromTerm: null,
      enrollmentCount: 88,
      enrollmentCap: 175,
      waitlistCount: 0,
      waitlistCap: 0,
      status: "open",
      conflictsWithPlan: false,
    }),
    others: [],
  },
  {
    courseId: "COMS4160W",
    code: formatCourseId("COMS4160W"),
    title: "COMPUTER GRAPHICS",
    points: 3,
    score: 0.84,
    components: { requirementFit: 0.44, taste: 0.37, unlock: 0.03, offering: 0 },
    reasons: [
      {
        kind: "interesting_and_counts",
        groupId: "cc-major-computer-science:track",
        groupLabel: "a Computer Science track elective",
        similarTo: ["COMS3134W"],
      },
      { kind: "unlocks", courseIds: ["COMS4162W"], unlockedCount: 5 },
    ],
    caveats: [],
    instructorReputation: reviews({ teachingQuality: 4.7, workload: 3.1 }, 21),
    best: section("COMS4160W", "001", "13656", {
      title: null,
      instructors: ["Silvia Sellan"],
      meetings: weekly(["Tu", "Th"], 970, 1045, "Pupin Laboratories", "428"),
      timeKind: "published",
      estimatedFromTerm: null,
      enrollmentCount: 66,
      enrollmentCap: 80,
      waitlistCount: 0,
      waitlistCap: 0,
      status: "open",
      conflictsWithPlan: false,
    }),
    others: [],
  },
  {
    courseId: "HUMA1001W",
    code: formatCourseId("HUMA1001W"),
    title: "LITERATURE HUMANITIES I",
    points: 4,
    score: 0.78,
    components: { requirementFit: 0.71, taste: 0.02, unlock: 0, offering: 0 },
    reasons: [
      {
        kind: "required",
        groupId: "cc-core:literature-humanities",
        groupLabel: "the Core Curriculum's Literature Humanities",
      },
    ],
    caveats: [
      {
        kind: "prereq_unknown",
        advisories: ["Open to first-year students in Columbia College only."],
        outstanding: [],
      },
    ],
    instructorReputation: reviews({ teachingQuality: 4.3, workload: 4.6 }, 88),
    best: section("HUMA1001W", "042", "11642", {
      title: null,
      instructors: ["Molly Murray"],
      meetings: weekly(["Tu", "Th"], 610, 720, "Hamilton Hall", "301"),
      timeKind: "published",
      estimatedFromTerm: null,
      enrollmentCount: 19,
      enrollmentCap: 20,
      waitlistCount: 0,
      waitlistCap: 0,
      status: "open",
      conflictsWithPlan: false,
    }),
    others: [],
  },
];

/**
 * An outstanding-requirement list, in `auditProfile`'s own order.
 *
 * Rendered by the real `OutstandingCard`, so the ordering rule the profile
 * page depends on is visible here too: requirements whose rule names specific
 * courses first, then the ones matched by a registrar flag, then the ones a
 * student certifies with an adviser. That order is the product's argument — a
 * requirement one click from progress is not the same job as one that needs a
 * conversation — and a drawn list of five identical rows was quietly denying
 * it existed.
 *
 * A Columbia College second-year with a declared Computer Science major: the
 * groups are the real ones in `lib/requirements/programs`, and how far along
 * this particular student is, is the illustrative part.
 */
export const LANDING_OUTSTANDING: readonly RemainingRequirement[] = [
  {
    programId: "cc-core",
    programName: "The Core Curriculum",
    groupId: "contemporary-civilization",
    label: "Contemporary Civilization",
    outstanding: 2,
    unit: "courses",
    verification: "exact",
    candidates: ["CCIS1101W", "CCIS1102W"],
  },
  {
    programId: "cc-core",
    programName: "The Core Curriculum",
    groupId: "art-humanities",
    label: "Art Humanities",
    outstanding: 1,
    unit: "courses",
    verification: "exact",
    candidates: ["HUMA1121W"],
  },
  {
    programId: "cc-major-computer-science",
    programName: "Computer Science major",
    groupId: "track-electives",
    label: "Track electives",
    outstanding: 3,
    unit: "courses",
    verification: "exact",
    candidates: ["COMS4160W", "COMS4111W", "COMS4118W"],
  },
  {
    programId: "cc-core",
    programName: "The Core Curriculum",
    groupId: "global-core",
    label: "Global Core",
    outstanding: 2,
    unit: "courses",
    verification: "flagged",
    candidates: [],
  },
  {
    programId: "cc-core",
    programName: "The Core Curriculum",
    groupId: "science-a",
    label: "Science Requirement (Category A)",
    outstanding: 1,
    unit: "courses",
    verification: "flagged",
    candidates: [],
  },
  {
    programId: "cc-core",
    programName: "The Core Curriculum",
    groupId: "foreign-language",
    label: "Foreign language",
    outstanding: 1,
    unit: "courses",
    verification: "attested",
    candidates: [],
  },
];

/* ── The advisor band ────────────────────────────────────────────────────── */

/**
 * One turn of `/chat`, typed as the agent's own transcript types.
 *
 * Same bargain as the feed fixture above. `ToolActivity` and `CitedCourse` are
 * what `lib/agent/transcript.ts` hands the thread after a real run, so the
 * band renders the real `TaskList`, the real `AssistantMarkdown` and the real
 * `SourceList` rather than a drawing of them. If a tool is renamed or a label
 * rewritten, `toolLabel()` moves this band with it.
 *
 * The question is the one this page has been claiming a ranked list cannot
 * answer — "which of these leaves Friday free" — because the band exists to
 * say what the box is FOR, and a demo asking "what should I take?" would only
 * show the assistant doing the feed's job worse.
 *
 * The tool names are real and in a plausible order for that question: read the
 * student's record, check the degree, rank, then check the week for clashes.
 * The prose is illustrative for the same reason the feed's reasons are — there
 * is no true answer for a visitor whose record we have never seen.
 */
export const LANDING_ADVISOR_QUESTION =
  "I have 4 slots left and I want Fridays free. What should I drop?";

export const LANDING_ADVISOR_ACTIVITY: readonly ToolActivity[] = [
  "get_courses_taken",
  "get_unmet_requirements",
  "recommend_courses",
  "check_conflicts",
].map((name, index) => ({
  toolCallId: `landing-${index}`,
  name,
  label: toolLabel(name),
  state: "done" as const,
}));

export const LANDING_ADVISOR_ANSWER = [
  "Drop **COMS W4160 Computer Graphics**. It is the only one of the four that",
  "meets on a Friday, and it is a track elective. Three other courses satisfy",
  "that same slot, and two of them run again in the spring.",
  "",
  "Keeping it costs you the Friday and finishes nothing. **COMS W3134** and",
  "**HUMA W1001** both close out requirements you cannot defer, so those stay.",
].join("\n");

export const LANDING_ADVISOR_SOURCES: readonly CitedCourse[] = [
  { courseId: "COMS4162W", code: formatCourseId("COMS4162W"), title: "Advanced Computer Graphics", source: "recommend_courses" },
  { courseId: "COMS4701W", code: formatCourseId("COMS4701W"), title: "Artificial Intelligence", source: "recommend_courses" },
  { courseId: "COMS4771W", code: formatCourseId("COMS4771W"), title: "Machine Learning", source: "recommend_courses" },
  { courseId: "COMS3251W", code: formatCourseId("COMS3251W"), title: "Computational Linear Algebra", source: "recommend_courses" },
  { courseId: "COMS3157W", code: formatCourseId("COMS3157W"), title: "Advanced Programming", source: "get_unmet_requirements" },
];

/* ── The setup band ──────────────────────────────────────────────────────── */

/**
 * The coursework screen's two chip decks, as `courseChipLines` wants them.
 *
 * Step 2 of onboarding is the one worth showing, because it is the only step
 * that does something for the student before they have done anything: it
 * arrives already filled in. A picture of a school picker would be a picture
 * of a dropdown.
 *
 * Ids, not printed codes. `formatCourseId` turns `HUMA1001W` into
 * `HUMA W1001`, which is the form the chip prints under the title — and
 * hardcoding the printed form is how the hero once ended up showing
 * "COMS 3134" beside "COMS W3134" on adjacent cards.
 */
export const LANDING_TAKEN: readonly { code: string; title: string }[] = [
  { code: formatCourseId("ENGL1010CC"), title: "University Writing" },
  { code: formatCourseId("MATH1101UN"), title: "Calculus I" },
  { code: formatCourseId("SCNC1000CC"), title: "Frontiers of Science" },
  { code: formatCourseId("COMS1004W"), title: "Introduction to Computer Science and Programming in Java" },
];

export const LANDING_SUGGESTED: readonly { code: string; title: string }[] = [
  { code: formatCourseId("MATH1102UN"), title: "Calculus II" },
  { code: formatCourseId("COMS3203W"), title: "Discrete Mathematics" },
];
