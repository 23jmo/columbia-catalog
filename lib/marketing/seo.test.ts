import { describe, expect, it } from "vitest";

import { llmsTxt, robotsTxt, sitemapXml } from "./crawler-files";
import { FAQ_ITEMS } from "./faq";
import { SITEMAP_PATHS, SITE_ORIGIN } from "./site";

describe("crawler files", () => {
  it("allows the public pages and does not Disallow the whole site", () => {
    const body = robotsTxt();
    expect(body).toContain("Allow: /");
    expect(body).toContain("Allow: /about");
    expect(body).toContain("Allow: /faq");
    expect(body).toContain("Allow: /programs");
    expect(body).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(body).not.toMatch(/Disallow: \/\s*$/m);
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Disallow: /saved");
    expect(body).not.toContain("Disallow: /feed");
  });

  it("lists about, faq, privacy, terms, and the public programs on the www host", () => {
    const body = sitemapXml();
    for (const path of SITEMAP_PATHS) {
      expect(body).toContain(`<loc>${SITE_ORIGIN}${path}</loc>`);
    }
    expect(body).toContain(`<loc>${SITE_ORIGIN}/programs</loc>`);
    expect(body).toContain(`<loc>${SITE_ORIGIN}/programs/cc-major-computer-science</loc>`);
    expect(body).toContain(`<loc>${SITE_ORIGIN}/programs/seas-major-computer-science</loc>`);
    expect(body).toContain(`<loc>${SITE_ORIGIN}/programs/cc-core</loc>`);
    expect(body).toContain(`<loc>${SITE_ORIGIN}/programs/seas-core</loc>`);
    expect(body).not.toContain("cc-minor-computer-science");
    expect(body.startsWith("<?xml")).toBe(true);
  });

  it("keeps llms.txt quotable and honest about coverage", () => {
    const body = llmsTxt();
    expect(body).toContain("Columbia College, Columbia Engineering, and Barnard College");
    expect(body).toContain("coming soon");
    expect(body).toContain("unofficial student project");
    expect(body).toContain(`${SITE_ORIGIN}/about`);
    // Three of four. Claiming all four would be the specific lie this file
    // is most likely to be quoted for.
    expect(body).not.toMatch(/four schools/i);
    expect(body).not.toMatch(/waitlist/i);
  });
});

describe("FAQ answers", () => {
  /*
   * This guard used to read "without claiming Barnard is live", and it was
   * right to until 2026-08-30. It has been INVERTED rather than deleted:
   * Barnard is now live and General Studies is not, so the same asymmetry is
   * asserted, pointing at the school that is still uncovered.
   *
   * These strings get quoted verbatim by answer engines, so both directions
   * cost something real. Understating coverage sends a Barnard student away
   * from a product that works for her; overstating it walks a GS student
   * through a setup that ends in an empty audit.
   */
  it("covers the required questions, claims Barnard, and does not claim General Studies", () => {
    const questions = FAQ_ITEMS.map((item) => item.question);
    expect(questions).toContain("What is LionPlan?");
    expect(questions).toContain("Is LionPlan an official Columbia tool?");
    expect(questions).toContain("Which schools does LionPlan support?");
    expect(questions).toContain("How is this different from Stellic and Vergil?");
    expect(questions).toContain(
      "How is this different from the other project also called LionPlan?",
    );
    expect(questions).toContain("Do I need a Columbia email?");
    expect(questions).toContain("Does it replace my CSA adviser?");

    const schools = FAQ_ITEMS.find(
      (item) => item.question === "Which schools does LionPlan support?",
    );
    expect(schools?.answer).toContain("coming soon");
    expect(schools?.answer).toMatch(
      /live for Columbia College, Columbia Engineering, and Barnard College/i,
    );
    // General Studies has zero authored programs — not just zero majors but
    // zero Core, because `coreForSchool` resolves out of the same registry.
    expect(schools?.answer).toMatch(/General Studies is coming soon/i);
    expect(schools?.answer).not.toMatch(/live for General Studies/i);
  });

  it("does not tell a Barnard student that Barnard onboarding is unavailable", () => {
    /*
     * The sharpest stale answer in the file, and the reason it is guarded by
     * id rather than by sweeping the prose: this one said "Barnard onboarding
     * is not live yet" while sitting in the answer to a question about email
     * addresses, where nobody editing school-coverage copy would think to look.
     */
    const email = FAQ_ITEMS.find((item) => item.question === "Do I need a Columbia email?");
    expect(email?.answer).toMatch(/Columbia or Barnard Google account/i);
    expect(email?.answer).not.toMatch(/Barnard onboarding is not live/i);
  });
});
