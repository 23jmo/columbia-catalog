/**
 * Charts lane — tests.
 *
 * Everything worth asserting is in `./series`: the step-after expansion, ghost
 * alignment, and the empty cases the component branches on. Nothing here
 * touches the DOM, which is the point — the maths is separable, so it is.
 *
 * Run with `npx vitest run components/charts`.
 */

import { describe, expect, it } from "vitest";

import type { EnrollmentSnapshot, RegistrationMilestone } from "@/lib/types";
import type { SeatHistorySeries } from "@/components/course/contracts";
import {
  GHOST_COLOR_VAR,
  LIVE_SERIES_COLOR_VARS,
  alignmentShifts,
  anchorTermCodes,
  buildSeatChartModel,
  milestonesInWindow,
  normalizePoints,
  orderForPainting,
  shiftInDays,
  termCodeOfSeries,
  tickGranularity,
  yAxisMax,
} from "./series";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LIVE_SECTION_ID = "20263COMS4113W001";
const GHOST_SECTION_ID = "20253COMS4113W001@20253";

const HOUR = 60 * 60 * 1000;

function snapshot(
  sectionId: string,
  observedAt: string,
  enrollmentCount: number,
  extra: Partial<EnrollmentSnapshot> = {},
): EnrollmentSnapshot {
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

function series(overrides: Partial<SeatHistorySeries> & { seriesId: string }): SeatHistorySeries {
  return {
    label: "Section 001",
    points: [],
    ...overrides,
  };
}

/** Epoch ms of a frame key's value, read back without fighting the index signature. */
function valueAt(frames: ReturnType<typeof buildSeatChartModel>["frames"], index: number, key: string) {
  return frames[index][key];
}

// ---------------------------------------------------------------------------
// Point normalisation
// ---------------------------------------------------------------------------

describe("normalizePoints", () => {
  it("sorts out-of-order observations and resolves instants", () => {
    const normalized = normalizePoints([
      snapshot(LIVE_SECTION_ID, "2026-04-01T14:00:00Z", 30),
      snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12),
    ]);
    expect(normalized.map((one) => one.snapshot.enrollmentCount)).toEqual([12, 30]);
    expect(normalized[0].t).toBe(Date.parse("2026-04-01T09:00:00Z"));
  });

  it("drops rows whose timestamp cannot be parsed", () => {
    const normalized = normalizePoints([
      snapshot(LIVE_SECTION_ID, "not a date", 5),
      snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12),
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].snapshot.enrollmentCount).toBe(12);
  });

  it("keeps the last row when two share an instant", () => {
    const normalized = normalizePoints([
      snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12),
      snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 13),
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].snapshot.enrollmentCount).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// Step-after expansion — the single most important behaviour in this lane
// ---------------------------------------------------------------------------

describe("buildSeatChartModel — step-after expansion", () => {
  it("holds a series flat between its own observations instead of interpolating", () => {
    // Change-only data: A moved at 09:00 and 14:00. B moved at 11:00, which
    // inserts an instant into the union timeline where A said nothing at all.
    const model = buildSeatChartModel([
      series({
        seriesId: LIVE_SECTION_ID,
        points: [
          snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12),
          snapshot(LIVE_SECTION_ID, "2026-04-01T14:00:00Z", 108),
        ],
      }),
      series({
        seriesId: "20263COMS4113W002",
        label: "Section 002",
        points: [snapshot("20263COMS4113W002", "2026-04-01T11:00:00Z", 40)],
      }),
    ]);

    expect(model.frames.map((frame) => frame.t)).toEqual([
      Date.parse("2026-04-01T09:00:00Z"),
      Date.parse("2026-04-01T11:00:00Z"),
      Date.parse("2026-04-01T14:00:00Z"),
    ]);

    // At 11:00 section 001 must read 12 — its last observation — and NOT a
    // value interpolated toward 108. A naive chart draws ~50 here and lies.
    expect(valueAt(model.frames, 1, "s0")).toBe(12);
    expect(valueAt(model.frames, 0, "s0")).toBe(12);
    expect(valueAt(model.frames, 2, "s0")).toBe(108);
  });

  it("leaves a series null before its first observation rather than assuming zero", () => {
    const model = buildSeatChartModel([
      series({
        seriesId: LIVE_SECTION_ID,
        points: [snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12)],
      }),
      series({
        seriesId: "20263COMS4113W002",
        label: "Section 002",
        points: [snapshot("20263COMS4113W002", "2026-04-01T11:00:00Z", 40)],
      }),
    ]);

    // "We were not watching yet" is a gap, not a floor at zero.
    expect(valueAt(model.frames, 0, "s1")).toBeNull();
    expect(valueAt(model.frames, 1, "s1")).toBe(40);
  });

  it("reports the largest value seen and an ascending domain", () => {
    const model = buildSeatChartModel([
      series({
        seriesId: LIVE_SECTION_ID,
        points: [
          snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12),
          snapshot(LIVE_SECTION_ID, "2026-04-01T14:00:00Z", 108),
        ],
      }),
    ]);
    expect(model.maxSeats).toBe(108);
    expect(model.domain).toEqual([
      Date.parse("2026-04-01T09:00:00Z"),
      Date.parse("2026-04-01T14:00:00Z"),
    ]);
  });

  it("pads the domain around a lone observation so the axis is not a point", () => {
    const model = buildSeatChartModel([
      series({
        seriesId: LIVE_SECTION_ID,
        points: [snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12)],
      }),
    ]);
    const [from, to] = model.domain ?? [0, 0];
    expect(to).toBeGreaterThan(from);
    expect(model.hasData).toBe(true);
  });

  it("indexes the real observation separately from the carried value", () => {
    const model = buildSeatChartModel([
      series({
        seriesId: LIVE_SECTION_ID,
        points: [
          snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12, { waitlistCount: 0 }),
          snapshot(LIVE_SECTION_ID, "2026-04-01T14:00:00Z", 108, { waitlistCount: 9 }),
        ],
      }),
      series({
        seriesId: "20263COMS4113W002",
        label: "Section 002",
        points: [snapshot("20263COMS4113W002", "2026-04-01T11:00:00Z", 40)],
      }),
    ]);
    const index = model.observationIndex.get("s0");
    // 11:00 is on the timeline but section 001 never reported there.
    expect(index?.get(Date.parse("2026-04-01T11:00:00Z"))).toBeUndefined();
    expect(index?.get(Date.parse("2026-04-01T14:00:00Z"))?.waitlistCount).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Empty handling
// ---------------------------------------------------------------------------

describe("buildSeatChartModel — empty handling", () => {
  it("returns no data for no series at all", () => {
    const model = buildSeatChartModel([]);
    expect(model.hasData).toBe(false);
    expect(model.frames).toEqual([]);
    expect(model.domain).toBeNull();
    expect(model.plots).toEqual([]);
  });

  it("returns no data when every series has an empty point list", () => {
    const model = buildSeatChartModel([
      series({ seriesId: LIVE_SECTION_ID }),
      series({ seriesId: "20263COMS4113W002", label: "Section 002" }),
    ]);
    // The plots still exist — the legend can name them — but there is nothing
    // to draw, so the component renders the empty state instead of an axis.
    expect(model.plots).toHaveLength(2);
    expect(model.hasData).toBe(false);
    expect(model.domain).toBeNull();
    expect(model.maxSeats).toBe(0);
  });

  it("still plots when only a ghost carries points", () => {
    const model = buildSeatChartModel([
      series({ seriesId: LIVE_SECTION_ID }),
      series({
        seriesId: GHOST_SECTION_ID,
        label: "Fall 2025",
        isGhost: true,
        points: [snapshot(GHOST_SECTION_ID, "2025-04-01T09:00:00Z", 90)],
      }),
    ]);
    expect(model.hasData).toBe(true);
    expect(valueAt(model.frames, 0, "s1")).toBe(90);
  });

  it("sizes a y axis even with nothing observed", () => {
    expect(yAxisMax(0, null)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Ghost handling
// ---------------------------------------------------------------------------

describe("ghost series", () => {
  it("marks ghosts, de-emphasises their colour, and leaves the live palette intact", () => {
    const model = buildSeatChartModel([
      series({
        seriesId: LIVE_SECTION_ID,
        points: [snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12)],
      }),
      series({
        seriesId: GHOST_SECTION_ID,
        label: "Fall 2025",
        isGhost: true,
        points: [snapshot(GHOST_SECTION_ID, "2025-04-01T09:00:00Z", 90)],
      }),
      series({
        seriesId: "20263COMS4113W002",
        label: "Section 002",
        points: [snapshot("20263COMS4113W002", "2026-04-01T09:00:00Z", 20)],
      }),
    ]);

    expect(model.plots.map((plot) => plot.isGhost)).toEqual([false, true, false]);
    expect(model.plots[1].colorVar).toBe(GHOST_COLOR_VAR);
    // The ghost must not consume a palette slot, or the two live sections
    // would end up sharing a colour.
    expect(model.plots[0].colorVar).toBe(LIVE_SERIES_COLOR_VARS[0]);
    expect(model.plots[2].colorVar).toBe(LIVE_SERIES_COLOR_VARS[1]);
  });

  it("paints ghosts before live lines so they sit behind them", () => {
    const model = buildSeatChartModel([
      series({
        seriesId: LIVE_SECTION_ID,
        points: [snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12)],
      }),
      series({
        seriesId: GHOST_SECTION_ID,
        label: "Fall 2025",
        isGhost: true,
        points: [snapshot(GHOST_SECTION_ID, "2025-04-01T09:00:00Z", 90)],
      }),
    ]);
    expect(orderForPainting(model.plots).map((plot) => plot.frameKey)).toEqual(["s1", "s0"]);
  });

  it("slides a ghost so its registration-open lines up with the live term's", () => {
    const milestones: RegistrationMilestone[] = [
      {
        termCode: "20263",
        kind: "registration_open",
        label: "Registration opens",
        occursAt: "2026-04-01T09:00:00Z",
      },
      {
        termCode: "20253",
        kind: "registration_open",
        label: "Registration opens",
        occursAt: "2025-04-02T09:00:00Z",
      },
    ];
    const shifts = alignmentShifts(
      [
        series({
          seriesId: LIVE_SECTION_ID,
          points: [snapshot(LIVE_SECTION_ID, "2026-04-01T10:00:00Z", 12)],
        }),
        series({
          seriesId: GHOST_SECTION_ID,
          label: "Fall 2025",
          isGhost: true,
          points: [snapshot(GHOST_SECTION_ID, "2025-04-02T11:00:00Z", 90)],
        }),
      ],
      milestones,
    );

    expect(shifts.get(LIVE_SECTION_ID)).toBe(0);
    // 2025-04-02 → 2026-04-01 is 364 days.
    expect(shiftInDays(shifts.get(GHOST_SECTION_ID) ?? 0)).toBe(364);

    // And once shifted, the ghost's observation lands two hours after the live
    // term's registration opened — comparable, which is the entire point.
    const model = buildSeatChartModel(
      [
        series({
          seriesId: LIVE_SECTION_ID,
          points: [snapshot(LIVE_SECTION_ID, "2026-04-01T10:00:00Z", 12)],
        }),
        series({
          seriesId: GHOST_SECTION_ID,
          label: "Fall 2025",
          isGhost: true,
          points: [snapshot(GHOST_SECTION_ID, "2025-04-02T11:00:00Z", 90)],
        }),
      ],
      milestones,
    );
    const ghostInstant = [...(model.observationIndex.get("s1") ?? new Map()).keys()][0];
    expect(ghostInstant - Date.parse("2026-04-01T09:00:00Z")).toBe(2 * HOUR);
  });

  it("does not shift a ghost when there is no live series to align to", () => {
    const shifts = alignmentShifts(
      [
        series({
          seriesId: GHOST_SECTION_ID,
          label: "Fall 2025",
          isGhost: true,
          points: [snapshot(GHOST_SECTION_ID, "2025-04-02T11:00:00Z", 90)],
        }),
      ],
      [],
    );
    expect(shifts.get(GHOST_SECTION_ID)).toBe(0);
  });

  it("falls back to first-observation alignment when milestones are missing", () => {
    const shifts = alignmentShifts(
      [
        series({
          seriesId: LIVE_SECTION_ID,
          points: [snapshot(LIVE_SECTION_ID, "2026-04-01T09:00:00Z", 12)],
        }),
        series({
          seriesId: GHOST_SECTION_ID,
          label: "Fall 2025",
          isGhost: true,
          points: [snapshot(GHOST_SECTION_ID, "2025-04-01T09:00:00Z", 90)],
        }),
      ],
      [],
    );
    expect(shiftInDays(shifts.get(GHOST_SECTION_ID) ?? 0)).toBe(365);
  });
});

// ---------------------------------------------------------------------------
// Series identity, milestones, axes
// ---------------------------------------------------------------------------

describe("termCodeOfSeries", () => {
  it("reads the term off a live section id and a ghost id", () => {
    expect(termCodeOfSeries(LIVE_SECTION_ID)).toBe("20263");
    expect(termCodeOfSeries(GHOST_SECTION_ID)).toBe("20253");
  });

  it("returns null for an id it cannot attribute", () => {
    expect(termCodeOfSeries("mystery")).toBeNull();
    expect(termCodeOfSeries("mystery@nope")).toBeNull();
  });
});

describe("anchorTermCodes", () => {
  it("prefers live terms and falls back to ghost terms", () => {
    expect(
      anchorTermCodes([
        series({ seriesId: LIVE_SECTION_ID }),
        series({ seriesId: GHOST_SECTION_ID, isGhost: true }),
      ]),
    ).toEqual(["20263"]);

    expect(anchorTermCodes([series({ seriesId: GHOST_SECTION_ID, isGhost: true })])).toEqual([
      "20253",
    ]);
  });
});

describe("milestonesInWindow", () => {
  const milestones: RegistrationMilestone[] = [
    {
      termCode: "20263",
      kind: "registration_open",
      label: "Registration opens",
      occursAt: "2026-04-01T09:00:00Z",
    },
    {
      termCode: "20263",
      kind: "add_drop_deadline",
      label: "Add/drop deadline",
      occursAt: "2026-09-15T09:00:00Z",
    },
    {
      termCode: "20253",
      kind: "registration_open",
      label: "Registration opens",
      occursAt: "2025-04-01T09:00:00Z",
    },
  ];

  it("keeps only anchor-term milestones inside the drawn window", () => {
    const window = milestonesInWindow(
      milestones,
      [Date.parse("2026-03-01T00:00:00Z"), Date.parse("2026-05-01T00:00:00Z")],
      ["20263"],
    );
    expect(window.map((one) => one.milestone.kind)).toEqual(["registration_open"]);
  });

  it("returns nothing without a domain", () => {
    expect(milestonesInWindow(milestones, null, ["20263"])).toEqual([]);
  });

  it("de-duplicates identical annotations", () => {
    const window = milestonesInWindow(
      [milestones[0], { ...milestones[0] }],
      [Date.parse("2026-03-01T00:00:00Z"), Date.parse("2026-05-01T00:00:00Z")],
      ["20263"],
    );
    expect(window).toHaveLength(1);
  });
});

describe("yAxisMax", () => {
  it("clears the larger of observed seats and published capacity", () => {
    expect(yAxisMax(108, 110)).toBeGreaterThanOrEqual(110);
    expect(yAxisMax(140, 110)).toBeGreaterThanOrEqual(140);
  });

  it("never returns a ceiling flush with the data", () => {
    expect(yAxisMax(27, null)).toBeGreaterThan(27);
  });
});

describe("tickGranularity", () => {
  it("switches unit with the span so a registration hour and a year both read", () => {
    const start = Date.parse("2026-04-01T00:00:00Z");
    expect(tickGranularity([start, start + 6 * HOUR])).toBe("hour");
    expect(tickGranularity([start, start + 30 * 24 * HOUR])).toBe("day");
    expect(tickGranularity([start, start + 400 * 24 * HOUR])).toBe("month");
    expect(tickGranularity(null)).toBe("day");
  });
});
