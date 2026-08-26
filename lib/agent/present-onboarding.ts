/**
 * The onboarding prompt the thread shows when we cannot audit a degree.
 *
 * Global Core, Science, "what do I still need" are questions about THIS
 * student's remaining requirements. With no school and no program on file
 * that question has no honest answer — ranking the Bulletin list would
 * pretend we know which Core they are on. The card sends them to set up
 * the record instead.
 */

export const ONBOARDING_HREF = "/onboarding";

export interface OnboardingArtifact {
  kind: "onboarding_prompt";
  href: typeof ONBOARDING_HREF;
  reason: "no_degree";
}

export function buildOnboardingArtifact(): OnboardingArtifact {
  return {
    kind: "onboarding_prompt",
    href: ONBOARDING_HREF,
    reason: "no_degree",
  };
}

export function isOnboardingArtifact(value: unknown): value is OnboardingArtifact {
  if (!value || typeof value !== "object") return false;
  const record = value as { kind?: unknown; href?: unknown; reason?: unknown };
  return (
    record.kind === "onboarding_prompt" &&
    record.href === ONBOARDING_HREF &&
    record.reason === "no_degree"
  );
}
