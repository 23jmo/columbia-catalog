import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canHaptic, haptic, installWebHaptics } from "./index";
import { iosTick, isIos, uninstallIosOverlays } from "./ios";

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

function stubAndroid() {
  const vibrate = vi.fn(() => true);
  vi.stubGlobal("navigator", { vibrate, userAgent: "Android", platform: "Linux", maxTouchPoints: 5 });
  return vibrate;
}

function stubIphone() {
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    platform: "iPhone",
    maxTouchPoints: 5,
  });
}

function stubIosDocument(held?: { checked: boolean; closest: () => unknown }) {
  const clicks: HTMLInputElement[] = [];
  const created: Array<{ type: string; click: ReturnType<typeof vi.fn>; setAttribute: ReturnType<typeof vi.fn> }> =
    [];
  const body = {
    appendChild: vi.fn((node: { click?: () => void }) => node),
    removeChild: vi.fn((node: { click?: () => void }) => node),
  };
  const document = {
    body,
    readyState: "complete",
    elementFromPoint: () => held ?? null,
    createElement: (tag: string) => {
      const el = {
        type: "",
        tabIndex: 0,
        style: { cssText: "" },
        setAttribute: vi.fn(),
        click: vi.fn(() => {
          clicks.push(el as unknown as HTMLInputElement);
        }),
      };
      created.push(el);
      void tag;
      return el;
    },
  };
  vi.stubGlobal("document", document);
  return { body, clicks, created };
}

describe("haptic", () => {
  beforeEach(() => {
    stubMatchMedia(false);
  });

  afterEach(() => {
    uninstallIosOverlays();
    vi.unstubAllGlobals();
  });

  it("fires the success pattern on Android", () => {
    const vibrate = stubAndroid();
    expect(haptic("success")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([24, 40, 32]);
  });

  it("fires a short selection tick on Android", () => {
    const vibrate = stubAndroid();
    expect(haptic("selection")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(20);
  });

  it("defaults to impact", () => {
    const vibrate = stubAndroid();
    haptic();
    expect(vibrate).toHaveBeenCalledWith(32);
  });

  it("no-ops when prefers-reduced-motion is on", () => {
    const vibrate = stubAndroid();
    stubMatchMedia(true);
    expect(canHaptic()).toBe(false);
    expect(haptic("impact")).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("no-ops when vibrate is missing and the UA is not iOS", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0", platform: "Win32", maxTouchPoints: 0 });
    expect(canHaptic()).toBe(false);
    expect(haptic("error")).toBe(false);
  });

  it("swallows vibrate throws from odd WebViews", () => {
    const vibrate = stubAndroid();
    vibrate.mockImplementation(() => {
      throw new Error("not allowed");
    });
    expect(haptic("warning")).toBe(false);
  });

  it("detects iPhone as iOS", () => {
    stubIphone();
    expect(isIos()).toBe(true);
  });

  it("fires a switch click on iOS when vibrate is missing", () => {
    stubIphone();
    const { body, created } = stubIosDocument();
    expect(canHaptic()).toBe(true);
    expect(haptic("selection")).toBe(true);
    expect(body.appendChild).toHaveBeenCalled();
    expect(created[0]?.type).toBe("checkbox");
    expect(created[0]?.setAttribute).toHaveBeenCalledWith("switch", "");
    expect(created[0]?.click).toHaveBeenCalled();
    expect(body.removeChild).toHaveBeenCalled();
  });

  it("iosTick no-ops without a document body", () => {
    stubIphone();
    vi.stubGlobal("document", { body: null, createElement: () => ({}) });
    expect(iosTick()).toBe(false);
  });

  it("installWebHaptics no-ops off iOS and without MutationObserver", () => {
    stubAndroid();
    expect(installWebHaptics()).toEqual(expect.any(Function));
    stubIphone();
    expect(() => installWebHaptics()).not.toThrow();
  });

  it("flips the switch under the finger instead of parking a new one", () => {
    stubIphone();
    const held = { checked: false, closest: () => held };
    const { created } = stubIosDocument(held);
    expect(haptic("selection")).toBe(true);
    expect(held.checked).toBe(true);
    expect(created).toHaveLength(0);
  });
});
