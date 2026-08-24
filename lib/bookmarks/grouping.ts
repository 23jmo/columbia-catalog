/**
 * Pure selectors over the saved set.
 *
 * Everything here is a function of plain data — no store import, no React, no
 * Supabase — so `/saved`, the schedule dropdown and the tests all compute the
 * same answers from the same code. The store deliberately does not cache any
 * of it, because every number below depends on the term the reader is looking
 * at and the store does not know that.
 *
 * ── The one rule worth stating ─────────────────────────────────────────────
 *
 * "Uncategorized" is a bookmark with zero folder memberships, computed here.
 * There is no row for it, so it cannot be renamed, deleted, filed into, or
 * left holding a section that is also filed somewhere else. `All` is the same
 * kind of thing.
 */

import type { Course, CourseWithSections, Section, TermCode } from "@/lib/types";

/** The slice of the store these selectors need. Kept structural for testing. */
export interface SavedSetLike {
  saved: ReadonlySet<string>;
  termBySection: ReadonlyMap<string, TermCode>;
  folderIdsBySection: ReadonlyMap<string, readonly string[]>;
}

/** The two computed folders, plus a real folder id. */
export const ALL_FOLDER = "all";
export const UNCATEGORIZED_FOLDER = "uncategorized";

export type FolderScope = typeof ALL_FOLDER | typeof UNCATEGORIZED_FOLDER | string;

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Saved section ids in a term, optionally narrowed to one folder.
 *
 * `termCode` is applied first and always: a section id embeds its term, so a
 * bookmark saved for Fall 2026 has no business appearing under Spring 2027
 * even in "All". Passing `undefined` means every term, which is what the
 * gallery's total uses.
 */
export function savedSectionIds(
  set: SavedSetLike,
  options: { termCode?: TermCode; folder?: FolderScope } = {},
): string[] {
  const { termCode, folder = ALL_FOLDER } = options;
  const out: string[] = [];

  for (const sectionId of set.saved) {
    if (termCode && set.termBySection.get(sectionId) !== termCode) continue;

    const folderIds = set.folderIdsBySection.get(sectionId) ?? [];
    if (folder === ALL_FOLDER) {
      out.push(sectionId);
    } else if (folder === UNCATEGORIZED_FOLDER) {
      if (folderIds.length === 0) out.push(sectionId);
    } else if (folderIds.includes(folder)) {
      out.push(sectionId);
    }
  }

  return out;
}

export interface FolderCounts {
  all: number;
  uncategorized: number;
  /** Real folder id → how many saved sections it holds in this term. */
  byFolderId: ReadonlyMap<string, number>;
}

/**
 * One pass over the saved set producing every count the gallery renders.
 *
 * Done in a single walk rather than one `savedSectionIds` call per folder,
 * because the gallery asks for all of them at once and a student may have
 * fifty folders.
 */
export function folderCounts(set: SavedSetLike, termCode?: TermCode): FolderCounts {
  const byFolderId = new Map<string, number>();
  let all = 0;
  let uncategorized = 0;

  for (const sectionId of set.saved) {
    if (termCode && set.termBySection.get(sectionId) !== termCode) continue;
    all += 1;

    const folderIds = set.folderIdsBySection.get(sectionId) ?? [];
    if (folderIds.length === 0) {
      uncategorized += 1;
      continue;
    }
    for (const folderId of folderIds) {
      byFolderId.set(folderId, (byFolderId.get(folderId) ?? 0) + 1);
    }
  }

  return { all, uncategorized, byFolderId };
}

/** Which terms the student has actually saved something in, newest first. */
export function savedTermCodes(set: SavedSetLike): TermCode[] {
  const terms = new Set<TermCode>();
  for (const sectionId of set.saved) {
    const termCode = set.termBySection.get(sectionId);
    if (termCode) terms.add(termCode);
  }
  return [...terms].sort((a, b) => b.localeCompare(a));
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Saved sections under the course they belong to — the shape `/saved` renders.
 *
 * The result unit is the course, mirroring `/search`, so the two screens agree
 * about what a "class" is even though a bookmark is a section. Sections are
 * ordered by section code within a course; courses are ordered by the most
 * recently saved section they contain, so a class you just saved appears at
 * the top rather than wherever the alphabet puts it.
 */
export interface SavedCourseGroup {
  course: Course;
  sections: Section[];
}

export function groupSavedByCourse(
  sectionIds: readonly string[],
  sections: readonly Section[],
  courses: readonly (Course | CourseWithSections)[],
  savedAt?: ReadonlyMap<string, string>,
): SavedCourseGroup[] {
  const wanted = new Set(sectionIds);
  const courseById = new Map(courses.map((course) => [course.courseId, course as Course]));
  const groups = new Map<string, Section[]>();

  for (const section of sections) {
    if (!wanted.has(section.sectionId)) continue;
    const existing = groups.get(section.courseId);
    if (existing) existing.push(section);
    else groups.set(section.courseId, [section]);
  }

  const out: SavedCourseGroup[] = [];
  for (const [courseId, group] of groups) {
    const course = courseById.get(courseId);
    // A section whose course did not come back is dropped rather than rendered
    // headerless. It means the course was removed from the catalog between the
    // two reads, which the page reports separately.
    if (!course) continue;
    group.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
    out.push({ course, sections: group });
  }

  if (savedAt) {
    const newestIn = (group: SavedCourseGroup): string =>
      group.sections.reduce(
        (newest, section) => {
          const at = savedAt.get(section.sectionId) ?? "";
          return at > newest ? at : newest;
        },
        "",
      );
    out.sort((a, b) => newestIn(b).localeCompare(newestIn(a)));
  } else {
    out.sort((a, b) => a.course.courseId.localeCompare(b.course.courseId));
  }

  return out;
}

/**
 * Saved sections grouped by folder, for the schedule dropdown.
 *
 * A section filed in two folders appears under both — that is what
 * many-to-many means, and hiding the duplicate would make the menu disagree
 * with the folder page. Uncategorized comes last because it is the pile you
 * have not thought about yet.
 */
export interface FolderGroup {
  folderId: FolderScope;
  name: string;
  sectionIds: string[];
}

export function groupSavedByFolder(
  set: SavedSetLike,
  folders: readonly { folderId: string; name: string }[],
  termCode?: TermCode,
): FolderGroup[] {
  const out: FolderGroup[] = [];

  for (const folder of folders) {
    const sectionIds = savedSectionIds(set, { termCode, folder: folder.folderId });
    if (sectionIds.length > 0) {
      out.push({ folderId: folder.folderId, name: folder.name, sectionIds });
    }
  }

  const loose = savedSectionIds(set, { termCode, folder: UNCATEGORIZED_FOLDER });
  if (loose.length > 0) {
    out.push({ folderId: UNCATEGORIZED_FOLDER, name: "Uncategorized", sectionIds: loose });
  }

  return out;
}
