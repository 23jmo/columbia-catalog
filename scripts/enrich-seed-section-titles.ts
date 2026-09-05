/**
 * Fill the seed catalog's missing section titles from the captured Directory page.
 *
 * WHY THIS EXISTS: `lib/seed/coms-fall2026.json` is the catalog every surface
 * reads when Supabase is not configured — CI, `next build`, a fresh clone, the
 * MCP server on a laptop with no `.env.local`. It was extracted before
 * `sections.title` existed (migration 0017), so all 112 of its sections carry no
 * title at all, and on that path COMS 6998 and COMS 4995 are each one course
 * called "TOPICS IN COMPUTER SCIENCE" with twenty interchangeable rows. The
 * names that tell those rows apart — "COMPUTATION AND THE BRAIN", "DESIGNING LLM
 * AGENTS" — exist nowhere else in the product, so on the seed path the topic
 * titles are not merely unrendered, they are absent.
 *
 * The fixture is the same page the seed was extracted from
 * (`doc-subject-COMS-Fall2026.html`, every COMS section for Fall 2026), so this
 * is a backfill from the original source rather than an invention: the `<h1>`
 * inside each row's `div.course-details` is exactly what `parseSubjectPage`
 * already reads in production, and it is read here by that same parser rather
 * than by a second regex that could drift from it.
 *
 * The join is exact: call numbers are unique per term, and section ids are the
 * fallback. Measured on the current seed, 112 of 112 sections match with no
 * misses — if that ever stops being true this prints the unmatched ids rather
 * than filling anything approximately.
 *
 * NEVER OVERWRITES GOOD DATA (AGENTS.md): a section that already has a title
 * keeps it, so a re-run after a real ingest is a no-op rather than a rollback.
 *
 * Titles are stored RAW, including when the row merely restates the course's own
 * name — which is what the directory prints on an ordinary course, and what
 * `Section.title` documents. Whether a title is worth showing is decided
 * downstream by `isDistinctSectionTitle`, once, for every surface.
 *
 *   npx tsx scripts/enrich-seed-section-titles.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseSubjectPage } from "../lib/ingest/parsers/subject-page";
import type { CourseWithSections, TermCode } from "../lib/types";

const TERM: TermCode = "20263";
const SUBJECT = "COMS";
const FIXTURE = resolve("lib/ingest/__fixtures__/doc-subject-COMS-Fall2026.html");
const SEED = resolve("lib/seed/coms-fall2026.json");

const page = parseSubjectPage(readFileSync(FIXTURE, "utf8"), SUBJECT, TERM);
const rows = page.courses.flatMap((course) => course.sections);

// Call number is the unique key within a term; the section id covers the few
// rows the directory prints without one.
const byCallNumber = new Map(
  rows.filter((row) => row.callNumber).map((row) => [row.callNumber, row]),
);
const bySectionId = new Map(rows.map((row) => [row.sectionId, row]));

const courses = JSON.parse(readFileSync(SEED, "utf8")) as CourseWithSections[];

let filled = 0;
let alreadyTitled = 0;
const unmatched: string[] = [];

for (const course of courses) {
  for (const section of course.sections) {
    if (section.title != null) {
      alreadyTitled += 1;
      continue;
    }

    const match =
      (section.callNumber ? byCallNumber.get(section.callNumber) : undefined) ??
      bySectionId.get(section.sectionId);

    if (!match?.title) {
      unmatched.push(section.sectionId);
      continue;
    }

    section.title = match.title;
    filled += 1;
  }
}

writeFileSync(SEED, `${JSON.stringify(courses, null, 2)}\n`);

const total = courses.reduce((sum, course) => sum + course.sections.length, 0);
console.log(`Directory rows for ${SUBJECT} ${TERM}: ${rows.length}`);
console.log(`Sections in seed:              ${total}`);
console.log(`  already titled:              ${alreadyTitled}`);
console.log(`  filled from the Directory:   ${filled}`);
console.log(`  unmatched:                   ${unmatched.length}`);
if (unmatched.length > 0) console.log(`  ${unmatched.join(", ")}`);
