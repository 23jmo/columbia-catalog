import { programSitemapPaths } from "./public-programs";
import { SITE_ORIGIN, SITEMAP_PATHS } from "./site";

/**
 * Bodies for /robots.txt, /sitemap.xml, /llms.txt, and /llms-full.txt.
 *
 * Kept as strings so the route handlers can set text/plain or
 * application/xml themselves. Next must not wrap these in HTML.
 */

/** App routes that need a signed-in student. Confirmed against `app/`. */
const DISALLOWED_APP_PATHS = [
  "/api/",
  "/saved",
  "/schedule",
  "/profile",
  "/chat",
  "/search",
  "/progression",
  "/contribute",
  "/mcp-setup",
  "/drawer-probe",
] as const;

export function robotsTxt(): string {
  const allow = [
    "/",
    "/about",
    "/faq",
    "/privacy",
    "/terms",
    "/programs",
    "/onboarding",
    "/llms.txt",
    "/llms-full.txt",
  ];
  const lines = [
    "User-agent: *",
    ...allow.map((path) => `Allow: ${path}`),
    ...DISALLOWED_APP_PATHS.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    "",
  ];
  return lines.join("\n");
}

export function sitemapXml(): string {
  const paths = [...SITEMAP_PATHS, ...programSitemapPaths()];
  const urls = paths.map((path) => {
    const priority =
      path === "/about" || path === "/faq" || path === "/programs" ? "0.8" : path.startsWith("/programs/") ? "0.6" : "0.5";
    return [
      "  <url>",
      `    <loc>${SITE_ORIGIN}${path}</loc>`,
      "    <changefreq>weekly</changefreq>",
      `    <priority>${priority}</priority>`,
      "  </url>",
    ].join("\n");
  });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
    "",
  ].join("\n");
}

export function llmsTxt(): string {
  return [
    "LionPlan",
    "",
    "LionPlan is a course planner for Columbia College, Columbia Engineering, Barnard College, and selected General Studies programs. Tell it your school, your major, and what you have taken, and it works out what you should take next. A course card shows what a class satisfies and what it unlocks.",
    "",
    "Live coverage: Columbia College, Columbia Engineering, and Barnard College, plus the General Studies Core and Medical Humanities major. Other General Studies majors are still being added.",
    "",
    "Columbia and General Studies requirements are read from bulletin.columbia.edu; Barnard requirements are read from Barnard's own catalogue at catalog.barnard.edu, which is a separate publication on its own edition year. Barnard coverage is the Foundations general-education requirements plus eleven majors.",
    "",
    "LionPlan is an unofficial student project. It is not affiliated with Columbia University or Barnard College. It is not a substitute for Stellic, Vergil, or advising at CSA or Barnard. It does not replace those tools.",
    "",
    "A different student project is also called LionPlan. That one is an eight-semester visual planner. This site is the requirements map and next-course recommender at https://www.lionplan.org.",
    "",
    "About: https://www.lionplan.org/about",
    "Programs: https://www.lionplan.org/programs",
    "FAQ: https://www.lionplan.org/faq",
    "Privacy: https://www.lionplan.org/privacy",
    "Terms: https://www.lionplan.org/terms",
    "Get started: https://www.lionplan.org/onboarding",
    "",
  ].join("\n");
}

export function llmsFullTxt(): string {
  return [
    llmsTxt().trimEnd(),
    "",
    "How setup works",
    "School, graduation year 2026 to 2030, major, then the requirement questions the bulletin or catalogue cannot answer (LitHum versus Contemporary Civilization, Art Hum versus Music Hum, physics sequences, Barnard's senior thesis versus senior seminar). Next is an inferred transcript with suggestions and an Import transcript button. Then liked courses, interest tiles, a first feed card, and a Columbia or Barnard Google sign-in wall.",
    "",
    "Transcript files are read in the browser. The file is not uploaded. We do not sell student data.",
    "",
  ].join("\n");
}
