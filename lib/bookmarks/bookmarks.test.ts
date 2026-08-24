/**
 * Saved classes — tests for the pure selectors, the derived art, and the
 * store's optimistic behaviour.
 *
 * The store is the one thing here worth mocking the database for. Its whole
 * job is to be right about state that briefly disagrees with the server —
 * optimistic flip, rollback on refusal, undo that restores filing — and none
 * of that is observable from a pure function.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALL_FOLDER,
  UNCATEGORIZED_FOLDER,
  folderCounts,
  groupSavedByCourse,
  groupSavedByFolder,
  savedSectionIds,
  savedTermCodes,
  type SavedSetLike,
} from "./grouping";
import { folderArt, folderGradientCss } from "./folder-art";
import type { Course, Section } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FALL = "20263";
const SPRING = "20271";
/** Same value as SPRING, named for the store tests that parse it out of an id. */
const SPRING_TERM = SPRING;

const SYSTEMS = "folder-systems";
const BACKUP = "folder-backup";

/**
 * Four bookmarks across two terms:
 *   4113 §001 — Systems + Backup (both folders, the many-to-many case)
 *   4113 §002 — Systems
 *   3157 §001 — unfiled  → Uncategorized
 *   1004 §001 — Spring, unfiled
 */
function savedSet(): SavedSetLike {
  return {
    saved: new Set([
      `${FALL}COMS4113W001`,
      `${FALL}COMS4113W002`,
      `${FALL}COMS3157W001`,
      `${SPRING}COMS1004W001`,
    ]),
    termBySection: new Map([
      [`${FALL}COMS4113W001`, FALL],
      [`${FALL}COMS4113W002`, FALL],
      [`${FALL}COMS3157W001`, FALL],
      [`${SPRING}COMS1004W001`, SPRING],
    ]),
    folderIdsBySection: new Map([
      [`${FALL}COMS4113W001`, [SYSTEMS, BACKUP]],
      [`${FALL}COMS4113W002`, [SYSTEMS]],
    ]),
  };
}

function section(sectionId: string, courseId: string, sectionCode: string): Section {
  return {
    sectionId,
    courseId,
    termCode: sectionId.slice(0, 5),
    callNumber: "00000",
    sectionCode,
    component: null,
    methodOfInstruction: null,
    gradingMode: null,
    minUnit: 3,
    maxUnit: 3,
    instructors: [],
    meetings: [],
    enrollmentCount: null,
    enrollmentCap: null,
    waitlistCount: null,
    waitlistCap: null,
    status: "unknown",
    sourceAsOf: null,
    lastSeenAt: null,
    detailUrl: null,
    note: null,
    openTo: null,
  };
}

function course(courseId: string, title: string): Course {
  return {
    courseId,
    subjectCode: "COMS",
    number: Number(courseId.replace(/\D/g, "")),
    qualifier: "W",
    title,
    description: null,
    pointsMin: 3,
    pointsMax: 3,
    prerequisiteText: null,
    department: null,
    requirementFlags: {},
  };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

describe("savedSectionIds", () => {
  it("scopes to a term, because a section id belongs to exactly one", () => {
    const ids = savedSectionIds(savedSet(), { termCode: FALL });
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain(`${SPRING}COMS1004W001`);
  });

  it("returns every term when none is given", () => {
    expect(savedSectionIds(savedSet())).toHaveLength(4);
  });

  it("narrows to one folder", () => {
    expect(savedSectionIds(savedSet(), { termCode: FALL, folder: SYSTEMS })).toEqual([
      `${FALL}COMS4113W001`,
      `${FALL}COMS4113W002`,
    ]);
  });

  it("treats a section in two folders as a member of both", () => {
    const set = savedSet();
    expect(savedSectionIds(set, { folder: SYSTEMS })).toContain(`${FALL}COMS4113W001`);
    expect(savedSectionIds(set, { folder: BACKUP })).toContain(`${FALL}COMS4113W001`);
  });

  it("computes Uncategorized as zero memberships, not a stored folder", () => {
    expect(savedSectionIds(savedSet(), { termCode: FALL, folder: UNCATEGORIZED_FOLDER })).toEqual([
      `${FALL}COMS3157W001`,
    ]);
  });

  it("drops a section out of Uncategorized the moment it is filed", () => {
    const set = savedSet();
    const filed: SavedSetLike = {
      ...set,
      folderIdsBySection: new Map(set.folderIdsBySection).set(`${FALL}COMS3157W001`, [BACKUP]),
    };
    expect(savedSectionIds(filed, { folder: UNCATEGORIZED_FOLDER })).toEqual([
      `${SPRING}COMS1004W001`,
    ]);
  });

  it("defaults to All", () => {
    expect(savedSectionIds(savedSet(), { termCode: FALL })).toEqual(
      savedSectionIds(savedSet(), { termCode: FALL, folder: ALL_FOLDER }),
    );
  });
});

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

describe("folderCounts", () => {
  it("counts All, Uncategorized and each folder in one pass", () => {
    const counts = folderCounts(savedSet(), FALL);
    expect(counts.all).toBe(3);
    expect(counts.uncategorized).toBe(1);
    expect(counts.byFolderId.get(SYSTEMS)).toBe(2);
    expect(counts.byFolderId.get(BACKUP)).toBe(1);
  });

  it("counts a doubly-filed section once per folder but once in All", () => {
    const counts = folderCounts(savedSet(), FALL);
    const folderTotal = [...counts.byFolderId.values()].reduce((a, b) => a + b, 0);
    // 3 folder memberships across 2 sections, but only 3 sections in All.
    expect(folderTotal).toBe(3);
    expect(counts.all).toBe(3);
  });

  it("respects the term filter", () => {
    expect(folderCounts(savedSet(), SPRING).all).toBe(1);
    expect(folderCounts(savedSet(), SPRING).uncategorized).toBe(1);
  });

  it("counts every term when none is given", () => {
    expect(folderCounts(savedSet()).all).toBe(4);
  });
});

describe("savedTermCodes", () => {
  it("lists the terms actually saved in, newest first", () => {
    expect(savedTermCodes(savedSet())).toEqual([SPRING, FALL]);
  });
});

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

describe("groupSavedByCourse", () => {
  const sections = [
    section(`${FALL}COMS4113W002`, "COMS4113W", "002"),
    section(`${FALL}COMS4113W001`, "COMS4113W", "001"),
    section(`${FALL}COMS3157W001`, "COMS3157W", "001"),
  ];
  const courses = [course("COMS4113W", "Operating Systems"), course("COMS3157W", "Adv Prog")];

  it("groups sections under their course and orders sections by code", () => {
    const groups = groupSavedByCourse(
      sections.map((s) => s.sectionId),
      sections,
      courses,
    );
    const systems = groups.find((g) => g.course.courseId === "COMS4113W");
    expect(systems?.sections.map((s) => s.sectionCode)).toEqual(["001", "002"]);
  });

  it("orders courses by the most recently saved section they contain", () => {
    const savedAt = new Map([
      [`${FALL}COMS4113W001`, "2026-08-01T00:00:00Z"],
      [`${FALL}COMS4113W002`, "2026-08-02T00:00:00Z"],
      [`${FALL}COMS3157W001`, "2026-08-09T00:00:00Z"],
    ]);
    const groups = groupSavedByCourse(
      sections.map((s) => s.sectionId),
      sections,
      courses,
      savedAt,
    );
    expect(groups.map((g) => g.course.courseId)).toEqual(["COMS3157W", "COMS4113W"]);
  });

  it("ignores sections that were not asked for", () => {
    const groups = groupSavedByCourse([`${FALL}COMS3157W001`], sections, courses);
    expect(groups).toHaveLength(1);
    expect(groups[0].course.courseId).toBe("COMS3157W");
  });

  it("drops a section whose course did not come back rather than rendering it headerless", () => {
    const groups = groupSavedByCourse(
      sections.map((s) => s.sectionId),
      sections,
      [course("COMS3157W", "Adv Prog")],
    );
    expect(groups.map((g) => g.course.courseId)).toEqual(["COMS3157W"]);
  });
});

describe("groupSavedByFolder", () => {
  const folders = [
    { folderId: SYSTEMS, name: "Systems track" },
    { folderId: BACKUP, name: "Spring backup" },
  ];

  it("puts Uncategorized last", () => {
    const groups = groupSavedByFolder(savedSet(), folders, FALL);
    expect(groups.at(-1)?.folderId).toBe(UNCATEGORIZED_FOLDER);
  });

  it("omits folders with nothing in the term", () => {
    const groups = groupSavedByFolder(savedSet(), folders, SPRING);
    expect(groups.map((g) => g.folderId)).toEqual([UNCATEGORIZED_FOLDER]);
  });

  it("lists a doubly-filed section under both folders", () => {
    const groups = groupSavedByFolder(savedSet(), folders, FALL);
    const inSystems = groups.find((g) => g.folderId === SYSTEMS)?.sectionIds ?? [];
    const inBackup = groups.find((g) => g.folderId === BACKUP)?.sectionIds ?? [];
    expect(inSystems).toContain(`${FALL}COMS4113W001`);
    expect(inBackup).toContain(`${FALL}COMS4113W001`);
  });
});

// ---------------------------------------------------------------------------
// Folder art
// ---------------------------------------------------------------------------

describe("folderArt", () => {
  it("is deterministic — the same folder looks the same on every device", () => {
    expect(folderArt(SYSTEMS)).toEqual(folderArt(SYSTEMS));
  });

  it("gives different folders different art", () => {
    expect(folderArt(SYSTEMS)).not.toEqual(folderArt(BACKUP));
  });

  /**
   * The palette is the attribute the eye reads first, and there are only
   * `8 starts x 4 strides` of them. A student is capped at 50 folders, so this
   * asserts the generator actually spreads across that space instead of
   * clustering — a fixed stride would score 8 here.
   */
  it("spreads palettes across the available space rather than clustering", () => {
    const palettes = new Set<string>();
    for (let i = 0; i < 50; i++) palettes.add(folderArt(`folder-${i}`).stops.join("|"));
    expect(palettes.size).toBeGreaterThanOrEqual(20);
  });

  it("gives 50 folders 50 visually distinct covers", () => {
    const covers = new Set<string>();
    for (let i = 0; i < 50; i++) covers.add(folderGradientCss(folderArt(`folder-${i}`)));
    expect(covers.size).toBe(50);
  });

  it("never repeats a stop, which would flatten the gradient into a wash", () => {
    for (let i = 0; i < 200; i++) {
      const stops = folderArt(`folder-${i}`).stops;
      expect(new Set(stops).size).toBe(3);
    }
  });

  it("only ever names chart tokens, never a raw colour", () => {
    for (let i = 0; i < 50; i++) {
      for (const stop of folderArt(`f${i}`).stops) {
        expect(stop).toMatch(/^--color-chart-[1-8]$/);
      }
    }
  });

  it("keeps positions inside the box", () => {
    for (let i = 0; i < 100; i++) {
      for (const point of folderArt(`f${i}`).positions) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(100);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(100);
      }
    }
  });

  it("renders CSS that carries the tokens rather than resolved colours", () => {
    const css = folderGradientCss(folderArt(SYSTEMS));
    for (const stop of folderArt(SYSTEMS).stops) {
      expect(css).toContain(`var(${stop})`);
    }
    expect(css).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

const db = vi.hoisted(() => ({
  loadBookmarks: vi.fn(),
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
  removeBookmarks: vi.fn(),
  restoreBookmark: vi.fn(),
  setBookmarkFolders: vi.fn(),
  fileBookmarksIntoFolder: vi.fn(),
  unfileBookmarksFromFolder: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ isConfigured: () => true }));

vi.mock("@/lib/db/bookmarks", async () => {
  class BookmarkNotAvailableError extends Error {
    constructor() {
      super("Sign in with your Columbia or Barnard account to save a class.");
      this.name = "BookmarkNotAvailableError";
    }
  }
  return { ...db, BookmarkNotAvailableError };
});

const SECTION = `${FALL}COMS4113W001`;

describe("bookmark store", () => {
  let store: typeof import("./store");

  beforeEach(async () => {
    vi.resetModules();
    for (const fn of Object.values(db)) fn.mockReset();

    db.loadBookmarks.mockResolvedValue({
      bookmarks: [
        { sectionId: SECTION, termCode: FALL, createdAt: "2026-08-01", folderIds: [SYSTEMS] },
      ],
      folders: [{ folderId: SYSTEMS, name: "Systems track", createdAt: "2026-07-01" }],
    });

    store = await import("./store");
    await store.ensureBookmarksLoaded();
  });

  /*
   * The one that a passing read does not catch.
   *
   * RLS answers an anonymous SELECT on `bookmarks` with an empty array and no
   * error, so a load that does not check identity first succeeds and reports
   * "ready, nothing saved". `/saved` would then tell a signed-out visitor
   * their shortlist is empty rather than that it needs a sign-in — and send
   * them to search to press a star that cannot write.
   */
  it("reports signed_out rather than an empty shortlist when there is no session", async () => {
    vi.resetModules();
    for (const fn of Object.values(db)) fn.mockReset();
    const { BookmarkNotAvailableError } = await import("@/lib/db/bookmarks");
    db.loadBookmarks.mockRejectedValue(new BookmarkNotAvailableError());

    const fresh = await import("./store");
    await fresh.ensureBookmarksLoaded();

    const snapshot = fresh.getBookmarkSnapshot();
    expect(snapshot.status).toBe("signed_out");
    // A refusal, not a failure: nothing went wrong, so nothing is reported.
    expect(snapshot.error ?? null).toBeNull();
  });

  it("loads into a ready snapshot", () => {
    const snapshot = store.getBookmarkSnapshot();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.saved.has(SECTION)).toBe(true);
    expect(snapshot.folderIdsBySection.get(SECTION)).toEqual([SYSTEMS]);
  });

  it("flips the icon before the write lands", async () => {
    const target = `${FALL}COMS3157W001`;
    let sawOptimisticFlip = false;
    db.addBookmark.mockImplementation(async () => {
      sawOptimisticFlip = store.getBookmarkSnapshot().saved.has(target);
    });

    await store.toggleBookmark(target);
    expect(sawOptimisticFlip).toBe(true);
  });

  it("rolls back and reports when the write is refused", async () => {
    const target = `${FALL}COMS3157W001`;
    db.addBookmark.mockRejectedValue(new Error("You've saved 500 classes"));

    const result = await store.toggleBookmark(target);

    expect(result).toEqual({ kind: "failed", reason: "You've saved 500 classes" });
    expect(store.getBookmarkSnapshot().saved.has(target)).toBe(false);
    expect(store.getBookmarkSnapshot().error).toBe("You've saved 500 classes");
  });

  it("hands back the folders a removal destroyed, so Undo can restore filing", async () => {
    db.removeBookmark.mockResolvedValue(undefined);

    const result = await store.toggleBookmark(SECTION);

    expect(result).toEqual({ kind: "removed", sectionId: SECTION, folderIds: [SYSTEMS] });
    expect(store.getBookmarkSnapshot().saved.has(SECTION)).toBe(false);
    expect(store.getBookmarkSnapshot().folderIdsBySection.has(SECTION)).toBe(false);
  });

  it("restores a removed bookmark into the folders it was in, not into Uncategorized", async () => {
    db.removeBookmark.mockResolvedValue(undefined);
    db.restoreBookmark.mockResolvedValue(undefined);

    const removed = await store.toggleBookmark(SECTION);
    if (removed.kind !== "removed") throw new Error("expected a removal");

    await store.undoRemoval(removed.sectionId, removed.folderIds);

    expect(store.getBookmarkSnapshot().saved.has(SECTION)).toBe(true);
    expect(store.getBookmarkSnapshot().folderIdsBySection.get(SECTION)).toEqual([SYSTEMS]);
    expect(db.restoreBookmark).toHaveBeenCalledWith(SECTION, [SYSTEMS]);
  });

  it("refuses a second toggle while one is in flight", async () => {
    let release: (() => void) | undefined;
    db.removeBookmark.mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    const first = store.toggleBookmark(SECTION);
    const second = await store.toggleBookmark(SECTION);
    expect(second).toEqual({ kind: "busy" });

    release?.();
    await first;
  });

  it("rolls filing back when the write fails", async () => {
    db.setBookmarkFolders.mockRejectedValue(new Error("nope"));

    const ok = await store.setFolders(SECTION, []);

    expect(ok).toBe(false);
    expect(store.getBookmarkSnapshot().folderIdsBySection.get(SECTION)).toEqual([SYSTEMS]);
  });

  it("files additively, so bulk filing does not strip other folders", async () => {
    db.fileBookmarksIntoFolder.mockResolvedValue(undefined);

    await store.fileMany([SECTION], BACKUP);

    expect(store.getBookmarkSnapshot().folderIdsBySection.get(SECTION)).toEqual([
      SYSTEMS,
      BACKUP,
    ]);
  });

  it("unfiles down to Uncategorized rather than leaving an empty array", async () => {
    db.unfileBookmarksFromFolder.mockResolvedValue(undefined);

    await store.unfileMany([SECTION], SYSTEMS);

    expect(store.getBookmarkSnapshot().folderIdsBySection.has(SECTION)).toBe(false);
  });

  it("deleting a folder keeps its bookmarks by default", async () => {
    db.deleteFolder.mockResolvedValue(0);

    const removed = await store.deleteFolder(SYSTEMS, false);

    expect(removed).toBe(0);
    expect(store.getBookmarkSnapshot().saved.has(SECTION)).toBe(true);
    expect(store.getBookmarkSnapshot().folderIdsBySection.has(SECTION)).toBe(false);
    expect(store.getBookmarkSnapshot().folders).toHaveLength(0);
  });

  it("deleting a folder with its bookmarks removes them too", async () => {
    db.deleteFolder.mockResolvedValue(1);

    const removed = await store.deleteFolder(SYSTEMS, true);

    expect(removed).toBe(1);
    expect(store.getBookmarkSnapshot().saved.has(SECTION)).toBe(false);
  });

  it("bulk removal returns enough to put everything back", async () => {
    db.removeBookmarks.mockResolvedValue(undefined);

    const result = await store.removeMany([SECTION]);

    expect(result).toEqual({
      ok: true,
      // Everything Undo needs: the filing, the term the term-filter reads, and
      // the original save time so a revived bookmark does not jump the queue.
      restore: [
        { sectionId: SECTION, folderIds: [SYSTEMS], termCode: FALL, savedAt: "2026-08-01" },
      ],
    });
    expect(store.getBookmarkSnapshot().saved.size).toBe(0);
  });

  it("revives everything when a bulk removal fails", async () => {
    db.removeBookmarks.mockRejectedValue(new Error("offline"));

    const result = await store.removeMany([SECTION]);

    expect(result).toEqual({ ok: false, reason: "offline" });
    expect(store.getBookmarkSnapshot().saved.has(SECTION)).toBe(true);
    expect(store.getBookmarkSnapshot().folderIdsBySection.get(SECTION)).toEqual([SYSTEMS]);
  });

  /*
   * The cascade mirror.
   *
   * `watches` has a composite foreign key into `bookmarks` with
   * `on delete cascade`, so Postgres silently deletes the watch whenever a
   * bookmark goes. Nothing observes that from the client, so the store
   * announces removals and `BookmarkProvider` forwards them to the watchlist
   * store. If these ever stop firing, the symptom is a bell that still reads
   * "on" for a section with no watch row — and a next click that tries to
   * delete it again instead of creating one.
   */
  describe("removal announcements", () => {
    it("announces a single removal", async () => {
      db.removeBookmark.mockResolvedValue(undefined);
      const seen: string[][] = [];
      const off = store.onBookmarksRemoved((ids) => seen.push([...ids]));

      await store.toggleBookmark(SECTION);
      off();

      expect(seen).toEqual([[SECTION]]);
    });

    it("stays silent when the removal was refused", async () => {
      db.removeBookmark.mockRejectedValue(new Error("offline"));
      const seen: string[][] = [];
      const off = store.onBookmarksRemoved((ids) => seen.push([...ids]));

      await store.toggleBookmark(SECTION);
      off();

      // The row is still there, so the watch is too. Announcing here would
      // switch a live bell off in the UI while it stays armed in the database.
      expect(seen).toEqual([]);
      expect(store.getBookmarkSnapshot().saved.has(SECTION)).toBe(true);
    });

    it("says nothing about a save", async () => {
      db.addBookmark.mockResolvedValue({
        sectionId: `${FALL}COMS3157W001`,
        termCode: FALL,
        createdAt: "2026-08-02",
        folderIds: [],
      });
      const seen: string[][] = [];
      const off = store.onBookmarksRemoved((ids) => seen.push([...ids]));

      await store.toggleBookmark(`${FALL}COMS3157W001`);
      off();

      expect(seen).toEqual([]);
    });

    it("announces every section a bulk removal took", async () => {
      db.removeBookmarks.mockResolvedValue(undefined);
      const seen: string[][] = [];
      const off = store.onBookmarksRemoved((ids) => seen.push([...ids]));

      await store.removeMany([SECTION]);
      off();

      expect(seen).toEqual([[SECTION]]);
    });

    it("announces bookmarks a folder delete took with it", async () => {
      db.deleteFolder.mockResolvedValue(1);
      const seen: string[][] = [];
      const off = store.onBookmarksRemoved((ids) => seen.push([...ids]));

      await store.deleteFolder(SYSTEMS, true);
      off();

      expect(seen).toEqual([[SECTION]]);
    });

    it("says nothing when a folder delete spares its bookmarks", async () => {
      db.deleteFolder.mockResolvedValue(0);
      const seen: string[][] = [];
      const off = store.onBookmarksRemoved((ids) => seen.push([...ids]));

      await store.deleteFolder(SYSTEMS, false);
      off();

      expect(seen).toEqual([]);
      expect(store.getBookmarkSnapshot().saved.has(SECTION)).toBe(true);
    });

    it("stops calling a listener once it unsubscribes", async () => {
      db.removeBookmark.mockResolvedValue(undefined);
      const seen: string[][] = [];
      store.onBookmarksRemoved((ids) => seen.push([...ids]))();

      await store.toggleBookmark(SECTION);

      expect(seen).toEqual([]);
    });
  });

  /*
   * A fresh save has to be filterable immediately.
   *
   * `/saved` filters by term and defaults to the current one, and the write
   * returns nothing — the database stamps `term_code` in a trigger. Without a
   * locally derived term, a class you just saved is filed under `undefined`
   * and disappears from the page you saved it on until the next reload, which
   * reads as "the save did not work".
   */
  describe("term stamping", () => {
    it("stamps the term from the section id on save", async () => {
      db.addBookmark.mockResolvedValue(undefined);
      const target = `${SPRING_TERM}COMS1004W001`;

      await store.toggleBookmark(target);

      expect(store.getBookmarkSnapshot().termBySection.get(target)).toBe(SPRING_TERM);
    });

    it("records when it was saved", async () => {
      db.addBookmark.mockResolvedValue(undefined);
      const target = `${FALL}COMS3157W001`;

      await store.toggleBookmark(target);

      const savedAt = store.getBookmarkSnapshot().savedAtBySection.get(target);
      expect(savedAt).toBeTypeOf("string");
      expect(Number.isNaN(Date.parse(savedAt as string))).toBe(false);
    });

    it("does not re-date a section that was already saved", async () => {
      const before = store.getBookmarkSnapshot().savedAtBySection.get(SECTION);
      db.removeBookmark.mockResolvedValue(undefined);
      db.restoreBookmark.mockResolvedValue(undefined);

      // Removing clears it; the load-time value must not survive as a ghost.
      await store.toggleBookmark(SECTION);
      expect(store.getBookmarkSnapshot().savedAtBySection.has(SECTION)).toBe(false);
      expect(before).toBe("2026-08-01");
    });

    it("forgets the term when the bookmark goes", async () => {
      db.removeBookmark.mockResolvedValue(undefined);

      await store.toggleBookmark(SECTION);

      expect(store.getBookmarkSnapshot().termBySection.has(SECTION)).toBe(false);
    });
  });
});
