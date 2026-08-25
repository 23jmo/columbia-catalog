import type { UIMessage } from "ai";

import type { FeedCard } from "@/lib/recommend/feed";

/**
 * The onboarding → catalog handoff.
 *
 * "Take me to the catalog" is not a dump onto an empty home page. The student
 * just spent five screens answering what they take and what they like; the
 * first thing they see in the box should be those same sections, already in
 * a thread, with a question they can answer. Ranking again would be a
 * different ten cards and a reason to distrust the ones they just saw.
 *
 * The payload lives in `sessionStorage` so a refresh of `/` does not resurrect
 * a conversation they already left, and so a second tab does not steal it.
 * Module state covers React Strict Mode: `take` is called twice on mount, and
 * the second read must return the same cards.
 */

export const ONBOARDING_HANDOFF_KEY = "columbia-catalog:onboarding-handoff:v1";

const USER_PROMPT = "What should I take next?";

const ASSISTANT_PROSE =
  "Here are the sections I picked from what you just told me. Each one is a real offering this term — instructor, meeting time, and seats — not just a course name.\n\nWant a lighter week, a different department, or more like one of these?";

let takenThisDocument: FeedCard[] | null | undefined;

export function writeOnboardingHandoff(cards: FeedCard[]): void {
  takenThisDocument = undefined;
  if (typeof window === "undefined") return;
  if (cards.length === 0) return;
  try {
    window.sessionStorage.setItem(ONBOARDING_HANDOFF_KEY, JSON.stringify({ cards }));
  } catch {
    /* Private mode: the catalog still opens; the thread just starts empty. */
  }
}

/**
 * Consume the handoff once per document. Later calls in the same load return
 * the same cards so a Strict Mode remount does not lose the thread.
 */
export function takeOnboardingHandoff(): FeedCard[] | null {
  if (takenThisDocument !== undefined) return takenThisDocument;

  if (typeof window === "undefined") {
    takenThisDocument = null;
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_HANDOFF_KEY);
    window.sessionStorage.removeItem(ONBOARDING_HANDOFF_KEY);
    if (!raw) {
      takenThisDocument = null;
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    const cards =
      parsed && typeof parsed === "object" && Array.isArray((parsed as { cards?: unknown }).cards)
        ? ((parsed as { cards: unknown[] }).cards.filter(isHandoffCard) as FeedCard[])
        : [];
    takenThisDocument = cards.length > 0 ? cards : null;
    return takenThisDocument;
  } catch {
    takenThisDocument = null;
    return null;
  }
}

export function clearOnboardingHandoff(): void {
  takenThisDocument = undefined;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ONBOARDING_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * A user turn plus an assistant turn that already carries the cards.
 *
 * Built as the same `tool-recommend_courses` shape a live turn would have,
 * so `feedCards` and `suggestedFollowUps` in the transcript reader work
 * without a special case — and without spending a prompt on restating what
 * we already ranked.
 */
export function seedOnboardingMessages(cards: FeedCard[]): UIMessage[] {
  return [
    {
      id: "onboarding-user",
      role: "user",
      parts: [{ type: "text", text: USER_PROMPT }],
    },
    {
      id: "onboarding-assistant",
      role: "assistant",
      parts: [
        {
          type: "tool-recommend_courses",
          toolCallId: "onboarding-recommend",
          state: "output-available",
          input: { limit: cards.length },
          output: { cards, personalized: true },
        } as UIMessage["parts"][number],
        { type: "text", text: ASSISTANT_PROSE },
      ],
    },
  ];
}

function isHandoffCard(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const record = row as Record<string, unknown>;
  if (typeof record.courseId !== "string" || typeof record.code !== "string") return false;
  const best = record.best;
  if (!best || typeof best !== "object") return false;
  const section = best as Record<string, unknown>;
  return typeof section.sectionId === "string" && typeof section.vergilUrl === "string";
}
