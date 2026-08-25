import { describe, expect, it } from "vitest";

import { keepChangedReadings, type SeatSnapshot } from "./seat-history";

function snap(
  sectionId: string,
  observedAt: string,
  enrollmentCount: number,
  extra: Partial<SeatSnapshot> = {},
): SeatSnapshot {
  return {
    sectionId,
    observedAt,
    enrollmentCount,
    enrollmentCap: 110,
    waitlistCount: null,
    status: "open",
    ...extra,
  };
}

describe("keepChangedReadings", () => {
  it("drops heartbeats and keeps the look where the count moved", () => {
    // Newest-first, the order getRecentSeatMovement fetches in.
    const rows = [
      snap("A", "2026-08-24T12:00:00Z", 40),
      snap("A", "2026-08-24T11:00:00Z", 40),
      snap("A", "2026-08-24T10:00:00Z", 12),
    ];
    // 12:00 is a heartbeat of 11:00. Keep the jump at 11:00, not the later look.
    expect(keepChangedReadings(rows, 10).map((row) => row.observedAt)).toEqual([
      "2026-08-24T11:00:00Z",
      "2026-08-24T10:00:00Z",
    ]);
  });

  it("keeps a drop in open seats, not only openings", () => {
    const rows = [
      snap("A", "2026-08-24T12:00:00Z", 109),
      snap("A", "2026-08-24T11:00:00Z", 100),
    ];
    expect(keepChangedReadings(rows, 10)).toHaveLength(2);
  });

  it("treats a status-only change as a movement", () => {
    const rows = [
      snap("A", "2026-08-24T12:00:00Z", 110, { status: "full" }),
      snap("A", "2026-08-24T11:00:00Z", 110, { status: "open" }),
    ];
    expect(keepChangedReadings(rows, 10)).toHaveLength(2);
  });

  it("merges sections and respects the limit, newest first", () => {
    const rows = [
      snap("B", "2026-08-24T12:00:00Z", 5),
      snap("A", "2026-08-24T11:00:00Z", 2),
      snap("B", "2026-08-24T10:00:00Z", 1),
      snap("A", "2026-08-24T09:00:00Z", 1),
    ];
    expect(keepChangedReadings(rows, 3).map((row) => `${row.sectionId}@${row.observedAt}`)).toEqual([
      "B@2026-08-24T12:00:00Z",
      "A@2026-08-24T11:00:00Z",
      "B@2026-08-24T10:00:00Z",
    ]);
  });
});
