import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canHaptic, haptic } from "./index";

type MatchMedia = (query: string) => MediaQueryList;

function stubMatchMedia(reduced: boolean): void {
  const matchMedia: MatchMedia = (query) =>
    ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  vi.stubGlobal("matchMedia", matchMedia);
}

describe("haptic", () => {
  const vibrate = vi.fn(() => true);

  beforeEach(() => {
    vibrate.mockClear();
    vibrate.mockReturnValue(true);
    vi.stubGlobal("navigator", { vibrate });
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires the success pattern", () => {
    expect(haptic("success")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([10, 40, 18]);
  });

  it("fires a short selection tick", () => {
    expect(haptic("selection")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("defaults to impact", () => {
    haptic();
    expect(vibrate).toHaveBeenCalledWith(12);
  });

  it("no-ops when prefers-reduced-motion is on", () => {
    stubMatchMedia(true);
    expect(canHaptic()).toBe(false);
    expect(haptic("impact")).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("no-ops when vibrate is missing", () => {
    vi.stubGlobal("navigator", {});
    expect(canHaptic()).toBe(false);
    expect(haptic("error")).toBe(false);
  });

  it("swallows vibrate throws from odd WebViews", () => {
    vibrate.mockImplementation(() => {
      throw new Error("not allowed");
    });
    expect(haptic("warning")).toBe(false);
  });
});
