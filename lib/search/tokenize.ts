/**
 * Columbia Catalog — tokenization.
 *
 * This module is shared verbatim by the index builder and the query engine.
 * That is not a convenience, it is a correctness requirement: any difference
 * between how a document was tokenized and how the query is tokenized shows up
 * as a term that silently never matches.
 *
 * Rules, in order:
 *
 * 1. Fold — lowercase, strip diacritics, collapse everything that is not
 *    [a-z0-9] into a separator. After folding, terms are pure ASCII
 *    alphanumerics, which is what lets the dictionary be sorted with a plain
 *    string sort and searched with a byte-wise binary search.
 *
 * 2. Split on separators, then split runs that mix letters and digits, so
 *    "coms4118" yields "coms4118", "coms" and "4118". Keeping the fused form
 *    is what makes "coms4118" a single high-signal token; keeping the parts is
 *    what makes "COMS 4118" match the same course.
 *
 * 3. Course codes get a canonical form. Columbia writes the same course as
 *    "COMS W4118", "COMS 4118", "COMSW4118" and "coms4118"; all of them
 *    normalize to the code token `coms4118` (plus `comsw4118` when a qualifier
 *    letter is present), so an exact-code boost fires for every spelling.
 *
 * 4. Character trigrams back typo tolerance. They are built here so the
 *    builder's trigram index and the engine's candidate generation cannot
 *    drift apart.
 *
 * 5. Query-time only: subject aliases ("cs" -> "coms") and academic
 *    abbreviations ("orgo" -> "organic chemistry") expand into OR'd variants
 *    with a weight penalty. Expansion happens at query time rather than build
 *    time so the shipped index stays small and the alias table can change
 *    without regenerating the artifact.
 */

import { packTrigram, trigramSymbol, TRIGRAM_PAD } from "./index-format";

// ---------------------------------------------------------------------------
// Folding
// ---------------------------------------------------------------------------

const DIACRITICS = /[\u0300-\u036f]/g;
const NON_ALNUM = /[^a-z0-9]+/g;

/**
 * Lowercase, strip accents, reduce every other character to a single space.
 * "Señor Álvarez's Intro. to A.I." -> "senor alvarez s intro to a i"
 */
export function foldText(input: string): string {
  return input
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(NON_ALNUM, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

const LETTER_DIGIT_BOUNDARY = /(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/g;

/**
 * Split one folded run into its indexable tokens. A mixed run keeps the fused
 * token AND its letter/digit parts.
 *
 *   "coms4118"  -> ["coms4118", "coms", "4118"]
 *   "operating" -> ["operating"]
 */
export function splitRun(run: string, out: string[]): void {
  if (run.length === 0) return;
  out.push(run);
  if (!/[a-z]/.test(run) || !/[0-9]/.test(run)) return;
  const parts = run.split(LETTER_DIGIT_BOUNDARY);
  if (parts.length < 2) return;
  for (const part of parts) {
    if (part.length > 0) out.push(part);
  }
}

/** Tokenize an already-folded string. */
export function tokenizeFolded(folded: string): string[] {
  const out: string[] = [];
  if (folded.length === 0) return out;
  let start = 0;
  for (let i = 0; i <= folded.length; i++) {
    if (i === folded.length || folded.charCodeAt(i) === 32) {
      if (i > start) splitRun(folded.slice(start, i), out);
      start = i + 1;
    }
  }
  return out;
}

/** Fold and tokenize raw text. The entry point used by the index builder. */
export function tokenize(text: string): string[] {
  return tokenizeFolded(foldText(text));
}

// ---------------------------------------------------------------------------
// Course codes
// ---------------------------------------------------------------------------

export interface CourseCodeHit {
  subject: string;
  qualifier: string | null;
  number: number;
  /** `${subject}${number}` — the token form the index stores. */
  canonical: string;
  /** `${subject}${qualifier}${number}` when a qualifier was written. */
  canonicalWithQualifier: string | null;
}

/**
 * Matches a Columbia course code inside folded text. The optional single
 * letter between subject and number is the school qualifier (W, V, G, C, ...).
 *
 *   coms4118 / coms 4118 / coms w4118 / comsw4118 / coms 4118 w
 */
const CODE_RE = /\b([a-z]{2,4})\s?([a-z])?\s?(\d{3,4})\b\s?([a-z])?\b/g;

/**
 * Extract every course-code-shaped span from a folded string. Deliberately
 * permissive: a false positive costs one extra dictionary probe that misses,
 * while a false negative costs the single most valuable ranking signal we
 * have.
 */
export function detectCourseCodes(folded: string): CourseCodeHit[] {
  const hits: CourseCodeHit[] = [];
  CODE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CODE_RE.exec(folded)) !== null) {
    const subject = match[1];
    // A leading qualifier letter is far more common than a trailing one.
    const qualifier = match[2] ?? match[4] ?? null;
    const number = Number(match[3]);
    if (!Number.isFinite(number)) continue;
    hits.push({
      subject,
      qualifier,
      number,
      canonical: `${subject}${match[3]}`,
      canonicalWithQualifier: qualifier ? `${subject}${qualifier}${match[3]}` : null,
    });
  }
  return hits;
}

/**
 * The code tokens the builder indexes for one course record. Every spelling a
 * student might type has to land on one of these.
 */
export function courseCodeTokens(
  subjectCode: string,
  number: number,
  qualifier: string | null,
): string[] {
  const subject = foldText(subjectCode);
  const digits = String(number);
  const tokens = [subject, digits, `${subject}${digits}`];
  if (qualifier) {
    const q = foldText(qualifier);
    if (q) {
      tokens.push(`${subject}${q}${digits}`, `${subject}${digits}${q}`);
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Aliases and academic abbreviations (query-time expansion)
// ---------------------------------------------------------------------------

/**
 * Colloquial subject names -> the actual Columbia subject code. Students type
 * "cs 4118", the directory says "COMS W4118".
 */
export const SUBJECT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  cs: ["coms"],
  compsci: ["coms"],
  cse: ["coms", "csee"],
  ee: ["elen"],
  ie: ["ieor"],
  or: ["ieor"],
  bme: ["bmen"],
  che: ["cheme"],
  ce: ["civl"],
  me: ["meie"],
  ds: ["stat", "coms"],
  ml: ["coms"],
  ai: ["coms"],
  econ: ["econ"],
  poli: ["poli"],
  polisci: ["poli"],
  psych: ["psyc"],
  bio: ["biol"],
  chem: ["chem"],
  phys: ["phys"],
  math: ["math"],
  stats: ["stat"],
  stat: ["stat"],
  hist: ["hist"],
  phil: ["phil"],
  lit: ["engl", "clit"],
  eng: ["engl"],
  soc: ["soci"],
  anthro: ["anth"],
  astro: ["astr"],
  neuro: ["psyc", "biol"],
};

/**
 * Academic shorthand -> the words that actually appear in titles and
 * descriptions. Multi-word expansions are stored pre-tokenized.
 */
export const ABBREVIATIONS: Readonly<Record<string, readonly string[]>> = {
  ai: ["artificial", "intelligence"],
  ml: ["machine", "learning"],
  dl: ["deep", "learning"],
  nlp: ["natural", "language", "processing"],
  cv: ["computer", "vision"],
  os: ["operating", "systems"],
  db: ["database"],
  dbms: ["database"],
  algo: ["algorithms"],
  algos: ["algorithms"],
  ds: ["data", "structures"],
  dsa: ["data", "structures", "algorithms"],
  se: ["software", "engineering"],
  hci: ["human", "computer", "interaction"],
  pl: ["programming", "languages"],
  orgo: ["organic", "chemistry"],
  ochem: ["organic", "chemistry"],
  pchem: ["physical", "chemistry"],
  biochem: ["biochemistry"],
  diffeq: ["differential", "equations"],
  odes: ["differential", "equations"],
  linalg: ["linear", "algebra"],
  multivar: ["multivariable", "calculus"],
  calc: ["calculus"],
  probstat: ["probability", "statistics"],
  prob: ["probability"],
  stats: ["statistics"],
  micro: ["microeconomics"],
  macro: ["macroeconomics"],
  ir: ["international", "relations"],
  polisci: ["political", "science"],
  psych: ["psychology"],
  anthro: ["anthropology"],
  astro: ["astronomy"],
  neuro: ["neuroscience"],
  bio: ["biology"],
  chem: ["chemistry"],
  phys: ["physics"],
  lit: ["literature"],
  phil: ["philosophy"],
  hist: ["history"],
  intro: ["introduction", "introductory"],
  adv: ["advanced"],
  sem: ["seminar"],
  lab: ["laboratory"],
  ug: ["undergraduate"],
  grad: ["graduate"],
  fys: ["first", "year", "seminar"],
  cc: ["contemporary", "civilization"],
  lithum: ["literature", "humanities"],
  arthum: ["art", "humanities"],
  musichum: ["music", "humanities"],
  uw: ["university", "writing"],
  pe: ["physical", "education"],
};

/**
 * Very common English words that carry almost no discriminative signal in a
 * course catalog. They are still INDEXED (dropping them would break phrase-ish
 * queries like "theory of computation") but they are down-weighted at query
 * time and never trigger fuzzy expansion.
 */
export const LOW_SIGNAL_TERMS: ReadonlySet<string> = new Set([
  "a", "an", "and", "the", "of", "to", "in", "for", "on", "with", "or", "at",
  "by", "from", "as", "is", "are", "be", "this", "that", "it", "its", "will",
  "i", "ii", "iii", "iv",
]);

// ---------------------------------------------------------------------------
// Trigrams
// ---------------------------------------------------------------------------

/** Terms shorter than this get no trigram entries and no fuzzy matching. */
export const MIN_FUZZY_LENGTH = 4;

/**
 * Packed character trigrams for a folded term, padded with '$' at both ends so
 * prefixes and suffixes are represented. "cat" -> "$ca", "cat", "at$".
 *
 * Writes into `out` and returns the count, so the query path can reuse one
 * scratch array instead of allocating per keystroke.
 */
export function trigramsInto(term: string, out: Int32Array): number {
  const n = term.length;
  if (n < 2) return 0;
  let count = 0;
  const symbolAt = (i: number): number => {
    if (i < 0 || i >= n) return TRIGRAM_PAD;
    return trigramSymbol(term.charCodeAt(i));
  };
  for (let i = -1; i <= n - 2 && count < out.length; i++) {
    const a = symbolAt(i);
    const b = symbolAt(i + 1);
    const c = symbolAt(i + 2);
    if (a < 0 || b < 0 || c < 0) continue;
    out[count++] = packTrigram(a, b, c);
  }
  return count;
}

/** Allocating convenience wrapper — build time only. */
export function trigramsOf(term: string): number[] {
  const scratch = new Int32Array(term.length + 2);
  const n = trigramsInto(term, scratch);
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = scratch[i];
  return out;
}

// ---------------------------------------------------------------------------
// Bounded edit distance
// ---------------------------------------------------------------------------

/**
 * Levenshtein distance, abandoned as soon as it provably exceeds `maxDist`.
 * Only ever called on the handful of candidates that trigram overlap already
 * shortlisted — never over the whole dictionary.
 *
 * @returns the distance, or maxDist + 1 when it exceeds the bound.
 */
export function boundedEditDistance(a: string, b: string, maxDist: number): number {
  const alen = a.length;
  const blen = b.length;
  if (Math.abs(alen - blen) > maxDist) return maxDist + 1;
  if (alen === 0) return blen;
  if (blen === 0) return alen;

  // Two rolling rows; both fit comfortably in cache for dictionary terms.
  let prev = editScratchA;
  let curr = editScratchB;
  if (prev.length < blen + 1) {
    prev = editScratchA = new Uint16Array(blen + 1);
    curr = editScratchB = new Uint16Array(blen + 1);
  }
  for (let j = 0; j <= blen; j++) prev[j] = j;

  for (let i = 1; i <= alen; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    let rowMin = curr[0];
    const from = Math.max(1, i - maxDist);
    const to = Math.min(blen, i + maxDist);
    // Cells outside the diagonal band can never beat the bound.
    for (let j = 1; j < from; j++) curr[j] = maxDist + 1;
    for (let j = from; j <= to; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      let v = prev[j - 1] + cost;
      const del = prev[j] + 1;
      if (del < v) v = del;
      const ins = curr[j - 1] + 1;
      if (ins < v) v = ins;
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    for (let j = to + 1; j <= blen; j++) curr[j] = maxDist + 1;
    if (rowMin > maxDist) return maxDist + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  const dist = prev[blen];
  return dist > maxDist ? maxDist + 1 : dist;
}

let editScratchA = new Uint16Array(64);
let editScratchB = new Uint16Array(64);

/** How much misspelling we tolerate, by term length. */
export function fuzzyBudget(termLength: number): number {
  if (termLength < MIN_FUZZY_LENGTH) return 0;
  if (termLength <= 5) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

export interface QueryVariant {
  text: string;
  /** Multiplier applied to this variant's contribution. */
  weight: number;
}

export interface QueryTermGroup {
  /** OR'd alternatives. Index 0 is always the literal token the user typed. */
  variants: QueryVariant[];
  /** True for the trailing token of an unfinished query (as-you-type). */
  allowPrefix: boolean;
  /** True when the token is long enough and distinctive enough to fuzz. */
  allowFuzzy: boolean;
}

export interface ParsedQuery {
  raw: string;
  folded: string;
  groups: QueryTermGroup[];
  /**
   * Canonical code tokens ("coms4118"), including alias-resolved forms
   * ("cs4118" -> "coms4118"). Drive the exact-code boost.
   */
  codeTokens: string[];
  /** True when the query is nothing but whitespace. */
  isEmpty: boolean;
}

const ALIAS_WEIGHT = 0.85;
const ABBREV_WEIGHT = 0.7;

/**
 * Parse a raw query string once per keystroke. Everything downstream (posting
 * walks, prefix ranges, fuzzy candidate generation) reads this structure.
 *
 * @param raw   the user's text.
 * @param opts.completed  set when the caller knows the last word is finished
 *                        (e.g. the user typed a space or picked a suggestion),
 *                        which disables prefix expansion on it.
 */
export function parseQuery(raw: string, opts: { completed?: boolean } = {}): ParsedQuery {
  const folded = foldText(raw);
  if (folded.length === 0) {
    return { raw, folded, groups: [], codeTokens: [], isEmpty: true };
  }

  const endsWithSeparator = /[^A-Za-z0-9]$/.test(raw);
  const lastIsOpen = !opts.completed && !endsWithSeparator;

  // --- course codes -------------------------------------------------------
  const codeTokens: string[] = [];
  const codeSpans = detectCourseCodes(folded);
  for (const hit of codeSpans) {
    pushUnique(codeTokens, hit.canonical);
    if (hit.canonicalWithQualifier) pushUnique(codeTokens, hit.canonicalWithQualifier);
    const aliases = SUBJECT_ALIASES[hit.subject];
    if (aliases) {
      for (const alias of aliases) pushUnique(codeTokens, `${alias}${hit.number}`);
    }
  }

  // --- terms --------------------------------------------------------------
  const rawTokens = tokenizeFolded(folded);
  const groups: QueryTermGroup[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];
    if (seen.has(token)) continue;
    seen.add(token);

    const isLast = i === rawTokens.length - 1;
    const lowSignal = LOW_SIGNAL_TERMS.has(token);
    const variants: QueryVariant[] = [{ text: token, weight: lowSignal ? 0.25 : 1 }];

    const aliases = SUBJECT_ALIASES[token];
    if (aliases) {
      for (const alias of aliases) {
        if (alias !== token) variants.push({ text: alias, weight: ALIAS_WEIGHT });
      }
    }
    const expansion = ABBREVIATIONS[token];
    if (expansion) {
      for (const word of expansion) {
        if (word !== token) variants.push({ text: word, weight: ABBREV_WEIGHT });
      }
    }

    groups.push({
      variants,
      allowPrefix: isLast && lastIsOpen && token.length >= 2,
      allowFuzzy: !lowSignal && token.length >= MIN_FUZZY_LENGTH && !/^\d+$/.test(token),
    });
  }

  return { raw, folded, groups, codeTokens, isEmpty: groups.length === 0 };
}

function pushUnique(arr: string[], value: string): void {
  if (arr.indexOf(value) === -1) arr.push(value);
}
