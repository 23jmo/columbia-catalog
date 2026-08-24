import { prettyTitle } from "@/components/course/format";

/**
 * Course titles, made fit to sit next to each other in a list.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 *
 * Registrar titles arrive in two different cases and the catalog stores them as
 * they came. In the recommendation strip they land side by side:
 *
 *     THE SCIENCE OF PSYCHOLOGY
 *     Computer Vision I: First Principles
 *
 * Either convention alone reads fine. Together, in one column, they read as a
 * rendering bug — and the all-caps rows shout, which makes the strip feel like
 * a database dump rather than a list of courses.
 *
 * ── Built on the app's existing formatter, not beside it ────────────────────
 *
 * `prettyTitle` in `components/course/format.ts` is the project's course-title
 * formatter and it already does the hard part: it detects that a title is
 * all-caps at all (leaving mixed-case ones strictly alone, which is what keeps
 * "Computer Vision I: First Principles" intact), lowercases, title-cases, and
 * keeps small words small. This module does not reimplement any of that. A
 * second title-caser in the codebase would drift from the first within a term.
 *
 * A `lib/` module importing from `components/` is the direction this repo
 * already goes for exactly this helper — see `lib/data/instructors.ts`, which
 * imports `prettyTitle` from the same place.
 *
 * ── The three repairs ───────────────────────────────────────────────────────
 *
 * `prettyTitle` gets three things wrong on real catalog data, all of them
 * visible in the onboarding strip. It is not this lane's file to change, so the
 * repairs live here as a post-pass and are listed for whoever owns it:
 *
 *   1. Roman numerals above two characters. Its numeral rule is
 *      `word.length <= 2 && /^(ii|iv|vi|ix|xi)$/`, so "CALCULUS II" survives
 *      and "CALCULUS III" becomes "Calculus Iii". Columbia numbers a lot of
 *      sequences past II.
 *   2. Acronyms. "INTRODUCTION TO AI" becomes "Introduction to Ai". Nothing in
 *      an all-caps string distinguishes an acronym from a word, so this cannot
 *      be inferred — it needs a list, and the list is below.
 *   3. Words behind an opening bracket. It capitalises `word.charAt(0)`, which
 *      for "(INTENSIVE)" is the bracket, so the word stays lowercase:
 *      "2ND TERM GEN CHEM (intensive)".
 *
 * Display only. Nothing here is written back — `GuestCourse.title` keeps the
 * registrar's string, which is what the migration sends to `student_courses`.
 */

/**
 * Well-formed Roman numerals only.
 *
 * A naive `/^[IVXLCDM]+$/` would also match ordinary words spelled from those
 * letters — "DID", "MIL", "CIVIC" — and title-casing is not worth turning
 * words into numerals. This is the standard strict form: thousands, then
 * hundreds, then tens, then units, each in order.
 *
 * One real English word survives it: "MIX" (M + IX = 1009). A title whose
 * entire word is "MIX" would be printed as "MIX", which is a shrug rather than
 * a bug, and the alternative — a denylist of English words that happen to be
 * numerals — costs more than it saves.
 */
const ROMAN_NUMERAL = /^(?=[MDCLXVI])M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/;

/**
 * Acronyms that must stay upper-case.
 *
 * Deliberately short and specific to what Columbia actually teaches. An
 * over-broad list starts upper-casing ordinary words: "IT" and "US" are on it
 * because "IT MANAGEMENT" and "US FOREIGN POLICY" are real course titles, but
 * they are also the reason this list is reviewed rather than grown by reflex.
 */
const ACRONYMS = new Set([
  "AI", "API", "CS", "DNA", "EE", "GIS", "GPU", "HIV", "HTML", "IT", "LLM", "ML",
  "NLP", "ODE", "PDE", "RNA", "SQL", "TV", "UI", "UK", "UN", "US", "USA", "UX",
]);

/** The same split `prettyTitle` uses, so token indices line up between the two. */
const TOKENS = /(\s+|[-/])/;

export function displayCourseTitle(title: string): string {
  const pretty = prettyTitle(title);

  /*
   * `prettyTitle` returns its input untouched when the title is not all-caps.
   * That is the signal that there is nothing to repair: a mixed-case title came
   * from the registrar already cased by a human, and second-guessing its
   * acronyms would be the same overreach in the other direction.
   */
  if (pretty === title) return title;

  const original = title.split(TOKENS);

  return pretty
    .split(TOKENS)
    .map((part, index) => {
      const source = original[index];
      if (!source) return part;

      // Letters only: "III" out of "III,", "AI" out of "(AI)".
      const core = source.replace(/[^A-Za-z]/g, "").toUpperCase();

      if (core.length > 1 && (ACRONYMS.has(core) || ROMAN_NUMERAL.test(core))) {
        return part.replace(/[A-Za-z]+/, (letters) => letters.toUpperCase());
      }

      /*
       * Repair 3: a word behind an opening bracket or quote never got its
       * initial capital, because `charAt(0)` was the bracket.
       *
       * Scoped to opening punctuation specifically, NOT to "does not start with
       * a letter". The looser test also catches ordinals — "2ND" — and turns
       * them into "2Nd", which is a worse bug than the one being fixed.
       */
      let repaired = /^[([{"'\u201C\u2018]/.test(part)
        ? part.replace(/[a-z]/, (first) => first.toUpperCase())
        : part;

      /*
       * Repair 4: a clause after a colon inside one token.
       *
       * `prettyTitle` splits on whitespace, hyphen and slash, so a colon with
       * no space after it — which the registrar writes constantly — leaves both
       * halves inside a single token and only the first gets capitalised:
       * "PHYSICS I:MECHANICS/RELATIVITY" came out as "I:mechanics/Relativity",
       * with the slash handled and the colon not.
       */
      repaired = repaired.replace(/([:.])([a-z])/g, (_, mark: string, letter: string) =>
        mark + letter.toUpperCase(),
      );

      return repaired;
    })
    .join("");
}
