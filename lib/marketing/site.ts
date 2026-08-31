import type { Metadata } from "next";

/**
 * Canonical origin for public marketing and crawler files.
 *
 * The apex host 308s to www. Every sitemap URL, canonical, and JSON-LD
 * url uses this string so a preview and production do not invent a
 * second site.
 */
export const SITE_ORIGIN = "https://www.lionplan.org";

/** HTML pages that belong in the sitemap. Crawler files are separate. */
export const SITEMAP_PATHS = ["/about", "/faq", "/privacy", "/terms"] as const;

/**
 * Files a crawler fetches before it decides whether to index anything.
 *
 * These used to 307 to /onboarding. Googlebot then stored the school
 * picker as robots.txt. That is the ranking failure this list exists
 * to stop.
 */
export const CRAWLER_FILE_PATHS = [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
] as const;

/** Cache header for public marketing HTML and crawler files. Not for onboarding. */
export const PUBLIC_CACHE_CONTROL =
  "public, s-maxage=3600, stale-while-revalidate=86400";

export function publicPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: `/${string}`;
}): Metadata {
  const url = `${SITE_ORIGIN}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: "LionPlan",
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
