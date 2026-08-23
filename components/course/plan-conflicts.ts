/**
 * Local candidate evaluation: does this section collide with the primary plan,
 * and can the student physically get between the two rooms in time?
 *
 * This is the drawer's own fallback so the "immediate conflict and commute
 * warnings" required above the fold (spec §7) are real from day one. The
 * schedule lane owns the authoritative version; when it lands, inject it as
 * `CourseDetailIntegrations.evaluateCandidate` and this file stops being used.
 */

import { isCrossCampus, WEEKDAY_LABEL, ZONE_WALK_MINUTES, minutesToLabel } from "@/lib/constants";
import type { CommuteLeg, ScheduleConflict, Weekday } from "@/lib/types";
import type { CandidateEvaluation, PlannedMeeting, PrimaryPlanSnapshot } from "./contracts";

function overlaps(a: PlannedMeeting, b: PlannedMeeting): boolean {
  return a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

export function evaluateCandidateLocally(
  candidate: PlannedMeeting[],
  plan: PrimaryPlanSnapshot,
): CandidateEvaluation {
  const conflicts: ScheduleConflict[] = [];
  const commuteLegs: CommuteLeg[] = [];
  const seenConflicts = new Set<string>();

  // A different section of the same course is a duplicate, not an overlap.
  const candidateCourseId = candidate.find((m) => m.courseId)?.courseId ?? null;
  if (candidateCourseId) {
    const duplicate = plan.meetings.find(
      (m) => m.courseId === candidateCourseId && m.ownerId !== candidate[0]?.ownerId,
    );
    if (duplicate) {
      conflicts.push({
        kind: "duplicate_course",
        severity: "hard",
        message: `${duplicate.label} is already in ${plan.name} — adding this replaces it rather than stacking.`,
        involves: [duplicate.ownerId, candidate[0]?.ownerId ?? candidateCourseId],
        weekday: duplicate.weekday,
      });
    }
  }

  for (const block of candidate) {
    for (const planned of plan.meetings) {
      if (planned.ownerId === block.ownerId) continue;

      if (overlaps(block, planned)) {
        const key = `overlap:${planned.ownerId}:${block.weekday}`;
        if (!seenConflicts.has(key)) {
          seenConflicts.add(key);
          conflicts.push({
            kind: "overlap",
            severity: "hard",
            message: `Overlaps ${planned.label} on ${WEEKDAY_LABEL[block.weekday]} (${minutesToLabel(
              Math.max(block.startMinute, planned.startMinute),
            )}–${minutesToLabel(Math.min(block.endMinute, planned.endMinute))}).`,
            involves: [planned.ownerId, block.ownerId],
            weekday: block.weekday,
          });
        }
        continue;
      }

      if (planned.weekday !== block.weekday) continue;

      // Back-to-back pair: whichever ends first is the origin.
      const [first, second] = planned.endMinute <= block.startMinute
        ? [planned, block]
        : block.endMinute <= planned.startMinute
          ? [block, planned]
          : [null, null];
      if (!first || !second) continue;

      const gapMinutes = second.startMinute - first.endMinute;
      // Anything beyond a normal passing period is not a commute question.
      if (gapMinutes > 60) continue;

      const walkMinutes = ZONE_WALK_MINUTES[first.campusZone][second.campusZone];
      const crossCampus = isCrossCampus(first.campusZone, second.campusZone);
      const feasible = gapMinutes >= walkMinutes;
      if (feasible && !crossCampus) continue;

      const leg: CommuteLeg = {
        weekday: block.weekday,
        fromLabel: first.buildingName ?? first.label,
        toLabel: second.buildingName ?? second.label,
        fromZone: first.campusZone,
        toZone: second.campusZone,
        walkMinutes,
        gapMinutes,
        feasible,
      };
      commuteLegs.push(leg);

      const key = `commute:${first.ownerId}:${second.ownerId}:${block.weekday}`;
      if (seenConflicts.has(key)) continue;
      seenConflicts.add(key);
      conflicts.push({
        kind: "commute",
        severity: crossCampus || !feasible ? "hard" : "soft",
        message: feasible
          ? `${WEEKDAY_LABEL[block.weekday]}: ${walkMinutes} min walk from ${leg.fromLabel} to ${leg.toLabel} with ${gapMinutes} min between classes.`
          : `${WEEKDAY_LABEL[block.weekday]}: ${walkMinutes} min walk from ${leg.fromLabel} to ${leg.toLabel}, but only ${gapMinutes} min between classes.`,
        involves: [first.ownerId, second.ownerId],
        weekday: block.weekday,
      });
    }
  }

  const order: Record<Weekday, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
  conflicts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "hard" ? -1 : 1;
    return order[a.weekday] - order[b.weekday];
  });

  return { conflicts, commuteLegs };
}
