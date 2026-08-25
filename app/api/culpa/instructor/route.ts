import { NextResponse } from "next/server";

import { getInstructorCulpaUrl } from "@/lib/db/reputation";
import { CULPA_HOME_URL } from "@/lib/reviews/culpa-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  const destination = name ? await getInstructorCulpaUrl(name) : null;

  return NextResponse.redirect(destination ?? CULPA_HOME_URL, {
    status: 307,
    headers: {
      // CULPA profile ids are stable, but a missing profile can appear after a
      // later ingest. Cache briefly rather than turning absence permanent.
      "cache-control": destination
        ? "public, max-age=3600, stale-while-revalidate=86400"
        : "public, max-age=60",
    },
  });
}

