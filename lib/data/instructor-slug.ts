/**
 * An instructor's name → the segment that addresses their page.
 *
 * WHY this is its own module rather than living beside the rest of the
 * instructor data layer: it is the one thing in that lane the *client* needs.
 * `InstructorLink` renders in search rows, section tables and the course
 * header, all of which are client components, and `lib/data/instructors.ts`
 * opens with `import { getAllCourses } from "@/lib/data/catalog"` — which in
 * turn statically pulls `lib/db/catalog-queries` and the Fall 2026 seed JSON.
 *
 * Importing a pure eight-line string function should not put a database client
 * and a catalog extract into the browser's import graph, and with no
 * `sideEffects: false` in package.json there is nothing telling the bundler it
 * may drop them. A leaf module with no imports at all makes the question moot
 * instead of leaving it to tree-shaking to get right.
 */

export function instructorSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
