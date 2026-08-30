import { describe, expect, it } from "vitest";

import type { GuessChoiceRoute } from "@/lib/onboarding/guess";

import { routeChipLines } from "./course-choices";

/** A route with only the fields the chip actually reads. */
function route(
  label: string,
  courses: [code: string, title: string | null][],
): GuessChoiceRoute {
  return {
    routeId: courses.map(([code]) => code).join("+"),
    label,
    courses: courses.map(([code, title]) => ({
      courseId: code.replace(/\s+/gu, ""),
      code,
      title,
      points: 3,
    })),
  } as GuessChoiceRoute;
}

describe("routeChipLines", () => {
  const litHum = route("Literature Humanities", [
    ["HUMA CC1001", "Masterpieces of Western Literature I"],
    ["HUMA CC1002", "Masterpieces of Western Literature II"],
  ]);
  const contempCiv = route("Contemporary Civilization", [
    ["COCI CC1101", "Intro to Contemporary Civilization I"],
    ["COCI CC1102", "Intro to Contemporary Civilization II"],
  ]);

  const physics = [
    route("Sequence 1", [["PHYS UN1401", "Intro to Mechanics"], ["PHYS UN1402", "Thermodynamics"]]),
    route("Sequence 2", [["PHYS UN1601", "Physics I"], ["PHYS UN1602", "Physics II"]]),
    route("Sequence 3", [["PHYS UN2801", "Accelerated Physics I"], ["PHYS UN2802", "Accelerated Physics II"]]),
  ];

  it("keeps a descriptive sequence name up front", () => {
    const siblings = [litHum, contempCiv];
    expect(routeChipLines(litHum, siblings)).toEqual({
      label: "Literature Humanities",
      sublabel: "HUMA CC1001, CC1002",
    });
    expect(routeChipLines(contempCiv, siblings)).toEqual({
      label: "Contemporary Civilization",
      sublabel: "COCI CC1101, CC1102",
    });
  });

  it("names an index-labelled sequence by the course it opens with", () => {
    // "Sequence 1/2/3" is what the Bulletin calls the SEAS physics options, and
    // it distinguishes nothing on a button. The branches diverge at their first
    // course, so its title is the name the source document never gave them.
    expect(routeChipLines(physics[0]!, physics)).toEqual({
      label: "Intro to Mechanics",
      sublabel: "PHYS UN1401, UN1402",
    });
    expect(routeChipLines(physics[2]!, physics)).toEqual({
      label: "Accelerated Physics I",
      sublabel: "PHYS UN2801, UN2802",
    });
  });

  it("falls back to codes when the opening courses share a title", () => {
    // Mechanical engineering's three physics routes all begin with PHYS UN1401
    // and differ only in their third term. Leading with the opening title would
    // print the same button three times, which is worse than an index — the
    // index at least implies you should read the line below it.
    const shared = [
      route("Sequence 1", [
        ["PHYS UN1401", "Intro to Mechanics"],
        ["PHYS UN1402", "Thermodynamics"],
      ]),
      route("Sequence 1, third term EEEB UN2001", [
        ["PHYS UN1401", "Intro to Mechanics"],
        ["EEEB UN2001", "Environmental Biology I"],
      ]),
    ];
    expect(routeChipLines(shared[0]!, shared)).toEqual({
      label: "PHYS UN1401, UN1402",
      sublabel: "Sequence 1",
    });
  });

  it("falls back to codes when an opening course has no title at all", () => {
    const untitled = [
      route("Sequence 1", [["PHYS UN1401", "Intro to Mechanics"], ["PHYS UN1402", null]]),
      route("Sequence 2", [["PHYS UN2801", null], ["PHYS UN2802", null]]),
    ];
    expect(routeChipLines(untitled[1]!, untitled)).toEqual({
      label: "PHYS UN2801, UN2802",
      sublabel: "Sequence 2",
    });
  });

  it("treats a qualifier hanging off the ordinal as part of the index", () => {
    // Mechanical engineering's "Sequence 1, third term EEEB UN2001".
    const meRoutes = [
      route("Sequence 1", [["PHYS UN1401", "Intro to Mechanics"]]),
      route("Sequence 1, third term EEEB UN2001", [
        ["PHYS UN1401", "Intro to Mechanics"],
        ["EEEB UN2001", "Environmental Biology I"],
      ]),
    ];
    expect(routeChipLines(meRoutes[1]!, meRoutes)).toEqual({
      label: "PHYS UN1401, EEEB UN2001",
      sublabel: "Sequence 1, third term EEEB UN2001",
    });
  });

  it("leads with the course name for a single course, code underneath", () => {
    // The rule everywhere else in onboarding, and it was inverted here: the
    // button said "MATH UN2010" loudest and "Linear Algebra" in grey below it.
    // Nobody recognises a class they took from its call number.
    const artHum = route("HUMA UN1121", [["HUMA UN1121", "Masterpieces of Western Art"]]);
    const musicHum = route("HUMA UN1123", [["HUMA UN1123", "Masterpieces of Western Music"]]);
    expect(routeChipLines(artHum, [artHum, musicHum])).toEqual({
      label: "Masterpieces of Western Art",
      sublabel: "HUMA UN1121",
    });
  });

  it("swaps to codes when two options in a group share a title", () => {
    // Applied Maths lists "Partial Differential Equations" twice in one group,
    // as MATH UN3028 and APMA E4200. Name-first those are two buttons a student
    // cannot tell apart; the call number is the part that differs.
    const pde = [
      route("MATH UN3028", [["MATH UN3028", "Partial Differential Equations"]]),
      route("APMA E4200", [["APMA E4200", "Partial Differential Equations"]]),
    ];
    expect(routeChipLines(pde[0]!, pde)).toEqual({
      label: "MATH UN3028",
      sublabel: "Partial Differential Equations",
    });
  });

  it("keeps names leading when only the untitled routes are ambiguous", () => {
    // The Linear Algebra group has two routes with no title among six. Blocking
    // on those would send the whole group back to call numbers, which is the
    // defect this exists to fix — a bare code is never confusable with a name.
    const linear = [
      route("MATH UN2010", [["MATH UN2010", "Linear Algebra"]]),
      route("COMS W3251", [["COMS W3251", null]]),
      route("MATH UN2020", [["MATH UN2020", null]]),
    ];
    expect(routeChipLines(linear[0]!, linear)).toEqual({
      label: "Linear Algebra",
      sublabel: "MATH UN2010",
    });
    expect(routeChipLines(linear[1]!, linear)).toEqual({ label: "COMS W3251" });
  });

  it("repairs registrar casing on a single-course name", () => {
    const linAlg = route("MATH UN2010", [["MATH UN2010", "LINEAR ALGEBRA"]]);
    expect(routeChipLines(linAlg, [linAlg])).toEqual({
      label: "Linear Algebra",
      sublabel: "MATH UN2010",
    });
  });

  it("keeps a bare code alone when there is no title to show", () => {
    const bare = route("EEEB UN2005", [["EEEB UN2005", null]]);
    expect(routeChipLines(bare, [bare])).toEqual({ label: "EEEB UN2005" });
  });
  it("leads with the description when the label is an ordinal plus a name", () => {
    // Biology's chemistry group. The Bulletin numbers these options, but each
    // number carries a real description and that is what tells them apart —
    // rendering the eight call numbers as the button's headline was the defect
    // this exists to prevent.
    const chem = [
      route("Option 1 — general chemistry then organic", [
        ["CHEM UN1403", null],
        ["CHEM UN1404", null],
        ["CHEM UN1500", null],
        ["CHEM UN1501", null],
      ]),
      route("Option 2 — intensive general chemistry", [
        ["CHEM UN1604", null],
        ["CHEM UN1507", null],
      ]),
    ];
    expect(routeChipLines(chem[0]!, chem)).toEqual({
      label: "General chemistry then organic",
      sublabel: "CHEM UN1403, UN1404, UN1500, UN1501",
    });
  });

  it("tells apart two options the Bulletin gave the same number", () => {
    // cc-major-biology really does label two routes "Option 3". The ordinal is
    // dropped, so the descriptions carry the distinction and the collision
    // never reaches the screen.
    const chem = [
      route("Option 3 — first-year organic, two-term lab", [
        ["CHEM UN1507", null],
        ["CHEM UN2495", null],
      ]),
      route("Option 3 — first-year organic, intensive lab", [
        ["CHEM UN1507", null],
        ["CHEM UN2545", null],
      ]),
    ];
    expect(routeChipLines(chem[0]!, chem).label).toBe("First-year organic, two-term lab");
    expect(routeChipLines(chem[1]!, chem).label).toBe("First-year organic, intensive lab");
  });

  it("treats a lettered sequence as an index too", () => {
    // The physics major's "Sequence A/B/C" says no more than "Sequence 1/2/3".
    const lettered = [
      route("Sequence A", [["PHYS UN1401", null], ["PHYS UN1402", null]]),
      route("Sequence B", [["PHYS UN1601", null], ["PHYS UN1602", null]]),
    ];
    expect(routeChipLines(lettered[0]!, lettered)).toEqual({
      label: "PHYS UN1401, UN1402",
      sublabel: "Sequence A",
    });
  });

  it("does not print the same call numbers twice", () => {
    // Computer engineering labels its applied-maths routes with their own
    // codes, so the sublabel would repeat the line above it.
    const routes = [
      route("APMA E2101", [["APMA E2101", null]]),
      route("MATH UN2030 + APMA E3101", [["MATH UN2030", null], ["APMA E3101", null]]),
    ];
    expect(routeChipLines(routes[1]!, routes)).toEqual({
      label: "MATH UN2030, APMA E3101",
    });
  });
});
