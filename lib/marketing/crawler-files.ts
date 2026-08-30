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
    "LionPlan is a Columbia course planner for Columbia College and Columbia Engineering. Tell it your school, your major, and what you have taken, and it works out what you should take next. A course card shows what a class satisfies and what it unlocks.",
    "",
    "Live schools: Columbia College and Columbia Engineering. Barnard College and General Studies are coming soon.",
    "",
    "LionPlan is an unofficial student project. It is not affiliated with Columbia University. It is not a substitute for Stellic, Vergil, or CSA advising. It does not replace those tools.",
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
    "School, graduation year 2026 to 2030, major, then the requirement questions the bulletin cannot answer (LitHum versus Contemporary Civilization, Art Hum versus Music Hum, physics sequences). Next is an inferred transcript with suggestions and an Import transcript button. Then liked courses, interest tiles, a first feed card, and a Columbia Google sign-in wall.",
    "",
    "Transcript files are read in the browser. The file is not uploaded. We do not sell student data.",
    "",
  ].join("\n");
}
