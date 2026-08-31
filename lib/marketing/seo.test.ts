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
    expect(body).toContain("Columbia College and Columbia Engineering");
    expect(body).toContain("coming soon");
    expect(body).toContain("unofficial student project");
    expect(body).toContain(`${SITE_ORIGIN}/about`);
    expect(body).not.toMatch(/four schools/i);
    expect(body).not.toMatch(/waitlist/i);
  });
});

describe("FAQ answers", () => {
  it("covers the required questions without claiming Barnard is live", () => {
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
    expect(schools?.answer).toMatch(/live for Columbia College and Columbia Engineering/i);
    expect(schools?.answer).not.toMatch(/live for Barnard/i);
  });
});
