/**
 * Which option a student probably took, when a requirement offers a choice.
 *
 * ── The problem this exists to solve ────────────────────────────────────────
 *
 * `namedCoursesOf` marks a course `required` only when a rule leaves no choice
 * — `all_of`, or an `n_of` with exactly one option. That is the correct reading
 * of the rule and it throws away something we know. "Did this senior complete
 * the Data Structures requirement" is close to certain; "was it COMS W3134 or
 * COMS W3137" is the only open question. The data model has one boolean per
 * course and no way to hold a certainty about a GROUP, so the certainty was
 * being discarded to avoid asserting the wrong course.
 *
 * The cost was not limited to the ambiguous course. Because Data Structures was
 * never confirmed, the engine's prerequisite filter withheld everything gated
 * on it — COMS W3157 and COMS W3261, both flatly required by the CS major —
 * and those dropped out of tier 1 too. One coin-flip in the middle of a chain
 * blanked out the whole chain. A student three months from a CS degree was
 * shown a pre-checked list with no intro CS, no data structures, no advanced
 * programming and no theory on it.
 *
 * ── Why a table, and why such a short one ───────────────────────────────────
 *
 * A default is only defensible where one option genuinely dominates. Some of
 * these groups are coin flips — Art Hum versus Music Hum is close to 50/50, and
 * guessing there would be inventing a transcript entry to save a click. So this
 * is an explicit allowlist keyed by the exact option set, not a heuristic like
 * "take the lowest course number". A group that is not listed gets no default
 * and keeps today's behaviour: every option offered, unchecked, in tier 2.
 *
 * Keying on the option SET rather than on a program and group label is what
 * makes one entry cover the CC major, the CC minor and the SEAS major, all
 * three of which spell this requirement the same way. It also means a new
 * program naming the same pair inherits the default without a second entry.
 *
 * ── Being wrong is cheap here, and that is the point ────────────────────────
 *
 * A wrong default puts one course on a screen whose entire job is "remove what
 * we got wrong", with the alternative sitting in the suggestion strip directly
 * below it. That is a two-click correction. The status quo — omitting the
 * requirement and everything downstream of it — is four courses the student has
 * to remember and add by hand, and they will not.
 */

import { toCourseId, type CourseId } from "@/lib/requirements/code";

export interface LikelyChoice {
  /** The option we default to, pre-checked. */
  courseId: CourseId;
  /** The options we passed over. They stay in the deck, unchecked. */
  alternatives: CourseId[];
}

/**
 * The allowlist.
 *
 * Both entries lean on something the program definitions already say out loud.
 * `seas-major-computer-science.ts` annotates the intro group "COMS W1004, or
 * COMS W1007 for students with prior experience" and the data-structures group
 * "COMS W3134, or the honors course COMS W3137" — in both cases the named
 * course is the default route and the alternative is the exception. Both notes
 * go on to record that the honors courses are not in our catalog at all, which
 * is a second, independent reason the standard course is the safer guess: it is
 * the only one of the pair a student can end up matched against.
 */
const MODAL_PICKS: ReadonlyArray<{ options: readonly string[]; pick: string }> = [
  // Introductory Programming.
  { options: ["COMS W1004", "COMS W1007"], pick: "COMS W1004" },
  // Data Structures.
  { options: ["COMS W3134", "COMS W3137"], pick: "COMS W3134" },
];

/** Option sets, normalised to a lookup key so order and spelling cannot matter. */
const BY_OPTION_SET = new Map<string, CourseId>(
  MODAL_PICKS.flatMap(({ options, pick }) => {
    const key = optionSetKey(options.map(toCourseId).filter(isCourseId));
    const courseId = toCourseId(pick);
    return key && courseId ? [[key, courseId] as const] : [];
  }),
);

function isCourseId(id: CourseId | null): id is CourseId {
  return id !== null;
}

function optionSetKey(options: readonly CourseId[]): string | null {
  if (options.length === 0) return null;
  return [...options].sort().join("|");
}

/**
 * The option we default to for a group, or `null` when there is no defensible
 * one — which is the common case and the safe one.
 */
export function likelyChoiceFor(options: readonly CourseId[]): LikelyChoice | null {
  const key = optionSetKey(options);
  if (!key) return null;

  const courseId = BY_OPTION_SET.get(key);
  if (!courseId) return null;

  return {
    courseId,
    alternatives: options.filter((option) => option !== courseId),
  };
}
