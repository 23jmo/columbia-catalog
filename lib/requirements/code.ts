/**
 * The bridge between how the Bulletin writes a course code and how we key one.
 *
 * These are the same course:
 *
 *   Bulletin (CourseLeaf)     "MATH UN1201"    subject, space, qualifier+number
 *   Directory / our courseId  "MATH1201UN"     subject, number, qualifier
 *
 * Every requirement definition in this module is authored in the Bulletin's
 * spelling, because that is what a human reading the Bulletin can check the
 * file against. Nothing downstream ever sees that spelling: `toCourseId` is
 * called at the module boundary and the rest of the audit works in `courseId`.
 *
 * THREE TRAPS, all of them things that have already bitten this repo once:
 *
 * 1. **Qualifiers are 1–3 characters, not one letter.** `MATH UN1201`,
 *    `COMS W3157`, `HUMA CC1001`, `ECON BC3033` all occur. Migration 0011
 *    widened the column for exactly this reason after a single `COMSBC3997`
 *    row aborted an entire subject's ingest.
 *
 * 2. **Subject codes are padded with trailing underscores to four characters.**
 *    The directory serves `/subj/PE__/` and `/subj/LAW_/`, and
 *    `subject-index.ts` keeps the padding verbatim so the code can be turned
 *    back into a fetchable URL. The Bulletin never pads. So `PE UN1001` has to
 *    become `PE__1001UN`, and a comparison that skips this silently loses
 *    Physical Education — which happens to be a Core requirement.
 *
 * 3. **The ampersand form.** The Core table writes a two-course sequence as a
 *    single cell: `HUMA CC1001&#38; HUMA CC1002`. That is two courses, and a
 *    parser that treats the cell as one code produces a course that does not
 *    exist and a requirement that can never be satisfied.
 */

/** A course code as the Bulletin prints it, e.g. `"MATH UN1201"`. */
export type BulletinCode = string;

/** A course code as we key it, e.g. `"MATH1201UN"`. Matches `Course.courseId`. */
export type CourseId = string;

/** Subject codes shorter than this are padded with `_` to reach it. */
const SUBJECT_PAD_WIDTH = 4;

/**
 * Pad a subject code the way the directory does: trailing underscores out to
 * four characters. `COMS` is unchanged, `LAW` becomes `LAW_`, `PE` becomes
 * `PE__`. Codes longer than four (`CSEE`, `IEORE`) are left alone.
 */
export function padSubjectCode(subject: string): string {
  const upper = subject.toUpperCase().replace(/[^A-Z_]/g, "");
  if (upper.length >= SUBJECT_PAD_WIDTH) return upper;
  return upper.padEnd(SUBJECT_PAD_WIDTH, "_");
}

/** Strip the directory's padding back off for display: `PE__` reads as `PE`. */
export function unpadSubjectCode(subject: string): string {
  return subject.replace(/_+$/, "");
}

/**
 * The school/level qualifiers Columbia actually issues.
 *
 * This list is not decoration — it is the only way to split an *unspaced* code
 * correctly. `MATHUN1201` is genuinely ambiguous to a regex: greedy matching
 * reads it as subject `MATHU` + qualifier `N`, which is a course that does not
 * exist. Knowing that `UN` is a qualifier and `N` following `MATHU` is not
 * resolves it. Longest-first so `UN` wins over `N`.
 *
 * Sourced from the Fall 2026 qualifier census recorded in migration 0011:
 * UN, N, BC, A, GR, GU, B, PS, CC, GS — plus the older single letters
 * (W, V, E, C, D, F, K, X, Y) still present on archived terms and in the Bulletin's
 * own prose, which lags the registrar by years. `X` is Barnard's.
 */
const KNOWN_QUALIFIERS = [
  "UN", "GR", "GU", "BC", "CC", "GS", "PS", "PH", "OT",
  "A", "B", "C", "D", "E", "F", "G", "K", "N", "V", "W", "X", "Y",
].sort((a, b) => b.length - a.length);

const KNOWN_QUALIFIER_SET = new Set(KNOWN_QUALIFIERS);

export interface ParsedCode {
  /** Padded, directory-shaped: `"MATH"`, `"PE__"`. */
  subjectCode: string;
  number: number;
  /** `"UN"`, `"W"`, `"CC"` — or `null` on the rare unqualified code. */
  qualifier: string | null;
  /** The `courseId` these three compose to. */
  courseId: CourseId;
}

/**
 * Split one Bulletin-shaped code into parts.
 *
 * Accepts every spelling seen in the wild, because the Bulletin is not
 * self-consistent across departments:
 *
 *   "MATH UN1201"   canonical
 *   "MATH  UN1201"  double space
 *   "MATHUN1201"    no space (some inline links)
 *   "MATH UN 1201"  space before the number
 *   "COMS W3157"    single-letter qualifier
 *   "COMS4115W"     directory / Vergil unofficial-record form
 *   "ECON 3213"     no qualifier at all
 *
 * Returns `null` rather than guessing when the string is not a course code —
 * requirement tables carry plenty of prose in the code column.
 */
export function parseBulletinCode(raw: string): ParsedCode | null {
  const text = raw
    .normalize("NFKC")
    .toUpperCase()
    // The Bulletin is riddled with non-breaking and narrow spaces.
    // Fold every run of whitespace to one plain space so the patterns
    // below can be read literally.
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Spaced form. The space does the splitting, so the qualifier can be read
  // straight off: "MATH UN1201", "COMS W3157", "ECON 3213", "MATH UN 1201".
  const spaced = /^([A-Z]{2,6}) ([A-Z]{1,3})? ?(\d{4})([A-Z]{0,3})$/.exec(text);
  if (spaced) {
    const [, subject, qualifier, digits, trailing] = spaced;
    return build(subject, digits, qualifier || trailing || null);
  }

  // Directory form: subject + number + qualifier. Vergil prints this
  // (`COMS4115W`). The Bulletin form puts the qualifier *before* the digits
  // (`COMSW3157`); digits in the middle are what make this unambiguous.
  const directory = /^([A-Z]{2,6})(\d{4})([A-Z]{1,3})$/.exec(text);
  if (directory && KNOWN_QUALIFIER_SET.has(directory[3])) {
    return build(directory[1], directory[2], directory[3]);
  }

  // Unspaced form, e.g. "MATHUN1201" from a stripped inline link.
  const unspaced = /^([A-Z]{2,9})(\d{4})$/.exec(text);
  if (!unspaced) return null;
  const [, letters, digits] = unspaced;

  /*
   * A regex alone CANNOT split this. `^([A-Z]{2,6})([A-Z]{1,3})(\d{4})$`
   * reads "MATHUN1201" as subject `MATHU` + qualifier `N`, because greedy
   * matching hands the subject every letter it can and the qualifier only
   * needs one. That is a course that has never existed.
   *
   * So the split is driven by the known qualifier set — but only past a length
   * floor, which is the part that is easy to get wrong. "ECON3213" is a real
   * unqualified code, and `ECON` ends in `N`, so a rule that always strips a
   * known qualifier turns it into `ECO N3213` — also a course that has never
   * existed. Five letters is the floor because every real subject+qualifier
   * pair clears it (COMS+W, APMA+E, MATH+UN, HUMA+CC) and no bare four-letter
   * subject does.
   */
  if (letters.length >= 5) {
    for (const qualifier of KNOWN_QUALIFIERS) {
      if (!letters.endsWith(qualifier)) continue;
      const subject = letters.slice(0, letters.length - qualifier.length);
      if (subject.length < 2 || subject.length > 6) continue;
      return build(subject, digits, qualifier);
    }
  }

  if (letters.length <= 6) return build(letters, digits, null);
  return null;
}

function build(subject: string, digits: string, qualifier: string | null): ParsedCode {
  const subjectCode = padSubjectCode(subject);
  const number = Number(digits);
  const qual = qualifier && qualifier.length > 0 ? qualifier : null;
  return {
    subjectCode,
    number,
    qualifier: qual,
    courseId: `${subjectCode}${number}${qual ?? ""}`,
  };
}

/** `"MATH UN1201"` → `"MATH1201UN"`. `null` when the input is not a code. */
export function toCourseId(raw: string): CourseId | null {
  return parseBulletinCode(raw)?.courseId ?? null;
}

/**
 * Split a Bulletin cell that packs a course *sequence* into one string.
 *
 * The Core table's Literature Humanities row is literally
 * `HUMA CC1001&amp; HUMA CC1002`, and Contemporary Civilization is the same
 * shape. Both halves are required, so the caller gets an array and decides.
 */
export function splitCodeSequence(raw: string): BulletinCode[] {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/＆/g, "&") // full-width ampersand, used on some pages
    .split(/\s*&\s*|\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Render a `courseId` back the way a student reads it: `"MATH1201UN"` →
 * `"MATH UN1201"`. Used everywhere the audit shows a course we only know by id.
 */
export function formatCourseId(courseId: CourseId): string {
  const match = /^([A-Z]{2,6}_*)(\d{4})([A-Z]{0,3})$/.exec(courseId.toUpperCase());
  if (!match) return courseId;
  const [, subject, digits, qualifier] = match;
  const readable = unpadSubjectCode(subject);
  return qualifier ? `${readable} ${qualifier}${digits}` : `${readable} ${digits}`;
}

/** The 1000/2000/…/9000 band a course sits in. Used by level-range rules. */
export function levelOf(courseId: CourseId): number | null {
  const match = /(\d{4})/.exec(courseId);
  if (!match) return null;
  return Math.floor(Number(match[1]) / 1000) * 1000;
}

/* ==========================================================================
 * Retired school letters
 * ========================================================================== */

/**
 * What each retired school letter became.
 *
 * ── Why this table has to exist ────────────────────────────────────────────
 *
 * Columbia's old course numbers carried a single letter naming the SCHOOL that
 * issued the course, not its level. The registrar's own "Key to Columbia Course
 * Listings" spells them out: `C` Columbia College, `V` interschool course with
 * Barnard, `W` interfaculty, `X` Barnard College, `F` General Studies, `G`
 * GSAS, `E` Engineering. Those were replaced by the two-letter level codes
 * (`UN`, `GU`, `GR`) plus the school codes (`CC`, `BC`, `GS`) still in use.
 *
 * A transcript does not get reissued when the registrar renumbers. A junior's
 * record legitimately says `MATH V2010`, and the catalog legitimately says
 * `MATH UN2010`, and `build()` composes the qualifier straight into the
 * `courseId` — so `MATH2010V` and `MATH2010UN` are different keys for one
 * course. Every consumer that looks a record up by id therefore reports real
 * Columbia coursework as unknown: verified on 2026-08-27 against the live
 * catalog, where `V`, `X`, `C` and `F` have ZERO rows and their courses are all
 * filed under `UN`, `BC`, `CC` and `GS`.
 *
 * ── Why a preference order rather than a single successor ──────────────────
 *
 * One old code can land on more than one modern row, and the letter is what
 * disambiguates. `PSYC X1001` and `PSYC UN1001` are different courses at
 * different colleges — `X` says Barnard, so `PSYC BC1001` is the right answer
 * and `PSYC UN1001` is the wrong one. `ENGL C1010` is University Writing, which
 * exists as both `ENGL CC1010` and `ENGL GS1010`; `C` says Columbia College.
 *
 * ── What is deliberately NOT in here ───────────────────────────────────────
 *
 * `W`, `E` and `G` are missing on purpose. All three are still live in the
 * catalog — 72, 740 and 119 rows respectively — so they are not retired and
 * must never be rewritten. Exact-id matching runs first and unconditionally, so
 * a live `COMS W4901` resolves to itself and never reaches this table.
 */
export const LEGACY_QUALIFIER_SUCCESSORS: Readonly<Record<string, readonly string[]>> = {
  C: ["CC", "UN"],
  V: ["UN", "CC"],
  X: ["BC"],
  F: ["GS"],
};

/**
 * The order to prefer modern qualifiers in when the old code gives no steer.
 *
 * Undergraduate first, because every caller of this is reading a student's
 * transcript rather than a graduate bulletin.
 */
export const DEFAULT_QUALIFIER_PREFERENCE: readonly string[] = [
  "UN",
  "CC",
  "GU",
  "BC",
  "GS",
  "GR",
];

/**
 * Rank the modern qualifiers for a code that carried `legacy`.
 *
 * The legacy letter's own successors come first — that is the whole point of
 * keeping the letter — then the general order, so a subject that renumbered
 * somewhere unexpected still resolves rather than failing closed.
 */
export function qualifierPreference(legacy: string | null): readonly string[] {
  const named = legacy ? (LEGACY_QUALIFIER_SUCCESSORS[legacy] ?? []) : [];
  const rest = DEFAULT_QUALIFIER_PREFERENCE.filter((q) => !named.includes(q));
  return [...named, ...rest];
}

/**
 * True when `qualifier` is a school letter the registrar has retired.
 *
 * Callers use this to decide whether a miss is worth a second query. A miss on
 * a live qualifier is a course we do not have; a miss on a retired one is
 * probably a renumbering.
 */
export function isRetiredQualifier(qualifier: string | null): boolean {
  return qualifier != null && qualifier in LEGACY_QUALIFIER_SUCCESSORS;
}
