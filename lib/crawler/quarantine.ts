/**
 * LionPlan — the quarantine guard.
 *
 * Contract tests on golden fixtures catch *known* breakage before deploy. This
 * file catches *unknown* breakage in production: an ingest run producing fewer
 * or emptier records than the previous committed run for the same key is
 * quarantined and never written (spec §10).
 *
 * The asymmetry is deliberate. A run that is bigger and richer is committed
 * without ceremony; a run that shrinks is refused, because the only cheap way
 * to distinguish "the registrar cancelled six sections" from "our selector
 * stopped matching" is to stop and have a human look. Being a day stale is
 * recoverable. Silently deleting the catalog is not.
 */

import type { IngestFingerprint, IngestPayload } from "./contracts";

/**
 * Fields flicker legitimately — an instructor goes TBA, a room is pulled — so
 * a tiny drop in populated fields is tolerated. Record count is not: any
 * decrease at all is refused.
 */
export const FIELD_SHRINK_TOLERANCE = 0.02;

export interface QuarantineDecision {
  quarantined: boolean;
  reason: string | null;
  incoming: Omit<IngestFingerprint, "capturedAt">;
  previous: IngestFingerprint | null;
}

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

/**
 * Counts populated scalar leaves. `null`, `undefined`, empty strings and
 * whitespace-only strings do not count; `false` and `0` do, because they are
 * real values.
 */
export function countFilledFields(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.trim().length > 0 ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? 1 : 0;
  if (typeof value === "boolean") return 1;
  if (Array.isArray(value)) {
    return value.reduce<number>((total, entry) => total + countFilledFields(entry), 0);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (total, entry) => total + countFilledFields(entry),
      0,
    );
  }
  return 0;
}

/**
 * The comparable shape of a parse result. `recordCount` counts the units the
 * page is *about* (sections, bulletin rows, subjects), so a subject page that
 * loses half its sections is caught even if the remaining ones grew richer.
 */
export function fingerprintPayload(payload: IngestPayload): Omit<IngestFingerprint, "capturedAt"> {
  switch (payload.kind) {
    case "subject_term": {
      const sections = payload.page.courses.flatMap((course) => course.sections);
      return {
        recordCount: sections.length,
        filledFieldCount: countFilledFields(payload.page.courses),
      };
    }
    case "section_detail":
      return { recordCount: 1, filledFieldCount: countFilledFields(payload.detail) };
    case "bulletin_department":
      return {
        recordCount: payload.rows.length,
        filledFieldCount: countFilledFields(payload.rows),
      };
    case "subject_index":
      return {
        recordCount: payload.index.subjects.length,
        filledFieldCount: countFilledFields(payload.index.subjects),
      };
    case "academic_calendar":
      return {
        recordCount: payload.calendar.milestones.length,
        filledFieldCount: countFilledFields(payload.calendar.milestones),
      };
  }
}

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

export function evaluateQuarantine(
  incoming: Omit<IngestFingerprint, "capturedAt">,
  previous: IngestFingerprint | null,
  options: { fieldTolerance?: number } = {},
): QuarantineDecision {
  const tolerance = options.fieldTolerance ?? FIELD_SHRINK_TOLERANCE;

  // First run for this key: there is nothing better to protect, so commit.
  if (!previous) {
    return { quarantined: false, reason: null, incoming, previous: null };
  }

  if (incoming.recordCount < previous.recordCount) {
    return {
      quarantined: true,
      reason:
        `record count fell from ${previous.recordCount} to ${incoming.recordCount} ` +
        `(previous run committed ${previous.capturedAt})`,
      incoming,
      previous,
    };
  }

  const floor = Math.floor(previous.filledFieldCount * (1 - tolerance));
  if (incoming.filledFieldCount < floor) {
    return {
      quarantined: true,
      reason:
        `populated fields fell from ${previous.filledFieldCount} to ${incoming.filledFieldCount} ` +
        `(tolerance floor ${floor})`,
      incoming,
      previous,
    };
  }

  return { quarantined: false, reason: null, incoming, previous };
}

/** Fingerprint to persist once a run has actually been committed. */
export function committedFingerprint(
  incoming: Omit<IngestFingerprint, "capturedAt">,
  at: string,
): IngestFingerprint {
  return { ...incoming, capturedAt: at };
}
