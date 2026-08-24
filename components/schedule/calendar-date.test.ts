import { describe, expect, it } from "vitest";
import {
  addDays,
  clampToTerm,
  daysOfWeek,
  formatHour,
  formatTime,
  fromISODate,
  monthGrid,
  startOfWeek,
  toISODate,
  weekdayOf,
} from "./calendar-date";

describe("calendar-date", () => {
  it("round-trips a local ISO date without shifting timezones", () => {
    expect(toISODate(fromISODate("2026-09-02"))).toBe("2026-09-02");
  });

  it("reads weekdays from a local date, not UTC", () => {
    // Wednesday 2 September 2026 — first day of Fall instruction in the fallback.
    expect(weekdayOf(fromISODate("2026-09-02"))).toBe("We");
  });

  it("starts the week on Monday, including when the date is a Sunday", () => {
    const sunday = fromISODate("2026-09-06");
    expect(toISODate(startOfWeek(sunday))).toBe("2026-08-31");
    expect(daysOfWeek(sunday).map(toISODate)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("builds a 42-cell Monday-first month grid", () => {
    const grid = monthGrid(fromISODate("2026-09-15"));
    expect(grid).toHaveLength(42);
    expect(toISODate(grid[0])).toBe("2026-08-31");
    expect(toISODate(grid[41])).toBe("2026-10-11");
  });

  it("clamps a date before the term to the first day of instruction", () => {
    const today = fromISODate("2026-08-23");
    expect(toISODate(clampToTerm(today, "2026-09-02", "2026-12-12"))).toBe("2026-09-02");
  });

  it("keeps today when it sits inside the term", () => {
    const today = fromISODate("2026-10-14");
    expect(toISODate(clampToTerm(today, "2026-09-02", "2026-12-12"))).toBe("2026-10-14");
  });

  it("adds days without mutating the source", () => {
    const monday = fromISODate("2026-09-07");
    expect(toISODate(addDays(monday, 2))).toBe("2026-09-09");
    expect(toISODate(monday)).toBe("2026-09-07");
  });

  it("formats gutter hours the way the rest of the catalog does", () => {
    expect(formatHour(17)).toBe("5pm");
    expect(formatHour(12)).toBe("12pm");
    expect(formatHour(0)).toBe("12am");
  });

  it("formats event times with minutes when needed", () => {
    expect(formatTime(new Date(2026, 8, 3, 18, 10))).toBe("6:10pm");
  });
});
