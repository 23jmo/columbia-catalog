import type { School } from "@/lib/requirements/types";

import type { LoadedCatalog } from "./pipeline";

/**
 * Which courses a student's school lets them register for, as far as the
 * catalog can say.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * A Columbia College student was recommended APMA E2000, the engineering
 * multivariable calculus, which only SEAS students may take. Nothing in the
 * data we ingest says so: the section's `open_to` is blank (the registrar
 * fills that field for professional schools, not for the undergraduate
 * split), the note is blank, and the description does not mention it. So the
 * recommender had no way to know, and it ranked the course on merit.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * Two signals, both from the catalog itself.
 *
 *   DESIGNATOR   The letter after the number is the registrar's statement of
 *                whose course it is. `CC` is Columbia College's own Core
 *                sections, `GS` is General Studies'. Each stays with its
 *                school.
 *
 *   SEAS FIRST YEAR   The engineering first-year sequence carries the `E`
 *                designator like every other engineering course, and the
 *                designator alone cannot separate it from ELEN E1101 or
 *                EAEE E2100, which half of Columbia College takes for its
 *                science requirement. A level rule was tried first — "E
 *                below 3000" — and it would have hidden fifteen courses from
 *                CC, of which at most six are actually closed. So the closed
 *                ones are named, below, and everything else with an `E` stays
 *                open to everyone.
 *
 * Everything else — UN, BC, GU, GR, W — is admitted for every undergraduate
 * school. Barnard courses are open to Columbia students and vice versa, and
 * the 4000-level GU/GR seminars are where seniors go. A student with no
 * school on file is gated by nothing: a wrong exclusion for someone we know
 * nothing about is worse than a wrong inclusion.
 *
 * This is a rule about the catalog, not about enrollment reality. Instructor
 * permission, department priority and "SEAS students first" waitlists are
 * not in the data, and this does not pretend to know them. What it removes is
 * the case where the course is, by the catalog's own account, another
 * school's.
 */
export function admitsSchool(
  listing: { courseId: string; qualifier: string | null },
  school: School | null,
): boolean {
  if (school === null) return true;
  switch (listing.qualifier) {
    case "CC":
      return school === "CC";
    case "GS":
      return school === "GS";
    case "E":
      return school === "SEAS" || !SEAS_ONLY.has(listing.courseId);
    default:
      return true;
  }
}

/**
 * The engineering first-year sequence: required of every SEAS student and
 * closed to the other three schools, whose students take the UN equivalent
 * (MATH UN1201/1202 for APMA E2000, COMS W1004 for ENGI E1006).
 *
 * Deliberately short. Add a course here only when the bulletin, not a hunch,
 * says it is SEAS-only. The sub-3000 `E` courses NOT on this list — ELEN
 * E1101, EAEE E2100, IEOR E2261, ORCA E2500, CHEN E1000 among them — are
 * open to Columbia College and General Studies and are some of their most
 * popular science and elective picks.
 */
export const SEAS_ONLY: ReadonlySet<string> = new Set([
  "APMA2000E", // Multivariable calculus for engineers and applied scientists
  "ENGI1006E", // Introduction to computing for engineers and applied scientists
  "ENGI1102E", // The Art of Engineering
  "ENGI1002E", // Egleston Scholars seminar
]);

/**
 * The catalog with another school's courses removed — listings and
 * candidates both, so the requirement pool and the ranking cannot disagree
 * about what is on offer.
 */
export function gateCatalogForSchool(catalog: LoadedCatalog, school: School | null): LoadedCatalog {
  if (school === null) return catalog;
  const listings = catalog.listings.filter((listing) => admitsSchool(listing, school));
  const admitted = new Set(listings.map((listing) => listing.courseId));
  return {
    listings,
    candidates: catalog.candidates.filter((candidate) => admitted.has(candidate.courseId)),
  };
}
