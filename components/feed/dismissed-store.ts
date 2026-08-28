/**
 * The courses a reader has swiped away, in this browser.
 *
 * ── Why a store and not `useState` in the deck ────────────────────────────
 *
 * It began as state seeded by an effect on mount, which is the obvious shape
 * and the wrong one twice over. React flags the synchronous `setState` in an
 * effect as a cascading render, and it is right to: the first paint after
 * hydration shows every discarded card, and the second removes them. On a slow
 * phone that is a visible flash of classes the student already dismissed.
 *
 * `useSyncExternalStore` is the shape React provides for exactly this — an
 * external source the server cannot see. The server snapshot is empty, the
 * client snapshot is whatever `localStorage` holds, and React reconciles the
 * two itself without a render pass in between.
 *
 * The `storage` listener is a small bonus that falls out of the pattern:
 * discard a course in one tab and the other tab's feed loses it too, instead
 * of the two disagreeing until one is reloaded.
 *
 * ── Why `localStorage` and not the database ───────────────────────────────
 *
 * A discard is "not this one, not now" about a ranked list that is recomputed
 * every visit. It is not worth a table or a migration to remember across
 * devices, it survives a refresh — which is the part that would otherwise feel
 * broken — and a refresh sends them as `excludeCourseIds` / `demoteCourseIds`
 * so the next ranking is not the same neighbourhood with a different number.
 */

const KEY = "lionplan.feed.dismissed.v1";
const EMPTY: ReadonlySet<string> = new Set();

const listeners = new Set<() => void>();
/**
 * `getSnapshot` must return a referentially stable value between changes or
 * React re-renders forever, so the parsed set is cached and only ever replaced
 * by a write.
 */
let cache: ReadonlySet<string> | null = null;

export function subscribeDismissed(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorageEvent);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorageEvent);
  };
}

export function getDismissed(): ReadonlySet<string> {
  cache ??= new Set(read());
  return cache;
}

/** The server has no browser storage, so nothing is dismissed there. */
export function getDismissedServerSnapshot(): ReadonlySet<string> {
  return EMPTY;
}

export function setDismissed(next: ReadonlySet<string>): void {
  cache = next;
  write([...next]);
  emit();
}

function onStorageEvent(event: StorageEvent) {
  if (event.key !== null && event.key !== KEY) return;
  cache = null;
  emit();
}

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Both of these swallow everything.
 *
 * `localStorage` throws rather than returning null in a Safari private window
 * and wherever site data is blocked, and none of what is kept here is worth
 * taking the feed down for: the worst case is a discarded card coming back on
 * the next visit.
 */
function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function write(values: readonly string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(values));
  } catch {
    // Nothing to do, and nothing worth saying.
  }
}
