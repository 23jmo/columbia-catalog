import { formatCourseId } from "@/lib/requirements/code";
import type { RecommendationReason } from "@/lib/recommend/types";

/**
 * How many cards the last onboarding screen ranks.
 *
 * Ten, not four: the signed-in feed is twelve, and a four-card teaser looked
 * like a stub. Guests still cannot scroll the stack — `OnboardingScreen`
 * locks the viewport until sign-in — so the extra cards are a denser blur
 * behind the gate, then a real list once the overlay lifts.
 */
export const FEED_PREVIEW_LIMIT = 10;

export interface OnboardingFeedPreviewCard {
  courseId: string;
  code: string;
  title: string;
  reason: string;
  instructor: string | null;
  points: number | null;
  fill: number | null;
}

/** One clause — matches the feed card's reason line. */
export function formatRecommendationReason(reason: RecommendationReason | undefined): string {
  if (!reason) return "Recommended for you";

  switch (reason.kind) {
    case "required":
      return `Clears ${reason.groupLabel}`;
    case "interesting_and_counts":
      return `Your kind of thing — clears ${reason.groupLabel}`;
    case "because_you_took":
      return `Like ${andMore(reason.similarTo)}`;
    case "unlocks":
      return `Opens up ${andMore(reason.courseIds)}`;
  }
}

function andMore(courseIds: readonly string[]): string {
  const [first, ...rest] = courseIds;
  if (!first) return "";
  return rest.length > 0 ? `${formatCourseId(first)} +${rest.length}` : formatCourseId(first);
}
