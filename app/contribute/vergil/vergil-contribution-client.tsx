"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import { signIn } from "@/lib/db/auth";

const SOURCE = "Vergil course search via Columbia Catalog Chrome extension" as const;
const CHUNK_SIZE = 200;

interface VergilMeeting {
  weekday: "Su" | "Mo" | "Tu" | "We" | "Th" | "Fr" | "Sa";
  startMinute: number;
  endMinute: number;
  buildingName: string | null;
  room: string | null;
}

interface VergilSection {
  sectionKey: string;
  termCode: string;
  courseId: string;
  sectionCode: string;
  callNumber: string;
  meetings: VergilMeeting[];
  observedAt: string;
  provenance: "Vergil course search";
}

interface VergilScan {
  status: "complete";
  termCode: string;
  page: number;
  pages: number;
  scannedCourses: number;
  totalCourses: number;
  startedAt: string;
  completedAt: string;
  error: null;
  baselineSectionCount: number;
  sectionsCaptured: number;
}

interface VergilPayload {
  schemaVersion: 1;
  exportedAt: string;
  source: typeof SOURCE;
  scan: VergilScan;
  sections: VergilSection[];
}

interface ContributionSummary {
  enabled: boolean;
  ready: boolean;
  reason: string | null;
  termCode: string | null;
  sections: number;
  meetings: number;
  locations: number;
  observedFrom: string | null;
  observedTo: string | null;
}

interface ContributionResult {
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
}

interface RuntimeApi {
  lastError?: { message?: string };
  sendMessage(
    extensionId: string,
    message: { type: string },
    callback: (response: unknown) => void,
  ): void;
}

type Phase = "connecting" | "ready" | "review" | "uploading" | "done" | "error";

function runtimeApi(): RuntimeApi | null {
  const value = globalThis as typeof globalThis & { chrome?: { runtime?: RuntimeApi } };
  return value.chrome?.runtime ?? null;
}

function extensionMessage(extensionId: string, type: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const runtime = runtimeApi();
    if (!runtime) {
      reject(new Error("Open this page in Chrome with the Columbia Catalog extension installed."));
      return;
    }
    try {
      runtime.sendMessage(extensionId, { type }, (response) => {
        const message = runtime.lastError?.message;
        if (message) reject(new Error("The Vergil extension could not be reached."));
        else resolve(response);
      });
    } catch {
      reject(new Error("The Vergil extension could not be reached."));
    }
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSummary(value: unknown): ContributionSummary {
  if (!isObject(value)) throw new Error("The extension returned an unreadable summary.");
  const summary = value as Partial<ContributionSummary>;
  if (
    typeof summary.enabled !== "boolean" ||
    typeof summary.ready !== "boolean" ||
    typeof summary.sections !== "number" ||
    typeof summary.meetings !== "number" ||
    typeof summary.locations !== "number"
  ) {
    throw new Error("The extension returned an unreadable summary.");
  }
  if (
    summary.ready &&
    (typeof summary.termCode !== "string" ||
      typeof summary.observedFrom !== "string" ||
      typeof summary.observedTo !== "string")
  ) {
    throw new Error("The completed refresh is missing its observation range.");
  }
  return {
    enabled: summary.enabled,
    ready: summary.ready,
    reason: typeof summary.reason === "string" ? summary.reason : null,
    termCode: typeof summary.termCode === "string" ? summary.termCode : null,
    sections: summary.sections,
    meetings: summary.meetings,
    locations: summary.locations,
    observedFrom: typeof summary.observedFrom === "string" ? summary.observedFrom : null,
    observedTo: typeof summary.observedTo === "string" ? summary.observedTo : null,
  };
}

function parsePayload(value: unknown, summary: ContributionSummary): VergilPayload {
  if (!isObject(value)) throw new Error("The extension returned an unreadable contribution.");
  if (typeof value.error === "string") throw new Error(value.error);
  if (
    value.schemaVersion !== 1 ||
    value.source !== SOURCE ||
    !isObject(value.scan) ||
    !Array.isArray(value.sections) ||
    value.sections.length !== summary.sections ||
    value.scan.termCode !== summary.termCode
  ) {
    throw new Error("The contribution no longer matches the reviewed refresh.");
  }
  return value as unknown as VergilPayload;
}

function isLocation(value: string | null): boolean {
  return Boolean(value?.trim() && value.trim().toLowerCase() !== "to be announced");
}

function formatTime(value: string | null): string {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function payloadHash(payload: VergilPayload): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function postContribution(body: unknown): Promise<ContributionResult> {
  const response = await fetch("/api/contributions/vergil", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = (await response.json()) as unknown;
  if (!response.ok) {
    const message = isObject(value) && typeof value.error === "string"
      ? value.error
      : "The contribution could not be submitted.";
    throw new Error(message);
  }
  return value as ContributionResult;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2lg bg-background-secondary-default p-3">
      <span className="text-caption-1-medium text-text-tertiary">{label}</span>
      <span className="text-title-2-semibold tabular-nums text-text-primary">{value}</span>
    </div>
  );
}

export function VergilContributionClient({
  extensionId,
  signedIn,
}: {
  extensionId: string;
  signedIn: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [summary, setSummary] = useState<ContributionSummary | null>(null);
  const [payload, setPayload] = useState<VergilPayload | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ContributionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setPhase("connecting");
    setError(null);
    try {
      const nextSummary = parseSummary(
        await extensionMessage(extensionId, "GET_VERGIL_CONTRIBUTION_SUMMARY"),
      );
      setSummary(nextSummary);
      setPhase("ready");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "The extension could not be reached.");
      setPhase("error");
    }
  }, [extensionId]);

  useEffect(() => {
    let active = true;
    void extensionMessage(extensionId, "GET_VERGIL_CONTRIBUTION_SUMMARY")
      .then((value) => {
        if (!active) return;
        setSummary(parseSummary(value));
        setPhase("ready");
      })
      .catch((connectError: unknown) => {
        if (!active) return;
        setError(
          connectError instanceof Error
            ? connectError.message
            : "The extension could not be reached.",
        );
        setPhase("error");
      });
    return () => {
      active = false;
    };
  }, [extensionId]);

  const review = async () => {
    if (!summary?.ready || !summary.enabled) return;
    setError(null);
    try {
      const nextPayload = parsePayload(
        await extensionMessage(extensionId, "GET_VERGIL_CONTRIBUTION"),
        summary,
      );
      setPayload(nextPayload);
      setPhase("review");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "The contribution could not be reviewed.");
      setPhase("error");
    }
  };

  const submit = async () => {
    if (!payload || !summary || !signedIn) return;
    setPhase("uploading");
    setProgress(0);
    setError(null);
    try {
      const hash = await payloadHash(payload);
      const start = await postContribution({
        action: "start",
        payloadHash: hash,
        schemaVersion: payload.schemaVersion,
        source: payload.source,
        exportedAt: payload.exportedAt,
        termCode: payload.scan.termCode,
        sections: payload.sections.length,
        meetings: payload.sections.reduce((count, section) => count + section.meetings.length, 0),
        locations: payload.sections.reduce(
          (count, section) =>
            count + section.meetings.filter(
              (meeting) => isLocation(meeting.buildingName) || isLocation(meeting.room),
            ).length,
          0,
        ),
        observedFrom: summary.observedFrom,
        observedTo: summary.observedTo,
        scan: payload.scan,
      });

      if (start.status === "uploading") {
        for (let index = 0; index < payload.sections.length; index += CHUNK_SIZE) {
          const chunk = payload.sections.slice(index, index + CHUNK_SIZE);
          const chunkResult = await postContribution({
            action: "chunk",
            contributionId: start.contributionId,
            sections: chunk,
          });
          setProgress(
            Math.round(
              ((chunkResult.receivedSections ?? index + chunk.length) / payload.sections.length) * 100,
            ),
          );
        }
      }

      const finalized = await postContribution({
        action: "finalize",
        contributionId: start.contributionId,
      });
      setResult(finalized);
      setProgress(100);
      setPhase("done");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The contribution could not be submitted.");
      setPhase("error");
    }
  };

  const readyToReview = summary?.ready === true && summary.enabled === true;
  const statusText = useMemo(() => {
    if (!summary) return "Checking extension";
    if (!summary.enabled) return "Sharing is off";
    if (!summary.ready) return "Refresh required";
    return "Ready to review";
  }, [summary]);

  return (
    <main className="flex min-w-0 flex-col gap-6 py-6 sm:py-10">
      <header className="flex flex-col gap-3">
        <Badge className="w-fit">Community refresh</Badge>
        <h1 className="text-headline-medium text-balance text-text-primary">
          Contribute times and locations from Vergil
        </h1>
        <p className="max-w-[620px] text-body-regular text-text-secondary">
          Review the sanitized result of your completed term refresh, then choose whether to add it
          to Columbia Catalog. Course schedules only—never your classes, token, UNI, or Vergil account.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-[20px] border border-border-table bg-background-primary-default p-4 shadow-xs sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-title-2-semibold text-text-primary">Extension refresh</h2>
            <p className="text-body-2-regular text-text-secondary">{statusText}</p>
          </div>
          <Button variant="secondary" size="small" onClick={() => void connect()} disabled={phase === "connecting"}>
            Check again
          </Button>
        </div>

        {summary ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Term" value={summary.termCode ?? "—"} />
            <Stat label="Sections" value={summary.sections.toLocaleString()} />
            <Stat label="Meetings" value={summary.meetings.toLocaleString()} />
            <Stat label="Locations" value={summary.locations.toLocaleString()} />
          </div>
        ) : null}

        {summary?.observedFrom ? (
          <p className="text-caption-1-regular text-text-tertiary">
            Observed {formatTime(summary.observedFrom)} through {formatTime(summary.observedTo)}
          </p>
        ) : null}

        {!summary?.enabled && summary ? (
          <p className="rounded-2lg bg-background-secondary-default p-3 text-body-2-regular text-text-secondary">
            Open the extension popup and turn on “Allow contribution handoff,” then check again.
          </p>
        ) : null}
        {summary && !summary.ready ? (
          <p className="rounded-2lg bg-background-secondary-default p-3 text-body-2-regular text-text-secondary">
            {summary.reason ?? "Run Refresh every course in the extension first."}
          </p>
        ) : null}

        {phase !== "review" && phase !== "uploading" && phase !== "done" ? (
          <Button onClick={() => void review()} disabled={!readyToReview}>
            Review contribution
          </Button>
        ) : null}
      </section>

      {payload && (phase === "review" || phase === "uploading") ? (
        <section className="flex flex-col gap-4 rounded-[20px] border border-border-table bg-background-primary-default p-4 shadow-xs sm:p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-title-2-semibold text-text-primary">Final review</h2>
            <p className="text-body-2-regular text-text-secondary">
              The server will accept only exact catalog matches and will quarantine unmatched,
              older, or less-complete schedule rows.
            </p>
          </div>

          {phase === "uploading" ? (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-caption-1-medium text-text-secondary">
                <span>Uploading validated chunks</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background-tertiary-default">
                <div
                  className="h-full w-full origin-left rounded-full bg-button-primary transition-transform ease-out motion-reduce:transition-none"
                  style={{ transform: `scaleX(${progress / 100})` }}
                />
              </div>
            </div>
          ) : signedIn ? (
            <Button onClick={() => void submit()}>Submit schedule contribution</Button>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-2lg bg-background-secondary-default p-3">
              <p className="text-body-2-regular text-text-secondary">
                Sign in with Columbia or Barnard before the final submission.
              </p>
              <Button onClick={() => void signIn()}>Sign in to submit</Button>
            </div>
          )}
        </section>
      ) : null}

      {phase === "done" && result ? (
        <section className="flex flex-col gap-3 rounded-[20px] border border-border-table bg-background-primary-default p-4 shadow-xs sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-title-2-semibold text-text-primary">Contribution processed</h2>
            <Badge color={result.status === "rejected" ? "neutral" : "primary"}>{result.status}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Accepted sections" value={(result.acceptedSections ?? 0).toLocaleString()} />
            <Stat label="Meetings written" value={(result.meetingsWritten ?? 0).toLocaleString()} />
            <Stat label="Unmatched" value={(result.unmatchedSections ?? 0).toLocaleString()} />
            <Stat label="Protected" value={((result.lowerQualitySections ?? 0) + (result.staleSections ?? 0)).toLocaleString()} />
          </div>
          {result.rejectionReason ? (
            <p className="text-body-2-regular text-text-secondary">{result.rejectionReason}</p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-2lg border border-border-table bg-background-secondary-default p-3 text-body-2-regular text-text-secondary">
          {error}
        </div>
      ) : null}
    </main>
  );
}
