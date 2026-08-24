import { describe, expect, it } from "vitest";
import { eventBlockStyle, layoutDay } from "./calendar-layout";
import type { CalendarEvent } from "./calendar-types";

function event(id: string, start: string, end: string): CalendarEvent {
  return {
    id,
    calendarId: id,
    title: id,
    start,
    end,
    color: "blue",
    layer: "class",
    tone: "plan",
  };
}

describe("layoutDay", () => {
  it("packs overlapping events into side-by-side columns", () => {
    const day = new Date(2026, 8, 8);
    const placed = layoutDay(
      [
        event("a", "2026-09-08T10:00:00", "2026-09-08T12:00:00"),
        event("b", "2026-09-08T11:00:00", "2026-09-08T13:00:00"),
      ],
      day,
    );

    expect(placed).toHaveLength(2);
    expect(placed[0]?.left).toBe(0);
    expect(placed[0]?.width).toBe(50);
    expect(placed[1]?.left).toBe(50);
    expect(placed[1]?.width).toBe(50);
  });

  it("clears hour lines by a pixel the way EventBlock.vue does", () => {
    const style = eventBlockStyle({
      event: event("a", "2026-09-08T10:00:00", "2026-09-08T11:00:00"),
      top: 64,
      height: 64,
      left: 0,
      width: 100,
    });
    expect(style.top).toBe("66px");
    expect(style.height).toBe("61px");
  });
});
