/**
 * LionPlan — authoritative shared domain types.
 *
 * Every module imports from here. Do not redefine these shapes locally and do
 * not edit this file without coordinating: parsers, the search index builder,
 * the database layer, the API routes, the MCP server and the UI all depend on
 * it simultaneously.
 */

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

/** Columbia term code: `YYYY` + season digit. `20263` = Fall 2026. */
export type TermCode = string;

export type Season = "Spring" | "Summer" | "Fall";

export interface Term {
  termCode: TermCode;
  season: Season;
  year: number;
  /** Human label used in directory URLs, e.g. "Fall2026". */
  directoryLabel: string;
  /** Display label, e.g. "Fall 2026". */
  label: string;
  startsOn?: string;
  endsOn?: string;
  addDropDeadline?: string;
  isRegisterable: boolean;
  isArchived: boolean;
}

// ---------------------------------------------------------------------------
// Campus geography
// ---------------------------------------------------------------------------

export type CampusZone =
  | "morningside"
  | "barnard"
  | "manhattanville"
  | "cuimc"
  | "other"
  | "unknown";

export interface Building {
  buildingId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  campusZone: CampusZone;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface Subject {
  subjectCode: string;
  subjectName: string;
  /** Owning school/division as printed on the directory index. */
  school: string | null;
}

/**
 * Curriculum flags carried on the course record. Stored as JSONB; only the
 * flags we actually surface are named here, the rest ride along untyped.
 */
export interface RequirementFlags {
  globalCore?: boolean;
  scienceRequirement?: boolean;
  scienceWithLab?: boolean;
  artsAndHumanities?: boolean;
  socialScience?: boolean;
  language?: boolean;
  physicalEducation?: boolean;
  firstYearSeminar?: boolean;
  // Barnard "Ways of Knowing"
  thinkingLocally?: boolean;
  thinkingThroughGlobalInquiry?: boolean;
  thinkingAboutSocialDifference?: boolean;
  thinkingWithHistoricalPerspective?: boolean;
  thinkingQuantitativelyAndEmpirically?: boolean;
  thinkingTechnologicallyAndDigitally?: boolean;
  // "Nine Ways of Knowing"
  culturesInComparison?: boolean;
  ethicsAndValues?: boolean;
  historicalStudies?: boolean;
  laboratoryScience?: boolean;
  literature?: boolean;
  quantitativeAndDeductiveReasoning?: boolean;
  socialAnalysis?: boolean;
  visualAndPerformingArts?: boolean;
  [key: string]: boolean | undefined;
}

export interface Course {
  /** Stable id: `${subjectCode}${number}${qualifier}` e.g. "COMS4113W". */
  courseId: string;
  subjectCode: string;
  /** Numeric course number, e.g. 4113. */
  number: number;
  /** Qualifier/suffix letter, e.g. "W". */
  qualifier: string | null;
  title: string;
  description: string | null;
  pointsMin: number | null;
  pointsMax: number | null;
  prerequisiteText: string | null;
  department: string | null;
  requirementFlags: RequirementFlags;
}

export type EnrollmentStatusCode = "open" | "full" | "waitlist" | "closed" | "unknown";

export interface Section {
  /** `${termCode}${courseId}${sectionCode}` e.g. "20263COMS4113W001". */
  sectionId: string;
  courseId: string;
  termCode: TermCode;
  /** Registrar call number used to actually register. */
  callNumber: string;
  /** Zero-padded section, e.g. "001". */
  sectionCode: string;
  /**
   * The section's OWN title, when it has one distinct from the course's.
   *
   * Columbia prints it as the `<h1>` inside `div.course-details` on each row of
   * a subject index page. Container courses are why it matters: PHED1001UN is
   * "PHYSICAL EDUCATION ACTIVITIES" across all 64 of its sections, which are
   * "PHED: Swim (Beginner)", "PHED: Diving", "PHED: Walk to Run" and 26 more.
   * COMS6998E is "TOPICS IN COMPUTER SCIENCE" over 20 unrelated seminars.
   *
   * Stored RAW, including when it merely repeats the course title -- which it
   * does on an ordinary course, where every row carries the course's own name.
   * The "is this worth showing" judgement lives downstream in
   * `isDistinctSectionTitle`, so the record stays faithful to the page and one
   * predicate decides for every surface.
   *
   * Optional rather than `| null` so nothing that builds a `Section` today has
   * to change.
   */
  title?: string | null;
  component: string | null;
  methodOfInstruction: string | null;
  gradingMode: string | null;
  minUnit: number | null;
  maxUnit: number | null;
  instructors: string[];
  meetings: Meeting[];
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  waitlistCount: number | null;
  waitlistCap: number | null;
  status: EnrollmentStatusCode;
  /** The directory's own "as of" timestamp, ISO 8601. Provenance, always shown. */
  sourceAsOf: string | null;
  /** When our pipeline last successfully read this section. */
  lastSeenAt: string | null;
  /** Canonical directory URL for this section. */
  detailUrl: string | null;
  note: string | null;
  openTo: string | null;
}

export type Weekday = "Mo" | "Tu" | "We" | "Th" | "Fr" | "Sa" | "Su";

export interface Meeting {
  weekday: Weekday;
  /** Minutes from midnight, local. 13:10 → 790. */
  startMinute: number;
  endMinute: number;
  buildingName: string | null;
  room: string | null;
}

/** A course with its sections attached — the unit rendered by search. */
export interface CourseWithSections extends Course {
  sections: Section[];
}

// ---------------------------------------------------------------------------
// Enrollment history
// ---------------------------------------------------------------------------

export interface EnrollmentSnapshot {
  sectionId: string;
  observedAt: string;
  enrollmentCount: number;
  enrollmentCap: number;
  waitlistCount: number | null;
  status: EnrollmentStatusCode;
}

export type RegistrationMilestoneKind =
  | "registration_open"
  | "appointment_window"
  | "add_drop_deadline"
  | "term_start";

export interface RegistrationMilestone {
  termCode: TermCode;
  kind: RegistrationMilestoneKind;
  label: string;
  occursAt: string;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchFilters {
  /** Free-text query. */
  q?: string;
  termCode?: TermCode;
  subjects?: string[];
  schools?: string[];
  instructors?: string[];
  /** Inclusive course-number range, e.g. [1000, 3999]. */
  levelRange?: [number, number];
  creditsMin?: number;
  creditsMax?: number;
  days?: Weekday[];
  /** Minutes from midnight. */
  startAfterMinute?: number;
  endBeforeMinute?: number;
  openSeatsOnly?: boolean;
  requirements?: string[];
  maxWorkload?: number;
  minTeachingQuality?: number;
  /** When false, courses with no review coverage are excluded. Default true. */
  includeUnrated?: boolean;
}

export interface SearchHit {
  courseId: string;
  score: number;
  /** Section ids that matched section-level filters, if any were active. */
  matchedSectionIds: string[] | null;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  /** Milliseconds spent in the local engine — surfaced in dev, asserted in tests. */
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Reviews & reputation
// ---------------------------------------------------------------------------

export type ReviewSourceKind = "culpa" | "reddit";

export interface ReviewDimensions {
  /** All 1–5 unless noted. Null means the review carried no signal. */
  workload: number | null;
  difficulty: number | null;
  teachingQuality: number | null;
  gradingFairness: number | null;
  /** -1..1 */
  sentiment: number | null;
  wouldTakeAgain: boolean | null;
}

export interface ReviewRecord extends ReviewDimensions {
  reviewId: string;
  source: ReviewSourceKind;
  courseId: string | null;
  instructorName: string | null;
  postedAt: string | null;
  url: string;
  excerpt: string | null;
}

/**
 * Aggregated reputation. Course and instructor are scored SEPARATELY and only
 * combine for a specific section — never averaged into one number.
 */
export interface ReputationSummary {
  /** Mean of each dimension across contributing reviews. */
  dimensions: ReviewDimensions;
  sampleSize: number;
  /** ISO dates of the oldest and newest contributing review. */
  dateRange: [string, string] | null;
  /** Per-source counts, shown verbatim. No confidence label is derived. */
  bySource: Record<ReviewSourceKind, number>;
}

export interface InstructorProfile {
  name: string;
  uni: string | null;
  reputation: ReputationSummary | null;
  /** Live-fetched at view time, attributed, never persisted. */
  rmp: RmpSnapshot | null;
  coursesTaught: string[];
}

/** Fetched live when a drawer opens. Never written to our database. */
export interface RmpSnapshot {
  rating: number | null;
  difficulty: number | null;
  wouldTakeAgainPercent: number | null;
  numRatings: number | null;
  profileUrl: string;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export interface Plan {
  planId: string;
  userId: string;
  termCode: TermCode;
  name: string;
  isPrimary: boolean;
  sectionIds: string[];
  customBlocks: CustomBlock[];
}

/** A non-course commitment. Participates fully in conflict + commute checks. */
export interface CustomBlock {
  blockId: string;
  label: string;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
}

export type ConflictKind = "overlap" | "commute" | "duplicate_course";

export interface ScheduleConflict {
  kind: ConflictKind;
  severity: "hard" | "soft";
  message: string;
  /** Section ids or custom block ids involved. */
  involves: string[];
  weekday: Weekday;
}

export interface CommuteLeg {
  weekday: Weekday;
  fromLabel: string;
  toLabel: string;
  fromZone: CampusZone;
  toZone: CampusZone;
  /** Estimated walking minutes. */
  walkMinutes: number;
  /** Minutes actually available between the two meetings. */
  gapMinutes: number;
  feasible: boolean;
}

export interface PlanAnalysis {
  creditsMin: number;
  creditsMax: number;
  conflicts: ScheduleConflict[];
  commuteLegs: CommuteLeg[];
  /** Requirement keys satisfied by the plan's courses. */
  satisfiedRequirements: string[];
  daysWithNoClasses: Weekday[];
  totalWalkMinutesByDay: Partial<Record<Weekday, number>>;
}

// ---------------------------------------------------------------------------
// Watchlist & alerts
// ---------------------------------------------------------------------------

export interface Watch {
  userId: string;
  sectionId: string;
  createdAt: string;
}

export interface WatchWithState extends Watch {
  section: Section;
  /** How many users watch this section — shown upfront, deliberately. */
  watcherCount: number;
  /** Enrollment delta since the watch was created. */
  deltaSinceWatched: number | null;
}

// ---------------------------------------------------------------------------
// Ingest / crawl queue
// ---------------------------------------------------------------------------

export type CrawlJobKind =
  | "subject_term"
  | "section_detail"
  | "bulletin_department"
  | "subject_index"
  | "academic_calendar";

export type CrawlTier = "baseline" | "hot" | "registration";

export interface CrawlJob {
  jobId: string;
  kind: CrawlJobKind;
  /** Subject code, department slug, or other kind-specific key. */
  targetKey: string;
  termCode: TermCode | null;
  /** The URL a worker should fetch. */
  url: string;
  tier: CrawlTier;
  /** The recency cache: a job is due only when now() > nextFetchAt. */
  nextFetchAt: string;
  leasedUntil: string | null;
  leasedBy: string | null;
  lastOkAt: string | null;
  consecutiveFailures: number;
}

/** What a browser or cron worker posts back after fetching. */
export interface CrawlSubmission {
  jobId: string;
  leaseToken: string;
  ok: boolean;
  /** Raw HTML. The server parses; clients are never trusted to parse. */
  html?: string;
  error?: string;
  fetchedAt: string;
}

export interface IngestRunResult {
  jobId: string;
  recordsWritten: number;
  quarantined: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Parser outputs
// ---------------------------------------------------------------------------

export interface ParsedSubjectPage {
  subjectCode: string;
  termCode: TermCode;
  courses: ParsedCourse[];
}

export interface ParsedCourse {
  courseId: string;
  subjectCode: string;
  number: number;
  qualifier: string | null;
  title: string;
  sections: ParsedSection[];
}

export interface ParsedSection {
  sectionId: string;
  courseId: string;
  termCode: TermCode;
  callNumber: string;
  sectionCode: string;
  title: string;
  pointsMin: number | null;
  pointsMax: number | null;
  instructors: string[];
  enrollmentCount: number | null;
  enrollmentCap: number | null;
  status: EnrollmentStatusCode;
  sourceAsOf: string | null;
  detailUrl: string | null;
  meetings: Meeting[];
}

export interface ParsedSectionDetail extends ParsedSection {
  description: string | null;
  prerequisiteText: string | null;
  department: string | null;
  gradingMode: string | null;
  component: string | null;
  methodOfInstruction: string | null;
  note: string | null;
  openTo: string | null;
  approvalsRequired: string | null;
}

/** Bulletin rows carry the meeting times the directory omits. */
export interface ParsedBulletinRow {
  courseCode: string;
  sectionCode: string;
  callNumber: string | null;
  meetings: Meeting[];
  instructor: string | null;
  points: number | null;
  enrollmentCount: number | null;
  enrollmentCap: number | null;
}
