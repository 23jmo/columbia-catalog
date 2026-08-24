/**
 * Build `lib/prereqs/generated/prereq-catalog.json` from captured bulletin HTML.
 *
 *   npx tsx scripts/build-prereqs.ts            # write the catalog
 *   npx tsx scripts/build-prereqs.ts --report   # print what it parsed, write nothing
 *
 * WHY A BUILD STEP. The prerequisite prose lives in HTML. Parsing it is
 * deterministic but not free, and nothing about it changes between requests,
 * so it is done once here and the result is imported as data — the same split
 * the search index already uses. When the crawler lane starts persisting
 * `prerequisite_formula`, this script becomes the backfill for it and the UI
 * keeps reading through `lib/progression/catalog.ts` unchanged.
 *
 * The equivalence pass runs BEFORE the prerequisite pass on purpose: reading
 * W4111's prerequisite correctly depends on already knowing that W3134, W3136
 * and W3137 are interchangeable, and that fact is published in a different
 * course's description. See `lib/prereqs/equivalence.ts`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type HTMLElement } from "node-html-parser";

import { buildCourseId, cleanText, parseCourseNumber } from "../lib/ingest/parsers/shared";
import {
  buildEquivalenceIndex,
  extractEquivalenceGroups,
  mergeEquivalenceGroups,
} from "../lib/prereqs/equivalence";
import {
  buildCanonicalIndex,
  canonicalizeEquivalenceGroups,
  canonicalizeRequirement,
} from "../lib/prereqs/canonical";
import { parsePrerequisiteText } from "../lib/prereqs/parse";
import type { EquivalenceGroup, PrereqCatalog, PrereqNode, ProgressionCourse } from "../lib/prereqs/types";

const SOURCE = "lib/ingest/__fixtures__/bulletin-cs.html";
const OUTPUT = "lib/prereqs/generated/prereq-catalog.json";

/** "COMS W3134 Data Structures in Java. 3 points." */
const TITLE_LINE =
  /^([A-Z]{2,5})\s+([A-Z]{0,3}\d{4}[A-Z]{0,3})\s+(.*?)\.?\s*$/;

interface RawBlock {
  courseId: string;
  subjectCode: string;
  number: number;
  qualifier: string | null;
  title: string;
  points: number | null;
  prereqText: string | null;
  descriptionText: string;
}

function readBlock(block: HTMLElement): RawBlock | null {
  const titleNode = block.querySelector(".courseblocktitle");
  if (!titleNode) return null;

  // "3.00 points" / "1.00-3.00 points" sits in its own <em>, so the points are
  // stripped off the heading rather than teased out of the title text.
  const full = cleanText(titleNode.text);
  const pointsMatch = /([\d.]+)(?:\s*-\s*[\d.]+)?\s*points?\.?\s*$/i.exec(full);
  const points = pointsMatch ? Number(pointsMatch[1]) : null;
  const heading = pointsMatch ? full.slice(0, pointsMatch.index).trim() : full;

  const match = TITLE_LINE.exec(heading.replace(/\.\s*$/, ""));
  if (!match) return null;

  const [, subjectCode, rawNumber, rawTitle] = match;
  const parsed = parseCourseNumber(rawNumber);
  if (!parsed) return null;

  const prereqNode = block.querySelector(".prereq");
  // The description is the courseblock minus its heading and minus the
  // schedule tables, which would otherwise flood the equivalence scanner with
  // call numbers that look like course codes.
  const descriptionParts = block
    .querySelectorAll("p")
    .filter((p) => !p.classNames.includes("courseblocktitle"))
    .map((p) => cleanText(p.text));

  return {
    courseId: buildCourseId(subjectCode, parsed.number, parsed.qualifier),
    subjectCode,
    number: parsed.number,
    qualifier: parsed.qualifier,
    title: toTitleCase(rawTitle),
    points: Number.isFinite(points) ? points : null,
    prereqText: prereqNode ? cleanText(prereqNode.text) : null,
    descriptionText: descriptionParts.join(" "),
  };
}

/**
 * The bulletin shouts half its titles ("ADVANCED PROGRAMMING") and sentence-
 * cases the other half ("Data Structures in Java"). Normalizing only the
 * shouted ones keeps the editorial casing where it exists.
 */
function toTitleCase(input: string): string {
  const text = cleanText(input);
  if (text !== text.toUpperCase()) return text;
  const minor = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
  return text
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((part, index) => {
      if (/^(\s+|-|\/)$/.test(part)) return part;
      if (index > 0 && minor.has(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

function build(): { catalog: PrereqCatalog; groups: EquivalenceGroup[] } {
  const html = readFileSync(resolve(process.cwd(), SOURCE), "utf8");
  const root = parse(html);

  const blocks: RawBlock[] = [];
  for (const element of root.querySelectorAll(".courseblock")) {
    const block = readBlock(element);
    // A department page repeats a courseblock when a course is cross-listed.
    if (block && !blocks.some((existing) => existing.courseId === block.courseId)) {
      blocks.push(block);
    }
  }

  // Every reference the bulletin abbreviates ("1004", "COMS 4160") is resolved
  // against the ids that actually exist before anything downstream indexes on
  // them, or the graph grows phantom nodes that join to nothing.
  const canonical = buildCanonicalIndex(blocks.map((block) => block.courseId));

  const groups = mergeEquivalenceGroups(
    canonicalizeEquivalenceGroups(
      blocks.flatMap((block) =>
        extractEquivalenceGroups(block.descriptionText, block.subjectCode),
      ),
      canonical,
    ),
  );
  const equivalenceIndex = buildEquivalenceIndex(groups);
  const equivalenceOf = (courseId: string) => equivalenceIndex.get(courseId);

  const courses: ProgressionCourse[] = blocks.map((block) => ({
    courseId: block.courseId,
    subjectCode: block.subjectCode,
    number: block.number,
    qualifier: block.qualifier,
    title: block.title,
    points: block.points,
    prereq: canonicalizeRequirement(
      parsePrerequisiteText(block.courseId, block.prereqText, {
        defaultSubject: block.subjectCode,
        equivalenceOf,
      }),
      canonical,
    ),
    equivalents: [...(equivalenceIndex.get(block.courseId) ?? [])].filter(
      (id) => id !== block.courseId,
    ),
  }));

  courses.sort((a, b) =>
    a.subjectCode === b.subjectCode
      ? a.number - b.number
      : a.subjectCode.localeCompare(b.subjectCode),
  );

  return {
    catalog: {
      source: SOURCE,
      // Fixed to the fixture's own capture date rather than now(): the output
      // is committed, and a wall-clock stamp would make every rebuild a diff.
      builtAt: "2026-08-22",
      courses,
      equivalenceGroups: groups,
    },
    groups,
  };
}

function renderNode(node: PrereqNode | null): string {
  if (!node) return "—";
  if (node.kind === "course") return node.courseId;
  if (node.kind === "advisory") return `«${node.text}»`;
  return `(${node.children.map(renderNode).join(node.kind === "all" ? " AND " : " OR ")})`;
}

function main(): void {
  const { catalog, groups } = build();
  const report = process.argv.includes("--report");

  if (report) {
    for (const course of catalog.courses) {
      if (!course.prereq) continue;
      const { confidence, tree, corequisites, advisories, instructorPermission } = course.prereq;
      console.log(
        `${confidence.padEnd(10)} ${course.courseId.padEnd(12)} ${renderNode(tree)}` +
          (corequisites ? `  [coreq ${renderNode(corequisites)}]` : "") +
          (instructorPermission ? "  [permission]" : ""),
      );
      if (advisories.length > 0) console.log(`${" ".repeat(23)}↳ ${advisories.join(" · ")}`);
    }
    console.log("\nEquivalence groups:");
    for (const group of groups) console.log(`  ${group.courseIds.join(" ≡ ")}`);
  }

  const tally = catalog.courses.reduce<Record<string, number>>((acc, course) => {
    const key = course.prereq?.confidence ?? "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    `\n${catalog.courses.length} courses · ${groups.length} equivalence groups · ` +
      Object.entries(tally)
        .map(([key, count]) => `${key}=${count}`)
        .join(" "),
  );

  if (!report) {
    writeFileSync(resolve(process.cwd(), OUTPUT), `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(`wrote ${OUTPUT}`);
  }
}

main();
