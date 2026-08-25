/**
 * The home feed's rendering surface.
 *
 * Every component here is a SERVER component and the feed ships no JavaScript
 * of its own, so a rail of twelve cards is meaningful markup on first paint.
 * The client leaves that appear inside it — `SignInPrompt`, `BookmarkControls`,
 * `EnrollmentBar` — were already client components and are shared with the
 * search results, which is the point: a recommendation is a search hit someone
 * chose for you, and it should be the same object on screen.
 */

export { FeedPanel } from "./feed-panel";
export { FeedCardView } from "./feed-card";
export { FeedSkeleton } from "./feed-skeleton";
