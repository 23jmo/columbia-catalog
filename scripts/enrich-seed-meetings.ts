/**
 * Fill the seed catalog's missing meeting times and rooms from the Bulletin.
 *
 * WHY THIS EXISTS: the Directory subject page (`/subj/COMS/_Fall2026.html`) is
 * the fast, complete source for sections and live seat counts, but it does not
 * publish meeting patterns — the section detail page now renders "View Class
 * Schedule & Location in Vergil" where a room used to be. The Bulletin
 * department page does publish them. So the seed extracted from the Directory
 * has 112 sections and zero meetings, which leaves the schedule preview, the
 * campus card, and every day/time filter with nothing to show.
 *
 * The join is exact: `parseBulletinDepartment` emits `courseCode` in the same
 * canonical form as `Course.courseId`, and call numbers are unique per term.
 *
 * NEVER OVERWRITES GOOD DATA (AGENTS.md): a section that already has meetings
 * keeps them. The Directory stays authoritative for seat counts and status —
 * this script only fills a hole the Directory cannot fill.
 *
 *   npm run seed:meetings
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseBulletinDepartment } from "../lib/ingest/parsers/bulletin";
import type { CourseWithSections, Meeting, TermCode } from "../lib/types";

const TERM: TermCode = "20263";
const BULLETIN = resolve("lib/ingest/__fixtures__/bulletin-cs.html");
const SEED = resolve("lib/seed/coms-fall2026.json");

const rows = parseBulletinDepartment(readFileSync(BULLETIN, "utf8"), { termCode: TERM });

// Call number is the unique key when present; course+section is the fallback
// for rows the Bulletin prints without one.
const byCallNumber = new Map(rows.filter((row) => row.callNumber).map((row) => [row.callNumber!, row]));
const byCourseAndSection = new Map(rows.map((row) => [`${row.courseCode}|${row.sectionCode}`, row]));

const courses = JSON.parse(readFileSync(SEED, "utf8")) as CourseWithSections[];

let sectionsFilled = 0;
let meetingsAdded = 0;
let alreadyHadMeetings = 0;
let unmatched = 0;

for (const course of courses) {
  for (const section of course.sections) {
    if (section.meetings.length > 0) {
      alreadyHadMeetings += 1;
      continue;
    }

    const match =
      (section.callNumber ? byCallNumber.get(section.callNumber) : undefined) ??
      byCourseAndSection.get(`${section.courseId}|${section.sectionCode}`);

    if (!match || match.meetings.length === 0) {
      unmatched += 1;
      continue;
    }

    section.meetings = match.meetings as Meeting[];
    sectionsFilled += 1;
    meetingsAdded += match.meetings.length;

    // The Bulletin names an instructor where the Directory sometimes prints
    // none. Additive only — an existing list is never replaced.
    if (section.instructors.length === 0 && match.instructor) {
      section.instructors = [match.instructor];
    }
  }
}

writeFileSync(SEED, `${JSON.stringify(courses, null, 2)}\n`);

const totalSections = courses.reduce((sum, course) => sum + course.sections.length, 0);
console.log(`Bulletin rows for ${TERM}: ${rows.length}`);
console.log(`Sections in seed:        ${totalSections}`);
console.log(`  already had meetings:  ${alreadyHadMeetings}`);
console.log(`  filled from Bulletin:  ${sectionsFilled}  (+${meetingsAdded} meetings)`);
console.log(`  still without:         ${unmatched}  — not printed on this Bulletin page`);
