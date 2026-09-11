/**
 * Courses the student has already saved, as ranking exclusions.
 *
 * Bookmarks are sections. The feed is courses. A student who saved COMS W4111
 * section 001 and then walks back to `/` must not see W4111 again — even if
 * the ranking would now pick section 002. Counting the bookmark as `planned`
 * would be the wrong conversion: planned courses also count as completed for
 * prerequisites, and saving a class is not having taken it.
 *
 * Never throws. A bookmark read that fails is the same as "nothing saved" from
 * the feed's point of view — showing a class they already parked is a worse
 * failure than hiding one we could not look up.
 */

import { createServerSupabaseClient } from "@/lib/db/client";

import { courseIdsFromSectionIds } from "./section-id";

export async function loadSavedCourseIds(): Promise<string[]> {
  try {
    const client = await createServerSupabaseClient();
    if (!client) return [];

    const { data, error } = await client.from("bookmarks").select("section_id");
    if (error || !data) return [];

    const sectionIds = data.map((row) => row.section_id);
    if (sectionIds.length === 0) return [];

    /*
     * Prefer the sections table: it is the source of truth for course_id, and
     * it still works if a section code is ever not three digits. Fall back to
     * parsing the id when the join comes back empty (a bookmark whose section
     * has been withdrawn from the catalog).
     */
    const { data: sections } = await client
      .from("sections")
      .select("course_id")
      .in("section_id", sectionIds);

    const fromTable = [...new Set((sections ?? []).map((row) => row.course_id))];
    if (fromTable.length > 0) return fromTable;

    return [...courseIdsFromSectionIds(sectionIds)];
  } catch (cause) {
    console.error("recommend: could not read saved classes, treating as none:", cause);
    return [];
  }
}
