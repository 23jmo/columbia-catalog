import { describe, expect, it } from "vitest";

import { EMPTY_PROFILE } from "@/lib/profile/types";
import { programsFor } from "@/lib/profile/audit";

import { buildOnboardingArtifact, isOnboardingArtifact } from "./present-onboarding";

describe("onboarding prompt", () => {
  it("is the payload get_unmet_requirements emits when there is no degree", () => {
    const artifact = buildOnboardingArtifact();
    expect(artifact.kind).toBe("onboarding_prompt");
    expect(artifact.href).toBe("/onboarding");
    expect(isOnboardingArtifact(artifact)).toBe(true);
  });

  it("fires only when the audit has no school and no programs", () => {
    expect(programsFor({ ...EMPTY_PROFILE, userId: "u" })).toEqual([]);
    expect(programsFor({ ...EMPTY_PROFILE, userId: "u", school: "CC" }).length).toBeGreaterThan(0);
  });
});
