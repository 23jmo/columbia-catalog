/**
 * Columbia Catalog — catalog-wide prerequisite backfill.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-prereqs.ts status
 *   npx tsx --env-file=.env.local scripts/backfill-prereqs.ts run --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-prereqs.ts run
 *   npx tsx --env-file=.env.local scripts/backfill-prereqs.ts sample --subject=ECON
 *
 * ── What this is ───────────────────────────────────────────────────────────
 *
 * `scripts/build-prereqs.ts` said it plainly: "When the crawler lane starts
 * persisting `prerequisite_formula`, this script becomes the backfill for it."
 * 0032 added the column. This is that backfill.
 *
 * Until now the prerequisite parser — 589 lines of recursive descent, the most
 * carefully built thing in `lib/prereqs/` — had only ever run over ONE
 * checked-in HTML fixture covering 127 COMS/CSEE/CBMF courses. Meanwhile the
 * database holds prerequisite prose for 1,293 courses across 130 subjects,
 * none of it ever parsed.
 *
 * ── A correction to the spec's premise, stated plainly ─────────────────────
 *
 * The spec says `prerequisite_text` is "populated catalog-wide for all 8,189
 * courses". It is not: 1,293 courses have it. That is not a data gap so much as
 * a fact about Columbia — most courses genuinely have no prerequisite, and only
 * 6,258 courses have a description at all. 1,293 is still an order of magnitude
 * more than the fixture, and it covers the departments where prerequisites
 * actually gate a degree (IEOR 83, ECON 73, ELEN 63, BIOL 58, COMS 47).
 *
 * ── Order of operations, which is not arbitrary ────────────────────────────
 *
 * Equivalence extraction runs BEFORE parsing, catalog-wide, for the reason
 * `build-prereqs.ts` documents: reading W4111's prerequisite correctly depends
 * on already knowing W3134/W3136/W3137 are interchangeable, and that fact is
 * published in a DIFFERENT course's description. Running equivalence per
 * subject would lose every cross-listed group.
 *
 * Canonicalisation runs after: the bulletin writes "W3136" where the catalog
 * keys "COMS3136W", and an un-canonicalised reference is a dangling node.
 */

import { createServiceRoleClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/schema";
import {
  buildCanonicalIndex,
  canonicalizeEquivalenceGroups,
  canonicalizeRequirement,
} from "@/lib/prereqs/canonical";
import {
  buildEquivalenceIndex,
  extractEquivalenceGroups,
  mergeEquivalenceGroups,
} from "@/lib/prereqs/equivalence";
import { parsePrerequisiteText } from "@/lib/prereqs/parse";
import { courseIdsIn } from "@/lib/prereqs/parse";
import type {
  EquivalenceGroup,
  PrereqConfidence,
  PrereqRequirement,
} from "@/lib/prereqs/types";

interface CourseRow {
  course_id: string;
  subject_code: string;
  description: string | null;
  prerequisite_text: string | null;
}

/** What lands in `courses.prerequisite_formula`. */
interface StoredFormula {
  tree: PrereqRequirement["tree"];
  corequisites: PrereqRequirement["corequisites"];
  instructorPermission: boolean;
  advisories: string[];
}

interface Args {
  command: "status" | "run" | "sample";
  dryRun: boolean;
  subject: string | null;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const command = argv.find((a) => !a.startsWith("--")) ?? "status";
  if (command !== "status" && command !== "run" && command !== "sample") {
    throw new Error(`Unknown command "${command}". Use status | run | sample.`);
  }
  const subjectArg = argv.find((a) => a.startsWith("--subject="));
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  return {
    command,
    dryRun: argv.includes("--dry-run"),
    subject: subjectArg ? subjectArg.split("=")[1].toUpperCase() : null,
    limit: limitArg ? Number(limitArg.split("=")[1]) : 20,
  };
}

function client() {
  const c = createServiceRoleClient();
  if (!c) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return c;
}

/** Every course, paged — PostgREST caps a single response at 1,000 rows. */
async function loadCourses(): Promise<CourseRow[]> {
  const c = client();
  const rows: CourseRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await c
      .from("courses")
      .select("course_id, subject_code, description, prerequisite_text")
      .order("course_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`loadCourses: ${error.message}`);
    const page = (data ?? []) as unknown as CourseRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/**
 * Build the equivalence index over every description in the catalog.
 *
 * This is the pass that makes "students may receive credit for only one of the
 * following three courses" mean something. It is run over all 6,258 described
 * courses rather than only the 1,293 with prerequisites, because the statement
 * lives in the description of the courses being equated — which frequently have
 * no prerequisites of their own.
 */
function buildEquivalence(courses: CourseRow[]): {
  groups: EquivalenceGroup[];
  index: ReadonlyMap<string, ReadonlySet<string>>;
} {
  const raw: EquivalenceGroup[] = [];
  for (const course of courses) {
    if (!course.description) continue;
    raw.push(...extractEquivalenceGroups(course.description, course.subject_code));
  }

  const canonicalIndex = buildCanonicalIndex(courses.map((c) => c.course_id));
  const merged = mergeEquivalenceGroups(
    canonicalizeEquivalenceGroups(raw, canonicalIndex),
  );
  return { groups: merged, index: buildEquivalenceIndex(merged) };
}

interface ParseOutcome {
  courseId: string;
  requirement: PrereqRequirement;
  /** Course ids the tree references that our catalog does not hold. */
  dangling: string[];
}

function parseAll(
  courses: CourseRow[],
  equivalence: ReadonlyMap<string, ReadonlySet<string>>,
): ParseOutcome[] {
  const canonicalIndex = buildCanonicalIndex(courses.map((c) => c.course_id));
  const known = new Set(courses.map((c) => c.course_id));
  const out: ParseOutcome[] = [];

  for (const course of courses) {
    if (!course.prerequisite_text?.trim()) continue;

    const parsed = parsePrerequisiteText(course.course_id, course.prerequisite_text, {
      defaultSubject: course.subject_code,
      equivalenceOf: (id) => equivalence.get(id),
    });
    if (!parsed) continue;

    /*
     * `canonicalizeRequirement` is null-in/null-out and nothing else — the
     * `!parsed` guard above is what makes this non-null. Asserted rather than
     * branched: a `continue` here would silently drop courses if that function
     * ever grew a second way to fail, and a backfill that quietly skips rows is
     * the kind of bug you find months later by counting.
     */
    const canonical = canonicalizeRequirement(parsed, canonicalIndex);
    if (!canonical) {
      throw new Error(
        `${course.course_id}: canonicalization returned null for a non-null parse — ` +
          `the invariant this script relies on has changed`,
      );
    }

    const referenced = [
      ...courseIdsIn(canonical.tree),
      ...courseIdsIn(canonical.corequisites),
    ];

    out.push({
      courseId: course.course_id,
      requirement: canonical,
      dangling: [...new Set(referenced.filter((id) => !known.has(id)))],
    });
  }

  return out;
}

function toStored(requirement: PrereqRequirement): StoredFormula {
  return {
    tree: requirement.tree,
    corequisites: requirement.corequisites,
    instructorPermission: requirement.instructorPermission,
    advisories: requirement.advisories,
  };
}

function distribution(outcomes: ParseOutcome[]): Record<PrereqConfidence, number> {
  const counts: Record<PrereqConfidence, number> = {
    structured: 0,
    partial: 0,
    prose: 0,
  };
  for (const outcome of outcomes) counts[outcome.requirement.confidence] += 1;
  return counts;
}

function report(outcomes: ParseOutcome[], groups: EquivalenceGroup[]): void {
  const counts = distribution(outcomes);
  const total = outcomes.length;
  const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : "0.0");

  console.log(`\nparsed ${total} courses with prerequisite prose`);
  console.log(`  structured  ${String(counts.structured).padStart(5)}  ${pct(counts.structured)}%  every clause resolved to courses`);
  console.log(`  partial     ${String(counts.partial).padStart(5)}  ${pct(counts.partial)}%  some courses, some prose`);
  console.log(`  prose       ${String(counts.prose).padStart(5)}  ${pct(counts.prose)}%  no course reference at all`);

  const softGates = outcomes.filter((o) => o.requirement.instructorPermission).length;
  console.log(`\n  "or permission of the instructor": ${softGates} (${pct(softGates)}%)`);
  console.log(`  equivalence groups found: ${groups.length}`);

  /*
   * Dangling references are the honest failure signal.
   *
   * A tree naming a course our catalog does not hold is not necessarily a parse
   * error — COMS W3770 really does require MATH UN1201, and a subject we never
   * crawled is a gap in coverage, not in parsing. But a SUDDEN rise means the
   * code splitter broke, so the number is printed every run rather than
   * swallowed.
   */
  const withDangling = outcomes.filter((o) => o.dangling.length > 0);
  const danglingIds = new Set(withDangling.flatMap((o) => o.dangling));
  console.log(`  courses referencing an unknown course: ${withDangling.length} (${pct(withDangling.length)}%)`);
  console.log(`  distinct unknown course ids: ${danglingIds.size}`);
  if (danglingIds.size > 0) {
    console.log(`    e.g. ${[...danglingIds].slice(0, 10).join(", ")}`);
  }
}

async function write(outcomes: ParseOutcome[]): Promise<number> {
  const c = client();
  let written = 0;
  const CHUNK = 100;

  for (let i = 0; i < outcomes.length; i += CHUNK) {
    const slice = outcomes.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (outcome) => {
        const { error } = await c
          .from("courses")
          .update({
            /*
             * The one place a typed value becomes untyped storage. `Json` is a
             * recursive union that no concrete interface is assignable to, so
             * the cast is structural, not a claim about correctness — the shape
             * is pinned by `StoredFormula` on the way in and re-narrowed on the
             * way out.
             */
            prerequisite_formula: toStored(outcome.requirement) as unknown as Json,
            prerequisite_confidence: outcome.requirement.confidence,
          })
          .eq("course_id", outcome.courseId);
        if (error) throw new Error(`write ${outcome.courseId}: ${error.message}`);
        written += 1;
      }),
    );
    process.stdout.write(`\r  writing … ${Math.min(i + CHUNK, outcomes.length)}/${outcomes.length}`);
  }
  process.stdout.write("\n");
  return written;
}

async function status(): Promise<void> {
  const c = client();
  const { count: total } = await c
    .from("courses")
    .select("course_id", { count: "exact", head: true });
  const { count: withText } = await c
    .from("courses")
    .select("course_id", { count: "exact", head: true })
    .not("prerequisite_text", "is", null);
  const { count: withFormula } = await c
    .from("courses")
    .select("course_id", { count: "exact", head: true })
    .not("prerequisite_formula", "is", null);

  console.log(`courses:               ${total ?? 0}`);
  console.log(`  with prereq prose:   ${withText ?? 0}`);
  console.log(`  with parsed formula: ${withFormula ?? 0}`);

  for (const tier of ["structured", "partial", "prose"] as const) {
    const { count } = await c
      .from("courses")
      .select("course_id", { count: "exact", head: true })
      .eq("prerequisite_confidence", tier);
    console.log(`    ${tier.padEnd(12)} ${count ?? 0}`);
  }
}

/**
 * Print parses for one subject so a human can grade them.
 *
 * This exists because "90 tests, all against the same fixture" is exactly the
 * shape of evidence that hides a systematic error. Precision on a second
 * department cannot be asserted from a keyboard — someone has to read the prose
 * next to the tree. This prints them side by side.
 */
async function sample(args: Args): Promise<void> {
  const courses = await loadCourses();
  const { index } = buildEquivalence(courses);
  const scoped = args.subject
    ? courses.filter((c) => c.subject_code === args.subject)
    : courses;
  const outcomes = parseAll(scoped, index).slice(0, args.limit);

  for (const outcome of outcomes) {
    const source = scoped.find((c) => c.course_id === outcome.courseId);
    console.log(`\n── ${outcome.courseId}  [${outcome.requirement.confidence}]`);
    console.log(`   prose: ${source?.prerequisite_text?.slice(0, 220)}`);
    console.log(`   tree:  ${JSON.stringify(outcome.requirement.tree)}`);
    if (outcome.requirement.corequisites) {
      console.log(`   coreq: ${JSON.stringify(outcome.requirement.corequisites)}`);
    }
    if (outcome.requirement.instructorPermission) console.log(`   soft:  instructor permission`);
    if (outcome.requirement.advisories.length > 0) {
      console.log(`   advis: ${outcome.requirement.advisories.join(" | ")}`);
    }
    if (outcome.dangling.length > 0) {
      console.log(`   ⚠ unknown: ${outcome.dangling.join(", ")}`);
    }
  }
  console.log(`\n${outcomes.length} shown.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "status") return status();
  if (args.command === "sample") return sample(args);

  console.log("loading catalog …");
  const courses = await loadCourses();
  console.log(`  ${courses.length} courses`);

  console.log("extracting equivalence groups (catalog-wide) …");
  const { groups, index } = buildEquivalence(courses);

  console.log("parsing prerequisites …");
  const scoped = args.subject
    ? courses.filter((c) => c.subject_code === args.subject)
    : courses;
  const outcomes = parseAll(scoped, index);

  report(outcomes, groups);

  if (args.dryRun) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  const written = await write(outcomes);
  console.log(`\nwrote ${written} formulas`);

  const { notifyPrereqGraphStale } = await import("@/lib/recommend/pipeline");
  await notifyPrereqGraphStale();

  await status();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
