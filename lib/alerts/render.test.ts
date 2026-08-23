import { describe, expect, it } from "vitest";

import { renderSeatOpenedEmail, type SeatOpenedEmailInput } from "./render";
import type { TermCode } from "@/lib/types";

const BASE: SeatOpenedEmailInput = {
  courseCode: "COMS 4118",
  courseTitle: "Operating Systems I",
  sectionCode: "001",
  callNumber: "12345",
  termCode: "20263" as TermCode,
  enrollmentCount: 119,
  enrollmentCap: 120,
  seatsOpen: 1,
  observedAt: "2026-11-03T14:32:00.000Z",
  watcherCount: 34,
  courseUrl: "https://example.test/course/COMS4118W",
};

describe("renderSeatOpenedEmail", () => {
  it("puts the call number in the subject line", () => {
    // The lock-screen preview may be all anyone reads before they start
    // typing into Vergil, so the number they type has to survive truncation.
    const { subject } = renderSeatOpenedEmail(BASE);
    expect(subject).toContain("12345");
    expect(subject).toContain("COMS 4118");
  });

  it("links to Vergil, not to our own course page, as the primary action", () => {
    const { html } = renderSeatOpenedEmail(BASE);
    const firstLink = /href="([^"]+)"/.exec(html)?.[1];
    expect(firstLink).toContain("vergil.columbia.edu");
  });

  it("states the watcher count rather than implying exclusivity", () => {
    const { text } = renderSeatOpenedEmail(BASE);
    expect(text).toContain("34 people are watching");
    expect(text).toContain("emailed at the same time");
  });

  it("says 'only person' when nobody else is watching", () => {
    const { text } = renderSeatOpenedEmail({ ...BASE, watcherCount: 1 });
    expect(text).toContain("only person watching");
  });

  it("stamps the reading with when it was observed", () => {
    const { text } = renderSeatOpenedEmail(BASE);
    // Every seat number in this product travels with its provenance; an email
    // that claims a seat without saying when we looked is a claim we cannot
    // stand behind by the time it is read.
    expect(text).toMatch(/Read from the Directory of Classes at .+ ET\./);
  });

  it("does not invent a seat count it was not given", () => {
    const vague = renderSeatOpenedEmail({
      ...BASE,
      seatsOpen: null,
      enrollmentCount: null,
      enrollmentCap: null,
    });
    expect(vague.text).toContain("A seat opened.");
    expect(vague.text).not.toMatch(/\d+ of \d+ enrolled/);
  });

  it("escapes catalog text before putting it in HTML", () => {
    const hostile = renderSeatOpenedEmail({
      ...BASE,
      courseTitle: 'Topics in <script>alert("x")</script> Design',
    });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).toContain("&lt;script&gt;");
  });

  it("ships a plain-text alternative alongside the HTML", () => {
    // Not only an accessibility measure: a seat alert in a spam folder is
    // worse than no seat alert, because it is a promise we appeared to keep.
    const { text, html } = renderSeatOpenedEmail(BASE);
    expect(text.length).toBeGreaterThan(80);
    expect(html).toContain("<div");
    expect(text).not.toContain("<div");
  });
});
