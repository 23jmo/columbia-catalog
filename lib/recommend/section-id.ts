/**
 * Pull a course id out of a section id.
 *
 * `sectionId` is `${termCode}${courseId}${sectionCode}` — e.g. `20263COMS4113W001`.
 * The feed thinks in courses (one card per class) and bookmarks think in
 * sections (one row per call number), so every path that has to hide a saved
 * class from the ranking has to make this conversion.
 *
 * Documented as always ending in a 3-digit section code. See `Section.sectionId`
 * in `@/lib/types`. We do not import that file's runtime here: this helper has
 * to stay importable from the feed's client island.
 */

const SECTION_ID = /^(\d{5})(.+)(\d{3})$/;

export function courseIdFromSectionId(sectionId: string): string | null {
  const match = SECTION_ID.exec(sectionId.trim());
  const courseId = match?.[2];
  return courseId && courseId.length > 0 ? courseId : null;
}

/** Distinct course ids implied by a set of saved section ids. */
export function courseIdsFromSectionIds(sectionIds: Iterable<string>): Set<string> {
  const courseIds = new Set<string>();
  for (const sectionId of sectionIds) {
    const courseId = courseIdFromSectionId(sectionId);
    if (courseId) courseIds.add(courseId);
  }
  return courseIds;
}
