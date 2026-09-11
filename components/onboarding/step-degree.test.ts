import { describe, expect, it } from "vitest";

import {
  electableMajorsFor,
  hasSelectedMajor,
  type ProgramOption,
} from "./step-degree";

const OPTIONS: ProgramOption[] = [
  { id: "cc-major-economics", name: "Economics", kind: "major", school: "CC", origin: "authored" },
  {
    id: "cc-concentration-economics",
    name: "Economics",
    kind: "concentration",
    school: "CC",
    origin: "authored",
  },
  {
    id: "cc-major-computer-science",
    name: "Computer Science",
    kind: "major",
    school: "CC",
    origin: "authored",
  },
  {
    id: "seas-major-computer-science",
    name: "Computer Science",
    kind: "major",
    school: "SEAS",
    origin: "authored",
  },
  {
    id: "gs-major-medical-humanities",
    name: "Medical Humanities",
    kind: "major",
    school: "GS",
    origin: "authored",
  },
];

describe("electableMajorsFor", () => {
  it("does not list the Economics concentration next to the Economics major", () => {
    const majors = electableMajorsFor("CC", OPTIONS, []);
    expect(majors.map((option) => option.id)).toEqual([
      "cc-major-economics",
      "cc-major-computer-science",
    ]);
  });

  it("drops a major from another school instead of keeping it labelled foreign", () => {
    const majors = electableMajorsFor("SEAS", OPTIONS, ["cc-major-economics"]);
    expect(majors.map((option) => option.id)).toEqual(["seas-major-computer-science"]);
  });

  it("offers Medical Humanities to General Studies students", () => {
    expect(electableMajorsFor("GS", OPTIONS, []).map((option) => option.id)).toEqual([
      "gs-major-medical-humanities",
    ]);
  });
});

describe("hasSelectedMajor", () => {
  it("still recognises a leftover concentration so an old guest state can advance", () => {
    expect(hasSelectedMajor(["cc-concentration-economics"], OPTIONS)).toBe(true);
  });

  it("ignores a major that belongs to a different school", () => {
    expect(hasSelectedMajor(["cc-major-economics"], OPTIONS, "SEAS")).toBe(false);
    expect(hasSelectedMajor(["cc-major-economics"], OPTIONS, "CC")).toBe(true);
  });
});
