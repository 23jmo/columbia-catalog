/**
 * Check that every interest-tag exemplar names a course the catalog holds.
 *
 *   npx tsx --env-file=.env.local scripts/verify-interest-tag-exemplars.ts
 *   npx tsx --env-file=.env.local scripts/verify-interest-tag-exemplars.ts bc-major-psychology
 *
 * Exits non-zero when anything is unresolved, so it can gate a deploy.
 *
 * ── Why this is a script and not a test ────────────────────────────────────
 *
 * `lib/profile/interest-tags.ts` says an exemplar is "the tag's seed vector":
 * a declared interest has no course behind it, so the recommender leans on
 * these codes instead. A code that names nothing therefore seeds NOTHING. The
 * tag still renders, the student still picks it, and it contributes exactly
 * zero to her feed — forever, and silently. There is no error, no empty state,
 * and nothing on screen that looks wrong.
 *
 * The unit test in `lib/onboarding/onboarding.test.ts` catches the cheaper half
 * of this (a code that does not even parse). It cannot catch the expensive
 * half, because deciding whether `PSYC UN1010` exists needs the catalog, and
 * the suite runs offline. Hence a script.
 *
 * ── The second failure class, and why this script grew a second check ──────
 *
 * A dead code is the CHEAP failure. It is loud once you look, and the loop
 * below finds every one of them.
 *
 * The expensive failure is a code that resolves to the WRONG course, and the
 * first full audit — 2026-08-30 — found far more of those than dead ones.
 * Seven of the eleven Columbia Economics tags named `ECON UN3265` Money and
 * Banking: development, labour, trade, industrial organisation, public and
 * behavioural economics all shared one seed vector. Barnard aside, the pattern
 * repeated in five more departments — `solid-mechanics` seeded from
 * Thermodynamics, `dynamics-control` from Computer Graphics, `materials` from
 * Fluids, `perception` from Behavioral Neuroscience, `public-policy` from the
 * American Politics Seminar.
 *
 * Nothing catches that automatically: those are all real courses, so a catalog
 * lookup is happy, and the screen looks identical either way. What CAN be
 * caught is its most common shape — two tags in one program pointing at the
 * same course, which guarantees the recommender can never rank them
 * differently, and is almost always a placeholder somebody meant to replace.
 * That is the second loop below.
 *
 * The rest is a reading job. When you add or edit a tag, print the exemplar's
 * TITLE next to it and read the two together; do not trust that a code
 * resolving means it resolved to what you meant.
 *
 * ── What the dead-code check found the first time it ran, on 2026-08-30 ─────
 *
 * 33 of 156 exemplars in the Columbia College and SEAS lists resolved to
 * nothing — a fifth of them. Two representative causes, both transcription
 * rather than catalog gaps:
 *
 *   - `PSYC UN1010`. Columbia's introductory course is `PSYC UN1001` The
 *     Science of Psychology; `PSYC BC1010` is Barnard's experimental lab. The
 *     code appears to be a blend of the two.
 *   - `BMEN E4010`, `E4210`, `E4300`, `E4438`. None exist. The department's
 *     real numbers nearby are 4001, 4302, 4310 and 4330.
 *
 * The Barnard lists added the same day resolved 230 of 230, because they were
 * written against a dump of this table rather than from memory. That is the
 * whole argument for running this before adding a tag, not after.
 */

import { createClient } from "@supabase/supabase-js";

import { toCourseId } from "../lib/requirements/code";
import {
  interestTagsForPrograms,
  programsWithInterestTags,
} from "../lib/profile/interest-tags";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface Row {
  programId: string;
  tagId: string;
  code: string;
  courseId: string | null;
}

async function heldCourseIds(courseIds: string[]): Promise<Set<string>> {
  const held = new Set<string>();
  // Chunked because the id list is longer than a single `in` filter should be.
  for (let i = 0; i < courseIds.length; i += 200) {
    const chunk = courseIds.slice(i, i + 200);
    const { data, error } = await db.from("courses").select("course_id").in("course_id", chunk);
    if (error) throw new Error(`courses lookup failed: ${error.message}`);
    for (const row of data ?? []) held.add(row.course_id as string);
  }
  return held;
}

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const programIds = only.length
    ? programsWithInterestTags().filter((id) => only.includes(id))
    : programsWithInterestTags();

  if (only.length && programIds.length !== only.length) {
    const unknown = only.filter((id) => !programsWithInterestTags().includes(id));
    console.error(`No interest tags authored for: ${unknown.join(", ")}`);
    process.exit(2);
  }

  const rows: Row[] = [];
  for (const programId of programIds) {
    for (const tag of interestTagsForPrograms([programId])) {
      for (const code of tag.exemplars) {
        rows.push({ programId, tagId: tag.id, code, courseId: toCourseId(code) });
      }
    }
  }

  const parseable = rows.filter((row) => row.courseId !== null);
  const held = await heldCourseIds([...new Set(parseable.map((row) => row.courseId!))]);
  const dead = rows.filter((row) => row.courseId === null || !held.has(row.courseId));

  // Grouped by program so the output reads as a worklist rather than a wall.
  const byProgram = new Map<string, Row[]>();
  for (const row of dead) {
    const list = byProgram.get(row.programId) ?? [];
    list.push(row);
    byProgram.set(row.programId, list);
  }

  for (const [programId, list] of [...byProgram].sort()) {
    console.log(`\n${programId}`);
    for (const row of list) {
      const reason = row.courseId === null ? "unparseable" : `no ${row.courseId} in catalog`;
      console.log(`  ${row.tagId.padEnd(30)} ${row.code.padEnd(14)} ${reason}`);
    }
  }

  // Two tags on one screen seeded from one course. See the header: the
  // exemplar is the ONLY thing distinguishing these tags to the recommender,
  // so a shared one makes the pair indistinguishable no matter what the
  // student picks.
  const shared: string[] = [];
  for (const programId of programIds) {
    const owner = new Map<string, string>();
    for (const row of rows.filter((candidate) => candidate.programId === programId)) {
      if (row.courseId === null) continue;
      const first = owner.get(row.courseId);
      if (first !== undefined && first !== row.tagId) {
        shared.push(`  ${programId}: ${first} and ${row.tagId} both seed from ${row.code}`);
        continue;
      }
      owner.set(row.courseId, row.tagId);
    }
  }

  if (shared.length) {
    console.log("\nShared seeds\n" + shared.join("\n"));
  }

  console.log(
    `\n${rows.length - dead.length}/${rows.length} exemplars resolve across ` +
      `${programIds.length} programs.`,
  );

  if (shared.length) {
    console.log(
      "\nTwo tags seeded from one course rank identically forever. Give each " +
        "the course its own field actually teaches.",
    );
  }

  if (dead.length) {
    console.log(
      "\nA dead exemplar seeds an empty vector: the tag renders, the student " +
        "picks it, and it contributes nothing to her feed. Replace each with a " +
        "course the department actually teaches.",
    );
  }

  if (dead.length || shared.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
