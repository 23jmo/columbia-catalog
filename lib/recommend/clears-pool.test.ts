import { describe, expect, it } from "vitest";

import { outstandingForClears, resolveClearsPool, type ClearsListing } from "./clears-pool";

const listing = (
  courseId: string,
  flags: ClearsListing["requirementFlags"] = {},
  number = 1000,
): ClearsListing => ({ courseId, number, requirementFlags: flags });

describe("resolveClearsPool", () => {
  it("does not restrict when no filter is set", () => {
    expect(
      resolveClearsPool({ outstanding: [], clears: undefined, listings: [listing("COMS4111W")] }),
    ).toBeUndefined();
  });

  it("uses live requirement flags when the student has no program", () => {
    // This is the "easy Global Cores" failure: no outstanding groups, so the
    // old code ranked the whole catalog and then dropped every card.
    const pool = resolveClearsPool({
      outstanding: [],
      clears: "Global Core",
      listings: [
        listing("AFAS1001UN", { globalCore: true }),
        listing("COMS4111W"),
        listing("AHUM1400UN", { globalCore: true }),
      ],
    });
    expect(pool).toEqual(new Set(["AFAS1001UN", "AHUM1400UN"]));
  });

  it("does not leak CS courses into a Global Core pool", () => {
    const pool = resolveClearsPool({
      outstanding: [],
      clears: "Global Core",
      listings: [listing("COMS4111W"), listing("COMS4118W")],
    });
    expect(pool?.has("COMS4111W")).toBe(false);
    expect(pool?.has("COMS4118W")).toBe(false);
    expect(pool).toEqual(new Set());
  });

  it("falls back to the Bulletin list when listings carry no flags", () => {
    const pool = resolveClearsPool({
      outstanding: [],
      clears: "Global Core",
      listings: [listing("AFAS1001UN"), listing("COMS4111W")],
    });
    expect(pool?.has("AFAS1001UN")).toBe(true);
    expect(pool?.has("COMS4111W")).toBe(false);
  });

  it("returns an empty set rather than unrestricted when nothing offered matches", () => {
    const pool = resolveClearsPool({
      outstanding: [],
      clears: "Global Core",
      listings: [listing("COMS4111W"), listing("COMS4118W")],
    });
    expect(pool).toEqual(new Set());
  });

  it("unions audit candidates with live flags so a 60-row expansion is not the whole list", () => {
    const pool = resolveClearsPool({
      outstanding: [
        { group: { id: "global-core", label: "Global Core" }, candidates: ["AHUM1400UN"] },
      ],
      clears: "Global Core",
      listings: [
        listing("AHUM1400UN", { globalCore: true }),
        listing("AFAS1001UN", { globalCore: true }),
      ],
    });
    expect(pool).toEqual(new Set(["AHUM1400UN", "AFAS1001UN"]));
  });
});

describe("outstandingForClears", () => {
  it("adds a synthetic Global Core group so ranked cards keep a required reason", () => {
    const groups = outstandingForClears([], "Global Core", new Set(["AFAS1001UN"]));
    expect(groups).toHaveLength(1);
    expect(groups[0].group.label).toBe("Global Core");
    expect(groups[0].candidates).toEqual(["AFAS1001UN"]);
    expect(groups[0].status).toBe("unmet");
  });

  it("widens an existing group's candidates to the full pool", () => {
    const existing = outstandingForClears(
      [
        {
          group: {
            id: "global-core",
            label: "Global Core",
            rule: { kind: "n_matching", n: 2, select: { flag: "globalCore" } },
          },
          status: "unmet",
          verification: "flagged",
          matched: [],
          completed: 0,
          required: 2,
          unit: "courses",
          candidates: ["AHUM1400UN"],
        },
      ],
      "Global Core",
      new Set(["AHUM1400UN", "AFAS1001UN"]),
    );
    expect(existing).toHaveLength(1);
    expect(existing[0].candidates).toEqual(["AHUM1400UN", "AFAS1001UN"]);
  });
});
