import { afterEach, describe, expect, it } from "vitest";

import type { FeedCard } from "@/lib/recommend/feed";
import { emptyGuestState, type GuestOnboardingState } from "@/lib/onboarding/state";

import {
  clearFeedPreviewCache,
  feedPreviewCacheKey,
  FEED_PREVIEW_STORAGE_KEY,
  loadFeedPreviewCached,
  peekCachedFeedPreview,
} from "./feed-preview-cache";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

function installLocalStorage() {
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage(),
    configurable: true,
  });
}

function card(courseId: string): FeedCard {
  return {
    courseId,
    code: "COMS W4111",
    title: "Introduction to Databases",
    points: 3,
    score: 1,
    components: { requirementFit: 1, taste: 0, unlock: 0, offering: 0 },
    reasons: [],
    caveats: [],
    instructorReputation: null,
    best: {
      sectionId: "sec-1",
      sectionCode: "001",
      callNumber: "12345",
      termCode: "20263",
      termLabel: "Fall 2026",
      title: null,
      instructors: ["Gravano"],
      meetings: [],
      timeKind: "tba",
      estimatedFromTerm: null,
      enrollmentCount: 10,
      enrollmentCap: 80,
      waitlistCount: 0,
      waitlistCap: 0,
      status: "open",
      sourceAsOf: "2026-08-01T00:00:00.000Z",
      conflictsWithPlan: false,
      vergilUrl: "https://vergil.columbia.edu/vergil/class/20263/12345",
    },
    others: [],
  };
}

function state(overrides: Partial<GuestOnboardingState> = {}): GuestOnboardingState {
  return { ...emptyGuestState(), school: "CC", classYear: "2028", ...overrides };
}

afterEach(() => {
  clearFeedPreviewCache();
});

describe("feed preview cache", () => {
  it("survives a full reload of the in-memory copy via localStorage", async () => {
    installLocalStorage();
    const guest = state();
    const cards = [card("COMS4111W")];

    await loadFeedPreviewCached(guest, async () => ({ ok: true, cards }));
    expect(peekCachedFeedPreview(guest)?.[0]?.courseId).toBe("COMS4111W");

    // Drop the module memory the way a document load after Google SSO does.
    clearFeedPreviewCache();
    // clear also wipes storage — re-seed storage the way a previous tab left it
    await loadFeedPreviewCached(guest, async () => ({ ok: true, cards }));
    const stored = window.localStorage.getItem(FEED_PREVIEW_STORAGE_KEY);
    expect(stored).toContain("COMS4111W");

    clearFeedPreviewCache();
    // Restore only storage, not memory.
    window.localStorage.setItem(FEED_PREVIEW_STORAGE_KEY, stored!);
    expect(peekCachedFeedPreview(guest)?.[0]?.courseId).toBe("COMS4111W");
  });

  it("does not reuse cards when the guest answers change", async () => {
    installLocalStorage();
    const first = state();
    await loadFeedPreviewCached(first, async () => ({ ok: true, cards: [card("COMS4111W")] }));

    const second = state({ interestTags: ["systems"] });
    expect(feedPreviewCacheKey(first)).not.toBe(feedPreviewCacheKey(second));
    expect(peekCachedFeedPreview(second)).toBeNull();
  });
});
