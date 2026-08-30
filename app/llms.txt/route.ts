import { llmsTxt } from "@/lib/marketing/crawler-files";
import { PUBLIC_CACHE_CONTROL } from "@/lib/marketing/site";

export const dynamic = "force-static";

/** Short definition for answer engines. Plain text, not a page. */
export function GET() {
  return new Response(llmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": PUBLIC_CACHE_CONTROL,
    },
  });
}
