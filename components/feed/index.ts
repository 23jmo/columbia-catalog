/**
 * The home feed's rendering surface.
 *
 * Every component here is a SERVER component. The feed ships no JavaScript of
 * its own — the only interaction is the "and N other sections" disclosure,
 * which is a native `<details>` — so a page of twelve cards is meaningful
 * markup on first paint. The one client leaf that appears inside it is the
 * shared `SignInPrompt`, which was already a client component.
 */

export { FeedPanel } from "./feed-panel";
export { FeedCardView } from "./feed-card";
export { SectionLine } from "./section-line";
export { CaveatNotes, ReasonChips } from "./reason-chips";
export { FeedSkeleton } from "./feed-skeleton";
