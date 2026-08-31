import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  guestOnboardingLocation,
  isGuestAllowedPath,
  isPublicMarketingPath,
  postAuthPath,
} from "./guest-gate";

describe("Search Console verification file", () => {
  it("is the exact URL-prefix body Google fetches at the site root", () => {
    // Google GETs /googlea7837cf2147ea393.html and compares this string.
    // A wrapper, BOM, or missing newline fails the check.
    const body = readFileSync(
      join(process.cwd(), "public/googlea7837cf2147ea393.html"),
      "utf8",
    );
    expect(body).toBe("google-site-verification: googlea7837cf2147ea393.html\n");
  });
});

describe("isGuestAllowedPath", () => {
  it("lets a guest stay on onboarding, auth, and APIs", () => {
    expect(isGuestAllowedPath("/onboarding")).toBe(true);
    expect(isGuestAllowedPath("/onboarding/")).toBe(true);
    expect(isGuestAllowedPath("/auth/callback")).toBe(true);
    expect(isGuestAllowedPath("/api/agent")).toBe(true);
  });

  it("lets a guest read About, FAQ, Privacy, Terms, and crawler files", () => {
    // HTML pages a journalist or an answer engine has to reach, plus the
    // files Googlebot fetches first. The Chrome Web Store listing already
    // points at /privacy/extension, so that prefix has to stay open too.
    expect(isGuestAllowedPath("/about")).toBe(true);
    expect(isGuestAllowedPath("/faq")).toBe(true);
    expect(isGuestAllowedPath("/privacy")).toBe(true);
    expect(isGuestAllowedPath("/privacy/extension")).toBe(true);
    expect(isGuestAllowedPath("/terms")).toBe(true);
    expect(isGuestAllowedPath("/programs")).toBe(true);
    expect(isGuestAllowedPath("/programs/cc-major-computer-science")).toBe(true);
    expect(isGuestAllowedPath("/robots.txt")).toBe(true);
    expect(isGuestAllowedPath("/sitemap.xml")).toBe(true);
    expect(isGuestAllowedPath("/llms.txt")).toBe(true);
    expect(isGuestAllowedPath("/llms-full.txt")).toBe(true);
    expect(isGuestAllowedPath("/googlea7837cf2147ea393.html")).toBe(true);
    expect(isPublicMarketingPath("/robots.txt")).toBe(true);
    expect(isPublicMarketingPath("/googlea7837cf2147ea393.html")).toBe(true);
    expect(isPublicMarketingPath("/faq")).toBe(true);
    expect(isPublicMarketingPath("/onboarding")).toBe(false);
  });

  it("lets a guest read a shared course or instructor link", () => {
    // These are the two URLs that get pasted into a group chat or a reddit
    // reply during registration week. A link that answers "is this class any
    // good" has to answer it, not ask the reader for an account first —
    // nothing on either page is about a particular student.
    expect(isGuestAllowedPath("/course/COMS1004W")).toBe(true);
    expect(isGuestAllowedPath("/instructor/adam-cannon")).toBe(true);
  });

  it("keeps everything about a specific student behind the wizard", () => {
    // The feed, the shortlist and the audit are what onboarding is FOR.
    // Giving them away would leave nothing to sign in for.
    expect(isGuestAllowedPath("/")).toBe(false);
    expect(isGuestAllowedPath("/saved")).toBe(false);
    expect(isGuestAllowedPath("/search")).toBe(false);
    expect(isGuestAllowedPath("/schedule")).toBe(false);
    expect(isGuestAllowedPath("/profile")).toBe(false);
  });

  it("does not open a path that merely starts with an allowed word", () => {
    // `startsWith("/course/")` and not `startsWith("/course")`, so a future
    // `/courses-i-hate` route cannot fall through the gate by accident.
    expect(isGuestAllowedPath("/coursework")).toBe(false);
    expect(isGuestAllowedPath("/instructors-admin")).toBe(false);
    expect(isGuestAllowedPath("/about-us")).toBe(false);
    expect(isGuestAllowedPath("/privacy-review")).toBe(false);
    expect(isGuestAllowedPath("/faq-admin")).toBe(false);
    expect(isGuestAllowedPath("/programs-admin")).toBe(false);
    // Search Console files are `/google<token>.html` only — not `/google` itself
    // and not a nested path that happens to end in that name.
    expect(isGuestAllowedPath("/google")).toBe(false);
    expect(isGuestAllowedPath("/admin/googlea7837cf2147ea393.html")).toBe(false);
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
