import { NextResponse } from "next/server";

import { invalidatePrereqCache } from "@/lib/recommend/pipeline";

/**
 * POST /api/internal/revalidate-prereqs
 *
 * Drops the in-process prerequisite graph so the next feed/onboarding request
 * rebuilds from `courses.prerequisite_formula`. Called by operator scripts
 * after a prereq backfill — see `notifyPrereqGraphStale()`.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  invalidatePrereqCache();
  return NextResponse.json({ ok: true });
}
