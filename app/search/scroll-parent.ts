/**
 * Nearest ancestor that owns vertical overflow.
 *
 * The catalog shell locks `html`/`body` overflow and scrolls the MobileShell
 * page column instead (`overflow-y-auto`). Window-based virtualizers read
 * `window.scrollY`, which stays 0 in that setup — so they keep painting the
 * first screenful while the user scrolls through empty tall space.
 *
 * Callers pass the list root; we walk up until we find the real scroller.
 */

export function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    // `overlay` is the legacy WebKit value for auto scrollbars.
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * List offset inside the scroll content — what TanStack calls `scrollMargin`.
 *
 * Measured from live layout so a sticky search bar, filter chips, or the
 * index strip changing height still keeps row transforms honest.
 */
export function measureScrollMargin(list: HTMLElement, scrollParent: HTMLElement): number {
  const listTop = list.getBoundingClientRect().top;
  const parentTop = scrollParent.getBoundingClientRect().top;
  return listTop - parentTop + scrollParent.scrollTop;
}
