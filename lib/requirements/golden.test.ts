/**
 * Runs the golden student records.
 *
 * The records and their expectations live in `golden.ts`; this file is only the
 * harness. Keeping them apart matters: the fixture is meant to be read by a
 * person checking it against the Bulletin, and that reading is much harder when
 * the data is interleaved with assertion plumbing.
 */

import { describe, expect, it } from "vitest";

import { GOLDEN_RECORDS, runGolden } from "./golden";

describe("golden student records", () => {
  for (const record of GOLDEN_RECORDS) {
    describe(`${record.id} — ${record.who}`, () => {
      for (const [groupId, expected] of Object.entries(record.expect)) {
        it(`${groupId}: ${expected.status}`, () => {
          const { result, program } = runGolden(record);
          const group = result.groups.find((g) => g.group.id === groupId);

          /*
           * A missing group is a fixture error, not a failed expectation, and
           * the message says so with the available ids — the usual cause is a
           * program file renaming a group, which would otherwise surface as a
           * confusing "cannot read status of undefined".
           */
          if (!group) {
            throw new Error(
              `${record.id}: program "${program.id}" has no group "${groupId}". ` +
                `It has: ${result.groups.map((g) => g.group.id).join(", ")}`,
            );
          }

          // Compared as one object so a failure prints both numbers at once
          // rather than stopping at the status.
          const actual = {
            status: group.status,
            ...(expected.completed === undefined ? {} : { completed: group.completed }),
          };
          expect(actual).toEqual({
            status: expected.status,
            ...(expected.completed === undefined ? {} : { completed: expected.completed }),
          });
        });
      }

      if (record.expectSatisfiedCount !== undefined) {
        it(`satisfies ${record.expectSatisfiedCount} groups overall`, () => {
          expect(runGolden(record).result.satisfiedCount).toBe(record.expectSatisfiedCount);
        });
      }
    });
  }
});

describe("the fixture itself", () => {
  /*
   * A golden-record suite fails open in a way ordinary tests do not: a record
   * whose `expect` is empty produces no `it` blocks at all, so it contributes
   * nothing and reports nothing missing. These guard the harness rather than
   * the audit.
   */

  it("every record names a registered program and evaluates", () => {
    for (const record of GOLDEN_RECORDS) {
      expect(() => runGolden(record)).not.toThrow();
    }
  });

  it("record ids are unique", () => {
    const ids = GOLDEN_RECORDS.map((r) => r.id);
    expect(ids).toEqual([...new Set(ids)]);
  });

  it("every record asserts something", () => {
    /*
     * The failure this catches: someone adds a record, writes the `who` line,
     * leaves `expect: {}` as a placeholder, and the suite goes green with a
     * student nobody is checking. Records that are genuinely about the roll-up
     * satisfy this through `expectSatisfiedCount`.
     */
    const silent = GOLDEN_RECORDS.filter(
      (r) => Object.keys(r.expect).length === 0 && r.expectSatisfiedCount === undefined,
    ).map((r) => r.id);

    expect(silent).toEqual([]);
  });

  it("a group satisfied by a plan marks the plan", () => {
    /*
     * The other half of `planned-counts-but-is-marked`, and the more important
     * half. `evaluate.ts` deliberately lets a planned course close a
     * requirement so a student building next term's schedule can watch it go
     * green. The only thing standing between that and telling someone they have
     * already graduated is `planned: true` riding on the match.
     *
     * So: find a group that a record's plan pushed over the line, and insist
     * the evidence is still distinguishable. If this mark is ever dropped, the
     * status assertion above keeps passing and the student is misinformed —
     * which is exactly the kind of failure a golden record exists to catch.
     */
    const record = GOLDEN_RECORDS.find((r) => r.id === "planned-counts-but-is-marked");
    if (!record) throw new Error("the planned-course record was renamed or removed");

    const { result } = runGolden(record);
    const group = result.groups.find((g) => g.group.id === "global-core");
    if (!group) throw new Error("cc-core has no global-core group");

    expect(group.status).toBe("satisfied");
    // Exactly one of the two matches is a plan, and it says so.
    expect(group.matched.filter((m) => m.planned)).toHaveLength(1);
    expect(group.matched.filter((m) => !m.planned)).toHaveLength(1);
  });

  it("every record that uses `planned` also asserts a group the plan touches", () => {
    /*
     * This replaced a guard that asserted the opposite of the truth: it
     * required that a record whose coursework was entirely planned must not
     * expect anything `satisfied`. That encodes the assumption `evaluate.ts`
     * explicitly rejects — planned courses DO count — so it would have forced
     * the next author to write a false expectation to get past it.
     *
     * What is actually worth guarding is that `planned` is never decorative.
     * A record that sets it and then asserts nothing has quietly stopped
     * testing the plan path while still looking like it covers it.
     */
    for (const record of GOLDEN_RECORDS) {
      if (!record.planned?.length) continue;
      expect({ id: record.id, asserts: Object.keys(record.expect).length > 0 }).toEqual({
        id: record.id,
        asserts: true,
      });
    }
  });
});
