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

  it("swaps to codes first when the labels are only an index", () => {
    // "Sequence 1/2/3" is what the Bulletin calls the SEAS physics options, and
    // it distinguishes nothing on a button. The call numbers do.
    expect(routeChipLines(physics[0]!, physics)).toEqual({
      label: "PHYS UN1401, UN1402",
      sublabel: "Sequence 1",
    });
    expect(routeChipLines(physics[2]!, physics)).toEqual({
      label: "PHYS UN2801, UN2802",
      sublabel: "Sequence 3",
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

  it("leads with the code for a single course, whatever the siblings are", () => {
    // Unchanged behaviour: siblings inside one group have near-identical
    // titles, so the call number is the only reliably distinct part.
    const artHum = route("HUMA UN1121", [["HUMA UN1121", "Masterpieces of Western Art"]]);
    const musicHum = route("HUMA UN1123", [["HUMA UN1123", "Masterpieces of Western Music"]]);
    expect(routeChipLines(artHum, [artHum, musicHum])).toEqual({
      label: "HUMA UN1121",
      sublabel: "Masterpieces of Western Art",
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
