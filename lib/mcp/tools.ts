/**
 * The thirteen tools of spec §16.
 *
 * ── Shape of every handler ─────────────────────────────────────────────────
 *
 * Each returns JSON as text content. Agents parse text; giving them a stable,
 * self-describing JSON object beats prose they have to interpret, and beats a
 * bespoke content type their client may not render.
 *
 * ── Provenance travels with every seat number ──────────────────────────────
 *
 * The product rule that every seat count is displayed with its "as of" stamp
 * is not a UI convention — it is a claim about what we know. An agent reading
 * `enrollmentCount: 119` with no timestamp will happily tell a student a class
 * is open twenty minutes after it filled. So `sourceAsOf` is serialised on
 * every section this file emits, and the tool descriptions say what it means.
 *
 * ── Write tools propose; they do not act ───────────────────────────────────
 *
 * `add_section` and `remove_section` create a pending proposal and hand back a
 * URL. They cannot mutate a plan, and not because the handler declines to —
 * `PlansPort` has no mutation method at all. An agent that decides to
 * "helpfully" rebuild someone's schedule ends up with a review queue, which is
 * exactly the outcome spec §16 asks for.
 *
 * `watch_section` is the one exception and it is a deliberate one: a watch is
 * additive, reversible, and changes no schedule. The worst case is an email
 * the student did not ask for, against the best case of not missing a seat.
 *
 * ── Errors are content, not exceptions ─────────────────────────────────────
 *
 * A tool that throws gives an agent a protocol error to reason about. A tool
 * that returns `{ error, ... }` with `isError: true` gives it a sentence it
 * can act on and, where useful, the thing it should do instead. Missing scope
 * says which scope; rate limiting says how long to wait.
 */

import { z } from "zod";

import { isDistinctSectionTitle } from "../catalog-list-types";
import { WEEKDAYS } from "../constants";
import type { CourseWithSections, SearchFilters, Section, TermCode, Weekday } from "../types";

import { hasScopes, type McpAuthInfo, type Scope } from "./auth";
import type { McpDeps } from "./contracts";
import { isPlanKind, type ProposalKind } from "./proposals";
import { PROPOSAL_RULE, ANONYMOUS_TOOL_RULE, AUTHENTICATED_TOOL_RULE } from "./ratelimit";

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function ok(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function fail(error: string, extra: Record<string, unknown> = {}): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error, ...extra }, null, 2) }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/**
 * Sections, with their provenance attached and nothing invented.
 *
 * `meetings` is empty for most current-term sections because Columbia stopped
 * publishing days and times in the public directory after Spring 2025
 * (.plans/BLOCKERS.md #5). The field is emitted as an empty array with a
 * `meetingsKnown: false` flag rather than omitted, so an agent can tell "meets
 * at no time" apart from "we do not know when this meets" — a distinction it
 * would otherwise have to guess, and would guess wrong.
 *
 * ── `title` is not decoration ──────────────────────────────────────────────
 *
 * On a container course the section IS the class. COMS 6998 is one course
 * called "Topics in Computer Science" whose 20 Fall 2026 sections are 20
 * unrelated seminars — "LLM Based Generative AI", "Computation and the Brain" —
 * and COMS 4995 is another. Without this field `get_sections` answers "what
 * topics is 6998 running" with twenty call numbers and one repeated course
 * title, which is not an answer, and no amount of prompting recovers a string
 * that never left the server.
 *
 * `courseTitle` is required rather than optional so the decision is never
 * skipped by omission: the section's title reaches the payload only when
 * `isDistinctSectionTitle` says it names something the course title does not.
 * Emitted as `null` otherwise — an explicit "this section has no name of its
 * own", rather than an absent key an agent would have to interpret.
 */
function serializeSection(section: Section, courseTitle: string | undefined) {
  return {
    sectionId: section.sectionId,
    courseId: section.courseId,
    sectionCode: section.sectionCode,
    callNumber: section.callNumber,
    termCode: section.termCode,
    title: isDistinctSectionTitle(section.title, courseTitle) ? section.title! : null,
    instructors: section.instructors,
    component: section.component,
    methodOfInstruction: section.methodOfInstruction,
    points: { min: section.minUnit, max: section.maxUnit },
    seats: {
      enrollmentCount: section.enrollmentCount,
      enrollmentCap: section.enrollmentCap,
      waitlistCount: section.waitlistCount,
      status: section.status,
      // Never separated from the numbers above. See the file header.
      sourceAsOf: section.sourceAsOf,
    },
    meetingsKnown: (section.meetings?.length ?? 0) > 0,
    meetings: (section.meetings ?? []).map((meeting) => ({
      weekday: meeting.weekday,
      startMinute: meeting.startMinute,
      endMinute: meeting.endMinute,
      building: meeting.buildingName,
      room: meeting.room,
    })),
    note: section.note,
    openTo: section.openTo,
  };
}

/**
 * Course titles for a loose set of sections, keyed by course id.
 *
 * `list_watches`, `list_bookmarks` and the saved-class listing hold sections
 * that arrived without their courses, and `serializeSection` cannot tell a
 * section that names its own class from one restating the course's name without
 * the course title to compare against. Resolving it here keeps those payloads
 * saying the same thing as `get_course` — a student who saved COMS 6998 section
 * 012 gets "Computation and the Brain" back, not twenty rows of "Topics in
 * Computer Science".
 *
 * Grouped by term because `getCoursesByIds` is term-scoped: a watch on a Spring
 * section would miss a Fall-only read and silently lose its title. One read per
 * distinct term, which in practice is one or two.
 */
async function courseTitlesFor(
  deps: McpDeps,
  sections: readonly Section[],
): Promise<Map<string, string>> {
  const byTerm = new Map<TermCode, Set<string>>();
  for (const section of sections) {
    const ids = byTerm.get(section.termCode) ?? new Set<string>();
    ids.add(section.courseId);
    byTerm.set(section.termCode, ids);
  }

  const titles = new Map<string, string>();
  const reads = await Promise.all(
    [...byTerm].map(([termCode, ids]) => deps.catalog.getCoursesByIds([...ids], termCode)),
  );
  for (const courses of reads) {
    for (const course of courses) titles.set(course.courseId, course.title);
  }
  return titles;
}

function serializeCourse(course: CourseWithSections, includeSections = true) {
  return {
    courseId: course.courseId,
    code: `${course.subjectCode} ${course.number}${course.qualifier ?? ""}`,
    subjectCode: course.subjectCode,
    number: course.number,
    title: course.title,
    description: course.description,
    points: { min: course.pointsMin, max: course.pointsMax },
    prerequisiteText: course.prerequisiteText,
    department: course.department,
    requirementFlags: Object.entries(course.requirementFlags ?? {})
      .filter(([, value]) => value === true)
      .map(([key]) => key),
    sectionCount: course.sections.length,
    ...(includeSections
      ? { sections: course.sections.map((section) => serializeSection(section, course.title)) }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export interface ToolContext {
  deps: McpDeps;
  /** Null for an unauthenticated caller. Catalog tools work either way. */
  auth: McpAuthInfo | null;
  /** Rate-limit bucket: the user for a token, the client IP otherwise. */
  callerKey: string;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** Scopes a caller must hold. Empty means the tool is public. */
  scopes: Scope[];
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

const weekdaySchema = z.enum(WEEKDAYS as unknown as [Weekday, ...Weekday[]]);

const customBlockSchema = z.object({
  blockId: z.string().default("block"),
  label: z.string(),
  weekday: weekdaySchema,
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
});

// ---------------------------------------------------------------------------

export const TOOLS: ToolDefinition[] = [
  // --- Unauthenticated: catalog and reputation -----------------------------
  {
    name: "search_courses",
    title: "Search courses",
    description:
      "Full-text and faceted search over the Columbia course catalog. Runs the same ranking " +
      "the website uses, so result order matches what the student sees. Seat counts in the " +
      "results carry a sourceAsOf timestamp: they are the last reading we took, not live.",
    scopes: [],
    inputSchema: {
      query: z.string().optional().describe("Free text: course code, title words, or topic."),
      termCode: z.string().optional().describe('Term code, e.g. "20263" for Fall 2026.'),
      subjects: z.array(z.string()).optional().describe('Subject codes, e.g. ["COMS", "MATH"].'),
      instructors: z.array(z.string()).optional(),
      levelMin: z.number().int().optional().describe("Inclusive course-number floor, e.g. 3000."),
      levelMax: z.number().int().optional(),
      creditsMin: z.number().optional(),
      creditsMax: z.number().optional(),
      requirements: z
        .array(z.string())
        .optional()
        .describe('Requirement flag keys, e.g. ["globalCore", "scienceWithLab"].'),
      openSeatsOnly: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).default(20),
    },
    async handler(args, { deps }) {
      const filters: SearchFilters = {
        q: args.query as string | undefined,
        termCode: args.termCode as SearchFilters["termCode"],
        subjects: args.subjects as string[] | undefined,
        instructors: args.instructors as string[] | undefined,
        creditsMin: args.creditsMin as number | undefined,
        creditsMax: args.creditsMax as number | undefined,
        requirements: args.requirements as string[] | undefined,
        openSeatsOnly: args.openSeatsOnly as boolean | undefined,
      };
      if (args.levelMin !== undefined || args.levelMax !== undefined) {
        filters.levelRange = [
          (args.levelMin as number | undefined) ?? 0,
          (args.levelMax as number | undefined) ?? 9999,
        ];
      }

      const limit = (args.limit as number | undefined) ?? 20;
      const result = await deps.search.search(filters, limit);
      return ok({
        total: result.total,
        returned: result.courses.length,
        // Reported so an agent can say "showing 20 of 340" rather than
        // implying it has seen everything.
        truncated: result.total > result.courses.length,
        elapsedMs: result.elapsedMs,
        courses: result.courses.map((course) => serializeCourse(course, false)),
      });
    },
  },

  {
    name: "get_course",
    title: "Get a course",
    description:
      "Full record for one course including every section, with seat counts and their " +
      "sourceAsOf timestamps. Use the courseId from search_courses (e.g. COMS4118W).",
    scopes: [],
    inputSchema: {
      courseId: z.string().describe('Course id, e.g. "COMS4118W".'),
      termCode: z.string().optional(),
    },
    async handler(args, { deps }) {
      const course = await deps.catalog.getCourse(
        args.courseId as string,
        args.termCode as SearchFilters["termCode"],
      );
      if (!course) return fail(`No course with id ${String(args.courseId)}.`);
      return ok(serializeCourse(course));
    },
  },

  {
    name: "get_sections",
    title: "Get sections of a course",
    description:
      "Every section of one course in a term. `title` is the class that section actually is " +
      "when the course is a container — COMS 6998 and COMS 4995 are each one 'Topics in " +
      "Computer Science' over ~20 unrelated seminars, and the section title is the only place " +
      "those are named; it is null when the section has no name of its own, which is the usual " +
      "case. meetingsKnown is false when Columbia does not publish the meeting pattern for that " +
      "term — that is missing data, not a section with no meetings.",
    scopes: [],
    inputSchema: {
      courseId: z.string(),
      termCode: z.string().optional(),
    },
    async handler(args, { deps }) {
      const course = await deps.catalog.getCourse(
        args.courseId as string,
        args.termCode as SearchFilters["termCode"],
      );
      if (!course) return fail(`No course with id ${String(args.courseId)}.`);
      return ok({
        courseId: course.courseId,
        termCode: args.termCode ?? null,
        sections: course.sections.map((section) => serializeSection(section, course.title)),
      });
    },
  },

  {
    name: "get_ratings",
    title: "Get course or instructor reputation",
    description:
      "Aggregated review dimensions. Course quality and instructor quality are scored " +
      "SEPARATELY and must never be averaged into one number — a hard course taught well is " +
      "not the same as an easy course taught badly. Returns null with a reason when nothing " +
      "has been reviewed.",
    scopes: [],
    inputSchema: {
      courseId: z.string().optional(),
      instructor: z.string().optional().describe("Instructor name as it appears on a section."),
    },
    async handler(args, { deps }) {
      const courseId = args.courseId as string | undefined;
      const instructor = args.instructor as string | undefined;
      if (!courseId && !instructor) {
        return fail("Pass courseId, instructor, or both.");
      }

      const [course, instructorSummary] = await Promise.all([
        courseId ? deps.ratings.getCourseReputation(courseId) : Promise.resolve(null),
        instructor ? deps.ratings.getInstructorReputation(instructor) : Promise.resolve(null),
      ]);

      return ok({
        // Two keys, never one. The separation is the point.
        course: courseId ? { courseId, reputation: course } : null,
        instructor: instructor ? { name: instructor, reputation: instructorSummary } : null,
        note:
          course === null && instructorSummary === null
            ? "No reviews have been ingested for this subject yet. Absence of a rating is not a low rating."
            : undefined,
      });
    },
  },

  {
    name: "get_seat_history",
    title: "Get seat history",
    description:
      "Every recorded look at a section's enrollment, oldest first. Unchanged counts " +
      "are still rows — a gap would mean we stopped looking, not that the count held. " +
      "Interpolate step-after so equal points stay flat and jumps stay jumps.",
    scopes: [],
    inputSchema: {
      sectionId: z.string().describe('Section id, e.g. "20263COMS4118W001".'),
      since: z.string().optional().describe("ISO timestamp; only changes at or after it."),
    },
    async handler(args, { deps }) {
      const points = await deps.seatHistory.getSeatHistory(
        args.sectionId as string,
        args.since as string | undefined,
      );
      return ok({
        sectionId: args.sectionId,
        changeCount: points.length,
        interpolation: "step-after",
        points,
      });
    },
  },

  // --- Unauthenticated: stateless analysis ---------------------------------
  {
    name: "check_conflicts",
    title: "Check a proposed schedule for conflicts",
    description:
      "Time overlaps and duplicate courses across a proposed set of sections, plus any " +
      "custom commitments. Sections whose meeting pattern is unpublished cannot conflict " +
      "with anything and are reported separately, so a clean result is not mistaken for a " +
      "verified one.",
    scopes: [],
    inputSchema: {
      sectionIds: z.array(z.string()).min(1),
      customBlocks: z.array(customBlockSchema).optional(),
    },
    async handler(args, { deps }) {
      const sections = await deps.catalog.getSections(args.sectionIds as string[]);
      const blocks = (args.customBlocks ?? []) as z.infer<typeof customBlockSchema>[];
      const conflicts = deps.schedule.checkConflicts(sections, blocks);

      const unknown = sections
        .filter((section) => (section.meetings?.length ?? 0) === 0)
        .map((section) => section.sectionId);
      const missing = (args.sectionIds as string[]).filter(
        (id) => !sections.some((section) => section.sectionId === id),
      );

      return ok({
        conflicts,
        hardConflictCount: conflicts.filter((conflict) => conflict.severity === "hard").length,
        // Named explicitly: "no conflicts" over sections we cannot place is
        // not the same claim as "no conflicts".
        sectionsWithUnknownMeetingTimes: unknown,
        sectionsNotFound: missing,
        checkedSectionCount: sections.length - unknown.length,
      });
    },
  },

  {
    name: "check_commute",
    title: "Check walking time between back-to-back classes",
    description:
      "Walking legs between consecutive meetings on the same day, with the gap available and " +
      "whether it is enough. Columbia's campus spans Morningside, the Medical Center and " +
      "Manhattanville — a ten-minute passing period does not cover all of them.",
    scopes: [],
    inputSchema: {
      sectionIds: z.array(z.string()).min(1),
      customBlocks: z.array(customBlockSchema).optional(),
    },
    async handler(args, { deps }) {
      const sections = await deps.catalog.getSections(args.sectionIds as string[]);
      const blocks = (args.customBlocks ?? []) as z.infer<typeof customBlockSchema>[];
      const legs = deps.schedule.checkCommute(sections, blocks);
      return ok({
        legs,
        infeasibleCount: legs.filter((leg) => !leg.feasible).length,
        sectionsWithUnknownMeetingTimes: sections
          .filter((section) => (section.meetings?.length ?? 0) === 0)
          .map((section) => section.sectionId),
      });
    },
  },

  {
    name: "check_requirements",
    title: "Check which requirements a proposed schedule touches",
    description:
      "Which flagged Core / Ways of Knowing requirements these courses carry. This is NOT a " +
      "degree audit: it reports requirements touched, not fulfilled, and the notApplicable " +
      "list names everything a real audit covers that this cannot. Do not tell a student " +
      "they can graduate based on this.",
    scopes: [],
    inputSchema: {
      sectionIds: z.array(z.string()).min(1),
      program: z
        .string()
        .default("cc")
        .describe('One of "cc", "seas", "gs", "barnard". Unknown values check every group.'),
    },
    async handler(args, { deps }) {
      const sections = await deps.catalog.getSections(args.sectionIds as string[]);
      const courseIds = [...new Set(sections.map((section) => section.courseId))];
      const courses = await deps.catalog.getCoursesByIds(courseIds);
      const report = deps.schedule.checkRequirements(courses, (args.program as string) ?? "cc");
      return ok({
        ...report,
        disclaimer:
          "Requirements touched, not fulfilled. A real audit needs your completed coursework, " +
          "your major, and how many courses each requirement takes — none of which this has.",
      });
    },
  },

  // --- Authenticated: the student's own data -------------------------------
  {
    name: "get_my_schedule",
    title: "Get the student's classes for a term",
    description:
      "The signed-in student's classes for a term — their saved list, with every section " +
      "resolved and any time overlaps between them already computed. This is what to read " +
      "for \"what am I taking\", \"when do my classes meet\", \"where do I have to be on " +
      "Tuesday\" and anything else about their week. Read-only.",
    /*
     * ── This reads the saved list, and used to read a separate plan store ───
     *
     * There were two answers to "what am I taking": a shortlist you built by
     * saving, and a plan you built by adding saved classes to a schedule. The
     * second was a copy of the first with an extra step in front of it, and
     * the step was the problem — a student who saved six classes and never
     * pressed "Add to schedule" had an empty schedule, so the agent answering
     * "when do my classes meet" told them, truthfully and uselessly, that they
     * had no classes.
     *
     * One list. Saving IS planning; the seam between them was ours, not the
     * student's, and it only ever produced disagreement between two screens
     * about the same six courses.
     *
     * The scope moved with the data. It was `schedule:read`, and an
     * authorization statement has to name what is actually read — a token
     * granted only schedule access must not come back with the shortlist.
     */
    scopes: ["bookmarks:rw"],
    inputSchema: {
      termCode: z.string().optional().describe("e.g. 20263. Omit for every term."),
    },
    async handler(args, { deps, auth }) {
      const entries = await deps.bookmarks.listBookmarks(auth!.extra.userId, {
        termCode: args.termCode as TermCode | undefined,
      });
      if (entries.length === 0) {
        return ok({
          count: 0,
          sections: [],
          conflicts: [],
          note: "This student has not saved any classes yet.",
        });
      }

      const sections = await deps.catalog.getSections(entries.map((entry) => entry.sectionId));
      const byId = new Map(sections.map((section) => [section.sectionId, section]));

      /*
       * Conflicts come back with the list rather than waiting to be asked for.
       * A shortlist is allowed to overlap — that is what makes it a shortlist —
       * so the overlaps are reported as facts about the set, never as errors,
       * and the model is told below which of them it can actually stand on.
       */
      const placeable = sections.filter((section) => (section.meetings?.length ?? 0) > 0);
      const conflicts = deps.schedule.checkConflicts(placeable, []);
      const courseTitles = await courseTitlesFor(deps, sections);

      return ok({
        count: entries.length,
        sections: entries.flatMap((entry) => {
          const section = byId.get(entry.sectionId);
          // A saved row we cannot resolve is surfaced below, not returned
          // hollow — it usually means the section was withdrawn.
          if (!section) return [];
          return [
            {
              savedAt: entry.savedAt,
              folderIds: entry.folderIds,
              ...serializeSection(section, courseTitles.get(section.courseId)),
            },
          ];
        }),
        conflicts,
        hardConflictCount: conflicts.filter((conflict) => conflict.severity === "hard").length,
        // Named explicitly: "no conflicts" across sections we cannot place is
        // not the same claim as "no conflicts".
        sectionsWithUnknownMeetingTimes: sections
          .filter((section) => (section.meetings?.length ?? 0) === 0)
          .map((section) => section.sectionId),
        unresolvedSectionIds: entries
          .map((entry) => entry.sectionId)
          .filter((id) => !byId.has(id)),
      });
    },
  },

  {
    name: "add_section",
    title: "Propose adding a section to a plan",
    description:
      "Creates a PENDING proposal and returns a URL where the student accepts or rejects it. " +
      "This does not change the plan. Tell the student the change is waiting for them and " +
      "give them the reviewUrl — do not report the section as added.",
    scopes: ["schedule:write"],
    inputSchema: {
      planId: z.string(),
      sectionId: z.string(),
      note: z.string().optional().describe("Why you are suggesting this; shown to the student."),
    },
    async handler(args, context) {
      return proposeChange("add_section", args, context);
    },
  },

  {
    name: "remove_section",
    title: "Propose removing a section from a plan",
    description:
      "Creates a PENDING proposal and returns a URL where the student accepts or rejects it. " +
      "This does not change the plan.",
    scopes: ["schedule:write"],
    inputSchema: {
      planId: z.string(),
      sectionId: z.string(),
      note: z.string().optional(),
    },
    async handler(args, context) {
      return proposeChange("remove_section", args, context);
    },
  },

  {
    name: "watch_section",
    title: "Watch a section for open seats",
    description:
      "Adds the section to the student's watchlist. Every watcher is emailed at the same " +
      "moment a seat opens — notifications are never staggered — so the returned " +
      "watcherCount is how many other people get the same email. This one WRITES rather " +
      "than proposes, because a watch is additive and reversible.",
    scopes: ["watch:write"],
    inputSchema: { sectionId: z.string() },
    async handler(args, { deps, auth }) {
      const sectionId = args.sectionId as string;
      const section = await deps.catalog.getSection(sectionId);
      if (!section) return fail(`No section with id ${sectionId}.`);

      const watch = await deps.plans.addWatch(auth!.extra.userId, sectionId);
      return ok({
        watching: true,
        sectionId,
        watcherCount: watch.watcherCount,
        seats: {
          enrollmentCount: section.enrollmentCount,
          enrollmentCap: section.enrollmentCap,
          status: section.status,
          sourceAsOf: section.sourceAsOf,
        },
        note: `${watch.watcherCount} ${watch.watcherCount === 1 ? "person is" : "people are"} watching this section. All watchers are emailed simultaneously.`,
      });
    },
  },

  {
    name: "list_watches",
    title: "List the student's watched sections",
    description:
      "The signed-in student's watchlist with current seat state, how many others are " +
      "watching each section, and how the enrollment has moved since they started watching.",
    scopes: ["schedule:read"],
    inputSchema: {},
    async handler(_args, { deps, auth }) {
      const watches = await deps.plans.listWatches(auth!.extra.userId);
      const courseTitles = await courseTitlesFor(deps, watches.map((watch) => watch.section));
      return ok({
        count: watches.length,
        watches: watches.map((watch) => ({
          sectionId: watch.sectionId,
          createdAt: watch.createdAt,
          watcherCount: watch.watcherCount,
          deltaSinceWatched: watch.deltaSinceWatched,
          section: serializeSection(watch.section, courseTitles.get(watch.section.courseId)),
        })),
      });
    },
  },

  // -------------------------------------------------------------------------
  // Saved classes
  // -------------------------------------------------------------------------

  {
    name: "list_bookmark_folders",
    title: "List the student's saved-class folders",
    description:
      "The folders the student made to organise their saved classes, with how many classes " +
      "are in each. There is no folder for unfiled classes — a class in no folder is shown " +
      "on the site as 'Uncategorized', which is a computed view, not a folder you can file " +
      "into. Pass folderId: 'uncategorized' to list_bookmarks to see those.",
    scopes: ["bookmarks:rw"],
    inputSchema: {},
    async handler(_args, { deps, auth }) {
      const folders = await deps.bookmarks.listFolders(auth!.extra.userId);
      return ok({ count: folders.length, folders });
    },
  },

  {
    name: "list_bookmarks",
    title: "List the student's saved classes",
    description:
      "The student's shortlist: sections they saved while deciding what to take. This is NOT " +
      "their schedule and not their registration — saving is deliberately looser than " +
      "planning, and a student will usually have saved more classes than they can take. " +
      "Seat numbers come with the timestamp they were read at.",
    scopes: ["bookmarks:rw"],
    inputSchema: {
      termCode: z.string().optional().describe("e.g. 20263. Omit for every term."),
      folderId: z
        .string()
        .optional()
        .describe("A folder id from list_bookmark_folders, or 'uncategorized' for unfiled ones."),
    },
    async handler(args, { deps, auth }) {
      const entries = await deps.bookmarks.listBookmarks(auth!.extra.userId, {
        termCode: args.termCode as TermCode | undefined,
        folderId: args.folderId as string | undefined,
      });
      if (entries.length === 0) return ok({ count: 0, bookmarks: [] });

      const sections = await deps.catalog.getSections(entries.map((entry) => entry.sectionId));
      const sectionById = new Map(sections.map((section) => [section.sectionId, section]));
      const courseTitles = await courseTitlesFor(deps, sections);

      return ok({
        count: entries.length,
        bookmarks: entries.flatMap((entry) => {
          const section = sectionById.get(entry.sectionId);
          // Same rule as list_watches: a row we cannot resolve to a section is
          // dropped rather than returned hollow.
          if (!section) return [];
          return [
            {
              sectionId: entry.sectionId,
              savedAt: entry.savedAt,
              folderIds: entry.folderIds,
              uncategorized: entry.folderIds.length === 0,
              section: serializeSection(section, courseTitles.get(section.courseId)),
            },
          ];
        }),
      });
    },
  },

  {
    name: "propose_bookmark",
    title: "Propose saving a class to the student's shortlist",
    description:
      "Creates a PENDING proposal and returns a URL where the student accepts or rejects it. " +
      "This does not save anything. Use it when you have found a class worth considering — " +
      "the shortlist is where a student collects candidates, so a proposal here is a much " +
      "lighter suggestion than one that changes a schedule.",
    scopes: ["bookmarks:rw"],
    inputSchema: {
      sectionId: z.string(),
      note: z.string().optional().describe("Why you are suggesting this; shown to the student."),
    },
    async handler(args, context) {
      return proposeChange("add_bookmark", args, context);
    },
  },

  {
    name: "propose_unbookmark",
    title: "Propose removing a class from the student's shortlist",
    description:
      "Creates a PENDING proposal and returns a URL where the student accepts or rejects it. " +
      "This does not remove anything. Accepting also stops any seat alert on that section, " +
      "because a watch only exists on a saved class.",
    scopes: ["bookmarks:rw"],
    inputSchema: {
      sectionId: z.string(),
      note: z.string().optional(),
    },
    async handler(args, context) {
      return proposeChange("remove_bookmark", args, context);
    },
  },
];

// ---------------------------------------------------------------------------
// Shared write path
// ---------------------------------------------------------------------------

async function proposeChange(
  kind: ProposalKind,
  args: Record<string, unknown>,
  { deps, auth, callerKey }: ToolContext,
): Promise<ToolResult> {
  const userId = auth!.extra.userId;
  const sectionId = args.sectionId as string;

  // Metered separately and far more tightly than reads. A proposal costs an
  // agent one call and costs a human a decision; the asymmetry is the reason.
  const decision = deps.rateLimiter.consume(`${callerKey}:proposal`, PROPOSAL_RULE);
  if (!decision.allowed) {
    return fail("Too many pending proposals created. Slow down.", {
      retryAfterSeconds: decision.retryAfterSeconds,
    });
  }

  const section = await deps.catalog.getSection(sectionId);
  if (!section) return fail(`No section with id ${sectionId}.`);

  /*
   * Both families end in the same row; only the target and the no-op check
   * differ. Plan kinds carry a `planId` and bookmark kinds carry null — a
   * pairing migration 0023 enforces in Postgres, so a mistake here is a failed
   * insert rather than a proposal pointing at nothing.
   */
  let planId: string | null = null;
  let summary: string;

  if (isPlanKind(kind)) {
    planId = args.planId as string;
    const plan = await deps.plans.getPlan(userId, planId);
    if (!plan) return fail(`No plan ${planId} for this account.`);

    // Refuse the no-ops rather than queueing them: a proposal to add something
    // already there is a decision the student would have to read and dismiss.
    const alreadyIn = plan.sectionIds.includes(sectionId);
    if (kind === "add_section" && alreadyIn) {
      return fail(`Section ${sectionId} is already in "${plan.name}".`);
    }
    if (kind === "remove_section" && !alreadyIn) {
      return fail(`Section ${sectionId} is not in "${plan.name}".`);
    }

    const verb = kind === "add_section" ? "Add" : "Remove";
    const preposition = kind === "add_section" ? "to" : "from";
    summary = `${verb} ${section.courseId} section ${section.sectionCode} ${preposition} "${plan.name}"`;
  } else {
    const alreadySaved = await deps.bookmarks.isBookmarked(userId, sectionId);
    if (kind === "add_bookmark" && alreadySaved) {
      return fail(`Section ${sectionId} is already saved.`);
    }
    if (kind === "remove_bookmark" && !alreadySaved) {
      return fail(`Section ${sectionId} is not saved.`);
    }

    summary =
      kind === "add_bookmark"
        ? `Save ${section.courseId} section ${section.sectionCode} to your saved classes`
        : `Remove ${section.courseId} section ${section.sectionCode} from your saved classes`;
  }

  const proposal = await deps.proposals.create({
    userId,
    planId,
    kind,
    sectionId,
    courseId: section.courseId,
    summary,
    note: (args.note as string | undefined) ?? null,
    originClientId: auth!.clientId,
    baseUrl: deps.baseUrl,
  });

  return ok({
    // Named `proposed`, not `added`. An agent skimming for a success flag
    // should not find one that reads as "done".
    proposed: true,
    applied: false,
    proposalId: proposal.proposalId,
    summary: proposal.summary,
    reviewUrl: proposal.reviewUrl,
    expiresAt: proposal.expiresAt,
    message:
      "Nothing has changed yet. The student must accept this in the app — send them the reviewUrl.",
  });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function findTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

/**
 * Runs a tool with the two checks every call needs, in this order: scope
 * first, then rate limit.
 *
 * The order matters. Metering a caller who was never allowed to make the call
 * would let an unauthorized agent consume a legitimate one's budget, and would
 * report "slow down" for what is really "sign in".
 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const tool = findTool(name);
  if (!tool) return fail(`Unknown tool "${name}".`);

  if (tool.scopes.length > 0) {
    if (!context.auth) {
      return fail("This tool needs a signed-in Columbia or Barnard account.", {
        requiredScopes: tool.scopes,
        howToFix: "Complete the OAuth flow your MCP client offers for this server.",
      });
    }
    if (!hasScopes(context.auth.scopes, tool.scopes)) {
      return fail("Your token is missing a required scope.", {
        requiredScopes: tool.scopes,
        grantedScopes: context.auth.scopes,
        howToFix: "Re-authorize this server and grant the missing scope.",
      });
    }
  }

  const rule = context.auth ? AUTHENTICATED_TOOL_RULE : ANONYMOUS_TOOL_RULE;
  const decision = context.deps.rateLimiter.consume(`${context.callerKey}:tool`, rule);
  if (!decision.allowed) {
    return fail("Rate limit exceeded.", {
      limit: decision.limit,
      retryAfterSeconds: decision.retryAfterSeconds,
    });
  }

  try {
    return await tool.handler(args, context);
  } catch (cause) {
    // Never leak a stack trace or a Postgres message to an external agent —
    // it is neither useful to it nor ours to publish.
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`mcp tool ${name} failed:`, message);
    return fail(`The ${name} tool failed. This has been logged.`);
  }
}
