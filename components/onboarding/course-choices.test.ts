import { describe, expect, it } from "vitest";

import type { GuessChoice, GuessChoiceRoute } from "@/lib/onboarding/guess";

import { chipLinesFor, choiceCourses } from "./course-choices";

/** A route with only the fields these functions actually read. */
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

function choice(...routes: GuessChoiceRoute[]): GuessChoice {
  return { choiceId: "c", label: "A requirement", programName: "P", routes };
}

describe("choiceCourses", () => {
  it("offers each term of a sequence as its own course", () => {
    // The data models this as two routes of two courses. A student answers one
    // class at a time, and one who did a single term of Lit Hum has to be able
    // to say so — as routes there was no button that meant that.
    const courses = choiceCourses(
      choice(
        route("Literature Humanities", [
          ["HUMA CC1001", "Masterpieces of Western Literature I"],
          ["HUMA CC1002", "Masterpieces of Western Literature II"],
        ]),
        route("Contemporary Civilization", [
          ["COCI CC1101", "Intro to Contemporary Civilization I"],
          ["COCI CC1102", "Intro to Contemporary Civilization II"],
        ]),
      ),
    );

    expect(courses.map((facts) => facts.code)).toEqual([
      "HUMA CC1001",
      "HUMA CC1002",
      "COCI CC1101",
      "COCI CC1102",
    ]);
  });

  it("prints a course reachable by two routes only once", () => {
    // Mechanical engineering's physics routes all open with PHYS UN1401 and
    // differ only in the later term, so undeduplicated the group would show
    // the same chip three times.
    const courses = choiceCourses(
      choice(
        route("Sequence 1", [
          ["PHYS UN1401", "Intro to Mechanics"],
          ["PHYS UN1402", "Thermodynamics"],
        ]),
        route("Sequence 1, third term EEEB UN2001", [
          ["PHYS UN1401", "Intro to Mechanics"],
          ["EEEB UN2001", "Environmental Biology I"],
        ]),
      ),
    );

    expect(courses.map((facts) => facts.code)).toEqual([
      "PHYS UN1401",
      "PHYS UN1402",
      "EEEB UN2001",
    ]);
  });
});

describe("chipLinesFor", () => {
  /** The chips one group renders, in order — what the component does. */
  function chips(group: GuessChoice) {
    const courses = choiceCourses(group);
    return courses.map((course) => chipLinesFor(course, courses));
  }

  it("leads with the course name and puts the call number underneath", () => {
    // The rule everywhere else in onboarding, and it was inverted here: the
    // button said "MATH UN2010" loudest and "Linear Algebra" in grey below it.
    // Nobody recognises a class they took from its call number.
    const group = choice(
      route("HUMA UN1121", [["HUMA UN1121", "Masterpieces of Western Art"]]),
      route("HUMA UN1123", [["HUMA UN1123", "Masterpieces of Western Music"]]),
    );
    expect(chips(group)).toEqual([
      { label: "Masterpieces of Western Art", sublabel: "HUMA UN1121" },
      { label: "Masterpieces of Western Music", sublabel: "HUMA UN1123" },
    ]);
  });

  it("repairs registrar casing before showing a title", () => {
    const group = choice(route("MATH UN2010", [["MATH UN2010", "LINEAR ALGEBRA"]]));
    expect(chips(group)).toEqual([
      { label: "Linear Algebra", sublabel: "MATH UN2010" },
    ]);
  });

  it("names a course the catalog had no row for", () => {
    // University Writing has no section in either live term, so it arrives
    // titleless; `KNOWN_COURSE_TITLES` is the hole-filler that keeps the chip
    // from being a bare call number.
    const group = choice(route("ENGL CC1010", [["ENGL CC1010", null]]));
    expect(chips(group)).toEqual([
      { label: "University Writing", sublabel: "ENGL CC1010" },
    ]);
  });

  it("shows a bare code when nothing anywhere names the course", () => {
    // Not "EEEB UN2005 / EEEB UN2005" — a chip never prints its code twice.
    const group = choice(route("EEEB UN2005", [["EEEB UN2005", null]]));
    expect(chips(group)).toEqual([{ label: "EEEB UN2005" }]);
  });

  it("puts the call number on top when two courses share a title", () => {
    // Applied Maths lists "Partial Differential Equations" twice, as MATH
    // UN3028 and APMA E4200. Name-first those are two buttons a student cannot
    // tell apart, and the call number is the part that differs.
    const group = choice(
      route("MATH UN3028", [["MATH UN3028", "Partial Differential Equations"]]),
      route("APMA E4200", [["APMA E4200", "Partial Differential Equations"]]),
    );
    expect(chips(group)).toEqual([
      { label: "MATH UN3028", sublabel: "Partial Differential Equations" },
      { label: "APMA E4200", sublabel: "Partial Differential Equations" },
    ]);
  });

  it("swaps the whole group, not only the colliding pair", () => {
    // Decided group-wide on purpose: one row of buttons where some lead with a
    // name and others with a code reads as a rendering bug, and the student
    // cannot tell which line to trust on which chip.
    const group = choice(
      route("MATH UN3028", [["MATH UN3028", "Partial Differential Equations"]]),
      route("APMA E4200", [["APMA E4200", "Partial Differential Equations"]]),
      route("STAT GU4203", [["STAT GU4203", "Probability Theory"]]),
    );
    expect(chips(group)[2]).toEqual({
      label: "STAT GU4203",
      sublabel: "Probability Theory",
    });
  });

  it("keeps names leading when only the untitled courses are ambiguous", () => {
    // The Linear Algebra group has untitled courses among its six. Blocking on
    // those would send the whole group back to call numbers, which is the
    // defect this exists to fix — a bare code is never confusable with a name.
    const group = choice(
      route("MATH UN2010", [["MATH UN2010", "Linear Algebra"]]),
      route("COMS W3251", [["COMS W3251", null]]),
      route("MATH UN2020", [["MATH UN2020", null]]),
    );
    expect(chips(group)).toEqual([
      { label: "Linear Algebra", sublabel: "MATH UN2010" },
      { label: "COMS W3251" },
      { label: "MATH UN2020" },
    ]);
  });
});
