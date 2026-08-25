/**
 * Stick-to-bottom maths for the assistant thread.
 *
 * The page is the scroller — the composer is sticky, there is no inner
 * overflow pane — so these helpers talk in window/document metrics rather
 * than a container's scrollTop. Kept pure so a test can pin the threshold
 * without mounting the thread.
 */

/** Close enough to the end that a few pixels of layout noise do not unpin. */
export const NEAR_BOTTOM_PX = 96;

export function distanceFromBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): number {
  return Math.max(0, scrollHeight - clientHeight - scrollTop);
}

export function isNearBottom(distance: number, threshold = NEAR_BOTTOM_PX): boolean {
  return distance <= threshold;
}

/**
 * Turns whose bottom edge sits below the visible fold.
 *
 * The fold is the top of the sticky composer, not the viewport bottom — the
 * composer covers the last stretch of the page, and a turn hiding under it
 * is a turn the student has not read.
 */
export function countMessagesBelowFold(bottoms: readonly number[], foldY: number): number {
  return bottoms.filter((bottom) => bottom > foldY + 1).length;
}

export function moreMessagesLabel(count: number): string {
  const n = Math.max(1, count);
  return n === 1 ? "1 more message" : `${n} more messages`;
}
