/**
 * Write protection for the ingest pipeline — spec §10, "Parse safety", layer 2.
 *
 * Contract tests on golden fixtures catch KNOWN breakage before deploy. This
 * catches UNKNOWN breakage in production: when Columbia silently changes their
 * HTML, the parser does not crash, it just returns less. An ingest run that
 * produces meaningfully fewer or emptier records than the previous run for the
 * same key is quarantined for review and never committed.
 *
 * The product rule this enforces is absolute: NEVER overwrite good data with
 * worse data. A stale catalog with visible provenance is the acceptable failure
 * mode; a silently-emptied one is not.
 *
 * The thresholds exist so that LEGITIMATE shrinkage still lands. Sections do
 * genuinely disappear — a term ends, a course is cancelled, a department trims
 * its offerings — so a small drop is normal and only a cliff is suspicious.
 */

/** The two numbers every ingest run reports for a given key. */
export interface IngestCounts {
  /** Records the run produced, e.g. sections parsed off a subject-term page. */
  recordCount: number;
  /**
   * Records carrying a usable enrollment reading. A parser that still finds
   * every row but has lost the enrollment `<dd>` shows up here and nowhere
   * else, which is exactly the silent-breakage case.
   */
  nonEmptyCount: number;
}

export interface QuarantineThresholds {
  /** Fractional drop in `recordCount` that trips the guard. Default 0.30. */
  maxRecordDropRatio: number;
  /** Fractional drop in `nonEmptyCount` that trips the guard. Default 0.50. */
  maxNonEmptyDropRatio: number;
  /**
   * Previous runs at or below this record count are too small to reason about
   * ratios on, so only a drop to zero is refused. Default 3.
   */
  smallSampleFloor: number;
}

export const DEFAULT_QUARANTINE_THRESHOLDS: QuarantineThresholds = {
  maxRecordDropRatio: 0.3,
  maxNonEmptyDropRatio: 0.5,
  smallSampleFloor: 3,
};

export interface QuarantineDecision {
  quarantine: boolean;
  /** Human-readable justification. Present only when `quarantine` is true. */
  reason?: string;
}

const ALLOW: QuarantineDecision = { quarantine: false };

/**
 * Decide whether an ingest run may be committed.
 *
 * @param previous Counts from the last successful run for the same key, or
 *   `null` on a first run (nothing to protect, so the write is allowed).
 * @param next Counts the current run produced.
 */
export function shouldQuarantine(
  previous: IngestCounts | null,
  next: IngestCounts,
  thresholds: Partial<QuarantineThresholds> = {},
): QuarantineDecision {
  const limits = { ...DEFAULT_QUARANTINE_THRESHOLDS, ...thresholds };

  // Guards never throw — a malformed submission must be refused, not crash the
  // worker that is holding a lease.
  const incoherent = findIncoherence(next, "incoming");
  if (incoherent) return { quarantine: true, reason: incoherent };
  if (previous) {
    const priorIncoherent = findIncoherence(previous, "previous");
    if (priorIncoherent) return { quarantine: true, reason: priorIncoherent };
  }

  // First run for this key: there is no good data to overwrite.
  if (!previous) return ALLOW;

  // The previous run had nothing either — anything is an improvement.
  if (previous.recordCount === 0) return ALLOW;

  if (next.recordCount === 0) {
    return {
      quarantine: true,
      reason:
        `produced 0 records where the previous run produced ${previous.recordCount}` +
        " — treating an empty parse as breakage, not as an emptied catalog",
    };
  }

  // Growth is always fine, and so is any change on a sample too small for a
  // ratio to mean anything (a 2-section subject losing one section is normal).
  if (previous.recordCount > limits.smallSampleFloor) {
    const recordDrop = dropRatio(previous.recordCount, next.recordCount);
    if (recordDrop > limits.maxRecordDropRatio) {
      return {
        quarantine: true,
        reason:
          `record count fell ${formatPercent(recordDrop)} ` +
          `(${previous.recordCount} → ${next.recordCount}), ` +
          `above the ${formatPercent(limits.maxRecordDropRatio)} limit`,
      };
    }
  }

  // A run can keep every row and still be broken if the values went missing.
  if (previous.nonEmptyCount > limits.smallSampleFloor) {
    const nonEmptyDrop = dropRatio(previous.nonEmptyCount, next.nonEmptyCount);
    if (nonEmptyDrop > limits.maxNonEmptyDropRatio) {
      return {
        quarantine: true,
        reason:
          `non-empty readings fell ${formatPercent(nonEmptyDrop)} ` +
          `(${previous.nonEmptyCount} → ${next.nonEmptyCount}), ` +
          `above the ${formatPercent(limits.maxNonEmptyDropRatio)} limit`,
      };
    }
  } else if (previous.nonEmptyCount > 0 && next.nonEmptyCount === 0) {
    return {
      quarantine: true,
      reason:
        `lost every non-empty reading (${previous.nonEmptyCount} → 0)` +
        " while still returning records — the values, not the rows, broke",
    };
  }

  return ALLOW;
}

/**
 * Convenience wrapper for the common case: counting a parsed subject page.
 * `nonEmptyCount` is the number of sections that came back with an enrollment
 * reading, which is the field most likely to vanish silently.
 */
export function countSectionRecords(
  sections: readonly { enrollmentCount: number | null }[],
): IngestCounts {
  return {
    recordCount: sections.length,
    nonEmptyCount: sections.filter((section) => section.enrollmentCount !== null).length,
  };
}

// ---------------------------------------------------------------------------

function findIncoherence(counts: IngestCounts, which: string): string | null {
  if (!Number.isFinite(counts.recordCount) || !Number.isFinite(counts.nonEmptyCount)) {
    return `${which} counts are not finite numbers`;
  }
  if (counts.recordCount < 0 || counts.nonEmptyCount < 0) {
    return `${which} counts are negative`;
  }
  if (counts.nonEmptyCount > counts.recordCount) {
    return (
      `${which} counts are incoherent: nonEmptyCount ${counts.nonEmptyCount}` +
      ` exceeds recordCount ${counts.recordCount}`
    );
  }
  return null;
}

function dropRatio(previous: number, next: number): number {
  if (previous <= 0) return 0;
  return Math.max(0, (previous - next) / previous);
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
