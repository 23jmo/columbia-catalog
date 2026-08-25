/**
 * Schedule and campus-map artifacts for the chat thread.
 *
 * Same contract as `recommend_courses` → `FeedCard`: the tool resolves real
 * catalog/plan rows on the server and returns the exact props the existing
 * cards already take. The model never invents a meeting time or a building.
 * Conversation UI reads these payloads back out and renders
 * `CalendarWeekPreview` / `CampusCard` — the identical components the course
 * drawer and schedule tab use.
 */

import type { CampusRouteStop } from "@/components/campus/contracts";
import type { WeekGridBlock } from "@/components/course/contracts";
import { toWeekGridBlocks } from "@/components/schedule/to-blocks";
import { CURRENT_TERM, WEEKDAY_LABEL, minutesToLabel } from "@/lib/constants";
import type { CatalogPort, PlansPort } from "@/lib/mcp/contracts";
import { sectionLabel, toTimedItems } from "@/lib/schedule/timeline";
import type { Plan, Section, TermCode, Weekday } from "@/lib/types";

export type { InstructorArtifact, InstructorCourseChip } from "./present-instructor";
export { buildInstructorArtifact } from "./present-instructor";

export interface ScheduleArtifact {
  kind: "schedule_card";
  termCode: TermCode;
  planId: string | null;
  planName: string | null;
  blocks: WeekGridBlock[];
  weekdays?: Weekday[];
  commitmentIds: string[];
  unknownMeetingSectionIds: string[];
  unresolvedSectionIds: string[];
}

export interface CampusMapArtifact {
  kind: "campus_map_card";
  buildingNames: Array<string | null>;
  roomLabel: string | null;
  label: string | null;
  meta: string | null;
  routeStops: CampusRouteStop[] | null;
  connectStops: boolean;
  weekday: Weekday | null;
}

type PlanDeps = {
  catalog: Pick<CatalogPort, "getSections">;
  plans: Pick<PlansPort, "listPlans" | "getPlan">;
};

export async function buildScheduleArtifact(
  deps: PlanDeps,
  userId: string,
  input: {
    planId?: string;
    sectionIds?: string[];
    weekday?: Weekday;
    termCode?: string;
  },
): Promise<ScheduleArtifact> {
  const termCode = input.termCode ?? CURRENT_TERM;
  const plan = await resolvePlan(deps.plans, userId, input.planId, termCode);

  const planSectionIds = plan?.sectionIds ?? [];
  const extraIds = (input.sectionIds ?? []).filter((id) => !planSectionIds.includes(id));
  const allIds = [...new Set([...planSectionIds, ...extraIds])];
  const sections = allIds.length > 0 ? await deps.catalog.getSections(allIds) : [];
  const byId = new Map(sections.map((section) => [section.sectionId, section]));

  const planSections = pickSections(planSectionIds, byId);
  const candidateSections = pickSections(extraIds, byId);

  let blocks = toWeekGridBlocks({
    sections: planSections,
    customBlocks: plan?.customBlocks ?? [],
    candidateSections,
  });
  if (input.weekday) {
    blocks = blocks.filter((block) => block.weekday === input.weekday);
  }

  return {
    kind: "schedule_card",
    termCode: plan?.termCode ?? termCode,
    planId: plan?.planId ?? null,
    planName: plan?.name ?? null,
    blocks,
    ...(input.weekday ? { weekdays: [input.weekday] } : {}),
    commitmentIds: (plan?.customBlocks ?? []).map((block) => block.blockId),
    unknownMeetingSectionIds: sections
      .filter((section) => section.meetings.length === 0)
      .map((section) => section.sectionId),
    unresolvedSectionIds: allIds.filter((id) => !byId.has(id)),
  };
}

export async function buildCampusMapArtifact(
  deps: Pick<PlanDeps, "catalog">,
  input: {
    sectionIds?: string[];
    buildingNames?: string[];
    weekday?: Weekday;
    highlightSectionId?: string;
  },
): Promise<CampusMapArtifact> {
  const sections = input.sectionIds?.length
    ? await deps.catalog.getSections(input.sectionIds)
    : [];

  if (input.weekday && sections.length > 0) {
    return mapForDay(sections, input.weekday, input.highlightSectionId);
  }

  const fromMeetings = uniqueBuildings(sections);
  const buildingNames = fromMeetings.length > 0 ? fromMeetings : (input.buildingNames ?? []);
  const first = firstMeeting(sections);

  return {
    kind: "campus_map_card",
    buildingNames,
    roomLabel: first?.room ?? null,
    label: sections[0] ? sectionLabel(sections[0]) : (buildingNames[0] ?? null),
    meta: first
      ? `${WEEKDAY_LABEL[first.weekday]} · ${minutesToLabel(first.startMinute)}–${minutesToLabel(first.endMinute)}`
      : null,
    routeStops:
      buildingNames.length > 0
        ? buildingNames.map((name, index) => ({
            buildingNames: [name],
            label: name ?? "Unknown",
            highlighted: index === 0,
          }))
        : null,
    connectStops: false,
    weekday: null,
  };
}

async function resolvePlan(
  plans: Pick<PlansPort, "listPlans" | "getPlan">,
  userId: string,
  planId: string | undefined,
  termCode: string,
): Promise<Plan | null> {
  if (planId) return plans.getPlan(userId, planId);
  const listed = await plans.listPlans(userId, termCode);
  return listed.find((plan) => plan.isPrimary) ?? listed[0] ?? null;
}

function pickSections(ids: readonly string[], byId: Map<string, Section>): Section[] {
  return ids.map((id) => byId.get(id)).filter((section): section is Section => Boolean(section));
}

function uniqueBuildings(sections: readonly Section[]): string[] {
  const names: string[] = [];
  for (const section of sections) {
    for (const meeting of section.meetings) {
      if (meeting.buildingName && !names.includes(meeting.buildingName)) {
        names.push(meeting.buildingName);
      }
    }
  }
  return names;
}

function firstMeeting(sections: readonly Section[]): Section["meetings"][number] | undefined {
  return sections.find((section) => section.meetings.length > 0)?.meetings[0];
}

function mapForDay(
  sections: readonly Section[],
  weekday: Weekday,
  highlightSectionId: string | undefined,
): CampusMapArtifact {
  const items = toTimedItems(sections, [])
    .filter((item) => item.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const highlight = highlightSectionId ?? items[0]?.id ?? "";
  const focused = items.find((item) => item.id === highlight) ?? items[0];
  const routeStops: CampusRouteStop[] = items.map((item) => ({
    buildingNames: item.buildingName ? [item.buildingName] : [],
    label: item.label,
    meta: `${minutesToLabel(item.startMinute)}–${minutesToLabel(item.endMinute)}`,
    highlighted: item.id === highlight,
  }));

  return {
    kind: "campus_map_card",
    buildingNames: items.map((item) => item.buildingName).filter((name): name is string => Boolean(name)),
    roomLabel: focused?.room ?? null,
    label: focused?.label ?? null,
    meta: focused
      ? `${WEEKDAY_LABEL[weekday]} · ${minutesToLabel(focused.startMinute)}–${minutesToLabel(focused.endMinute)}`
      : WEEKDAY_LABEL[weekday],
    routeStops: routeStops.length > 0 ? routeStops : null,
    connectStops: true,
    weekday,
  };
}
