import { robotsTxt } from "@/lib/marketing/crawler-files";
import { PUBLIC_CACHE_CONTROL } from "@/lib/marketing/site";

/**
 * /robots.txt as text/plain. A page.tsx here would be HTML, and Googlebot
 * treating HTML as robots.txt is how the school picker became the file.
 */
export function GET() {
  return new Response(robotsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": PUBLIC_CACHE_CONTROL,
    },
  });
}
