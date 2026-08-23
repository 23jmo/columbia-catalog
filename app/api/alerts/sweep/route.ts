/**
 * GET/POST /api/alerts/sweep — deliver seat-opened emails.
 *
 * Runs on a cron, separately from `/api/crawl/cron`, and the separation is the
 * point: the crawler is allowed to be slow and to give up partway through a
 * queue, whereas an alert that is late is an alert that failed. Sharing a
 * handler would let a long crawl tick eat the budget for mail that was already
 * owed.
 *
 * It is also why this route is cheap. It never fetches Columbia and never
 * ingests anything — it reads a small set of pending rows, sends, and records.
 * A tick with nothing to do costs one query.
 *
 * Idempotent by construction: dedupe lives in `alerts_sent`, keyed on the
 * exact transition timestamp, so running this twice in a row sends nothing the
 * second time. That means it is safe to hit manually during an incident.
 */

import { NextResponse } from "next/server";

import { runAlertSweep } from "@/lib/alerts/sweep";
import { isCronAuthorized } from "@/lib/cron-auth";
import { isServiceConfigured, configurationProblem } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Under the 60s ceiling with room to spare. The sweep stops itself here and
 * leaves the rest for the next tick rather than being killed mid-send, which
 * would leave emails delivered but unrecorded.
 */
const SWEEP_DEADLINE_MS = 40_000;

async function handle(request: Request): Promise<Response> {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (process.env.ALERTS_DISABLED === "1") {
    return NextResponse.json({ pending: 0, sent: 0, stoppedBecause: "disabled" }, { status: 200 });
  }
  if (!isServiceConfigured()) {
    return NextResponse.json(
      { error: "service role unavailable", reason: configurationProblem() },
      { status: 503 },
    );
  }

  try {
    const summary = await runAlertSweep({ deadlineMs: SWEEP_DEADLINE_MS });
    return NextResponse.json(summary, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
