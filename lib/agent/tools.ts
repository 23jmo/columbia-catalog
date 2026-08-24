/**
 * The agent's tools.
 *
 * ── Reuse, not reimplementation ────────────────────────────────────────────
 *
 * Sixteen of these are the MCP tools from `lib/mcp/tools.ts`, bridged rather
 * than rewritten. That is a correctness decision, not a laziness one. Those
 * handlers already know that a seat count is meaningless without its
 * `sourceAsOf` stamp, that an empty `meetings` array means "we do not know
 * when this meets" rather than "it meets at no time", and that a write must
 * propose rather than act. A second implementation would start correct and
 * drift, and the two would disagree about a student's schedule — which is
 * exactly how `student_courses` and the localStorage progression record ended
 * up as two disagreeing student records.
 *
 * The three additions are the ones MCP has no equivalent for, because they need
 * the recommendation engine: `get_courses_taken`, `get_unmet_requirements`, and
 * `recommend_courses`.
 *
 * ── The transcript is not logging ──────────────────────────────────────────
 *
 * Every bridged handler appends its raw output to `context.transcript`. That
 * array is what `lib/agent/grounding.ts` checks the model's prose against, so
 * it is load-bearing: a tool that ran without recording its output would make
 * every course it returned look invented. It is collected here, at the single
 * choke point every tool passes through, rather than reconstructed from the
 * SDK's step objects — one place to be right instead of one per call site.
 *
 * ── Why `runTool` is bypassed ──────────────────────────────────────────────
 *
 * `runTool` meters every call against the MCP rate limiter. The spec caps
 * *prompts* (20 per 6 hours, `lib/agent/usage.ts`) and explicitly does not cap
 * tool calls, because a hard question is precisely the one that needs to
 * search, then check prerequisites, then check seats. Routing through
 * `runTool` would quietly reinstate the cap the spec removed. The scope check
 * `runTool` also performs is not lost — it is satisfied structurally instead,
 * by `sessionAuth` below.
 */

import { z } from "zod";
import { tool, type ToolSet } from "ai";

import { getAllCourses, getCoursesByIds } from "@/lib/data/catalog";
import { createSupabaseCandidateProvider } from "@/lib/db/candidate-source";
import { loadStudentProfile } from "@/lib/db/student-profile";
import type { McpAuthInfo } from "@/lib/mcp/auth";
import { mcpDeps } from "@/lib/mcp/server";
import { findTool, type ToolContext as McpToolContext } from "@/lib/mcp/tools";
import { auditProfile } from "@/lib/profile/audit";
import type { StudentProfile as AppStudentProfile } from "@/lib/profile/types";
import { recommend } from "@/lib/recommend";
import {
  graphPrereqSource,
  loadProgressionGraph,
  noVectorSource,
  unknownPrereqSource,
} from "@/lib/recommend/sources";
import type {
  CandidateCourse,
  PrereqSource,
  StudentProfile as EngineStudentProfile,
} from "@/lib/recommend/types";
import { expandCandidatesForPrograms } from "@/lib/requirements/candidates";
import { formatCourseId } from "@/lib/requirements/code";
import type { CourseFacts } from "@/lib/requirements/evaluate";
import type { CourseId } from "@/lib/requirements/code";
import type { TermCode } from "@/lib/types";

/* ==========================================================================
 * Context
 * ========================================================================== */

export interface AgentToolContext {
  /** The signed-in student. The agent is never built without one. */
  userId: string;
  /** Raw tool output for this turn, in call order. Read by the grounding check. */
  transcript: string[];
  /** Shared MCP context: ports, synthetic auth, rate-limit bucket. */
  mcp: McpToolContext;
}

/**
 * Full scopes for the signed-in student, synthesised rather than negotiated.
 *
 * MCP scopes exist because a *third-party* client asks for access to a
 * student's account and the student decides how much to grant. None of that
 * applies here: the caller is our own first-party UI, the student is already
 * authenticated by Supabase, and the data in question is their own. Presenting
 * a consent screen for the app to read the schedule the app just rendered would
 * be theatre.
 *
 * The token field is a marker, not a credential. Nothing verifies it — this
 * object never leaves the process, and `verifyAccessToken` is not on the path.
 * It is spelled out so that a future reader grepping for the string finds this
 * comment rather than hunting for a token that was never issued.
 */
function sessionAuth(userId: string, email: string): McpAuthInfo {
  return {
    token: "in-app-session",
    clientId: "columbia-catalog-web",
    scopes: ["catalog:read", "schedule:read", "schedule:write", "watch:write", "bookmarks:rw"],
    extra: { userId, email },
  };
}

export function buildAgentToolContext(
  userId: string,
  email: string,
  baseUrl: string,
): AgentToolContext {
  return {
    userId,
    transcript: [],
    mcp: {
      deps: mcpDeps(baseUrl),
      auth: sessionAuth(userId, email),
      callerKey: `agent:${userId}`,
    },
  };
}

/* ==========================================================================
 * Bridge
 * ========================================================================== */

/**
 * The MCP tools worth giving the in-app agent.
 *
 * `check_commute` and `get_seat_history` are omitted, not forgotten. Commute
 * needs a residence the web session has not asked for, and seat history is a
 * chart — an agent narrating twelve enrollment readings in prose is strictly
 * worse than the chart the course page already draws, and burns context doing
 * it. Both remain available over MCP, where the client renders them.
 */
const BRIDGED_MCP_TOOLS = [
  "search_courses",
  "get_course",
  "get_sections",
  "get_ratings",
  "check_conflicts",
  "check_requirements",
  "get_my_schedule",
  "add_section",
  "remove_section",
  "watch_section",
  "list_watches",
  "list_bookmark_folders",
  "list_bookmarks",
  "propose_bookmark",
  "propose_unbookmark",
] as const;

/**
 * Turn one MCP tool definition into an AI SDK tool.
 *
 * The two systems describe inputs differently — MCP holds a `ZodRawShape` so it
 * can emit JSON Schema per property, the AI SDK wants a schema object — so the
 * shape is wrapped rather than redeclared. Redeclaring would let the two drift,
 * and the failure mode of a drifted schema is a tool that silently ignores an
 * argument the model carefully supplied.
 */
function bridgeMcpTool(name: string, context: AgentToolContext) {
  const definition = findTool(name);
  if (!definition) throw new Error(`bridgeMcpTool: no MCP tool named "${name}"`);

  return tool({
    description: definition.description,
    inputSchema: z.object(definition.inputSchema),
    async execute(input: Record<string, unknown>) {
      const result = await definition.handler(input, context.mcp);
      const text = result.content.map((part) => part.text).join("\n");

      /*
       * Errors are recorded too. An error payload names no courses, so it
       * cannot widen the grounded set — but it CAN explain why the model went
       * on to say it could not find something, which is worth having when a
       * turn is being debugged after the fact.
       */
      context.transcript.push(text);
      return text;
    },
  });
}

/* ==========================================================================
 * The three the engine adds
 * ========================================================================== */

const ACTIVE_TERMS: TermCode[] = ["20263", "20271"];

/**
 * The student's record and their audit, through the SAME path the profile page
 * uses.
 *
 * `loadStudentProfile` → `auditProfile` → `expandCandidatesForPrograms` is not
 * a convenience here, it is the point. If the agent evaluated requirements by
 * its own route it would eventually disagree with the page the student is
 * looking at, and "the chatbot says I still need Global Core but my audit says
 * I don't" is a bug report that costs more trust than the feature earns. Every
 * subtlety that path already handles — attestations re-keyed per program,
 * planned courses counting, cross-counted courses reported rather than
 * silently resolved — is inherited rather than reimplemented.
 */
async function loadStudentAudit() {
  const profile = await loadStudentProfile();
  if (!profile) throw new Error("loadStudentAudit: no signed-in student");

  const facts = await loadCourseFacts(profile.courses.map((course) => course.courseId));
  const audit = auditProfile({ profile, catalog: facts });

  /*
   * Candidate expansion is what makes `get_unmet_requirements` worth calling.
   * Without it every `n_matching` group — Global Core, the Science
   * requirement, CS electives, i.e. every requirement a student actually needs
   * help with — comes back with an empty candidate list, and the agent can
   * only repeat the requirement's name back at them.
   */
  const programs = await expandCandidatesForPrograms(audit.programs, {
    provider: createSupabaseCandidateProvider({ terms: ACTIVE_TERMS }),
    // Never suggest what the student has already done.
    exclude: profile.courses.map((course) => course.courseId),
  });

  return { profile, audit: { ...audit, programs }, facts };
}

/**
 * Catalog facts for the courses on a student's record.
 *
 * Mirrors `loadFacts` in `lib/profile/page-data.ts` — same two terms, same
 * first-term-wins rule, same `pointsMin` choice — because the agent's answer
 * about a student's credit total has to match the number on their profile page.
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

/** The engine's `StudentProfile`, built from the app's. */
function toEngineProfile(profile: AppStudentProfile): EngineStudentProfile {
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

/**
 * Candidate courses for the active terms.
 *
 * Narrowed to what is actually offered BEFORE scoring, not after. Scoring the
 * whole 8,189-course catalog and filtering afterwards would rank a course the
 * student cannot register for above one they can — and the ranking is the
 * product.
 */
async function loadCandidates(): Promise<CandidateCourse[]> {
  const byId = new Map<string, CandidateCourse>();

  for (const termCode of ACTIVE_TERMS) {
    for (const course of await getAllCourses(termCode)) {
      if (byId.has(course.courseId)) continue;
      byId.set(course.courseId, {
        courseId: course.courseId,
        code: `${course.subjectCode} ${course.number}${course.qualifier ?? ""}`,
        title: course.title,
        // `pointsMin`, matching the audit: counting a variable-credit course at
        // its maximum would let a points requirement look satisfied on credit
        // the student may not earn.
        points: course.pointsMin ?? course.pointsMax,
      });
    }
  }

  return [...byId.values()];
}

/**
 * The prerequisite source, with its degradation made explicit.
 *
 * `loadProgressionGraph` throws rather than returning an empty graph, because
 * an empty graph reports every course as `met` and would silently disable the
 * hard filter — recommending COMS W4111 to a first-year on the strength of a
 * failed query. Catching that here and falling back to `unknownPrereqSource` is
 * the other half of the contract: the agent keeps working, every course carries
 * a "we could not check this" caveat, and nothing is ever presented as eligible
 * because a query failed.
 */
async function prereqSourceOrDegrade(): Promise<PrereqSource> {
  try {
    return graphPrereqSource(await loadProgressionGraph());
  } catch (cause) {
    console.error("agent: prerequisite graph unavailable, degrading to unknown:", cause);
    return unknownPrereqSource();
  }
}

function engineTools(context: AgentToolContext): ToolSet {
  /** Record output for the grounding check and hand the model the same text. */
  const emit = (payload: unknown): string => {
    const text = JSON.stringify(payload, null, 2);
    context.transcript.push(text);
    return text;
  };

  return {
    get_courses_taken: tool({
      description:
        "The student's confirmed coursework: what they have taken, when, and whether they said " +
        "they liked it. `liked: null` means they were never asked — it does NOT mean they " +
        "disliked it, and you must not describe it that way. `inCatalog: false` marks transfer, " +
        "AP or archived credit we hold no catalog record for; that is real coursework and must " +
        "never be called invalid.",
      inputSchema: z.object({}),
      async execute() {
        const { profile, facts } = await loadStudentAudit();
        return emit({
          school: profile.school,
          classYear: profile.classYear,
          programIds: profile.programIds,
          interestTags: profile.interestTags,
          count: profile.courses.length,
          courses: profile.courses.map((course) => ({
            courseId: course.courseId,
            code: formatCourseId(course.courseId),
            title: facts.get(course.courseId)?.title ?? null,
            termLabel: course.termLabel,
            points: course.points,
            liked: course.liked,
            planned: course.source === "plan",
            inCatalog: facts.has(course.courseId),
          })),
        });
      },
    }),

    get_unmet_requirements: tool({
      description:
        "Requirement groups the student has not satisfied, per program, with the courses that " +
        "would satisfy each. Call this before saying anything about what a student still needs. " +
        "`verification` says how a group was checked: `exact` matched a named course list, " +
        "`flagged` trusted a Bulletin flag, and `attested` is the student's own statement that " +
        "has been verified against nothing — say so when you rely on one. `origin: \"parsed\"` " +
        "means the program was read automatically from the Bulletin and not checked by a person.",
      inputSchema: z.object({
        programId: z
          .string()
          .optional()
          .describe("Restrict to one program id. Omit for every program the student is in."),
      }),
      async execute({ programId }) {
        const { audit } = await loadStudentAudit();
        const wanted = programId
          ? audit.programs.filter((result) => result.program.id === programId)
          : audit.programs;

        return emit({
          programs: wanted.map((result) => ({
            programId: result.program.id,
            programName: result.program.name,
            kind: result.program.kind,
            origin: result.program.origin,
            sourceUrl: result.program.sourceUrl,
            unmet: result.groups
              .filter((group) => group.status !== "satisfied")
              .map((group) => ({
                groupId: group.group.id,
                label: group.group.label,
                status: group.status,
                verification: group.verification,
                completed: group.completed,
                required: group.required,
                unit: group.unit,
                matched: group.matched.map((match) => match.code),
                /*
                 * Capped, with the true size alongside. A Global Core group can
                 * expand to hundreds of courses; pasting all of them costs the
                 * model its context and tells the student nothing a filtered
                 * `recommend_courses` call would not tell them better.
                 */
                candidates: group.candidates.slice(0, 30).map(formatCourseId),
                candidateCount: group.candidates.length,
              })),
          })),
          crossCounted: audit.crossCounted,
          unmatchedCourseIds: audit.unmatchedCourseIds,
        });
      },
    }),

    recommend_courses: tool({
      description:
        "The recommendation engine. Returns courses offered in the active terms, ranked for THIS " +
        "student, each carrying the reasons it was chosen. Prefer this over search_courses " +
        "whenever the student is asking what they should take rather than about a course they " +
        "already named. Courses whose prerequisites the student has not met are EXCLUDED from " +
        "`recommendations`; set includeWithheld to see them under `withheld`, with what is " +
        "missing and whether the registrar's own wording allows instructor permission as a way " +
        "in. `caveats` containing `no_vector` means we have no semantic profile for that course " +
        "and it was ranked on requirement fit alone.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(25).default(10),
        subjects: z
          .array(z.string())
          .optional()
          .describe('Restrict to subject codes, e.g. ["COMS", "MATH"].'),
        includeWithheld: z
          .boolean()
          .default(false)
          .describe("Also return courses blocked by prerequisites. Use when asked why, or why not."),
      }),
      async execute({ limit, subjects, includeWithheld }) {
        const [{ profile, audit }, allCandidates, prereqs] = await Promise.all([
          loadStudentAudit(),
          loadCandidates(),
          prereqSourceOrDegrade(),
        ]);

        const wanted = subjects?.map((subject) => subject.toUpperCase());
        const candidates = wanted?.length
          ? allCandidates.filter((course) => wanted.includes(course.code.split(" ")[0]))
          : allCandidates;

        const result = recommend({
          profile: toEngineProfile(profile),
          candidates,
          outstanding: audit.programs.flatMap((program) =>
            program.groups.filter((group) => group.status !== "satisfied"),
          ),
          prereqs,
          /*
           * No vectors yet. The LSA artifact is built for the browser
           * (`public/index/*.emb.bin`) and decoding it server-side is separate
           * work. Until then taste scores zero, every result carries a
           * `no_vector` caveat, and ranking falls back to requirement fit and
           * unlock — a real feed, the "what your degree needs" half working
           * without the "what you might like" half. Visible in the output
           * rather than silently absent, which is why the caveat is not
           * stripped before the model sees it.
           */
          vectors: noVectorSource(),
          limit,
          withheldLimit: includeWithheld ? limit : 0,
        });

        return emit({
          recommendations: result.recommendations.map((entry) => ({
            courseId: entry.course.courseId,
            code: entry.course.code,
            title: entry.course.title,
            points: entry.course.points,
            score: Number(entry.score.toFixed(4)),
            components: entry.components,
            reasons: entry.reasons,
            caveats: entry.caveats,
          })),
          ...(includeWithheld
            ? {
                withheld: result.withheld.map((entry) => ({
                  courseId: entry.course.courseId,
                  code: entry.course.code,
                  title: entry.course.title,
                  reason: entry.reason,
                  missing: entry.missing,
                  advisories: entry.advisories,
                })),
              }
            : {}),
        });
      },
    }),
  };
}

/* ==========================================================================
 * The set
 * ========================================================================== */

export function buildAgentTools(context: AgentToolContext): ToolSet {
  const tools: ToolSet = {};
  for (const name of BRIDGED_MCP_TOOLS) tools[name] = bridgeMcpTool(name, context);
  return { ...tools, ...engineTools(context) };
}
