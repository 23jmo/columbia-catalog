/**
 * Hand-written row types for the Columbia Catalog Postgres schema, plus the
 * mappers that convert them to and from the domain types in `@/lib/types`.
 *
 * This file is the ONLY place snake_case becomes camelCase. Nothing outside
 * `lib/db` should ever see a `*Row` type, and nothing inside `lib/db` should
 * hand a raw row to a caller.
 *
 * These types are written by hand rather than generated so they can be
 * reviewed against the migrations in `supabase/migrations/**` line by line.
 * When a migration changes a column, change it here in the same commit.
 */

import { z } from "zod";

import type {
  Building,
  CampusZone,
  Course,
  CrawlJob,
  CrawlJobKind,
  CrawlTier,
  CustomBlock,
  EnrollmentSnapshot,
  EnrollmentStatusCode,
  Meeting,
  RegistrationMilestone,
  RegistrationMilestoneKind,
  RequirementFlags,
  ReviewRecord,
  ReviewSourceKind,
  Season,
  Section,
  Subject,
  Term,
  TermCode,
  Watch,
  Weekday,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * PostgREST serializes `numeric` as an unquoted JSON number, but a driver or a
 * proxy that stringifies large numerics would silently hand back a string.
 * Every numeric column goes through here so one bad assumption cannot become a
 * NaN in a credit total.
 */
function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function int(value: number | string | null | undefined): number | null {
  const n = num(value);
  return n === null ? null : Math.round(n);
}

/**
 * The Directory of Classes prints its "as of" stamp as prose
 * ("August 22, 2026"). We keep that string verbatim for display and store a
 * parsed timestamp alongside it for ordering. This produces the parsed half.
 */
export function parseSourceAsOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// Untrusted-input validation
// ---------------------------------------------------------------------------

/**
 * `requirement_flags` is JSONB, so at the type level it is `unknown` no matter
 * what the migration's CHECK constraint says. This is the one genuinely
 * untrusted read in the catalog path — an ingest bug or a hand-edited row
 * could put anything in there — so it is validated rather than cast.
 *
 * Non-boolean values are dropped rather than rejected: a single malformed flag
 * must not blank out a course page.
 */
export const requirementFlagsSchema = z
  .record(z.string(), z.unknown())
  .transform((raw): RequirementFlags => {
    const out: RequirementFlags = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "boolean") out[key] = value;
    }
    return out;
  });

export function parseRequirementFlags(value: Json | null | undefined): RequirementFlags {
  if (value === null || value === undefined) return {};
  const parsed = requirementFlagsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export const weekdaySchema = z.enum(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
export const enrollmentStatusSchema = z.enum(["open", "full", "waitlist", "closed", "unknown"]);
export const crawlTierSchema = z.enum(["baseline", "hot", "registration"]);
export const crawlJobKindSchema = z.enum([
  "subject_term",
  "section_detail",
  "bulletin_department",
  "subject_index",
  "academic_calendar",
]);

/** Minutes from midnight. 0..1440 inclusive, matching the CHECK constraint. */
export const minuteSchema = z.number().int().min(0).max(1440);

/** A meeting as it arrives from a parser — the untrusted side of ingest. */
export const meetingInputSchema = z
  .object({
    weekday: weekdaySchema,
    startMinute: minuteSchema,
    endMinute: minuteSchema,
    buildingName: z.string().nullable().default(null),
    room: z.string().nullable().default(null),
  })
  .refine((m) => m.endMinute >= m.startMinute, {
    message: "endMinute must not precede startMinute",
  });

/** What a browser or cron worker posts back. Clients are never trusted. */
export const crawlSubmissionSchema = z.object({
  jobId: z.string().uuid(),
  leaseToken: z.string().uuid(),
  ok: z.boolean(),
  html: z.string().max(8 * 1024 * 1024).optional(),
  error: z.string().max(2000).optional(),
  fetchedAt: z.string(),
});

export type CrawlSubmissionInput = z.infer<typeof crawlSubmissionSchema>;

// ---------------------------------------------------------------------------
// Row types — catalog (0001_catalog.sql)
// ---------------------------------------------------------------------------

export type TermRow = {
  term_code: string;
  season: Season;
  year: number;
  directory_label: string;
  label: string;
  starts_on: string | null;
  ends_on: string | null;
  add_drop_deadline: string | null;
  is_registerable: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type SubjectRow = {
  subject_code: string;
  subject_name: string;
  school: string | null;
  created_at: string;
  updated_at: string;
};

export type BuildingRow = {
  building_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  campus_zone: CampusZone;
  created_at: string;
  updated_at: string;
};

export type InstructorRow = {
  instructor_id: string;
  full_name: string;
  /** Generated column: never written. */
  normalized_name: string;
  uni: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseRow = {
  course_id: string;
  subject_code: string;
  course_number: number;
  qualifier: string | null;
  title: string;
  description: string | null;
  points_min: number | null;
  points_max: number | null;
  prerequisite_text: string | null;
  corequisite_text: string | null;
  department: string | null;
  requirement_flags: Json;
  created_at: string;
  updated_at: string;
};

export type SectionRow = {
  section_id: string;
  course_id: string;
  term_code: string;
  /** Denormalized from courses, maintained by trg_sections_fill_subject. */
  subject_code: string;
  call_number: string;
  section_code: string;
  /**
   * The section's own title from the directory row's <h1>, migration 0017.
   * Often repeats the course title; stored faithfully either way and
   * suppressed downstream rather than at ingest.
   */
  title: string | null;
  component: string | null;
  method_of_instruction: string | null;
  grading_mode: string | null;
  min_unit: number | null;
  max_unit: number | null;
  enrollment_count: number | null;
  enrollment_cap: number | null;
  waitlist_count: number | null;
  waitlist_cap: number | null;
  status: EnrollmentStatusCode;
  source_as_of: string | null;
  source_as_of_raw: string | null;
  last_seen_at: string | null;
  detail_url: string | null;
  note: string | null;
  open_to: string | null;
  created_at: string;
  updated_at: string;
};

export type MeetingRow = {
  meeting_id: string;
  section_id: string;
  weekday: Weekday;
  start_minute: number;
  end_minute: number;
  building_id: string | null;
  building_name: string | null;
  room: string | null;
  created_at: string;
};

export type SectionInstructorRow = {
  section_id: string;
  instructor_id: string;
  position: number;
};

/**
 * The shape a nested PostgREST select produces:
 *
 *   .select("*, meetings(*), section_instructors(position, instructors(full_name))")
 *
 * Embedded relations arrive as arrays (or a single object for a to-one
 * relation), and are absent entirely when not requested.
 */
export interface SectionRowWithRelations extends SectionRow {
  meetings?: MeetingRow[] | null;
  section_instructors?: Array<{
    position: number | null;
    instructors: { full_name: string } | { full_name: string }[] | null;
  }> | null;
}

export interface CourseRowWithSections extends CourseRow {
  sections?: SectionRowWithRelations[] | null;
}

// ---------------------------------------------------------------------------
// Row types — history (0002_history.sql)
// ---------------------------------------------------------------------------

export type EnrollmentSnapshotRow = {
  section_id: string;
  observed_at: string;
  enrollment_count: number;
  enrollment_cap: number | null;
  waitlist_count: number | null;
  status: EnrollmentStatusCode;
};

export type RegistrationMilestoneRow = {
  milestone_id: string;
  term_code: string;
  kind: RegistrationMilestoneKind;
  label: string;
  occurs_at: string;
  ends_at: string | null;
  audience: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Row types — crawl (0003_crawl.sql)
// ---------------------------------------------------------------------------

export type CrawlJobRow = {
  job_id: string;
  kind: CrawlJobKind;
  target_key: string;
  term_code: string | null;
  url: string;
  tier: CrawlTier;
  next_fetch_at: string;
  leased_until: string | null;
  leased_by: string | null;
  lease_token: string | null;
  last_ok_at: string | null;
  last_failed_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  lease_count: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type IngestRunStatus = "running" | "ok" | "failed" | "quarantined";

export type IngestRunRow = {
  run_id: string;
  job_id: string | null;
  kind: CrawlJobKind | null;
  target_key: string | null;
  term_code: string | null;
  worker_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: IngestRunStatus;
  records_written: number;
  quarantined: boolean;
  records_seen: number | null;
  previous_records: number | null;
  notes: string | null;
};

/**
 * Migration 0007. The shape of the last run that was actually COMMITTED for a
 * quarantine key — deliberately not the last `ingest_runs` row, which also
 * records refusals. Ratcheting this down to a rejected parse's output would let
 * the next equally-broken parse through.
 */
export type IngestFingerprintRow = {
  /** `${kind}:${target_key}:${term_code ?? "-"}`. */
  ingest_key: string;
  record_count: number;
  filled_field_count: number;
  captured_at: string;
  updated_at: string;
};

/**
 * Migration 0007. Ledger backing the per-client hourly request ceiling
 * (spec §10). `client_id` is an opaque browser id and must never be a user id:
 * this table must not become a way to attribute crawl traffic to a person.
 */
export type ClientLeaseRow = {
  lease_id: number;
  client_id: string;
  job_count: number;
  leased_at: string;
};

// ---------------------------------------------------------------------------
// Row types — reviews (0004_reviews.sql)
// ---------------------------------------------------------------------------

export type ReviewSourceRow = {
  source_id: string;
  /** Only ever 'culpa' or 'reddit'. RateMyProfessor is never stored. */
  kind: ReviewSourceKind;
  name: string;
  base_url: string | null;
  license_note: string | null;
  created_at: string;
};

export type ReviewRawRow = {
  review_id: string;
  source_id: string;
  source_review_key: string | null;
  subject_ref: string | null;
  instructor_id: string | null;
  course_id: string | null;
  posted_at: string | null;
  body: string | null;
  excerpt: string | null;
  url: string;
  fetched_at: string;
  created_at: string;
};

export type ReviewDimensionsRow = {
  review_id: string;
  workload: number | null;
  difficulty: number | null;
  teaching_quality: number | null;
  grading_fairness: number | null;
  sentiment: number | null;
  would_take_again: boolean | null;
  extracted_at: string;
  model_version: string;
};

// ---------------------------------------------------------------------------
// Row types — users (0005_users.sql)
// ---------------------------------------------------------------------------

export type UserRow = {
  user_id: string;
  email: string;
  google_sub: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanRow = {
  plan_id: string;
  user_id: string;
  term_code: string;
  name: string;
  is_primary: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanItemRow = {
  plan_id: string;
  section_id: string;
  position: number;
  added_at: string;
};

export type CustomBlockRow = {
  block_id: string;
  plan_id: string;
  label: string;
  weekday: Weekday;
  start_minute: number;
  end_minute: number;
  created_at: string;
};

export type WatchRow = {
  user_id: string;
  section_id: string;
  created_at: string;
  enrollment_count_at_watch: number | null;
  notify_email: boolean;
};

export type AlertSentRow = {
  alert_id: string;
  user_id: string;
  section_id: string;
  sent_at: string;
  reason: string;
  transition_at: string | null;
  channel: string;
};

export type McpTokenRow = {
  token_id: string;
  user_id: string;
  name: string;
  token_hash: string;
  token_prefix: string | null;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Insert shapes
// ---------------------------------------------------------------------------
// Columns with database defaults, generated columns and trigger-maintained
// columns are optional on insert. `subject_code` on sections is deliberately
// omitted from the writer's concern — the trigger owns it.

export type TermInsert = Omit<TermRow, "created_at" | "updated_at"> &
  Partial<Pick<TermRow, "created_at" | "updated_at">>;

export type SubjectInsert = Omit<SubjectRow, "created_at" | "updated_at"> &
  Partial<Pick<SubjectRow, "created_at" | "updated_at">>;

export type BuildingInsert = Omit<BuildingRow, "created_at" | "updated_at"> &
  Partial<Pick<BuildingRow, "created_at" | "updated_at">>;

export type InstructorInsert = Omit<
  InstructorRow,
  "instructor_id" | "normalized_name" | "created_at" | "updated_at"
> &
  Partial<Pick<InstructorRow, "instructor_id">>;

export type CourseInsert = Omit<CourseRow, "created_at" | "updated_at" | "requirement_flags"> & {
  requirement_flags?: Json;
} & Partial<Pick<CourseRow, "created_at" | "updated_at">>;

export type SectionInsert = Omit<
  SectionRow,
  "subject_code" | "created_at" | "updated_at"
> &
  Partial<Pick<SectionRow, "subject_code" | "created_at" | "updated_at">>;

export type MeetingInsert = Omit<MeetingRow, "meeting_id" | "created_at"> &
  Partial<Pick<MeetingRow, "meeting_id" | "created_at">>;

export type EnrollmentSnapshotInsert = EnrollmentSnapshotRow;

export type PlanInsert = Omit<PlanRow, "plan_id" | "created_at" | "updated_at"> &
  Partial<Pick<PlanRow, "plan_id" | "share_token" | "is_primary" | "name">>;

export type CustomBlockInsert = Omit<CustomBlockRow, "block_id" | "created_at"> &
  Partial<Pick<CustomBlockRow, "block_id">>;

export type WatchInsert = Omit<
  WatchRow,
  "created_at" | "enrollment_count_at_watch" | "notify_email"
> &
  Partial<Pick<WatchRow, "created_at" | "enrollment_count_at_watch" | "notify_email">>;

// ---------------------------------------------------------------------------
// Mappers — rows to domain
// ---------------------------------------------------------------------------

export function rowToTerm(row: TermRow): Term {
  return {
    termCode: row.term_code,
    season: row.season,
    year: row.year,
    directoryLabel: row.directory_label,
    label: row.label,
    startsOn: row.starts_on ?? undefined,
    endsOn: row.ends_on ?? undefined,
    addDropDeadline: row.add_drop_deadline ?? undefined,
    isRegisterable: row.is_registerable,
    isArchived: row.is_archived,
  };
}

export function termToRow(term: Term): TermInsert {
  return {
    term_code: term.termCode,
    season: term.season,
    year: term.year,
    directory_label: term.directoryLabel,
    label: term.label,
    starts_on: term.startsOn ?? null,
    ends_on: term.endsOn ?? null,
    add_drop_deadline: term.addDropDeadline ?? null,
    is_registerable: term.isRegisterable,
    is_archived: term.isArchived,
  };
}

export function rowToSubject(row: SubjectRow): Subject {
  return {
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
    school: row.school,
  };
}

export function subjectToRow(subject: Subject): SubjectInsert {
  return {
    subject_code: subject.subjectCode,
    subject_name: subject.subjectName,
    school: subject.school,
  };
}

export function rowToBuilding(row: BuildingRow): Building {
  return {
    buildingId: row.building_id,
    name: row.name,
    lat: num(row.lat),
    lng: num(row.lng),
    campusZone: row.campus_zone,
  };
}

export function buildingToRow(building: Building): BuildingInsert {
  return {
    building_id: building.buildingId,
    name: building.name,
    lat: building.lat,
    lng: building.lng,
    campus_zone: building.campusZone,
  };
}

export function rowToCourse(row: CourseRow): Course {
  return {
    courseId: row.course_id,
    subjectCode: row.subject_code,
    number: row.course_number,
    qualifier: row.qualifier,
    title: row.title,
    description: row.description,
    pointsMin: num(row.points_min),
    pointsMax: num(row.points_max),
    prerequisiteText: row.prerequisite_text,
    department: row.department,
    requirementFlags: parseRequirementFlags(row.requirement_flags),
  };
}

export function courseToRow(course: Course): CourseInsert {
  return {
    course_id: course.courseId,
    subject_code: course.subjectCode,
    course_number: course.number,
    qualifier: course.qualifier,
    title: course.title,
    description: course.description,
    points_min: course.pointsMin,
    points_max: course.pointsMax,
    prerequisite_text: course.prerequisiteText,
    corequisite_text: null,
    department: course.department,
    // Only true flags are stored, so the GIN containment index stays small and
    // `requirement_flags @> '{"globalCore":true}'` is the only query shape.
    requirement_flags: Object.fromEntries(
      Object.entries(course.requirementFlags).filter(([, v]) => v === true),
    ) as Json,
  };
}

export function rowToMeeting(row: MeetingRow): Meeting {
  return {
    weekday: row.weekday,
    startMinute: int(row.start_minute) ?? 0,
    endMinute: int(row.end_minute) ?? 0,
    buildingName: row.building_name,
    room: row.room,
  };
}

export function meetingToRow(meeting: Meeting, sectionId: string): MeetingInsert {
  return {
    section_id: sectionId,
    weekday: meeting.weekday,
    start_minute: meeting.startMinute,
    end_minute: meeting.endMinute,
    building_id: null,
    building_name: meeting.buildingName,
    room: meeting.room,
  };
}

/** Flattens the embedded `section_instructors(position, instructors(full_name))`. */
function instructorNamesFromRelation(row: SectionRowWithRelations): string[] {
  const links = row.section_instructors;
  if (!links || links.length === 0) return [];
  return [...links]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .flatMap((link) => {
      const embedded = link.instructors;
      if (!embedded) return [];
      return Array.isArray(embedded)
        ? embedded.map((i) => i.full_name)
        : [embedded.full_name];
    });
}

export function rowToSection(
  row: SectionRowWithRelations,
  overrides?: { meetings?: Meeting[]; instructors?: string[] },
): Section {
  const meetings =
    overrides?.meetings ??
    (row.meetings ?? [])
      .map(rowToMeeting)
      .sort((a, b) => a.startMinute - b.startMinute);

  return {
    sectionId: row.section_id,
    courseId: row.course_id,
    termCode: row.term_code,
    callNumber: row.call_number,
    sectionCode: row.section_code,
    title: row.title,
    component: row.component,
    methodOfInstruction: row.method_of_instruction,
    gradingMode: row.grading_mode,
    minUnit: num(row.min_unit),
    maxUnit: num(row.max_unit),
    instructors: overrides?.instructors ?? instructorNamesFromRelation(row),
    meetings,
    enrollmentCount: int(row.enrollment_count),
    enrollmentCap: int(row.enrollment_cap),
    waitlistCount: int(row.waitlist_count),
    waitlistCap: int(row.waitlist_cap),
    status: row.status,
    // Provenance rule: the directory's own printed stamp is what the UI shows.
    // The parsed timestamp is a fallback, not a replacement.
    sourceAsOf: row.source_as_of_raw ?? row.source_as_of,
    lastSeenAt: row.last_seen_at,
    detailUrl: row.detail_url,
    note: row.note,
    openTo: row.open_to,
  };
}

export function sectionToRow(section: Section): SectionInsert {
  return {
    section_id: section.sectionId,
    course_id: section.courseId,
    term_code: section.termCode,
    call_number: section.callNumber,
    section_code: section.sectionCode,
    title: section.title ?? null,
    component: section.component,
    method_of_instruction: section.methodOfInstruction,
    grading_mode: section.gradingMode,
    min_unit: section.minUnit,
    max_unit: section.maxUnit,
    enrollment_count: section.enrollmentCount,
    enrollment_cap: section.enrollmentCap,
    waitlist_count: section.waitlistCount,
    waitlist_cap: section.waitlistCap,
    status: section.status,
    source_as_of: parseSourceAsOf(section.sourceAsOf),
    source_as_of_raw: section.sourceAsOf,
    last_seen_at: section.lastSeenAt,
    detail_url: section.detailUrl,
    note: section.note,
    open_to: section.openTo,
  };
}

export function rowToEnrollmentSnapshot(row: EnrollmentSnapshotRow): EnrollmentSnapshot {
  return {
    sectionId: row.section_id,
    observedAt: row.observed_at,
    enrollmentCount: int(row.enrollment_count) ?? 0,
    // `EnrollmentSnapshot.enrollmentCap` is non-nullable in the domain while the
    // column is nullable — the directory occasionally prints a count with no
    // cap. 0 is the only honest stand-in for "no cap was published"; callers
    // rendering a "x / y" pair should treat 0 as unknown rather than as a full
    // section.
    enrollmentCap: int(row.enrollment_cap) ?? 0,
    waitlistCount: int(row.waitlist_count),
    status: row.status,
  };
}

export function enrollmentSnapshotToRow(
  snapshot: EnrollmentSnapshot,
): EnrollmentSnapshotInsert {
  return {
    section_id: snapshot.sectionId,
    observed_at: snapshot.observedAt,
    enrollment_count: snapshot.enrollmentCount,
    enrollment_cap: snapshot.enrollmentCap,
    waitlist_count: snapshot.waitlistCount,
    status: snapshot.status,
  };
}

export function rowToRegistrationMilestone(
  row: RegistrationMilestoneRow,
): RegistrationMilestone {
  return {
    termCode: row.term_code,
    kind: row.kind,
    label: row.label,
    occursAt: row.occurs_at,
  };
}

export function rowToCrawlJob(row: CrawlJobRow): CrawlJob {
  return {
    jobId: row.job_id,
    kind: row.kind,
    targetKey: row.target_key,
    termCode: row.term_code,
    url: row.url,
    tier: row.tier,
    nextFetchAt: row.next_fetch_at,
    leasedUntil: row.leased_until,
    leasedBy: row.leased_by,
    lastOkAt: row.last_ok_at,
    consecutiveFailures: int(row.consecutive_failures) ?? 0,
  };
}

/**
 * A leased job plus the token the worker must present to complete it. The token
 * is deliberately not part of `CrawlJob` — it is a credential, not catalog data.
 */
export interface LeasedCrawlJob extends CrawlJob {
  leaseToken: string | null;
}

export function rowToLeasedCrawlJob(row: CrawlJobRow): LeasedCrawlJob {
  return { ...rowToCrawlJob(row), leaseToken: row.lease_token };
}

export function rowToReviewRecord(
  raw: ReviewRawRow,
  dimensions: ReviewDimensionsRow | null,
  sourceKind: ReviewSourceKind,
  instructorName: string | null = null,
): ReviewRecord {
  return {
    reviewId: raw.review_id,
    source: sourceKind,
    courseId: raw.course_id,
    instructorName,
    postedAt: raw.posted_at,
    url: raw.url,
    excerpt: raw.excerpt,
    workload: num(dimensions?.workload ?? null),
    difficulty: num(dimensions?.difficulty ?? null),
    teachingQuality: num(dimensions?.teaching_quality ?? null),
    gradingFairness: num(dimensions?.grading_fairness ?? null),
    sentiment: num(dimensions?.sentiment ?? null),
    wouldTakeAgain: dimensions?.would_take_again ?? null,
  };
}

export function rowToCustomBlock(row: CustomBlockRow): CustomBlock {
  return {
    blockId: row.block_id,
    label: row.label,
    weekday: row.weekday,
    startMinute: int(row.start_minute) ?? 0,
    endMinute: int(row.end_minute) ?? 0,
  };
}

export function customBlockToRow(block: CustomBlock, planId: string): CustomBlockInsert {
  return {
    block_id: block.blockId,
    plan_id: planId,
    label: block.label,
    weekday: block.weekday,
    start_minute: block.startMinute,
    end_minute: block.endMinute,
  };
}

export function rowToWatch(row: WatchRow): Watch {
  return {
    userId: row.user_id,
    sectionId: row.section_id,
    createdAt: row.created_at,
  };
}

/**
 * Assembles the `CourseWithSections` unit the UI renders from a nested select.
 * Sections are returned in call-number order, which is how the directory prints
 * them and therefore how students expect to see them.
 */
export function rowToCourseWithSections(
  row: CourseRowWithSections,
  termCode?: TermCode,
): Course & { sections: Section[] } {
  const sectionRows = (row.sections ?? []).filter(
    (s) => termCode === undefined || s.term_code === termCode,
  );
  return {
    ...rowToCourse(row),
    sections: sectionRows
      .map((s) => rowToSection(s))
      .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode)),
  };
}

// ---------------------------------------------------------------------------
// PostgREST select strings
// ---------------------------------------------------------------------------
// Kept next to the row types so a column rename breaks both in one place.

export const SECTION_SELECT =
  "*, meetings(*), section_instructors(position, instructors(full_name))";

export const COURSE_WITH_SECTIONS_SELECT = `*, sections(${SECTION_SELECT})`;

// ---------------------------------------------------------------------------
// Database type
// ---------------------------------------------------------------------------
// The generic `@supabase/supabase-js` expects. Written by hand from the same
// migrations as the row types above, so `supabase.from("sections")` knows its
// columns and `supabase.rpc("claim_jobs")` knows its arguments.
//
// `Relationships` is not decoration: it is what lets the PostgREST select
// parser resolve embedded selects like `sections(meetings(*))` at the type
// level. Only the foreign keys we actually embed across are described.

type Rel<Columns extends string[], Relation extends string, Referenced extends string[]> = {
  foreignKeyName: string;
  columns: Columns;
  isOneToOne: boolean;
  referencedRelation: Relation;
  referencedColumns: Referenced;
};

export type Database = {
  /**
   * Tells `createClient` which PostgREST dialect to assume, so callers do not
   * have to write `createClient<Database, { PostgrestVersion: "…" }>`. Verified
   * against `supabase gen types` output for this project.
   */
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      terms: { Row: TermRow; Insert: TermInsert; Update: Partial<TermInsert>; Relationships: [] };
      subjects: {
        Row: SubjectRow;
        Insert: SubjectInsert;
        Update: Partial<SubjectInsert>;
        Relationships: [];
      };
      buildings: {
        Row: BuildingRow;
        Insert: BuildingInsert;
        Update: Partial<BuildingInsert>;
        Relationships: [];
      };
      instructors: {
        Row: InstructorRow;
        Insert: InstructorInsert;
        Update: Partial<InstructorInsert>;
        Relationships: [];
      };
      courses: {
        Row: CourseRow;
        Insert: CourseInsert;
        Update: Partial<CourseInsert>;
        Relationships: [Rel<["subject_code"], "subjects", ["subject_code"]>];
      };
      sections: {
        Row: SectionRow;
        Insert: SectionInsert;
        Update: Partial<SectionInsert>;
        Relationships: [
          Rel<["course_id"], "courses", ["course_id"]>,
          Rel<["term_code"], "terms", ["term_code"]>,
          Rel<["subject_code"], "subjects", ["subject_code"]>,
        ];
      };
      meetings: {
        Row: MeetingRow;
        Insert: MeetingInsert;
        Update: Partial<MeetingInsert>;
        Relationships: [
          Rel<["section_id"], "sections", ["section_id"]>,
          Rel<["building_id"], "buildings", ["building_id"]>,
        ];
      };
      section_instructors: {
        Row: SectionInstructorRow;
        Insert: SectionInstructorRow;
        Update: Partial<SectionInstructorRow>;
        Relationships: [
          Rel<["section_id"], "sections", ["section_id"]>,
          Rel<["instructor_id"], "instructors", ["instructor_id"]>,
        ];
      };
      enrollment_snapshots: {
        Row: EnrollmentSnapshotRow;
        Insert: EnrollmentSnapshotInsert;
        Update: Partial<EnrollmentSnapshotInsert>;
        Relationships: [Rel<["section_id"], "sections", ["section_id"]>];
      };
      registration_milestones: {
        Row: RegistrationMilestoneRow;
        Insert: Partial<RegistrationMilestoneRow> &
          Pick<RegistrationMilestoneRow, "term_code" | "kind" | "label" | "occurs_at">;
        Update: Partial<RegistrationMilestoneRow>;
        Relationships: [Rel<["term_code"], "terms", ["term_code"]>];
      };
      crawl_jobs: {
        Row: CrawlJobRow;
        Insert: Partial<CrawlJobRow> & Pick<CrawlJobRow, "kind" | "target_key" | "url">;
        Update: Partial<CrawlJobRow>;
        Relationships: [Rel<["term_code"], "terms", ["term_code"]>];
      };
      ingest_runs: {
        Row: IngestRunRow;
        Insert: Partial<IngestRunRow>;
        Update: Partial<IngestRunRow>;
        Relationships: [Rel<["job_id"], "crawl_jobs", ["job_id"]>];
      };
      ingest_fingerprints: {
        Row: IngestFingerprintRow;
        Insert: Partial<IngestFingerprintRow> & Pick<IngestFingerprintRow, "ingest_key">;
        Update: Partial<IngestFingerprintRow>;
        Relationships: [];
      };
      client_leases: {
        Row: ClientLeaseRow;
        Insert: Pick<ClientLeaseRow, "client_id" | "job_count"> &
          Partial<Pick<ClientLeaseRow, "leased_at">>;
        Update: Partial<ClientLeaseRow>;
        Relationships: [];
      };
      review_sources: {
        Row: ReviewSourceRow;
        Insert: Partial<ReviewSourceRow> & Pick<ReviewSourceRow, "kind" | "name">;
        Update: Partial<ReviewSourceRow>;
        Relationships: [];
      };
      reviews_raw: {
        Row: ReviewRawRow;
        Insert: Partial<ReviewRawRow> & Pick<ReviewRawRow, "review_id" | "source_id" | "url">;
        Update: Partial<ReviewRawRow>;
        Relationships: [
          Rel<["source_id"], "review_sources", ["source_id"]>,
          Rel<["course_id"], "courses", ["course_id"]>,
          Rel<["instructor_id"], "instructors", ["instructor_id"]>,
        ];
      };
      review_dimensions: {
        Row: ReviewDimensionsRow;
        Insert: Partial<ReviewDimensionsRow> &
          Pick<ReviewDimensionsRow, "review_id" | "model_version">;
        Update: Partial<ReviewDimensionsRow>;
        Relationships: [Rel<["review_id"], "reviews_raw", ["review_id"]>];
      };
      users: {
        Row: UserRow;
        Insert: Partial<UserRow> & Pick<UserRow, "user_id" | "email">;
        Update: Partial<UserRow>;
        Relationships: [];
      };
      plans: {
        Row: PlanRow;
        Insert: PlanInsert;
        Update: Partial<PlanInsert>;
        Relationships: [
          Rel<["user_id"], "users", ["user_id"]>,
          Rel<["term_code"], "terms", ["term_code"]>,
        ];
      };
      plan_items: {
        Row: PlanItemRow;
        Insert: Partial<PlanItemRow> & Pick<PlanItemRow, "plan_id" | "section_id">;
        Update: Partial<PlanItemRow>;
        Relationships: [
          Rel<["plan_id"], "plans", ["plan_id"]>,
          Rel<["section_id"], "sections", ["section_id"]>,
        ];
      };
      custom_blocks: {
        Row: CustomBlockRow;
        Insert: CustomBlockInsert;
        Update: Partial<CustomBlockInsert>;
        Relationships: [Rel<["plan_id"], "plans", ["plan_id"]>];
      };
      watches: {
        Row: WatchRow;
        Insert: WatchInsert;
        Update: Partial<WatchInsert>;
        Relationships: [
          Rel<["user_id"], "users", ["user_id"]>,
          Rel<["section_id"], "sections", ["section_id"]>,
        ];
      };
      alerts_sent: {
        Row: AlertSentRow;
        Insert: Partial<AlertSentRow> & Pick<AlertSentRow, "user_id" | "section_id">;
        Update: Partial<AlertSentRow>;
        Relationships: [
          Rel<["user_id"], "users", ["user_id"]>,
          Rel<["section_id"], "sections", ["section_id"]>,
        ];
      };
      mcp_tokens: {
        Row: McpTokenRow;
        Insert: Partial<McpTokenRow> & Pick<McpTokenRow, "user_id" | "token_hash">;
        Update: Partial<McpTokenRow>;
        Relationships: [Rel<["user_id"], "users", ["user_id"]>];
      };
    };
    Views: {
      course_reputation: { Row: ReputationAggregateRow; Relationships: [] };
      instructor_reputation: { Row: ReputationAggregateRow; Relationships: [] };
    };
    Functions: {
      record_enrollment_reading: {
        Args: {
          p_section_id: string;
          p_enrollment_count: number;
          p_enrollment_cap?: number | null;
          p_waitlist_count?: number | null;
          p_status?: EnrollmentStatusCode;
          p_observed_at?: string;
        };
        Returns: boolean;
      };
      seat_history: {
        Args: { p_section_id: string; p_from?: string | null; p_to?: string | null };
        Returns: EnrollmentSnapshotRow[];
      };
      claim_jobs: {
        Args: {
          worker_id: string;
          batch_size?: number;
          max_tier?: CrawlTier;
          min_overdue_seconds?: number;
        };
        Returns: CrawlJobRow[];
      };
      complete_job: {
        Args: {
          job_id: string;
          ok: boolean;
          lease_token?: string | null;
          error_text?: string | null;
          /**
           * Added in migration 0007. When supplied, `lib/crawler/scheduler.ts`
           * decides the cadence; when null the SQL function recomputes it, as
           * it did before. Two authorities on one value is the bug this closes.
           */
          p_next_fetch_at?: string | null;
        };
        Returns: CrawlJobRow;
      };
      /**
       * Migration 0008. `claim_jobs` filters only by tier and due time; the
       * `ClaimOptions` contract also carries kind and host predicates, and those
       * must be applied inside the locking statement — a browser that claimed a
       * `bulletin_department` job it cannot fetch (no CORS) and released it
       * would be handed the same job forever.
       */
      claim_crawl_jobs: {
        Args: {
          p_worker_id: string;
          p_batch_size?: number;
          p_min_overdue_seconds?: number;
          p_include_kinds?: CrawlJobKind[] | null;
          p_exclude_kinds?: CrawlJobKind[] | null;
          p_allowed_hosts?: string[] | null;
          p_lease_seconds?: number | null;
        };
        Returns: CrawlJobRow[];
      };
      set_crawl_tier: {
        Args: {
          p_selectors: { kind: CrawlJobKind; targetKey: string; termCode: TermCode | null }[];
          p_tier: CrawlTier;
          p_next_fetch_at: string;
        };
        Returns: number;
      };
      upsert_crawl_job: {
        Args: {
          p_kind: CrawlJobKind;
          p_target_key: string;
          p_term_code: string | null;
          p_url: string;
          p_tier?: CrawlTier;
          p_due_now?: boolean;
          /** Explicit schedule; wins over `p_due_now` and the tier default. */
          p_next_fetch_at?: string | null;
        };
        /** One row. `inserted` distinguishes a create from an update (0010). */
        Returns: { job_id: string; inserted: boolean }[];
      };
      prune_client_leases: { Args: { p_older_than?: string }; Returns: number };
      // ── Plan sync (migration 0013) ─────────────────────────────────────────
      // Both return the caller's canonical plan list as JSONB in exactly the
      // shape lib/types.ts `Plan` declares, so there is no field mapping in the
      // client to drift out of sync with the schema.
      list_user_plans: { Args: { p_term_code?: string | null }; Returns: Json };
      replace_user_plans: { Args: { p_term_code: string; p_plans: Json }; Returns: Json };
      /**
       * Historical meeting pattern for sections that have none of their own
       * (migration 0014). `source_term` always travels with the times — see
       * lib/db/typical-meetings.ts for why that is not optional.
       */
      typical_meetings: {
        Args: { p_section_ids: string[] };
        Returns: {
          section_id: string;
          source_term: string;
          source_section: string;
          weekday: Weekday;
          start_minute: number;
          end_minute: number;
          building_id: string | null;
          building_name: string | null;
          room: string | null;
        }[];
      };
      /** Aggregate only — no shape of this result can name a watcher (§14). */
      watch_counts: {
        Args: { p_section_ids: string[] };
        Returns: { section_id: string; watcher_count: number }[];
      };
      // ── Transactional ingest writers (migration 0009) ──────────────────────
      // Each takes the parser's own camelCase output as one JSONB document and
      // applies it in a single transaction. See lib/db/catalog-writer.ts.
      ensure_term: { Args: { p_term_code: string }; Returns: string };
      upsert_instructor: { Args: { p_full_name: string }; Returns: string | null };
      ingest_subject_page: {
        Args: { p_payload: unknown; p_observed_at?: string };
        Returns: number;
      };
      ingest_section_detail: {
        Args: { p_payload: unknown; p_observed_at?: string };
        Returns: number;
      };
      ingest_bulletin: {
        Args: { p_department: string; p_rows: unknown; p_observed_at?: string };
        Returns: number;
      };
      ingest_bulletin_courses: {
        Args: { p_department: string; p_courses: unknown; p_observed_at?: string };
        Returns: number;
      };
      ingest_subject_index: { Args: { p_payload: unknown }; Returns: number };
      ingest_academic_calendar: { Args: { p_payload: unknown }; Returns: number };
      release_expired_leases: { Args: Record<string, never>; Returns: number };
      crawl_queue_health: { Args: Record<string, never>; Returns: CrawlQueueHealthRow[] };
      watcher_count: { Args: { section_id: string }; Returns: number };
      watcher_counts: { Args: { section_ids: string[] }; Returns: WatcherCountRow[] };
      sections_opened_since: {
        Args: { p_since?: string; p_section_ids?: string[] | null };
        Returns: SectionOpenedRow[];
      };
      pending_seat_alerts: { Args: { p_since?: string }; Returns: PendingSeatAlertRow[] };
      record_alerts_sent: {
        Args: {
          p_user_ids: string[];
          p_section_id: string;
          p_transition_at: string;
          p_reason?: string;
          p_channel?: string;
        };
        Returns: number;
      };
      my_watch_states: { Args: Record<string, never>; Returns: WatchStateRow[] };
      get_shared_plan: { Args: { p_share_token: string }; Returns: SharedPlanRow[] };
      get_shared_plan_blocks: {
        Args: { p_share_token: string };
        Returns: Omit<CustomBlockRow, "plan_id" | "created_at">[];
      };
      has_open_seat: {
        Args: { p_status: EnrollmentStatusCode; p_count: number | null; p_cap: number | null };
        Returns: boolean;
      };
    };
    /**
     * Postgres enums, mirrored from the migrations.
     *
     * `Enums` and `CompositeTypes` are not optional even though nothing in this
     * codebase reads them by name: postgrest-js walks the whole schema shape to
     * infer a query's row type, and a `Database` missing either key fails that
     * walk and degrades every `.from()` result to `never`. That is what forced
     * `catalog-queries.ts` to reach for `.overrideTypes<…>()` on every call —
     * a workaround for a hole in this type, not a deliberate choice.
     */
    Enums: {
      season: Season;
      campus_zone: CampusZone;
      enrollment_status: EnrollmentStatusCode;
      weekday_code: Weekday;
      crawl_job_kind: CrawlJobKind;
      crawl_tier: CrawlTier;
      ingest_status: IngestRunStatus;
      registration_milestone_kind: RegistrationMilestoneKind;
      review_source_kind: ReviewSourceKind;
    };
    CompositeTypes: Record<string, never>;
  };
};

// ---------------------------------------------------------------------------
// Function return shapes
// ---------------------------------------------------------------------------

export type ReputationAggregateRow = {
  course_id?: string;
  instructor_id?: string;
  sample_size: number;
  workload: number | null;
  difficulty: number | null;
  teaching_quality: number | null;
  grading_fairness: number | null;
  sentiment: number | null;
  would_take_again_rate: number | null;
  first_posted_at: string | null;
  last_posted_at: string | null;
  culpa_count: number;
  reddit_count: number;
};

export type CrawlQueueHealthRow = {
  tier: CrawlTier;
  total: number;
  due: number;
  overdue_grace: number;
  leased: number;
  failing: number;
};

export type WatcherCountRow = {
  section_id: string;
  watcher_count: number;
};

export type SectionOpenedRow = {
  section_id: string;
  transition_at: string;
  enrollment_count: number;
  enrollment_cap: number | null;
  waitlist_count: number | null;
  status: EnrollmentStatusCode;
  previous_status: EnrollmentStatusCode;
  seats_open: number;
};

export type PendingSeatAlertRow = {
  user_id: string;
  email: string;
  section_id: string;
  transition_at: string;
  enrollment_count: number;
  enrollment_cap: number | null;
  seats_open: number;
  watcher_count: number;
};

export type WatchStateRow = {
  section_id: string;
  created_at: string;
  watcher_count: number;
  enrollment_count_at_watch: number | null;
  enrollment_count: number | null;
  delta_since_watched: number | null;
};

export type SharedPlanRow = {
  plan_id: string;
  term_code: string;
  name: string;
  created_at: string;
  section_ids: string[];
};
