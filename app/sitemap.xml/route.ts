import { CURRENT_TERM } from "@/lib/constants";
import { listInstructors } from "@/lib/data/instructors";
import { getAllCourses } from "@/lib/data/catalog";
import { catalogSitemapPaths } from "@/lib/marketing/catalog-sitemap";
import { sitemapXml } from "@/lib/marketing/crawler-files";
import { PUBLIC_CACHE_CONTROL } from "@/lib/marketing/site";

/** Rebuilt daily, after the crawl cron refreshes the catalog. */
export const revalidate = 86400;

/**
 * /sitemap.xml as application/xml. Never HTML.
 *
 * A catalog read that fails still serves the marketing pages: a sitemap
 * missing its course URLs for a day costs less than a 500 Search Console
 * remembers.
 */
export async function GET() {
  let catalogPaths: string[] = [];
  try {
    const [courses, instructors] = await Promise.all([
      getAllCourses(CURRENT_TERM),
      listInstructors(CURRENT_TERM),
    ]);
    catalogPaths = catalogSitemapPaths(courses, instructors, CURRENT_TERM);
  } catch (error) {
    console.error("sitemap: catalog read failed", error);
  }
  return new Response(sitemapXml(catalogPaths), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": PUBLIC_CACHE_CONTROL,
    },
  });
}
