/**
 * The watchlist store's cascade mirror.
 *
 * `forgetWatches` exists because Postgres deletes watch rows behind this
 * store's back: `watches` carries a composite foreign key into `bookmarks`
 * with `on delete cascade`, and there is no realtime channel on `watches` to
 * carry the news back. The bookmark store announces the removal and
 * `BookmarkProvider` forwards it here.
 *
 * The failure this guards against is specific and bad: a bell that keeps
 * reading "on" for a section whose watch row is gone, whose next click deletes
 * an already-deleted row rather than creating one — so the student believes
 * they are being alerted and never is.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const SECTION_A = "20263COMS4113W001";
const SECTION_B = "20263COMS3157W001";

const db = vi.hoisted(() => ({
  listWatches: vi.fn(),
  addWatch: vi.fn(),
  removeWatch: vi.fn(),
  getWatchCounts: vi.fn(),
}));

vi.mock("@/lib/db/watches", () => ({
  ...db,
  WatchNotAvailableError: class WatchNotAvailableError extends Error {
    constructor() {
      super("Sign in to watch sections.");
      this.name = "WatchNotAvailableError";
    }
  },
}));

// No browser client, so `openRealtime` is a no-op and nothing opens a socket.
vi.mock("@/lib/db/client", () => ({
  isConfigured: () => true,
  getBrowserClient: () => null,
}));

describe("forgetWatches", () => {
  let store: typeof import("./store");

  beforeEach(async () => {
    vi.resetModules();
    for (const fn of Object.values(db)) fn.mockReset();

    db.listWatches.mockResolvedValue([
      { sectionId: SECTION_A },
      { sectionId: SECTION_B },
    ]);
    db.getWatchCounts.mockResolvedValue(
      new Map([
        [SECTION_A, 12],
        [SECTION_B, 3],
      ]),
    );

    store = await import("./store");
    await store.ensureWatchlistLoaded();
    await store.trackWatcherCounts([SECTION_A, SECTION_B]);
  });

  it("drops the watch without writing anything", () => {
    store.forgetWatches([SECTION_A]);

    expect(store.getWatchlistSnapshot().watched.has(SECTION_A)).toBe(false);
    // The row is already gone server-side. A DELETE here would be a second
    // attempt at a row that no longer exists.
    expect(db.removeWatch).not.toHaveBeenCalled();
  });

  it("leaves other watches alone", () => {
    store.forgetWatches([SECTION_A]);

    expect(store.getWatchlistSnapshot().watched.has(SECTION_B)).toBe(true);
  });

  it("decrements the public watcher count", () => {
    expect(store.getWatchlistSnapshot().counts.get(SECTION_A)).toBe(12);

    store.forgetWatches([SECTION_A]);

    // The count is the fairness signal on every other reader's screen. Leaving
    // it at 12 after leaving the group overstates the competition.
    expect(store.getWatchlistSnapshot().counts.get(SECTION_A)).toBe(11);
  });

  it("ignores a section that was never watched", () => {
    const before = store.getWatchlistSnapshot();

    store.forgetWatches(["20263COMS9999W001"]);

    // Same snapshot object: no listener should have been woken at all.
    expect(store.getWatchlistSnapshot()).toBe(before);
  });

  it("never drives a count below zero", () => {
    store.forgetWatches([SECTION_A]);
    // A second announcement for the same section — a folder delete and a bulk
    // removal can both name it — must not keep subtracting.
    store.forgetWatches([SECTION_A]);

    expect(store.getWatchlistSnapshot().counts.get(SECTION_A)).toBe(11);
  });

  it("handles several sections at once", () => {
    store.forgetWatches([SECTION_A, SECTION_B]);

    expect(store.getWatchlistSnapshot().watched.size).toBe(0);
  });

  it("lets a section be watched again afterwards", async () => {
    db.addWatch.mockResolvedValue(undefined);

    store.forgetWatches([SECTION_A]);
    await store.toggleWatch(SECTION_A);

    // The whole point: because the local flag was cleared, the next toggle is
    // an INSERT. Without `forgetWatches` this line would have called
    // `removeWatch` on a row that does not exist.
    expect(db.addWatch).toHaveBeenCalledWith(SECTION_A);
    expect(store.getWatchlistSnapshot().watched.has(SECTION_A)).toBe(true);
  });
});
