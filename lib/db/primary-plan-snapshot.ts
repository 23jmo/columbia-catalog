/**
 * The viewer's primary plan, in the shape the course page wants.
 *
 * Spec §7 puts a question above the fold on every course page: *does this
 * clash with what I already have?* The drawer has had a real answer for it all
 * along — `evaluateCandidateLocally` does the conflict and commute maths — but
 * `courseDetailIntegrations.primaryPlan` was hard-coded to `null`, so the panel
 * has only ever been able to say "no plan to check against".
 *
 * This is the missing half. It reads the reader's own primary plan on the
 * server, flattens it into the `PrimaryPlanSnapshot` the contract asks for, and
 * hands it over. Every warning on the page is then about *their* week.
 *
 * ── Why the server and not the client ─────────────────────────────────────
 *
 * The conflict panel sits above the fold. Resolving the plan in the browser
 * would mean the panel renders "no plan" first and corrects itself a beat
 * later, which is worse than useless — a student who glances and scrolls has
 * been told their schedule is clear when it is not. Reading it during the
 * server render means the first paint is already correct.
 *
 * ── Failure is silent, and that is deliberate ─────────────────────────────
 *
 * Returning `null` degrades to exactly the state that shipped before: the panel
 * says it has no plan to check against, which is honest. A course page must not
 * fail to render because the plans table was slow.
 */

import type { PlannedMeeting, PrimaryPlanSnapshot } from "@/components/course/contracts";
import { resolveCampusZone } from "@/lib/campus/zones";
import { getSections } from "@/lib/data/catalog";
import { getPrimaryPlanForViewer } from "@/lib/db/plan-reads";
import type { Section, TermCode } from "@/lib/types";

/** `COMS 4118 · 001` — the label a conflict warning names the other class by. */
function sectionLabel(section: Section): string {
  return `${section.courseId} · ${section.sectionCode}`;
}

function meetingsOfSection(section: Section): PlannedMeeting[] {
  return section.meetings.map((meeting) => ({
    ownerId: section.sectionId,
    label: sectionLabel(section),
    courseId: section.courseId,
    weekday: meeting.weekday,
    startMinute: meeting.startMinute,
    endMinute: meeting.endMinute,
    buildingName: meeting.buildingName,
    campusZone: resolveCampusZone(meeting.buildingName),
  }));
}

export async function loadPrimaryPlanSnapshot(
  termCode: TermCode,
): Promise<PrimaryPlanSnapshot | null> {
  const plan = await getPrimaryPlanForViewer(termCode);
  if (!plan) return null;

  const sections = plan.sectionIds.length > 0 ? await getSections(plan.sectionIds) : [];

  /*
   * Custom blocks are meetings too. "Work, Tue/Thu 3–6" is the single most
   * common reason a section that looks free is not, and a conflict check that
   * quietly ignored it would be wrong in the case students care about most.
   * They carry no building, so their zone is "unknown" and the commute check
   * skips them rather than inventing a walk.
   */
  const blockMeetings: PlannedMeeting[] = plan.customBlocks.map((block) => ({
    ownerId: block.blockId,
    label: block.label,
    courseId: null,
    weekday: block.weekday,
    startMinute: block.startMinute,
    endMinute: block.endMinute,
    buildingName: null,
    campusZone: "unknown",
  }));

  return {
    planId: plan.planId,
    name: plan.name,
    termCode: plan.termCode,
    sectionIds: plan.sectionIds,
    meetings: [...sections.flatMap(meetingsOfSection), ...blockMeetings],
  };
}
