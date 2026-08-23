/**
 * Schedule lane — tests.
 *
 * Relative imports throughout: there is no vitest config in the repo and the
 * `@/` alias is a Next.js/tsconfig path that plain vitest does not resolve.
 * Run with `npx vitest run lib/schedule`.
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { Building, Course, CustomBlock, Meeting, Plan, Section } from "../types";
import { detectConflicts, isPlanFeasible } from "./conflicts";
import { analyzeCommute, commuteConflicts, walkMinutesBetween } from "./commute";
import { analyzePlan, creditTotals, sectionCredits, daysWithNoClasses } from "./analysis";
import { planToIcs, planEvents, firstOccurrence, weeklyRule, icsFilename } from "./ics";
import {
  LocalPlanStore,
  PlanWriteDeniedError,
  copyName,
  enforceSinglePrimary,
  makeBlock,
  nextPlanName,
  setAuthGuard,
} from "./plans";
import { DEMO_BUILDINGS, findBuilding, zoneOf } from "./buildings";
import { buildTerm } from "../constants";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TERM = "20263";

function meeting(
  weekday: Meeting["weekday"],
  startMinute: number,
  endMinute: number,
  buildingName: string | null = "Seeley W. Mudd Building",
  room: string | null = "833",
): Meeting {
  return { weekday, startMinute, endMinute, buildingName, room };
}

function section(overrides: Partial<Section> & { sectionId: string; courseId: string }): Section {
  return {
    termCode: TERM,
    callNumber: "00000",
    sectionCode: "001",
    component: null,
    methodOfInstruction: null,
    gradingMode: null,
    minUnit: 3,
    maxUnit: 3,
    instructors: ["Jae Woo Lee"],
    meetings: [],
    enrollmentCount: 10,
    enrollmentCap: 100,
    waitlistCount: null,
    waitlistCap: null,
    status: "open",
    sourceAsOf: "August 22, 2026",
    lastSeenAt: null,
    detailUrl: null,
    note: null,
    openTo: null,
    ...overrides,
  };
}

function course(overrides: Partial<Course> & { courseId: string }): Course {
  return {
    subjectCode: "COMS",
    number: 4118,
    qualifier: "W",
    title: "OPERATING SYSTEMS I",
    description: null,
    pointsMin: 3,
    pointsMax: 3,
    prerequisiteText: null,
    department: "Computer Science",
    requirementFlags: {},
    ...overrides,
  };
}

/** 10:10–11:25 MW in Mudd. */
const OS = section({
  sectionId: `${TERM}COMS4118W001`,
  courseId: "COMS4118W",
  callNumber: "12345",
  meetings: [meeting("Mo", 610, 685), meeting("We", 610, 685)],
});

/** 11:00–12:15 MW in Pupin — overlaps OS by 25 minutes. */
const OVERLAPPING = section({
  sectionId: `${TERM}COMS4111W001`,
  courseId: "COMS4111W",
  callNumber: "12346",
  meetings: [meeting("Mo", 660, 735, "Pupin Laboratories", "428")],
});

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

describe("detectConflicts", () => {
  it("finds a course-on-course overlap, once per weekday", () => {
    const conflicts = detectConflicts([OS, OVERLAPPING], []);
    const overlaps = conflicts.filter((conflict) => conflict.kind === "overlap");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].weekday).toBe("Mo");
    expect(overlaps[0].severity).toBe("hard");
    expect(overlaps[0].involves).toEqual(
      expect.arrayContaining([OS.sectionId, OVERLAPPING.sectionId]),
    );
  });

  it("reports a Mon/Wed clash on both days", () => {
    const bothDays = section({
      sectionId: `${TERM}COMS4995W001`,
      courseId: "COMS4995W",
      meetings: [meeting("Mo", 660, 735), meeting("We", 660, 735)],
    });
    const overlaps = detectConflicts([OS, bothDays], []).filter((c) => c.kind === "overlap");
    expect(overlaps.map((c) => c.weekday).sort()).toEqual(["Mo", "We"]);
  });

  it("treats back-to-back classes as clean — a class ending at 11:25 does not clash with 11:25", () => {
    const nextUp = section({
      sectionId: `${TERM}COMS3157W001`,
      courseId: "COMS3157W",
      meetings: [meeting("Mo", 685, 760)],
    });
    expect(detectConflicts([OS, nextUp], [])).toHaveLength(0);
  });

  // Spec §8: custom blocks are first class. This is the conflict that actually bites.
  it("conflicts a course against a custom block", () => {
    const work: CustomBlock = makeBlock("Work", "Mo", 600, 780);
    const conflicts = detectConflicts([OS], [work]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("overlap");
    expect(conflicts[0].severity).toBe("hard");
    expect(conflicts[0].involves).toEqual(
      expect.arrayContaining([OS.sectionId, work.blockId]),
    );
    expect(conflicts[0].message).toContain("Work");
  });

  it("catches a Tue/Thu shift against a Tue/Thu class", () => {
    const tuTh = section({
      sectionId: `${TERM}COMS4771W001`,
      courseId: "COMS4771W",
      meetings: [meeting("Tu", 880, 955), meeting("Th", 880, 955)],
    });
    const shift = [
      makeBlock("Work", "Tu", 900, 1080),
      makeBlock("Work", "Th", 900, 1080),
    ];
    const conflicts = detectConflicts([tuTh], shift).filter((c) => c.kind === "overlap");
    expect(conflicts.map((c) => c.weekday).sort()).toEqual(["Th", "Tu"]);
  });

  it("keeps two personal commitments soft — the student may double-book their own time", () => {
    const conflicts = detectConflicts(
      [],
      [makeBlock("Gym", "Fr", 600, 700), makeBlock("Lunch", "Fr", 650, 720)],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe("soft");
    expect(isPlanFeasible(conflicts)).toBe(true);
  });

  it("flags two sections of the same course even when the times are clean", () => {
    const other = section({
      sectionId: `${TERM}COMS4118W002`,
      courseId: "COMS4118W",
      sectionCode: "002",
      meetings: [meeting("Fr", 800, 875)],
    });
    const duplicates = detectConflicts([OS, other], []).filter(
      (conflict) => conflict.kind === "duplicate_course",
    );
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].severity).toBe("hard");
    expect(duplicates[0].involves).toHaveLength(2);
  });

  it("does not conflict a section with itself when it meets twice in one day", () => {
    const lectureAndLab = section({
      sectionId: `${TERM}COMS1004W001`,
      courseId: "COMS1004W",
      meetings: [meeting("Mo", 600, 675), meeting("Mo", 700, 775)],
    });
    expect(detectConflicts([lectureAndLab], [])).toHaveLength(0);
  });

  it("ignores sections with no meeting times rather than crashing", () => {
    const async = section({ sectionId: `${TERM}COMS0000W001`, courseId: "COMS0000W" });
    expect(detectConflicts([async, OS], [])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Commute
// ---------------------------------------------------------------------------

describe("commute", () => {
  it("resolves messy directory building strings to zones", () => {
    expect(zoneOf("417 MATHEMATICS BUILDING", DEMO_BUILDINGS)).toBe("morningside");
    expect(zoneOf("Jerome L. Greene Science Center", DEMO_BUILDINGS)).toBe("manhattanville");
    expect(zoneOf("Hammer Health Sciences Center", DEMO_BUILDINGS)).toBe("cuimc");
  });

  it("never crashes on an unknown building — it degrades to the zone table", () => {
    expect(findBuilding("Some Building That Does Not Exist", DEMO_BUILDINGS)).toBeNull();
    expect(zoneOf(null, DEMO_BUILDINGS)).toBe("unknown");
    expect(walkMinutesBetween(null, null)).toBeGreaterThan(0);
  });

  it("uses zone estimates when buildings carry no geocode", () => {
    const morningside = findBuilding("Seeley W. Mudd Building", DEMO_BUILDINGS);
    const manhattanville = findBuilding("Jerome L. Greene Science Center", DEMO_BUILDINGS);
    expect(morningside?.lat).toBeNull();
    expect(walkMinutesBetween(morningside, manhattanville)).toBe(14);
  });

  it("refines an intra-zone walk when both geocodes exist", () => {
    const from: Building = {
      buildingId: "a",
      name: "A",
      lat: 40.8095,
      lng: -73.9615,
      campusZone: "morningside",
    };
    const to: Building = { ...from, buildingId: "b", name: "B", lat: 40.807, lng: -73.9635 };
    const minutes = walkMinutesBetween(from, to);
    expect(minutes).toBeGreaterThan(0);
    expect(minutes).toBeLessThan(14);
  });

  // The headline case: CUIMC is 35 minutes away and a passing period is 10.
  it("makes a CUIMC hop infeasible in a 10-minute passing period", () => {
    const morningside = section({
      sectionId: `${TERM}COMS4118W001`,
      courseId: "COMS4118W",
      meetings: [meeting("Tu", 600, 675, "Seeley W. Mudd Building", "833")],
    });
    const medicalCenter = section({
      sectionId: `${TERM}BINF4008W001`,
      courseId: "BINF4008W",
      meetings: [meeting("Tu", 685, 760, "Hammer Health Sciences Center", "401")],
    });

    const legs = analyzeCommute([morningside, medicalCenter], []);
    expect(legs).toHaveLength(1);
    const [leg] = legs;
    expect(leg.fromZone).toBe("morningside");
    expect(leg.toZone).toBe("cuimc");
    expect(leg.gapMinutes).toBe(10);
    expect(leg.walkMinutes).toBe(35);
    expect(leg.feasible).toBe(false);
    expect(leg.fromId).toBe(morningside.sectionId);
    expect(leg.toId).toBe(medicalCenter.sectionId);

    const warnings = commuteConflicts(legs);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe("hard");
    expect(warnings[0].message).toContain("Not makeable");
    expect(warnings[0].involves).toEqual([morningside.sectionId, medicalCenter.sectionId]);
    expect(isPlanFeasible(warnings)).toBe(false);
  });

  it("hard-warns a Morningside → Manhattanville hop with only a passing period", () => {
    const morningside = section({
      sectionId: `${TERM}COMS4118W001`,
      courseId: "COMS4118W",
      meetings: [meeting("We", 600, 675, "Seeley W. Mudd Building", "833")],
    });
    const manhattanville = section({
      sectionId: `${TERM}NEUR4000W001`,
      courseId: "NEUR4000W",
      meetings: [meeting("We", 685, 760, "Jerome L. Greene Science Center", "L5-084")],
    });
    const warnings = commuteConflicts(analyzeCommute([morningside, manhattanville], []));
    expect(warnings[0].severity).toBe("hard");
  });

  it("softens a cross-campus hop that has hours of slack", () => {
    const morningside = section({
      sectionId: `${TERM}COMS4118W001`,
      courseId: "COMS4118W",
      meetings: [meeting("We", 600, 675, "Seeley W. Mudd Building", "833")],
    });
    const manhattanville = section({
      sectionId: `${TERM}NEUR4000W001`,
      courseId: "NEUR4000W",
      meetings: [meeting("We", 900, 975, "Jerome L. Greene Science Center", "L5-084")],
    });
    const warnings = commuteConflicts(analyzeCommute([morningside, manhattanville], []));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe("soft");
  });

  it("soft-notes a tight intra-Morningside walk", () => {
    const mudd = section({
      sectionId: `${TERM}COMS4118W001`,
      courseId: "COMS4118W",
      meetings: [meeting("Mo", 600, 675, "Seeley W. Mudd Building", "833")],
    });
    const pupin = section({
      sectionId: `${TERM}PHYS1601W001`,
      courseId: "PHYS1601W",
      meetings: [meeting("Mo", 683, 758, "Pupin Laboratories", "428")],
    });
    const warnings = commuteConflicts(analyzeCommute([mudd, pupin], []));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe("soft");
    expect(warnings[0].message).toContain("Tight");
  });

  it("does not report a walk between two meetings in the same building", () => {
    const first = section({
      sectionId: `${TERM}A001`,
      courseId: "AAAA1000W",
      meetings: [meeting("Mo", 600, 675, "Seeley W. Mudd Building", "833")],
    });
    const second = section({
      sectionId: `${TERM}B001`,
      courseId: "BBBB1000W",
      meetings: [meeting("Mo", 680, 755, "Seeley W. Mudd Building", "545")],
    });
    expect(analyzeCommute([first, second], [])).toHaveLength(0);
  });

  it("includes custom blocks as commute endpoints", () => {
    const manhattanville = section({
      sectionId: `${TERM}NEUR4000W001`,
      courseId: "NEUR4000W",
      meetings: [meeting("Th", 600, 675, "Jerome L. Greene Science Center", "L5-084")],
    });
    const shift = makeBlock("Work", "Th", 690, 900);
    const legs = analyzeCommute([manhattanville], [shift]);
    expect(legs).toHaveLength(1);
    expect(legs[0].toId).toBe(shift.blockId);
    // The block has no building, so the estimate is a guess and must stay soft.
    expect(commuteConflicts(legs).every((c) => c.severity === "soft")).toBe(true);
  });

  it("leaves overlapping meetings to conflict detection, not commute", () => {
    expect(analyzeCommute([OS, OVERLAPPING], [])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Credits & analysis
// ---------------------------------------------------------------------------

describe("credit math", () => {
  it("reads a fixed-credit section straight off the section", () => {
    expect(sectionCredits(OS)).toEqual({ min: 3, max: 3 });
  });

  // COMS 6900 really is 1–3 points; calling it "1" lies about the student's load.
  it("keeps a variable-credit course as a range", () => {
    const research = section({
      sectionId: `${TERM}COMS6900E001`,
      courseId: "COMS6900E",
      minUnit: 1,
      maxUnit: 3,
      meetings: [meeting("Fr", 600, 675)],
    });
    expect(sectionCredits(research)).toEqual({ min: 1, max: 3 });

    const total = creditTotals(
      [OS, research],
      [course({ courseId: "COMS4118W" }), course({ courseId: "COMS6900E", pointsMin: 1, pointsMax: 3 })],
    );
    expect(total).toEqual({ min: 4, max: 6 });
  });

  it("falls back to the course record when the section carries no units", () => {
    const unitless = section({
      sectionId: `${TERM}COMS1004W001`,
      courseId: "COMS1004W",
      minUnit: null,
      maxUnit: null,
    });
    expect(sectionCredits(unitless, course({ courseId: "COMS1004W", pointsMin: 3, pointsMax: 4 })))
      .toEqual({ min: 3, max: 4 });
  });

  it("contributes nothing rather than guessing when neither has units", () => {
    const unknown = section({
      sectionId: `${TERM}X001`,
      courseId: "XXXX0000W",
      minUnit: null,
      maxUnit: null,
    });
    expect(sectionCredits(unknown)).toEqual({ min: 0, max: 0 });
  });

  it("reports days with no classes, ignoring custom blocks", () => {
    expect(daysWithNoClasses([OS])).toEqual(["Tu", "Th", "Fr"]);
  });
});

describe("analyzePlan", () => {
  it("assembles credits, conflicts, commute, requirements and free days in one pass", () => {
    const globalCore = course({
      courseId: "ASCE1359W",
      subjectCode: "ASCE",
      number: 1359,
      title: "CONTEMPORARY CIVILIZATION",
      requirementFlags: { globalCore: true, artsAndHumanities: true },
    });
    const globalCoreSection = section({
      sectionId: `${TERM}ASCE1359W001`,
      courseId: "ASCE1359W",
      minUnit: 4,
      maxUnit: 4,
      meetings: [meeting("Tu", 610, 685, "Hamilton Hall", "413")],
    });
    const work = makeBlock("Work", "Mo", 620, 800);

    const analysis = analyzePlan({
      sections: [OS, globalCoreSection],
      courses: [course({ courseId: "COMS4118W" }), globalCore],
      blocks: [work],
    });

    expect(analysis.creditsMin).toBe(7);
    expect(analysis.creditsMax).toBe(7);
    expect(analysis.satisfiedRequirements).toEqual(["globalCore", "artsAndHumanities"]);
    expect(analysis.daysWithNoClasses).toEqual(["Th", "Fr"]);
    expect(analysis.conflicts.some((c) => c.involves.includes(work.blockId))).toBe(true);
    expect(Object.keys(analysis.totalWalkMinutesByDay).length).toBeGreaterThanOrEqual(0);
  });

  it("returns an empty, non-throwing analysis for an empty plan", () => {
    const analysis = analyzePlan({ sections: [], courses: [] });
    expect(analysis).toMatchObject({
      creditsMin: 0,
      creditsMax: 0,
      conflicts: [],
      commuteLegs: [],
      satisfiedRequirements: [],
    });
    expect(analysis.daysWithNoClasses).toEqual(["Mo", "Tu", "We", "Th", "Fr"]);
  });
});

// ---------------------------------------------------------------------------
// ICS export
// ---------------------------------------------------------------------------

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    planId: "plan_test",
    userId: "local",
    termCode: TERM,
    name: "Plan A",
    isPrimary: true,
    sectionIds: [OS.sectionId],
    customBlocks: [],
    ...overrides,
  };
}

describe("ics export", () => {
  it("finds the first matching weekday on or after the term start", () => {
    // 2026-09-02 is a Wednesday.
    expect(firstOccurrence([2026, 9, 2], "We")).toEqual([2026, 9, 2]);
    expect(firstOccurrence([2026, 9, 2], "Mo")).toEqual([2026, 9, 7]);
    expect(firstOccurrence([2026, 9, 2], "Fr")).toEqual([2026, 9, 4]);
  });

  it("bounds the weekly rule with a floating UNTIL that matches the floating DTSTART", () => {
    const rule = weeklyRule("Mo", "2026-12-12");
    expect(rule).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261212T235959");
    expect(rule).not.toContain("Z");
  });

  it("emits one recurring event per meeting, not per section", () => {
    const events = planEvents({ plan: plan(), sections: [OS] });
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.recurrenceRule)).toEqual([
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261212T235959",
      "FREQ=WEEKLY;BYDAY=WE;UNTIL=20261212T235959",
    ]);
  });

  it("produces a well-formed calendar with the expected shape", () => {
    const result = planToIcs({
      plan: plan(),
      sections: [OS],
      courses: [course({ courseId: "COMS4118W" })],
    });

    expect(result.eventCount).toBe(2);
    expect(result.filename).toBe("plan-a-20263.ics");
    expect(result.termDatesAreAuthoritative).toBe(false);

    const ics = result.content;
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261212T235959");
    expect(ics).toContain("SUMMARY:COMS 4118 · 001 — OPERATING SYSTEMS I");
    // Floating local times — no Z suffix, no timezone shift of the student's morning.
    expect(ics).toContain("DTSTART:20260907T101000");
    expect(ics).toContain("DTEND:20260907T112500");
    // Read-only toward Columbia: a deep link, never a form post.
    expect(ics).toContain("vergil.columbia.edu/vergil/class/20263/12345");
  });

  it("exports custom blocks alongside courses", () => {
    const work = makeBlock("Work", "Tu", 900, 1080);
    const result = planToIcs({ plan: plan({ customBlocks: [work] }), sections: [OS] });
    expect(result.eventCount).toBe(3);
    expect(result.content).toContain("SUMMARY:Work");
  });

  it("returns an empty but valid calendar when nothing in the plan has a time", () => {
    const async = section({ sectionId: `${TERM}Z001`, courseId: "ZZZZ0000W" });
    const result = planToIcs({ plan: plan({ sectionIds: [async.sectionId] }), sections: [async] });
    expect(result.eventCount).toBe(0);
    expect(result.content).toContain("BEGIN:VCALENDAR");
    expect(result.content).toContain("END:VCALENDAR");
  });

  it("slugifies awkward plan names into a safe filename", () => {
    expect(icsFilename(plan({ name: "if I don't get Op Systems" }))).toBe(
      "if-i-don-t-get-op-systems-20263.ics",
    );
  });
});

// ---------------------------------------------------------------------------
// Plan store
// ---------------------------------------------------------------------------

describe("plan store", () => {
  let store: LocalPlanStore;

  beforeEach(() => {
    setAuthGuard(() => ({ allowed: true }));
    store = new LocalPlanStore();
    store.reset();
  });

  it("names plans A, B, C and copies without collisions", () => {
    expect(nextPlanName([])).toBe("Plan A");
    expect(nextPlanName(["Plan A", "Plan B"])).toBe("Plan C");
    expect(copyName("Plan A", ["Plan A"])).toBe("Plan A (copy)");
    expect(copyName("Plan A", ["Plan A", "Plan A (copy)"])).toBe("Plan A (copy 2)");
  });

  it("makes the first plan in a term primary and keeps exactly one", () => {
    const first = store.createPlan({ name: "Plan A", termCode: TERM });
    const second = store.createPlan({ name: "if I don't get Op Systems", termCode: TERM });
    expect(first.isPrimary).toBe(true);
    expect(second.isPrimary).toBe(false);

    store.setPrimaryPlan(second.planId);
    const primaries = store.listPlans(TERM).filter((p) => p.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].planId).toBe(second.planId);
    expect(store.getPrimaryPlan(TERM)?.planId).toBe(second.planId);
  });

  it("promotes an heir when the primary is deleted", () => {
    const first = store.createPlan({ name: "Plan A", termCode: TERM });
    const second = store.createPlan({ name: "Plan B", termCode: TERM });
    store.deletePlan(first.planId);
    expect(store.getPrimaryPlan(TERM)?.planId).toBe(second.planId);
  });

  it("duplicates sections and gives copied blocks fresh ids", () => {
    const original = store.createPlan({ name: "Plan A", termCode: TERM });
    store.addSection(original.planId, OS.sectionId);
    store.upsertBlock(original.planId, makeBlock("Work", "Tu", 900, 1080));

    const copy = store.duplicatePlan(original.planId);
    expect(copy.name).toBe("Plan A (copy)");
    expect(copy.isPrimary).toBe(false);
    expect(copy.sectionIds).toEqual([OS.sectionId]);
    expect(copy.customBlocks[0].blockId).not.toBe(
      store.getPlan(original.planId)?.customBlocks[0].blockId,
    );
  });

  it("adds, deduplicates and removes sections and blocks", () => {
    const created = store.createPlan({ name: "Plan A", termCode: TERM });
    store.addSection(created.planId, OS.sectionId);
    store.addSection(created.planId, OS.sectionId);
    expect(store.getPlan(created.planId)?.sectionIds).toEqual([OS.sectionId]);

    const block = makeBlock("Work", "Tu", 900, 1080);
    store.upsertBlock(created.planId, block);
    store.upsertBlock(created.planId, { ...block, label: "Shift" });
    expect(store.getPlan(created.planId)?.customBlocks).toHaveLength(1);
    expect(store.getPlan(created.planId)?.customBlocks[0].label).toBe("Shift");

    store.removeBlock(created.planId, block.blockId);
    store.removeSection(created.planId, OS.sectionId);
    const after = store.getPlan(created.planId);
    expect(after?.customBlocks).toEqual([]);
    expect(after?.sectionIds).toEqual([]);
  });

  it("notifies subscribers on every mutation", () => {
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    const created = store.createPlan({ name: "Plan A", termCode: TERM });
    store.renamePlan(created.planId, "Dream schedule");
    unsubscribe();
    store.deletePlan(created.planId);
    expect(calls).toBe(2);
  });

  // Spec §15: writes require an account. Reads stay free.
  it("refuses writes when the auth guard denies, but still allows reads", () => {
    const created = store.createPlan({ name: "Plan A", termCode: TERM });
    setAuthGuard(() => ({ allowed: false, reason: "Sign in to save changes." }));

    expect(() => store.renamePlan(created.planId, "Nope")).toThrow(PlanWriteDeniedError);
    expect(store.getPlan(created.planId)?.name).toBe("Plan A");
    expect(store.listPlans(TERM)).toHaveLength(1);
  });

  it("self-heals storage that somehow declares two primaries", () => {
    const healed = enforceSinglePrimary([
      plan({ planId: "a", isPrimary: true }),
      plan({ planId: "b", isPrimary: true }),
    ]);
    expect(healed.filter((p) => p.isPrimary)).toHaveLength(1);
  });
});

describe("ics export — estimated term dates", () => {
  it("puts the caveat inside every event when bounds are estimated", () => {
    const result = planToIcs({ plan: plan(), sections: [OS] });

    expect(result.termDatesAreAuthoritative).toBe(false);
    // Once per VEVENT, not once per file: an .ics is read one appointment at a
    // time, and a note in a calendar-level property is one nobody sees.
    const occurrences = result.content.split("the first and last day of instruction are").length - 1;
    expect(occurrences).toBe(result.eventCount);
  });

  it("stays silent when the term carries real bounds", () => {
    const result = planToIcs({
      plan: plan(),
      sections: [OS],
      term: { ...buildTerm(TERM), startsOn: "2026-09-08", endsOn: "2026-12-14" },
    });

    expect(result.termDatesAreAuthoritative).toBe(true);
    expect(result.content).not.toContain("the first and last day of instruction are");
    expect(result.content).toContain("UNTIL=20261214T235959");
  });
});
