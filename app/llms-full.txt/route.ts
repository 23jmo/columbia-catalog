import { llmsFullTxt } from "@/lib/marketing/crawler-files";
import { PUBLIC_CACHE_CONTROL } from "@/lib/marketing/site";

/** Longer llms.txt: setup steps and the transcript promise. */
export function GET() {
  return new Response(llmsFullTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": PUBLIC_CACHE_CONTROL,
    },
  });
}
