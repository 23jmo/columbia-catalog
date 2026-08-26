import { describe, expect, it } from "vitest";

import { guestOnboardingLocation, isGuestAllowedPath, postAuthPath } from "./guest-gate";

describe("isGuestAllowedPath", () => {
  it("lets a guest stay on onboarding, auth, and APIs", () => {
    expect(isGuestAllowedPath("/onboarding")).toBe(true);
    expect(isGuestAllowedPath("/onboarding/")).toBe(true);
    expect(isGuestAllowedPath("/auth/callback")).toBe(true);
    expect(isGuestAllowedPath("/api/agent")).toBe(true);
  });

  it("sends every other page through the wizard", () => {
    expect(isGuestAllowedPath("/")).toBe(false);
    expect(isGuestAllowedPath("/search")).toBe(false);
    expect(isGuestAllowedPath("/schedule")).toBe(false);
    expect(isGuestAllowedPath("/profile")).toBe(false);
    expect(isGuestAllowedPath("/course/COMS1004W")).toBe(false);
  });
});

describe("guestOnboardingLocation", () => {
  it("strips unrelated query and hash", () => {
    const dest = guestOnboardingLocation(
      new URL("https://example.com/search?q=coms#rail"),
    );
    expect(dest.pathname).toBe("/onboarding");
    expect(dest.search).toBe("");
    expect(dest.hash).toBe("");
  });

  it("keeps auth_error so a failed sign-in still has a message", () => {
    const dest = guestOnboardingLocation(
      new URL("https://example.com/?auth_error=ineligible_domain&q=drop"),
    );
    expect(dest.pathname).toBe("/onboarding");
    expect(dest.searchParams.get("auth_error")).toBe("ineligible_domain");
    expect(dest.searchParams.get("q")).toBeNull();
  });
});

describe("postAuthPath", () => {
  it("keeps an explicit destination", () => {
    expect(postAuthPath("/search", false)).toBe("/search");
    expect(postAuthPath("/onboarding", true)).toBe("/onboarding");
  });

  it("sends an unfinished student back to the wizard instead of home", () => {
    expect(postAuthPath("/", false)).toBe("/onboarding");
  });

  it("lets a finished account land on home", () => {
    expect(postAuthPath("/", true)).toBe("/");
  });

  it("does not treat a deleted-and-rebuilt account as finished", () => {
    // After delete the completion cookie must be cleared; if it is, a
    // stranded OAuth return (next=/) stays in the wizard for the first feed.
    expect(postAuthPath("/", false)).toBe("/onboarding");
  });
});
