import { describe, expect, it } from "vitest";
import {
  defaultEndMinute,
  minutesAtPointer,
  pointerMovedBeyondHold,
  rangeFromDrag,
} from "./calendar-commitment";
import { PX_PER_MINUTE } from "./calendar-layout";

describe("rangeFromDrag", () => {
  it("keeps start before end regardless of drag direction", () => {
    expect(rangeFromDrag(600, 540)).toEqual({ startMinute: 540, endMinute: 600 });
  });

  it("expands tiny drags to the painted minimum", () => {
    expect(rangeFromDrag(600, 615)).toEqual({ startMinute: 600, endMinute: 630 });
  });
});

describe("minutesAtPointer", () => {
  it("snaps to the 15-minute grid", () => {
    const top = 100;
    const y = top + 630 * PX_PER_MINUTE;
    expect(minutesAtPointer(y, top)).toBe(630);
  });
});

describe("defaultEndMinute", () => {
  it("defaults to one hour", () => {
    expect(defaultEndMinute(600)).toBe(660);
  });
});

describe("pointerMovedBeyondHold", () => {
  it("cancels when the finger moves far enough", () => {
    expect(pointerMovedBeyondHold(0, 0, 0, 15)).toBe(true);
    expect(pointerMovedBeyondHold(0, 0, 0, 5)).toBe(false);
  });
});
