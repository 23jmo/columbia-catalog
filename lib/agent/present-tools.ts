/**
 * Tools that put existing UI on the thread.
 *
 * `get_my_schedule` and `get_sections` are lookups. These are the render
 * verbs: the student sees `CalendarWeekPreview`, `CampusCard`, or the
 * instructor hero under the answer, the same way `recommend_courses` puts
 * `FeedCardView` on screen. Splitting lookup from render is what keeps
 * "how many credits am I taking" from dumping a week canvas into the thread.
 */

import { z } from "zod";
import { tool, type ToolSet } from "ai";

import { buildCampusMapArtifact, buildInstructorArtifact, buildScheduleArtifact } from "@/lib/agent/present";
import { loadInstructorProfile } from "@/lib/data/instructors";
import { getInstructorReputation } from "@/lib/db/reputation";
import type { McpDeps } from "@/lib/mcp/contracts";

const WEEKDAY = z.enum(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);

export function presentTools(context: {
  userId: string;
  transcript: string[];
  mcp: { deps: McpDeps };
}): ToolSet {
  const emit = (payload: unknown): string => {
    const text = JSON.stringify(payload, null, 2);
    context.transcript.push(text);
    return text;
  };

  return {
    show_schedule: tool({
      description:
        "Put the student's week on screen as the same calendar the schedule tab uses. " +
        "Call this when they ask what their week / Tuesday / plan looks like, or when you " +
        "are comparing a section against the plan. Pass sectionIds to overlay candidates " +
        "(they draw as the preview tone). get_my_schedule is the lookup; this is what " +
        "makes the calendar appear. The student SEES the calendar under your answer.",
      inputSchema: z.object({
        planId: z.string().optional().describe("Omit to use the primary plan for the term."),
        termCode: z.string().optional().describe("Term code, e.g. 20263. Defaults to the current term."),
        sectionIds: z
          .array(z.string())
          .optional()
          .describe("Extra sections to preview on the week, not already on the plan."),
        weekday: WEEKDAY.optional().describe("Narrow to one day, e.g. Tu."),
      }),
      async execute({ planId, termCode, sectionIds, weekday }) {
        const artifact = await buildScheduleArtifact(context.mcp.deps, context.userId, {
          ...(planId ? { planId } : {}),
          ...(termCode ? { termCode } : {}),
          ...(sectionIds?.length ? { sectionIds } : {}),
          ...(weekday ? { weekday } : {}),
        });
        return emit(artifact);
      },
    }),

    show_campus_map: tool({
      description:
        "Put the campus map on screen — the same CampusCard the course drawer uses. " +
        "Call this when they ask where a class meets, whether two classes are a walk, " +
        "or what Thursday's route looks like. Pass sectionIds so buildings come from " +
        "the catalog, not from memory. Pass weekday to draw that day's walk in order. " +
        "The student SEES the map under your answer.",
      inputSchema: z.object({
        sectionIds: z.array(z.string()).optional().describe("Sections whose meetings supply the buildings."),
        buildingNames: z
          .array(z.string())
          .optional()
          .describe("Only when you have no section ids. Raw directory names, e.g. Hamilton Hall."),
        weekday: WEEKDAY.optional().describe("Draw that day's route in meeting order."),
        highlightSectionId: z.string().optional().describe("The section that gets the pulsing pin."),
      }),
      async execute({ sectionIds, buildingNames, weekday, highlightSectionId }) {
        const artifact = await buildCampusMapArtifact(context.mcp.deps, {
          ...(sectionIds?.length ? { sectionIds } : {}),
          ...(buildingNames?.length ? { buildingNames } : {}),
          ...(weekday ? { weekday } : {}),
          ...(highlightSectionId ? { highlightSectionId } : {}),
        });
        return emit(artifact);
      },
    }),

    show_instructor: tool({
      description:
        "Put an instructor on screen as the same identity + rating card the instructor " +
        "page uses. Call this when they ask about a professor, who teaches a section, or " +
        "whether someone is any good. Pass the name exactly as a tool returned it — never " +
        "a guessed spelling, and never Staff/TBA. get_ratings is the lookup; this is what " +
        "makes the card appear. The student SEES the card under your answer.",
      inputSchema: z.object({
        name: z.string().describe("Instructor name as it appears on a section, e.g. Luis Gravano."),
        termCode: z.string().optional().describe("Term code, e.g. 20263. Defaults to the current term."),
      }),
      async execute({ name, termCode }) {
        const artifact = await buildInstructorArtifact(
          { loadProfile: loadInstructorProfile, loadReputation: getInstructorReputation },
          { name, ...(termCode ? { termCode } : {}) },
        );
        return emit(artifact);
      },
    }),
  };
}
