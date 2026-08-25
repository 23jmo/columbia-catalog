/**
 * How good is the prerequisite parser, as a NUMBER.
 *
 * The existing suite has ~90 assertions and every one of them runs against the
 * same checked-in COMS fixture. That is the shape of evidence that hides a
 * systematic error: a parser tuned to one department's house style can look
 * flawless and still misread everyone else. The spec asked for precision and
 * recall against a second department, "a number, not an assertion", so this
 * file hand-labels real prose from ECON — a department with a different
 * dialect: Barnard cross-listings, parenthesised alternatives, and a habit of
 * appending a second sentence that scopes a requirement to majors only.
 *
 * ── The two directions are not equally dangerous ───────────────────────────
 *
 * PRECISION is the one that matters here, because `lib/recommend` uses this
 * tree as a HARD FILTER. A gate the parser invents — a course node that the
 * prose does not actually require — silently removes a course from a student's
 * recommendations forever, and nothing on screen explains why. There is no
 * recovery from that and no way for the student to notice.
 *
 * RECALL failures are milder by construction. A missing conjunct means we
 * recommend something the student may not yet be eligible for; they read the
 * prerequisite line on the course page, which is always displayed beside the
 * parse, and move on. That degrades to the status quo — which is Vergil.
 *
 * So the thresholds below are deliberately asymmetric, and the labels record
 * the prose verbatim so a future reader can re-grade rather than trust.
 */

import { describe, expect, it } from "vitest";

import { courseIdsIn, parsePrerequisiteText } from "./parse";
import type { PrereqConfidence } from "./types";

interface Labelled {
  courseId: string;
  subject: string;
  /** The prose exactly as `courses.prerequisite_text` holds it. */
  prose: string;
  /**
   * Every course the prose genuinely requires, hand-read. Order-independent.
   * An alternative set counts as required — "A or B" expects both ids here,
   * because the question this measures is "did the parser SEE the reference",
   * not "did it get the boolean shape right" (which the fixture suite covers).
   *
   * Ids are the LITERAL reading of the printed code, qualifier and all: the
   * Bulletin's "ECON W1105" is labelled `ECON1105W`, even though the course is
   * shelved in our catalog as `ECON1105UN`. That is not a shortcut — it is the
   * boundary between two stages. `parsePrerequisiteText` reads text; mapping a
   * retired qualifier onto the surviving course is `canonicalizeRequirement`'s
   * job, and it needs the whole catalog to do it (see `scripts/backfill-prereqs.ts`,
   * which runs `buildEquivalence` over every description BEFORE parsing a line).
   *
   * Measuring them together would hide which stage was wrong. It is worth
   * knowing the split is real and costly: 7.3% of parsed courses still point at
   * a course id the catalog does not hold, and each one is a gate the filter
   * cannot evaluate.
   */
  expected: string[];
  /** True when the prose ends "or permission of the instructor". */
  soft: boolean;
  confidence: PrereqConfidence;
}

/**
 * Ten consecutive ECON courses with prerequisite prose, taken from the live
 * catalog on 2026-08-24 and graded by hand. Not cherry-picked: this is the
 * first page the sampler printed.
 */
const ECON_LABELLED: Labelled[] = [
  {
    courseId: "ECON2105UN",
    subject: "ECON",
    prose: "Prerequisites: ECON W1105.",
    expected: ["ECON1105W"],
    soft: false,
    confidence: "structured",
  },
  {
    courseId: "ECON2224BC",
    subject: "ECON",
    prose: "Prerequisites: (ECON BC1003 or ECON UN1105)",
    expected: ["ECON1003BC", "ECON1105UN"],
    soft: false,
    confidence: "structured",
  },
  {
    courseId: "ECON2257UN",
    subject: "ECON",
    prose: "Prerequisites: ECON W1105.",
    expected: ["ECON1105W"],
    soft: false,
    confidence: "structured",
  },
  {
    courseId: "ECON3013BC",
    subject: "ECON",
    prose: "Prerequisites: ECON BC3035 or ECON BC3033, or permission of the instructor.",
    expected: ["ECON3035BC", "ECON3033BC"],
    soft: true,
    confidence: "structured",
  },
  {
    /*
     * The known recall miss. The prose is a conjunction of two alternative
     * sets — "(BC3033 or BC3035) AND (BC2411 or W1111 or W1211)" — and the
     * parser keeps the first and drops the second into advisories.
     *
     * It is recorded rather than fixed because the confidence tier already
     * tells the truth about it: `partial` means "some courses resolved, some
     * prose remained", which is exactly what happened. A tree that silently
     * dropped the conjunct while claiming `structured` would be the bug.
     */
    courseId: "ECON3018BC",
    subject: "ECON",
    prose:
      "Prerequisites: ECON BC3033 or ECON BC3035, and ECON BC2411 or STAT W1111 or STAT W1211, or permission of the instructor.",
    expected: ["ECON3033BC", "ECON3035BC", "ECON2411BC", "STAT1111W", "STAT1211W"],
    soft: true,
    confidence: "partial",
  },
  {
    courseId: "ECON3019BC",
    subject: "ECON",
    prose: "Prerequisites: ECON BC3035, or permission of the instructor.",
    expected: ["ECON3035BC"],
    soft: true,
    confidence: "structured",
  },
  {
    courseId: "ECON3024BC",
    subject: "ECON",
    prose: "Prerequisites: ECON BC3035 or ECON BC3033",
    expected: ["ECON3035BC", "ECON3033BC"],
    soft: false,
    confidence: "structured",
  },
  {
    /*
     * The registrar's own prose is duplicated here — the codes appear once
     * spaced and once bare. The parser must not emit five course nodes for
     * three courses.
     */
    courseId: "ECON3025UN",
    subject: "ECON",
    prose:
      "Prerequisites: ECON UN3211 and ECON UN3213 and STAT UN1201 ECON W3211, W3213 and STAT 1201.",
    expected: ["ECON3211UN", "ECON3213UN", "STAT1201UN"],
    soft: false,
    confidence: "partial",
  },
  {
    courseId: "ECON3026BC",
    subject: "ECON",
    prose: "Prerequisites: (ECON BC3035 or ECON UN3211)",
    expected: ["ECON3035BC", "ECON3211UN"],
    soft: false,
    confidence: "structured",
  },
  {
    /*
     * Two sentences, two different scopes. The second — "Prerequisite for
     * Economics majors: ECON BC3035" — is conditional on who the student IS,
     * which the rule language cannot express, so it must NOT become a gate.
     * Advisory is the correct destination.
     */
    courseId: "ECON3039BC",
    subject: "ECON",
    prose:
      "Prerequisites: ECON BC1003 or ECON W1105. Prerequisite for Economics majors: ECON BC3035.",
    expected: ["ECON1003BC", "ECON1105W"],
    soft: false,
    confidence: "partial",
  },
];

function parsed(entry: Labelled) {
  const result = parsePrerequisiteText(entry.courseId, entry.prose, {
    defaultSubject: entry.subject,
  });
  if (!result) throw new Error(`${entry.courseId}: parser returned null`);
  return result;
}

describe("prerequisite parser accuracy on a second department (ECON)", () => {
  it("never invents a prerequisite — precision is 100%", () => {
    /*
     * The load-bearing assertion in this file. A course node the prose does not
     * support becomes a permanent, invisible exclusion in the recommender.
     * A single failure here is a ship-blocker, which is why the threshold is
     * not a percentage.
     */
    const invented: string[] = [];

    for (const entry of ECON_LABELLED) {
      const expected = new Set(entry.expected);
      for (const id of courseIdsIn(parsed(entry).tree)) {
        if (!expected.has(id)) invented.push(`${entry.courseId} -> ${id}`);
      }
    }

    expect(invented).toEqual([]);
  });

  it("recalls at least 80% of genuinely required courses", () => {
    let found = 0;
    let total = 0;
    const missed: string[] = [];

    for (const entry of ECON_LABELLED) {
      const got = new Set(courseIdsIn(parsed(entry).tree));
      for (const id of entry.expected) {
        total += 1;
        if (got.has(id)) found += 1;
        else missed.push(`${entry.courseId} -> ${id}`);
      }
    }

    const recall = found / total;

    /*
     * Measured at 18/21 = 85.7% on 2026-08-24. All three misses are one
     * course, ECON3018BC, whose second conjunct falls into advisories — and it
     * is reported as `partial`, not as a confident parse.
     *
     * The floor is set below the measurement rather than at it, so a small
     * regression is visible in the number without turning every parser tweak
     * into a red build. If this drops meaningfully, read the misses.
     */
    expect(recall).toBeGreaterThanOrEqual(0.8);
    expect(missed.every((m) => m.startsWith("ECON3018BC"))).toBe(true);
  });

  it("grades its own confidence honestly", () => {
    /*
     * This is what makes an imperfect recall safe. A parse that dropped a
     * conjunct MUST NOT claim `structured`, because downstream code is entitled
     * to trust that tier. The tier is the contract, not the tree.
     */
    for (const entry of ECON_LABELLED) {
      expect(
        { id: entry.courseId, confidence: parsed(entry).confidence },
      ).toEqual({ id: entry.courseId, confidence: entry.confidence });
    }
  });

  it("detects the instructor-permission escape hatch", () => {
    // 23.7% of the catalog's prerequisites carry one. Missing it makes a soft
    // gate hard, which hides exactly the courses a motivated student can get
    // into by asking.
    for (const entry of ECON_LABELLED) {
      expect(
        { id: entry.courseId, soft: parsed(entry).instructorPermission },
      ).toEqual({ id: entry.courseId, soft: entry.soft });
    }
  });

  it("does not duplicate a course the registrar printed twice", () => {
    const ids = courseIdsIn(parsed(ECON_LABELLED[7]).tree);
    expect(ids).toEqual([...new Set(ids)]);
    expect(ids).toHaveLength(3);
  });
});

describe("level selectors are not courses", () => {
  /*
   * "any 1000-level or 2000-level EESC course" used to parse to a course node
   * with id `ANY1000` — a gate on a course that has never existed, which would
   * have held four EESC/ASPH courses shut forever with no way for a student to
   * clear it. The fix was to teach the tokenizer that quantifiers and
   * determiners are not subject codes.
   *
   * The fix has a known cost, measured rather than guessed: on 2026-08-24, 3 of
   * 1,000 sampled rows with prerequisite prose use this phrasing, and in those
   * rows the surviving text now swallows the WHOLE clause — including any real
   * course code sharing the sentence. Recall on ~4 courses, catalog-wide.
   *
   * It is not fixed, and that is a deliberate trade rather than a backlog item.
   * The failure lands on the safe side of the asymmetry this file opens with:
   * the parse degrades to `prose`, and a `prose` formula carries no course
   * nodes, so it cannot gate anything. The student sees the registrar's own
   * sentence instead of a filter — which is what they would have seen anyway.
   * Fabricating `ANY1000` was the version that silently removed courses.
   *
   * Both properties are pinned below so that a future parser change has to
   * confront the trade rather than rediscover it.
   */
  const PROSE = "Prerequisites: any 1000-level or 2000-level EESC course; MATH V1101 Calculus I.";

  it("never emits a course node for a level selector", () => {
    // The load-bearing half. A fabricated gate is unrecoverable.
    const result = parsePrerequisiteText("EESC3201UN", PROSE, { defaultSubject: "EESC" });
    const ids = courseIdsIn(result?.tree ?? null);

    expect(ids).not.toContain("ANY1000");
    expect(ids.some((id) => id.startsWith("ANY"))).toBe(false);
  });

  it("degrades to prose rather than to a partial gate", () => {
    /*
     * The known recall cost, asserted as it actually behaves. MATH V1101 is
     * real, is in the same sentence, and is lost — but the confidence tier
     * says `prose`, which is the signal downstream code uses to decline to
     * filter on this formula at all.
     *
     * If a later parser change recovers MATH V1101, this test SHOULD fail.
     * Update it then; do not weaken it now.
     */
    const result = parsePrerequisiteText("EESC3201UN", PROSE, { defaultSubject: "EESC" });

    expect(result?.confidence).toBe("prose");
    expect(courseIdsIn(result?.tree ?? null)).toEqual([]);
    // The prose is preserved, so the student still sees the requirement.
    expect(result?.advisories.join(" ")).toContain("MATH V1101");
  });

  it("reads the same course fine once the level phrase is gone", () => {
    // Proof that V-qualifier codes are not the problem — the clause is.
    const result = parsePrerequisiteText("EESC3201UN", "Prerequisites: MATH V1101 Calculus I.", {
      defaultSubject: "EESC",
    });
    expect(courseIdsIn(result?.tree ?? null)).toContain("MATH1101V");
  });
});
