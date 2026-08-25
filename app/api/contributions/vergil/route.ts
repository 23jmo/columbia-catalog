import { NextResponse } from "next/server";

import { NotSignedInError, requireSessionUser } from "@/lib/db/auth";

import { VergilContributionRequestSchema } from "./contracts";
import { callContributionRpc, ContributionDatabaseError } from "./rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 512_000;
const NO_STORE = { "cache-control": "no-store" };

interface ContributionProgress {
  contributionId: string;
  status: "uploading" | "accepted" | "partial" | "rejected";
  receivedSections?: number;
  expectedSections?: number;
  acceptedSections?: number;
  unmatchedSections?: number;
  lowerQualitySections?: number;
  staleSections?: number;
  meetingsWritten?: number;
  locationsWritten?: number;
  rejectionReason?: string | null;
  idempotent?: boolean;
}

function databaseFailure(error: ContributionDatabaseError): Response {
  if (error.message.includes("hourly_limit")) {
    return NextResponse.json(
      { error: "You have started three refresh uploads this hour. Try again later." },
      { status: 429, headers: NO_STORE },
    );
  }
  if (error.message.includes("not_found")) {
    return NextResponse.json(
      { error: "That contribution upload does not exist." },
      { status: 404, headers: NO_STORE },
    );
  }
  if (
    error.code === "22023" ||
    error.code === "22007" ||
    error.code === "23505" ||
    error.message.includes("invalid_") ||
    error.message.includes("duplicate_") ||
    error.message.includes("conflicting_")
  ) {
    return NextResponse.json(
      { error: "The extension payload failed server validation." },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    { error: "The contribution could not be stored." },
    { status: 503, headers: NO_STORE },
  );
}

export async function POST(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large." }, { status: 413, headers: NO_STORE });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: "Unreadable request." }, { status: 400, headers: NO_STORE });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large." }, { status: 413, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers: NO_STORE });
  }

  const parsed = VergilContributionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The extension payload failed server validation." },
      { status: 400, headers: NO_STORE },
    );
  }

  let account;
  try {
    account = await requireSessionUser();
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return NextResponse.json(
        { error: "Sign in before submitting a contribution." },
        { status: 401, headers: NO_STORE },
      );
    }
    throw error;
  }

  try {
    let result: ContributionProgress;
    const input = parsed.data;
    if (input.action === "start") {
      result = await callContributionRpc<ContributionProgress>("start_vergil_contribution", {
        p_user_id: account.userId,
        p_payload_hash: input.payloadHash,
        p_schema_version: input.schemaVersion,
        p_source: input.source,
        p_term_code: input.termCode,
        p_expected_sections: input.sections,
        p_expected_meetings: input.meetings,
        p_expected_locations: input.locations,
        p_scan_page: input.scan.page,
        p_scan_pages: input.scan.pages,
        p_scanned_courses: input.scan.scannedCourses,
        p_total_courses: input.scan.totalCourses,
        p_scan_started_at: input.scan.startedAt,
        p_scan_completed_at: input.scan.completedAt,
        p_observed_from: input.observedFrom,
        p_observed_to: input.observedTo,
        p_exported_at: input.exportedAt,
      });
    } else if (input.action === "chunk") {
      result = await callContributionRpc<ContributionProgress>(
        "append_vergil_contribution_chunk",
        {
          p_user_id: account.userId,
          p_contribution_id: input.contributionId,
          p_sections: input.sections,
        },
      );
    } else {
      result = await callContributionRpc<ContributionProgress>("finalize_vergil_contribution", {
        p_user_id: account.userId,
        p_contribution_id: input.contributionId,
      });
    }

    return NextResponse.json(result, { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof ContributionDatabaseError) return databaseFailure(error);
    return NextResponse.json(
      { error: "The contribution could not be stored." },
      { status: 503, headers: NO_STORE },
    );
  }
}

