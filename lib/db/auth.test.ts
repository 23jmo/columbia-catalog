import { describe, expect, it } from "vitest";
import { isColumbiaEmail } from "@/lib/db/auth";

describe("isColumbiaEmail — spec §15 eligibility", () => {
  it("accepts Columbia and Barnard, subdomains included", () => {
    for (const email of [
      "abc123@columbia.edu",
      "xy45@barnard.edu",
      "doc@cumc.columbia.edu",
      "mba@gsb.columbia.edu",
      "UPPER@COLUMBIA.EDU",
    ]) {
      expect(isColumbiaEmail(email), email).toBe(true);
    }
  });

  it("rejects lookalikes and everything else", () => {
    for (const email of [
      "someone@gmail.com",
      "a@columbia.edu.evil.com",
      "b@notcolumbia.edu",
      "c@barnard.edu.attacker.io",
      "",
      null,
      undefined,
    ]) {
      expect(isColumbiaEmail(email as string), String(email)).toBe(false);
    }
  });
});
