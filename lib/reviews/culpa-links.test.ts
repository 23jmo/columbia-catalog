import { describe, expect, it } from "vitest";

import {
  CULPA_HOME_URL,
  canonicalCulpaProfessorUrl,
  culpaInstructorHref,
} from "./culpa-links";

describe("CULPA links", () => {
  it("builds the app-owned instructor resolver URL", () => {
    expect(culpaInstructorHref("Martha A Kim")).toBe(
      "/api/culpa/instructor?name=Martha%20A%20Kim",
    );
  });

  it("accepts canonical numeric professor pages", () => {
    expect(canonicalCulpaProfessorUrl("https://culpa.info/professor/4221")).toBe(
      "https://culpa.info/professor/4221",
    );
  });

  it("rejects the broken search route and external redirects", () => {
    expect(
      canonicalCulpaProfessorUrl(
        "https://culpa.info/search?entity=all&query=Martha%20A%20Kim",
      ),
    ).toBeNull();
    expect(canonicalCulpaProfessorUrl("https://example.com/professor/4221")).toBeNull();
    expect(CULPA_HOME_URL).toBe("https://culpa.info");
  });
});

