import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindSwipeHaptics } from "./swipe";

type Handler = (event: TouchEvent) => void;

function fakeEl() {
  const listeners = new Map<string, Handler[]>();
  return {
    addEventListener(type: string, fn: EventListener) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn as Handler]);
    },
    removeEventListener(type: string, fn: EventListener) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((handler) => handler !== fn),
      );
    },
    emit(type: string, event: { touches?: Array<{ clientX: number; clientY: number }> }) {
      for (const handler of listeners.get(type) ?? []) {
        handler(event as unknown as TouchEvent);
      }
    },
  };
}

function stubAndroidVibrate() {
  const vibrate = vi.fn(() => true);
  vi.stubGlobal("navigator", { vibrate, userAgent: "Android", maxTouchPoints: 5, platform: "Linux" });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  return vibrate;
}

describe("bindSwipeHaptics", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { elementFromPoint: () => null, body: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ticks on the first horizontal lock, not on a vertical scroll", () => {
    const vibrate = stubAndroidVibrate();
    const el = fakeEl();
    const stop = bindSwipeHaptics(el as unknown as HTMLElement);

    el.emit("touchstart", { touches: [{ clientX: 40, clientY: 80 }] });
    el.emit("touchmove", { touches: [{ clientX: 42, clientY: 120 }] });
    expect(vibrate).not.toHaveBeenCalled();

    el.emit("touchstart", { touches: [{ clientX: 40, clientY: 80 }] });
    el.emit("touchmove", { touches: [{ clientX: 80, clientY: 82 }] });
    expect(vibrate).toHaveBeenCalledWith(20);

    stop();
  });
});
