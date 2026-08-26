import { describe, expect, it } from "vitest";

import { resolveAuthNext, safeSameOriginPath } from "./auth-return";

describe("safeSameOriginPath", () => {
  it("accepts same-origin paths", () => {
    expect(safeSameOriginPath("/onboarding")).toBe("/onboarding");
    expect(safeSameOriginPath("/search?q=1")).toBe("/search?q=1");
  });

  it("decodes a cookie-style value", () => {
    expect(safeSameOriginPath("%2Fonboarding")).toBe("/onboarding");
  });

  it("rejects open redirects", () => {
    expect(safeSameOriginPath("//evil.example")).toBeNull();
    expect(safeSameOriginPath("https://evil.example")).toBeNull();
    expect(safeSameOriginPath(null)).toBeNull();
  });
});

describe("resolveAuthNext", () => {
  it("prefers an explicit non-home query", () => {
    expect(resolveAuthNext("/onboarding", "/search")).toBe("/onboarding");
  });

  it("falls through a bare / query to the cookie — Site URL stand-in", () => {
    expect(resolveAuthNext("/", "/onboarding")).toBe("/onboarding");
    expect(resolveAuthNext("%2F", "%2Fonboarding")).toBe("/onboarding");
  });

  it("uses the cookie when the query is missing", () => {
    expect(resolveAuthNext(null, "/onboarding")).toBe("/onboarding");
  });

  it("falls back to home when nothing else is usable", () => {
    expect(resolveAuthNext(null, null)).toBe("/");
    expect(resolveAuthNext("/", "//evil")).toBe("/");
  });
});
