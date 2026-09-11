/**
 * The guess-deck cache under concurrency.
 *
 * Two callers race for this cache on every degree change: the flow's prefetch
 * effect, which re-fires on every school / year / program edit, and the
 * coursework screen, which asks for a deck the moment it mounts. A student who
 * changes their major and walks forward quickly has both in flight at once,
 * for two different degrees.
 *
 * `prefetchGuessDeck` has always guarded its write — it installs a deck only if
 * its own request is still the current one. `loadGuessDeckCached` did not, and
 * these tests pin what that cost.
 */

import { afterEach, describe, expect, it } from "vitest";

import type { GuessDeck } from "./guess";
import {
  clearGuessDeckCache,
  loadGuessDeckCached,
  peekCachedGuessDeck,
  prefetchGuessDeck,
} from "./guess-cache";
import { emptyGuestState, type GuestOnboardingState } from "./state";

/* ==========================================================================
 * Fixtures
 * ========================================================================== */

const CS: GuestOnboardingState = {
  ...emptyGuestState(),
  school: "CC",
  classYear: "2028",
  programIds: ["cc-major-computer-science"],
};

const ECON: GuestOnboardingState = { ...CS, programIds: ["cc-major-economics"] };

/** A deck identifiable by the degree it was built for. */
function deckNamed(name: string): GuessDeck {
  return {
    tier1: [
      {
        courseId: name,
        code: name,
        title: name,
        points: null,
        tier: 1,
        reasons: [],
        score: 1,
      },
    ],
    tier2: [],
    // These tests are about which deck the cache serves, not what is in one.
    choices: [],
    impliesTaken: {},
  };
}

/** A fetch whose resolution the test controls. */
function deferred(name: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release,
    fetch: async () => {
      await gate;
      return { ok: true, deck: deckNamed(name) };
    },
  };
}

const tierOneIds = (deck: GuessDeck | null) =>
  deck?.tier1.map((candidate) => candidate.courseId) ?? null;

afterEach(() => {
  clearGuessDeckCache();
});

/* ==========================================================================
 * Tests
 * ========================================================================== */

describe("the guess deck cache", () => {
  it("serves a cached deck without refetching", async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return { ok: true, deck: deckNamed("cs") };
    };

    await loadGuessDeckCached(CS, fetch);
    await loadGuessDeckCached(CS, fetch);

    expect(calls).toBe(1);
    expect(tierOneIds(peekCachedGuessDeck(CS))).toEqual(["cs"]);
  });

  it("does not serve one degree's deck for another", async () => {
    await loadGuessDeckCached(CS, async () => ({ ok: true, deck: deckNamed("cs") }));

    expect(peekCachedGuessDeck(ECON)).toBeNull();
  });

  it("does not cache a failed fetch", async () => {
    await loadGuessDeckCached(CS, async () => ({ ok: false, error: "nope" }));

    expect(peekCachedGuessDeck(CS)).toBeNull();
  });

  it("collapses concurrent requests for the same degree into one fetch", async () => {
    let calls = 0;
    const slow = deferred("cs");
    const fetch = async () => {
      calls += 1;
      return slow.fetch();
    };

    const first = loadGuessDeckCached(CS, fetch);
    const second = loadGuessDeckCached(CS, fetch);
    slow.release();
    await Promise.all([first, second]);

    expect(calls).toBe(1);
  });

  /*
   * The regression this file exists for.
   *
   * The student answers the major question as CS, the flow prefetches, and
   * before that request lands they switch to Economics. The coursework screen
   * then asks for the Economics deck. Both are in flight, and the CS one — the
   * older, now-irrelevant request — resolves last.
   */
  it("does not install a deck for a degree the student has left", async () => {
    const stale = deferred("cs");
    const fresh = deferred("econ");

    const staleRequest = loadGuessDeckCached(CS, stale.fetch);
    const freshRequest = loadGuessDeckCached(ECON, fresh.fetch);

    fresh.release();
    await freshRequest;
    expect(tierOneIds(peekCachedGuessDeck(ECON))).toEqual(["econ"]);

    // The abandoned request lands late. It must not overwrite the deck for the
    // degree the student is actually on.
    stale.release();
    await staleRequest;

    expect(tierOneIds(peekCachedGuessDeck(ECON))).toEqual(["econ"]);
  });

  /*
   * The same race with the roles swapped, and the one a student actually feels.
   *
   * `prefetchGuessDeck` skips its write when it is no longer the current
   * request. If a late-landing `loadGuessDeckCached` has already cleared the
   * in-flight record, the prefetch reads "I am not current" and throws away a
   * deck that was both complete and correct — so the coursework screen the
   * prefetch existed to warm opens on the skeleton instead.
   */
  it("keeps a completed prefetch that an older request finished after", async () => {
    const stale = deferred("cs");
    const fresh = deferred("econ");

    const staleRequest = loadGuessDeckCached(CS, stale.fetch);
    prefetchGuessDeck(ECON, fresh.fetch);

    stale.release();
    await staleRequest;

    fresh.release();
    // Let the prefetch's own `.then` run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(tierOneIds(peekCachedGuessDeck(ECON))).toEqual(["econ"]);
  });
});
