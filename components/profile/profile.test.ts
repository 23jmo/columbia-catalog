import { describe, expect, it } from "vitest";

import { CC_CORE, CC_MAJOR_COMPUTER_SCIENCE } from "@/lib/requirements/programs";
import type { RequirementRule } from "@/lib/requirements/types";

import {
  VERIFICATION_LABEL,
  outstandingLabel,
  percentLabel,
  progressLabel,
  stableHash,
  statusFillClass,
  statusToneClass,
  verificationLabelFor,
  verificationNoteFor,
} from "./format";

/**
 * Presentation tests for the profile screen.
 *
 * These are not snapshot tests of markup. They pin the two properties that make
 * the screen honest, both of which are easy to break with a well-meant tidy-up:
 *
 *   1. A requirement never claims a stronger check than its rule performs.
 *   2. A self-certified requirement never renders identically to a verified one.
 */

describe("verification labels", () => {
  it("distinguishes a registrar flag from a subject-and-level shape", () => {
    const flagRule: RequirementRule = {
      kind: "n_matching",
      n: 2,
      select: { flag: "globalCore" },
    };
    const shapeRule: RequirementRule = {
      kind: "points_matching",
      points: 9,
      select: { subjects: ["COMS"], numberRange: [3000, 9999] },
    };

    expect(verificationLabelFor(flagRule)).toBe("Matched on a curriculum flag");
    expect(verificationLabelFor(shapeRule)).toBe("Matched by subject and level");
    expect(verificationNoteFor(flagRule)).toMatch(/registrar stamps/i);
    expect(verificationNoteFor(shapeRule)).toMatch(/subject codes and course numbers/i);
  });

  it("never calls a rule 'named in the Bulletin' unless it names courses", () => {
    const named = new Set(["all_of", "n_of", "sequence_choice"]);
    const programs = [CC_CORE, CC_MAJOR_COMPUTER_SCIENCE];

    for (const program of programs) {
      for (const group of program.groups) {
        const label = verificationLabelFor(group.rule);
        if (label === VERIFICATION_LABEL.exact) {
          expect(named.has(group.rule.kind)).toBe(true);
        } else {
          expect(named.has(group.rule.kind)).toBe(false);
        }
      }
    }
  });

  it("marks an attested rule as self-certified, whatever else it says", () => {
    const rule: RequirementRule = { kind: "attested", note: "Swim test." };
    expect(verificationLabelFor(rule)).toBe(VERIFICATION_LABEL.attested);
    expect(verificationNoteFor(rule)).toMatch(/because you said so/i);
  });
});

describe("status tones", () => {
  /*
   * The whole point of the tiers. A screen where "done because the Bulletin
   * names these courses and you have them" and "done because you ticked a box"
   * paint the same green is a screen that launders self-report into
   * verification.
   */
  it("does not paint a self-certified pass the same as a verified one", () => {
    expect(statusToneClass("satisfied", "exact")).not.toBe(
      statusToneClass("satisfied", "attested"),
    );
    expect(statusFillClass("satisfied", "exact")).not.toBe(
      statusFillClass("satisfied", "attested"),
    );
  });

  it("treats a flag-matched pass as verified rather than self-reported", () => {
    expect(statusToneClass("satisfied", "flagged")).toBe(statusToneClass("satisfied", "exact"));
  });

  it("keeps unmet and in-progress visually distinct from each other and from done", () => {
    const done = statusToneClass("satisfied", "exact");
    const going = statusToneClass("in_progress", "exact");
    const nothing = statusToneClass("unmet", "exact");
    expect(new Set([done, going, nothing]).size).toBe(3);
  });
});

describe("number formatting", () => {
  it("clamps a percentage to 0–100", () => {
    expect(percentLabel(-0.5)).toBe("0%");
    expect(percentLabel(1.4)).toBe("100%");
    expect(percentLabel(0.256)).toBe("26%");
  });

  it("prints the unit for points, so 6 of 9 is never read as six courses", () => {
    expect(progressLabel(6, 9, "points")).toBe("6 of 9 points");
    expect(progressLabel(2, 4, "courses")).toBe("2 of 4");
  });

  it("pluralises what is outstanding", () => {
    expect(outstandingLabel(1, "courses")).toBe("1 course");
    expect(outstandingLabel(3, "courses")).toBe("3 courses");
    expect(outstandingLabel(1, "points")).toBe("1 point");
    expect(outstandingLabel(1.5, "points")).toBe("1.5 points");
  });
});

describe("stableHash", () => {
  /*
   * The cover art is seeded with this and rendered on both the server and the
   * client. A non-deterministic or signed result reaches the DOM as an invalid
   * `color-mix`, which silently drops the whole background — see the comment in
   * `./cover.tsx`.
   */
  it("is deterministic and unsigned across the 32-bit range", () => {
    const names = ["Ana Maria Ruiz", "", "Z", "a".repeat(200), "李雷"];
    for (const name of names) {
      const first = stableHash(name);
      expect(stableHash(name)).toBe(first);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(first)).toBe(true);
    }
  });
});
