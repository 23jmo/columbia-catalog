import { describe, expect, it } from "vitest";

import { candidateIdsForClears, flagKeyForClears, recommendationClears } from "./clears";
import type { RecommendationReason } from "./types";

const required = (label: string, id = "g"): RecommendationReason => ({
  kind: "required",
  groupId: id,
  groupLabel: label,
});

describe("recommendationClears", () => {
  it("keeps everything when no filter is set", () => {
    expect(recommendationClears([required("Computer Science Core")], undefined)).toBe(true);
    expect(recommendationClears([], "  ")).toBe(true);
  });

  it("keeps a course whose reason names the group", () => {
    expect(recommendationClears([required("Global Core", "global-core")], "Global Core")).toBe(
      true,
    );
  });

  it("matches the group id when the model copies that instead of the label", () => {
    expect(recommendationClears([required("Global Core", "global-core")], "global-core")).toBe(
      true,
    );
  });

  it("drops a CS core card under a Global Core filter", () => {
    expect(
      recommendationClears([required("Computer Science Core", "cs-core")], "Global Core"),
    ).toBe(false);
  });

  it("drops taste-only and unlock reasons — they do not name a requirement", () => {
    const taste: RecommendationReason = { kind: "because_you_took", similarTo: [] };
    const unlock: RecommendationReason = { kind: "unlocks", courseIds: [], unlockedCount: 0 };
    expect(recommendationClears([taste, unlock], "Global Core")).toBe(false);
  });
});

describe("candidateIdsForClears", () => {
  const core = {
    group: { id: "global-core", label: "Global Core" },
    candidates: ["HUMA1001CC", "COCI1101CC"],
  };
  const cs = {
    group: { id: "cs-core", label: "Computer Science Core" },
    candidates: ["COMS3261W"],
  };

  it("restricts to the matching group's candidates", () => {
    expect([...candidateIdsForClears([core, cs], "Global Core")!]).toEqual([
      "HUMA1001CC",
      "COCI1101CC",
    ]);
  });

  it("does not restrict when the matching group has no expanded candidates", () => {
    // An open selector before expansion. Restricting to [] would empty the feed.
    expect(
      candidateIdsForClears([{ ...core, candidates: [] }], "Global Core"),
    ).toBeUndefined();
  });

  it("does not restrict when nothing matches the label", () => {
    expect(candidateIdsForClears([cs], "Global Core")).toBeUndefined();
  });
});

describe("flagKeyForClears", () => {
  it("accepts the filter label, the flag key, and the kebab group id", () => {
    expect(flagKeyForClears("Global Core")).toBe("globalCore");
    expect(flagKeyForClears("globalCore")).toBe("globalCore");
    expect(flagKeyForClears("global-core")).toBe("globalCore");
    expect(flagKeyForClears("Science Requirement")).toBe("scienceRequirement");
  });

  it("does not treat a short 'core' as Global Core", () => {
    // "core" is in every Core Curriculum label. Mapping it to the first
    // filter would send a CS-core follow-up into Global Core by accident.
    expect(flagKeyForClears("core")).toBeNull();
    expect(flagKeyForClears("CS Core")).toBeNull();
  });
});
