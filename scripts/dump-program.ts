/**
 * Print every requirement a student of one or more programs faces, from OUR
 * data rather than from the Bulletin.
 *
 *   npx tsx --env-file=.env.local scripts/dump-program.ts seas-core seas-major-computer-science
 *   npx tsx --env-file=.env.local scripts/dump-program.ts --list
 *
 * Written while chasing a report that "the requirements look minimal". They
 * were: the SEAS computer science degree was missing its entire science block,
 * because `seas-core` carries only the nontechnical Core and the department
 * file had never picked up the rest. That was invisible from the source files —
 * every one of them looks complete on its own — and obvious the moment the two
 * a student actually sees were printed side by side. Hence this script.
 *
 * It resolves every named course against the live catalog, so the last section
 * of the output is the list of courses a program requires that we cannot match:
 * the difference between "you have not taken this" and "we cannot tell".
 */

import { createClient } from "@supabase/supabase-js";
import { AUTHORED_PROGRAMS } from "../lib/requirements/programs";
import { compileSelector } from "../lib/requirements/selector";
import { createSupabaseCandidateProviderWithIncludes } from "../lib/db/candidate-source";
import type { Program, RequirementGroup } from "../lib/requirements/types";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const norm = (printed: string) => {
  const m = printed.trim().match(/^([A-Z]+)\s+([A-Z]{1,2})?(\d{4})$/);
  return m ? `${m[1]}${m[3]}${m[2] ?? ""}` : printed.replace(/\s+/g, "");
};

async function titles(codes: string[]) {
  const ids = [...new Set(codes.map(norm))];
  const out = new Map<string, { title: string; points: number | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("courses")
      .select("course_id,title,points_min")
      .in("course_id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) out.set(row.course_id, { title: row.title, points: row.points_min });
  }
  return out;
}

function named(group: RequirementGroup): string[] {
  const r = group.rule;
  if (r.kind === "all_of") return r.courses;
  if (r.kind === "n_of") return r.courses;
  if (r.kind === "sequence_choice") return r.sequences.flatMap((s) => s.courses);
  return [];
}

const provider = createSupabaseCandidateProviderWithIncludes({ terms: ["20263", "20271"] });

async function render(program: Program, lookup: Map<string, { title: string; points: number | null }>) {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`${program.school} — ${program.name}  (${program.kind}, ${program.edition})`);
  console.log(`${program.sourceUrl}`);
  console.log("=".repeat(78));

  for (const [i, g] of program.groups.entries()) {
    const r = g.rule;
    let head = "";
    if (r.kind === "all_of") head = `ALL ${r.courses.length}`;
    else if (r.kind === "n_of") head = `CHOOSE ${r.n} of ${r.courses.length}`;
    else if (r.kind === "sequence_choice") head = `ONE SEQUENCE of ${r.sequences.length}`;
    else if (r.kind === "n_matching") head = `${r.n} COURSES matching`;
    else if (r.kind === "points_matching") head = `${r.points} POINTS matching`;
    else head = `SELF-ATTESTED`;

    console.log(`\n${String(i + 1).padStart(2)}. ${g.label}  —  ${head}`);
    if (g.note) console.log(`    note: ${g.note}`);

    if (r.kind === "sequence_choice") {
      for (const s of r.sequences) {
        console.log(`    ${s.label}:`);
        for (const c of s.courses) {
          const f = lookup.get(norm(c));
          console.log(`      ${c.padEnd(12)} ${f?.title ?? "(not in catalog)"}${f?.points != null ? `  [${f.points} pt]` : ""}`);
        }
      }
    } else if (r.kind === "all_of" || r.kind === "n_of") {
      for (const c of r.courses) {
        const f = lookup.get(norm(c));
        console.log(`      ${c.padEnd(12)} ${f?.title ?? "(NOT IN CATALOG)"}${f?.points != null ? `  [${f.points} pt]` : ""}`);
      }
    } else if (r.kind === "n_matching" || r.kind === "points_matching") {
      const sel = r.select;
      const bits: string[] = [];
      if (sel.subjects) bits.push(`subjects ${sel.subjects.join("/")}`);
      if (sel.numberRange) bits.push(`numbers ${sel.numberRange[0]}–${sel.numberRange[1]}`);
      if (sel.flag) bits.push(`flag "${sel.flag}"`);
      if (sel.include) bits.push(`+${sel.include.length} explicit`);
      if (sel.exclude) bits.push(`−${sel.exclude.length} excluded`);
      if (sel.excludeGroups) bits.push(`minus what [${sel.excludeGroups.join(", ")}] consumed`);
      console.log(`      selector: ${bits.join("; ")}`);
      try {
        const cands = await provider({
          select: compileSelector(sel),
          exclude: new Set(),
          limit: 500,
        });
        console.log(`      → ${cands.length} courses currently offered match this`);
        for (const c of cands.slice(0, 6)) console.log(`         e.g. ${c.code ?? c.courseId} ${c.title ?? ""}`);
        if (cands.length > 6) console.log(`         … and ${cands.length - 6} more`);
      } catch (e) {
        console.log(`      → candidate expansion failed: ${(e as Error).message}`);
      }
    } else if (r.kind === "attested") {
      console.log(`      ${r.note}`);
    }
  }
}

async function main() {

    const requested = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (process.argv.includes("--list") || requested.length === 0) {
    console.log("Programs:\n" + AUTHORED_PROGRAMS.map((p) => `  ${p.id.padEnd(38)} ${p.school} ${p.name}`).join("\n"));
    if (requested.length === 0) return;
  }
  const wanted = requested;
  const programs = wanted.map((id) => {
    const found = AUTHORED_PROGRAMS.find((p) => p.id === id);
    if (!found) throw new Error(`No such program: ${id}. Run with --list.`);
    return found;
  });

  const allCodes = programs.flatMap((p) => p.groups.flatMap(named));
  const lookup = await titles(allCodes);
  for (const p of programs) await render(p, lookup);

  const missing = [...new Set(allCodes.map(norm))].filter((id) => !lookup.has(id));
  console.log(`\n\nCOURSES NAMED BY THESE PROGRAMS THAT ARE NOT IN OUR CATALOG (${missing.length}):`);
  console.log(missing.join(", ") || "(none)");

}

main();
