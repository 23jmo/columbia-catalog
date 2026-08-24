import { describe, expect, it } from "vitest";
import type { WeekGridBlock } from "../course/contracts";
import { colorFor, expandEvents, filterEvents, previewEventsFromBlocks } from "./calendar-events";
import { fromISODate } from "./calendar-date";
import type { SourcedBlock } from "./calendar-types";

function block(
  ownerId: string,
  weekday: WeekGridBlock["weekday"],
  startMinute: number,
  endMinute: number,
  label = ownerId,
): WeekGridBlock {
  return {
    blockId: `${ownerId}@${weekday}@${startMinute}`,
    label,
    sublabel: "Mudd 833",
    weekday,
    startMinute,
    endMinute,
    tone: "plan",
  };
}

function sourced(gridBlock: WeekGridBlock, layer: SourcedBlock["layer"] = "class"): SourcedBlock {
  return { block: gridBlock, layer };
}

describe("expandEvents", () => {
  it("emits one event per matching weekday inside the visible range", () => {
    const events = expandEvents(
      [sourced(block("COMS4118", "Mo", 610, 685, "COMS 4118"))],
      fromISODate("2026-09-07"),
      fromISODate("2026-09-13"),
      "2026-09-02",
      "2026-12-12",
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "COMS 4118",
      start: "2026-09-07T10:10:00",
      end: "2026-09-07T11:25:00",
    });
  });

  it("clips occurrences that fall before the term starts", () => {
    // Week of Aug 31 includes Monday Aug 31, but Fall instruction starts Sep 2.
    const events = expandEvents(
      [sourced(block("COMS4118", "Mo", 610, 685))],
      fromISODate("2026-08-31"),
      fromISODate("2026-09-06"),
      "2026-09-02",
      "2026-12-12",
    );

    expect(events).toHaveLength(0);
  });

  it("does not invent a class after the last day of instruction", () => {
    const events = expandEvents(
      [sourced(block("COMS4118", "Mo", 610, 685))],
      fromISODate("2026-12-14"),
      fromISODate("2026-12-20"),
      "2026-09-02",
      "2026-12-12",
    );

    expect(events).toHaveLength(0);
  });

  it("paints historical patterns purple so they never look committed", () => {
    const events = expandEvents(
      [sourced(block("typical", "We", 600, 675), "historical")],
      fromISODate("2026-09-02"),
      fromISODate("2026-09-02"),
      "2026-09-02",
      "2026-12-12",
    );

    expect(events[0]?.color).toBe("purple");
    expect(events[0]?.layer).toBe("historical");
  });

  it("gives the same owner the same colour every week", () => {
    expect(colorFor("COMS4118")).toBe(colorFor("COMS4118"));
  });
});

describe("previewEventsFromBlocks", () => {
  it("anchors each weekday on the first in-term day, not the week containing term start", () => {
    // Fall instruction starts Wednesday Sep 2. A Tu/Th section must show both days.
    const events = previewEventsFromBlocks(
      [
        sourced(block("CHEM1", "Tu", 1090, 1165)),
        sourced(block("CHEM1", "Th", 1090, 1165)),
      ],
      "2026-09-02",
      "2026-12-12",
    );

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.start.slice(0, 10)).sort()).toEqual([
      "2026-09-03",
      "2026-09-08",
    ]);
  });
});

describe("filterEvents", () => {
  const monday = expandEvents(
    [
      sourced(block("COMS4118", "Mo", 610, 685, "COMS 4118")),
      sourced(block("work", "Mo", 900, 1080, "Work"), "commitment"),
    ],
    fromISODate("2026-09-07"),
    fromISODate("2026-09-07"),
    "2026-09-02",
    "2026-12-12",
  );

  it("hides a layer the student turned off", () => {
    const visible = filterEvents(monday, { class: true, commitment: false, historical: true }, "");
    expect(visible.map((event) => event.title)).toEqual(["COMS 4118"]);
  });

  it("filters by label without touching the network", () => {
    const visible = filterEvents(monday, { class: true, commitment: true, historical: true }, "work");
    expect(visible.map((event) => event.title)).toEqual(["Work"]);
  });
});
