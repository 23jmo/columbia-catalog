import { afterEach, describe, expect, it } from "vitest";

import { feedCards, suggestedFollowUps } from "@/lib/agent/transcript";
import type { FeedCard } from "@/lib/recommend/feed";

import {
  clearOnboardingHandoff,
  seedOnboardingMessages,
  takeOnboardingHandoff,
  writeOnboardingHandoff,
} from "./handoff";

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

function installSessionStorage() {
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: memoryStorage(),
    configurable: true,
  });
}

function card(): FeedCard {
  return {
    courseId: "COMS4111W",
    code: "COMS W4111",
    title: "Introduction to Databases",
    points: 3,
    score: 1,
    components: { requirementFit: 1, taste: 0, unlock: 0, offering: 0 },
    reasons: [{ kind: "required", groupId: "cs-major", groupLabel: "the CS major" }],
    caveats: [],
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

afterEach(() => {
  clearOnboardingHandoff();
});

describe("onboarding catalog handoff", () => {
  it("returns the same cards on a second take in one document", () => {
    installSessionStorage();
    writeOnboardingHandoff([card()]);

    const first = takeOnboardingHandoff();
    const second = takeOnboardingHandoff();
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(window.sessionStorage.getItem("columbia-catalog:onboarding-handoff:v1")).toBeNull();
  });

  it("seeds a thread the chat already knows how to render", () => {
    const messages = seedOnboardingMessages([card()]);
    const assistant = messages.find((message) => message.role === "assistant");
    expect(assistant).toBeDefined();
    const cards = feedCards(assistant!);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.code).toBe("COMS W4111");
    expect(suggestedFollowUps(assistant!)).toContain("Why these and not others?");
    expect(suggestedFollowUps(assistant!)).toContain("Show me more like these");
  });
});
