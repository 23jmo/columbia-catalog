/**
 * The grounding post-check.
 *
 * The spec's rule is one sentence: *the agent may state only facts returned by
 * a tool call, and no recalled knowledge about Columbia courses, ever.* The
 * system prompt asks for that. This file is what makes it true.
 *
 * ── Why a prompt is not enough ─────────────────────────────────────────────
 *
 * A model that has read the internet knows that COMS W4111 is Databases. That
 * is the problem, not the solution. Columbia renumbers courses, retires them,
 * moves them between schools, and changes what counts for what — and a model
 * recalling a 2023 catalog will state a 2023 fact in a confident present tense.
 * A student cannot tell that sentence apart from one the database produced, and
 * the entire premise of this product is that they should not have to.
 *
 * So every course code the model prints is checked against the codes the tools
 * actually returned this turn. Not "most". Every one.
 *
 * ── The check fails closed, and that is a real cost ────────────────────────
 *
 * A regex over prose cannot perfectly tell a citation from a coincidence. If it
 * over-matches, a good answer is held back. That direction was chosen on
 * purpose: an answer withheld is a moment of friction, and an invented
 * prerequisite is a student in the wrong classroom in September. The mitigation
 * is a tight pattern, not a lenient one — see `COURSE_CODE_PATTERN`.
 */

import { toCourseId, type CourseId } from "@/lib/requirements/code";

/**
 * A printed Columbia course code, in either of the two forms that appear in
 * practice: `COMS W4111` (Bulletin, with the school qualifier) and `COMS 4111`
 * (colloquial, qualifier dropped).
 *
 * Deliberately strict about the pieces:
 *
 *   - **3–4 uppercase letters** for the subject. Two would match `CC 1101`-ish
 *     fragments and, worse, ordinary prose; five would match nothing real.
 *   - **at most 2 qualifier letters**, uppercase, optional.
 *   - **exactly 4 digits**, bounded by `\b` on the right so a call number or a
 *     dollar figure cannot slip in.
 *
 * The separator class includes U+00A0. Columbia's own Bulletin separates the
 * subject from the number with a non-breaking space, that text reaches the model
 * through `prerequisiteText`, and a model asked to quote it will quote the NBSP
 * along with it. A `\s` here would silently miss exactly the codes most likely
 * to have been copied from source rather than recalled — the opposite of what
 * this check is for.
 */
const COURSE_CODE_PATTERN = /\b([A-Z]{3,4})[  ]{0,2}([A-Z]{1,2})?[  ]?(\d{4})\b/g;

/**
 * Every course code the model's prose appears to cite, normalized.
 *
 * Returns catalog ids rather than the printed strings so that `COMS W4111`,
 * `COMS 4111` and `coms w4111` collapse to one thing before comparison. Without
 * that, the check would flag a correctly-cited course as ungrounded purely
 * because the model dropped the qualifier — which is the single most common way
 * a person writes a Columbia course code out loud.
 */
export function extractCitedCourseCodes(prose: string): CourseId[] {
  const cited = new Set<CourseId>();

  for (const match of prose.matchAll(COURSE_CODE_PATTERN)) {
    const [, subject, qualifier, number] = match;
    const courseId = toCourseId(`${subject} ${qualifier ?? ""}${number}`);
    if (courseId) cited.add(courseId);
  }

  return [...cited];
}

/**
 * The set of course ids a turn's tool calls actually returned.
 *
 * Takes raw serialized tool output rather than parsed objects on purpose. The
 * tools in `lib/mcp/tools.ts` emit JSON as text and their payload shapes differ
 * — `search_courses` nests courses under `courses`, `get_sections` under
 * `sections`, `recommend_courses` under `recommendations`. Walking each shape
 * would mean this file knowing every tool's schema and being wrong the first
 * time one changes.
 *
 * Scanning the text with the same pattern used on the prose is both simpler and
 * strictly safer in the direction that matters: it can only ever make the
 * grounded set LARGER than a precise parse would, and a code that appears
 * anywhere in a tool's output — in a title, a prerequisite sentence, a
 * requirement label — genuinely did come from the database. That is the whole
 * claim being checked.
 */
export function groundedCourseCodes(toolOutputs: readonly string[]): Set<CourseId> {
  const grounded = new Set<CourseId>();

  for (const output of toolOutputs) {
    for (const courseId of extractCitedCourseCodes(output)) grounded.add(courseId);
    /*
     * Also accept ids in their stored form. Tool payloads carry `courseId`
     * fields like "COMS4111W" — already canonical, and NOT matched by
     * COURSE_CODE_PATTERN, which is written for printed codes where the
     * qualifier precedes the number. Missing these would mark a course
     * ungrounded on the strength of its own primary key not looking like a
     * citation.
     */
    for (const match of output.matchAll(/\b([A-Z]{3,4}\d{4}[A-Z]{0,2})\b/g)) {
      grounded.add(match[1]);
    }
  }

  return grounded;
}

/**
 * Subject and number, with the qualifier dropped.
 *
 * The qualifier is how the comparison would otherwise go wrong in both
 * directions, so it is dropped from both sides on purpose:
 *
 *   - Students and models write `COMS 3134` constantly. Comparing that against
 *     the catalog's `COMS3134W` as strings would flag the single most common
 *     CORRECT way to cite a Columbia course as an invention.
 *   - The same course is genuinely listed under two qualifiers when two schools
 *     offer it. Measured against the live catalog (2026-08-24): 82 of 8,103
 *     subject-number stems carry more than one qualifier — 1.01% — and reading
 *     them shows what they are. `COCI1101` is `CC` and `GS`; `CSOR4231` is `E`
 *     and `W`; `AHIS3002` is `BC` and `UN`. These are one course listed twice,
 *     not two courses that collide.
 *
 * So the qualifier carries school-of-origin, not course identity, and matching
 * on it would reject true citations to protect against a case the data does not
 * contain. The residual risk is that some future pair of genuinely distinct
 * courses shares a stem and one grounds the other; the cost of that is one
 * course code accepted that should have been questioned, against the certainty
 * of rejecting real citations if the qualifier were required.
 */
function courseStem(courseId: string): string {
  return courseId.replace(/[A-Z]{1,2}$/, "");
}

/**
 * Collapse ids that name the same course, keeping the most informative spelling.
 *
 * The qualified form wins because these strings end up in a refusal message the
 * student reads, and "I couldn't verify COMS W4995" tells them more about where
 * to look than "COMS4995" does.
 */
function dedupeByStem(courseIds: readonly CourseId[]): CourseId[] {
  const best = new Map<string, CourseId>();
  for (const courseId of courseIds) {
    const stem = courseStem(courseId);
    const existing = best.get(stem);
    if (!existing || courseId.length > existing.length) best.set(stem, courseId);
  }
  return [...best.values()];
}

export interface GroundingVerdict {
  grounded: boolean;
  /** Cited by the model, returned by no tool. Empty when `grounded`. */
  ungrounded: CourseId[];
}

/**
 * Check one assistant turn against the tools it ran.
 *
 * A turn with no citations is grounded — saying "I could not find anything
 * matching that" is a legitimate answer and cites nothing. A turn that ran no
 * tools and cites a course is the exact failure this exists to catch, and falls
 * out of the set arithmetic without a special case.
 */
export function checkGrounding(prose: string, toolOutputs: readonly string[]): GroundingVerdict {
  const grounded = new Set([...groundedCourseCodes(toolOutputs)].map(courseStem));
  const ungrounded = dedupeByStem(
    extractCitedCourseCodes(prose).filter((courseId) => !grounded.has(courseStem(courseId))),
  );
  return { grounded: ungrounded.length === 0, ungrounded };
}
