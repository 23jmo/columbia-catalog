/**
 * Free-text prerequisite → boolean expression.
 *
 * Everything here was written against the real prose in
 * `lib/ingest/__fixtures__/bulletin-cs.html`. Read this before changing a
 * regex — the shapes below are not hypothetical, they are what Columbia
 * actually publishes, and each rule exists because of a specific string.
 *
 * ── The four shapes that matter ─────────────────────────────────────────────
 *
 * 1. CANONICAL EXPRESSION FOLLOWED BY A RESTATEMENT. The bulletin prints the
 *    machine-readable form and then says the same thing again in prose:
 *
 *      "( COMS W3134 ) or ( COMS W3137 )  COMS W3134 OR COMS W3137"
 *       └──────── expression ────────┘   └───── restatement ─────┘
 *
 *    The two halves are separated by nothing at all. What ends the expression
 *    is JUXTAPOSITION: two terms adjacent with no connector between them. That
 *    single rule — see `parseSequence` — is what keeps the restatement from
 *    being folded in as extra requirements.
 *
 * 2. A TRAILING PROSE CLAUSE, usually after a semicolon:
 *
 *      "( COMS W1004 ) or COMS W1004 ; Knowledge of Java"
 *
 *    "Knowledge of Java" is a real gate that no transcript can prove. It is
 *    kept as an `advisory` node — visible, never evaluated. See `types.ts`.
 *
 * 3. AN ESCAPE HATCH: "or the instructor's permission", "or permission of
 *    instructor". Present on a large minority of courses. It does not change
 *    the requirement, it changes its *force*, so it is lifted out of the tree
 *    onto `instructorPermission` and every gate below becomes soft.
 *
 * 4. PURE PROSE, with no course reference at all:
 *
 *      "Approval by a faculty member who agrees to supervise the work"
 *
 *    Confidence `prose`. The planner shows it and asks the student.
 *
 * ── Why commas mean OR ──────────────────────────────────────────────────────
 *
 * Every comma-separated course list in the fixture is an alternation, and most
 * end in an explicit "or": "COMS W3136, COMS W3157, or COMS W3101". None is a
 * conjunction. Commas therefore bind as OR. `and` and `or` keep conventional
 * precedence otherwise, with `and` binding tighter.
 */

import { buildCourseId, cleanText, parseCourseNumber } from "../ingest/parsers/shared";
import type { PrereqConfidence, PrereqNode, PrereqRequirement } from "./types";

// ---------------------------------------------------------------------------
// Course codes
// ---------------------------------------------------------------------------

/**
 * "COMS W3134", "MATH UN2010", "APMA E2101", "COMS 3160BC" — a subject code
 * followed by a number that may carry a letter qualifier on either side.
 *
 * Columbia numbers are always four digits here. Anchoring on that is what
 * stops "Lect: 3" and points figures from being read as courses.
 */
const QUALIFIED_COURSE = /^([A-Z]{2,5})\s+([A-Z]{1,3})?(\d{4})([A-Z]{1,3})?\b/;

/**
 * A bare number or half-code — "W3136", "1004" — which the bulletin uses once
 * it has already named the subject in the same sentence. Resolved against the
 * subject of the course being parsed, never against a global default.
 */
const BARE_COURSE = /^([A-Z]{1,3})?(\d{4})([A-Z]{1,3})?\b/;

/**
 * English words that are not subject codes. Without this,
 * "COMS W3134 or COMS W3136 OR W3137" reads "OR W3137" as subject `OR`,
 * number 3137 — a course that does not exist.
 *
 * The quantifiers matter as much as the conjunctions, and they were the ones
 * missing. "any 1000-level or 2000-level EESC course" parsed to a `course` node
 * with id `ANY1000`, which is not a mis-read label but a fabricated GATE: the
 * planner would hold EESC UN3400 shut forever waiting for a course that has
 * never existed. A prerequisite naming a LEVEL rather than a course is a
 * selector we cannot evaluate, so it has to fall through to prose and surface
 * as an advisory — "check yourself" — which is the honest answer.
 *
 * Every word here was checked against `subjects` before being added; none of
 * them is a real Columbia subject code.
 */
const NOT_A_SUBJECT = new Set([
  // conjunctions and prepositions
  "OR", "AND", "NOR", "IN", "OF", "TO", "AT", "BY", "FOR", "THE", "AS", "ON",
  "PER", "VIA", "WITH", "FROM",
  // quantifiers and determiners — "any 1000-level", "one 3000-level course"
  "ANY", "ALL", "ONE", "TWO", "EACH", "BOTH", "SOME", "MOST", "ONLY", "AN",
  "A", "THIS", "THAT", "ITS", "NO", "UP",
  // modals and verbs that precede a number in this prose
  "MAY", "CAN", "ARE", "IS", "IT", "SEE", "NOT", "ALSO", "PLUS",
]);

/** Clauses that grant an instructor override. Lifted out before parsing. */
const PERMISSION_CLAUSE =
  /(?:,|;|\s)*\bor\b\s+(?:the\s+)?(?:instructor'?s?\s+permission|permission\s+of\s+(?:the\s+)?instructor)\b\.?/gi;

/** A standalone permission sentence, where there is no "or" to hang it on. */
const PERMISSION_MENTION = /\b(?:instructor'?s?\s+permission|permission\s+of\s+(?:the\s+)?instructor)\b/i;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { type: "open" }
  | { type: "close" }
  | { type: "and" }
  | { type: "or" }
  | { type: "course"; courseId: string; label: string }
  | { type: "prose"; text: string };

/**
 * Prose is accumulated word-by-word and flushed as one token, so
 * "Knowledge of Java" survives as a single readable advisory rather than three
 * fragments.
 */
function tokenize(input: string, defaultSubject: string | null): Token[] {
  const tokens: Token[] = [];
  let prose: string[] = [];

  const flushProse = () => {
    if (prose.length === 0) return;
    const text = prose.join(" ").replace(/\s*[,;.]\s*$/, "").trim();
    if (text) tokens.push({ type: "prose", text });
    prose = [];
  };

  let rest = input;
  while (rest.length > 0) {
    const char = rest[0];

    if (/\s/.test(char)) {
      rest = rest.slice(1);
      continue;
    }
    if (char === "(" || char === ")") {
      flushProse();
      tokens.push({ type: char === "(" ? "open" : "close" });
      rest = rest.slice(1);
      continue;
    }
    // A comma is an alternation separator; a semicolon ends a clause and is
    // treated the same, since the clause after it is prose in every observed
    // case and juxtaposition will terminate the expression anyway.
    if (char === "," || char === ";" || char === "/") {
      flushProse();
      tokens.push({ type: "or" });
      rest = rest.slice(1);
      continue;
    }

    const upper = rest.toUpperCase();

    const qualified = QUALIFIED_COURSE.exec(upper);
    if (qualified) {
      const [matched, subject, prefix, digits, suffix] = qualified;
      const parsed = NOT_A_SUBJECT.has(subject)
        ? null
        : parseCourseNumber(`${prefix ?? ""}${digits}${suffix ?? ""}`);
      if (parsed) {
        flushProse();
        tokens.push({
          type: "course",
          courseId: buildCourseId(subject, parsed.number, parsed.qualifier),
          label: `${subject} ${prefix ?? ""}${digits}${suffix ?? ""}`,
        });
        rest = rest.slice(matched.length);
        continue;
      }
    }

    const bare = BARE_COURSE.exec(upper);
    if (bare && defaultSubject) {
      const [matched, prefix, digits, suffix] = bare;
      const parsed = parseCourseNumber(`${prefix ?? ""}${digits}${suffix ?? ""}`);
      if (parsed) {
        flushProse();
        tokens.push({
          type: "course",
          courseId: buildCourseId(defaultSubject, parsed.number, parsed.qualifier),
          label: `${defaultSubject} ${prefix ?? ""}${digits}${suffix ?? ""}`,
        });
        rest = rest.slice(matched.length);
        continue;
      }
    }

    const word = /^[^\s(),;/]+/.exec(rest)?.[0] ?? rest[0];
    const lowered = word.toLowerCase().replace(/[.]+$/, "");
    if (lowered === "and") {
      flushProse();
      tokens.push({ type: "and" });
    } else if (lowered === "or") {
      flushProse();
      tokens.push({ type: "or" });
    } else {
      prose.push(word);
    }
    rest = rest.slice(word.length);
  }

  flushProse();
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface ParseState {
  tokens: Token[];
  index: number;
  /** Prose met after the expression ended. Surfaced, never evaluated. */
  advisories: string[];
  /**
   * Every course already consumed by the expression. This is how the
   * restatement is recognised — see `startsRestatement`.
   */
  seen: Set<string>;
  /** Parenthesis nesting. The restatement rule applies at top level only. */
  depth: number;
}

/**
 * Does the primary after `state.tokens[connectorIndex]` re-state a course the
 * expression has already required?
 *
 * This is the one rule that separates
 *
 *   "(W3134 or W3136 or W3137) and W3134 OR W3136 OR W3137"   ← restatement
 *   "(UN1201 or E2000) and (W3251 or UN2010) and W3203"       ← real conjunct
 *
 * Both continue past a closing paren with a bare course and a connector, so
 * position alone cannot tell them apart. Novelty can: a restatement by
 * definition introduces nothing new, and a genuine extra requirement always
 * does. COMS W4771 keeps its trailing `and COMS W3203 and COMS W3134`;
 * COMS W4701 drops its echo of the group it just parsed.
 *
 * Restricted to depth 0, because the bulletin never restates itself inside
 * parentheses while a legitimate alternation happily repeats a course across
 * two groups. COMS W3770 requires
 *
 *   "(MATH UN2010 or MATH UN2015 or …) and … and (STAT UN1201 or MATH UN2015
 *    or IEOR E3658)"
 *
 * where the second MATH UN2015 is a real alternative, not an echo.
 */
function startsRestatement(state: ParseState, connectorIndex: number): boolean {
  if (state.depth > 0) return false;
  const next = state.tokens[connectorIndex + 1];
  return next?.type === "course" && state.seen.has(next.courseId);
}

/**
 * `expression := disjunct ( "or" disjunct )*`
 * `disjunct   := primary ( "and" primary )*`
 * `primary    := "(" expression ")" | course | prose`
 *
 * Parsing stops the moment two primaries sit adjacent with no connector —
 * shape 1 in the file header. Everything from there on is collected as prose.
 */
function parseExpression(state: ParseState): PrereqNode | null {
  const alternatives: PrereqNode[] = [];
  const first = parseConjunction(state);
  if (!first) return null;
  alternatives.push(first);

  while (state.index < state.tokens.length && state.tokens[state.index].type === "or") {
    if (startsRestatement(state, state.index)) break;
    state.index += 1;
    const next = parseConjunction(state);
    if (!next) break;
    alternatives.push(next);
  }

  return alternatives.length === 1 ? alternatives[0] : { kind: "any", children: alternatives };
}

function parseConjunction(state: ParseState): PrereqNode | null {
  const terms: PrereqNode[] = [];
  const first = parsePrimary(state);
  if (!first) return null;
  terms.push(first);

  while (state.index < state.tokens.length && state.tokens[state.index].type === "and") {
    if (startsRestatement(state, state.index)) break;
    state.index += 1;
    const next = parsePrimary(state);
    if (!next) break;
    terms.push(next);
  }

  return terms.length === 1 ? terms[0] : { kind: "all", children: terms };
}

function parsePrimary(state: ParseState): PrereqNode | null {
  const token = state.tokens[state.index];
  if (!token) return null;

  if (token.type === "open") {
    state.index += 1;
    state.depth += 1;
    const inner = parseExpression(state);
    state.depth -= 1;
    if (state.tokens[state.index]?.type === "close") state.index += 1;
    return inner;
  }
  if (token.type === "course") {
    state.index += 1;
    state.seen.add(token.courseId);
    return { kind: "course", courseId: token.courseId, label: token.label };
  }
  if (token.type === "prose") {
    state.index += 1;
    return { kind: "advisory", text: token.text };
  }
  return null;
}

/**
 * Everything the expression parser did not consume, as readable prose.
 *
 * Courses the tree already requires are dropped rather than repeated: the tail
 * of a bulletin prerequisite is usually the restatement, and echoing
 * "COMS W3134 or COMS W3136 or COMS W3137" back at the reader as an advisory
 * would be noise on top of a requirement they can already see. What is left —
 * "Knowledge of Java", "or equivalent" — is the part the tree genuinely lost.
 */
function drainRemainder(state: ParseState): void {
  const words: string[] = [];
  let carriedConnector: string | null = null;

  for (; state.index < state.tokens.length; state.index += 1) {
    const token = state.tokens[state.index];

    if (token.type === "and" || token.type === "or") {
      // Held back, not emitted: a connector is only worth keeping if a term
      // that survives the filter follows it.
      if (words.length > 0) carriedConnector = token.type;
      continue;
    }

    const text =
      token.type === "course"
        ? state.seen.has(token.courseId)
          ? null
          : token.label
        : token.type === "prose"
          ? token.text
          : null;
    if (!text) continue;

    if (carriedConnector) {
      words.push(carriedConnector);
      carriedConnector = null;
    }
    words.push(text);
  }

  const cleaned = words
    .join(" ")
    .replace(/\s+/g, " ")
    // "…as covered in COMS COMS W3136": the bulletin names the subject in prose
    // and then again in the code that follows it.
    .replace(/\b([A-Z]{2,5})\s+(?=\1\s)/g, "")
    .replace(/^(?:and|or)\s+/i, "")
    .replace(/\s+(?:and|or)$/i, "")
    .trim();
  if (cleaned) state.advisories.push(cleaned);
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Flatten nesting, drop duplicate course references, and collapse single-child
 * groups.
 *
 * Deduplication is doing real work, not tidying: "( CSEE W3827 ) and CSEE
 * W3827" is one course written twice, and "( COMS W1004 ) or COMS W1004" is
 * the same. Both are the bulletin restating itself inside the expression, and
 * both reduce to a bare course node.
 */
export function normalizeNode(node: PrereqNode | null): PrereqNode | null {
  if (!node) return null;
  if (node.kind === "course" || node.kind === "advisory") return node;

  const seen = new Set<string>();
  const children: PrereqNode[] = [];

  for (const rawChild of node.children) {
    const child = normalizeNode(rawChild);
    if (!child) continue;
    // Same operator nests flat: (A and (B and C)) === (A and B and C).
    const merged = child.kind === node.kind ? child.children : [child];
    for (const item of merged) {
      const key = nodeKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      children.push(item);
    }
  }

  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { kind: node.kind, children };
}

function nodeKey(node: PrereqNode): string {
  if (node.kind === "course") return `c:${node.courseId}`;
  if (node.kind === "advisory") return `a:${node.text.toLowerCase()}`;
  return `${node.kind}:[${node.children.map(nodeKey).sort().join("|")}]`;
}

/**
 * Rewrite `A and B and C` as `A or B or C` when the registrar grants credit
 * for only one of A, B and C.
 *
 * COMS W4111 is the motivating case. Its prerequisite is published as
 * "(COMS W3134) and (COMS W3136) and (COMS W3137)", and the bulletin says a
 * few blocks earlier that a student "may receive credit for only one of the
 * following three courses: COMS W3134, COMS W3136, COMS W3137". Read
 * literally the AND is unsatisfiable by anyone; read against the equivalence
 * group it is obviously "any one of the data-structures courses".
 *
 * The rewrite fires only when EVERY conjunct is a course and all of them share
 * one group, so an ordinary "data structures and discrete math" conjunction is
 * untouched.
 */
export function collapseEquivalentConjunctions(
  node: PrereqNode | null,
  equivalenceOf: (courseId: string) => ReadonlySet<string> | undefined,
): PrereqNode | null {
  if (!node) return null;
  if (node.kind === "course" || node.kind === "advisory") return node;

  const children = node.children
    .map((child) => collapseEquivalentConjunctions(child, equivalenceOf))
    .filter((child): child is PrereqNode => child !== null);

  if (node.kind === "all" && children.length > 1 && children.every((c) => c.kind === "course")) {
    const ids = children.map((c) => (c as { courseId: string }).courseId);
    const group = equivalenceOf(ids[0]);
    if (group && ids.every((id) => group.has(id))) {
      return { kind: "any", children };
    }
  }

  return { kind: node.kind, children };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface ParsePrereqOptions {
  /** Subject of the course being parsed, so bare "W3136" resolves correctly. */
  defaultSubject?: string | null;
  /** Group lookup for `collapseEquivalentConjunctions`. Optional. */
  equivalenceOf?: (courseId: string) => ReadonlySet<string> | undefined;
}

/**
 * Parse one bulletin prerequisite string. Never throws: unreadable prose comes
 * back as a `prose`-confidence requirement with the original text intact.
 */
export function parsePrerequisiteText(
  courseId: string,
  rawInput: string | null | undefined,
  options: ParsePrereqOptions = {},
): PrereqRequirement | null {
  const rawText = cleanText(rawInput);
  if (!rawText) return null;

  const { prerequisiteText, corequisiteText } = splitCorequisites(rawText);

  const instructorPermission =
    PERMISSION_CLAUSE.test(rawText) || PERMISSION_MENTION.test(rawText);
  PERMISSION_CLAUSE.lastIndex = 0;

  const tree = parseClause(prerequisiteText, options);
  const coreq = parseClause(corequisiteText, options);

  const advisories = [...tree.advisories, ...coreq.advisories].filter(
    (text, index, all) => text.length > 2 && all.indexOf(text) === index,
  );

  return {
    courseId,
    rawText,
    tree: tree.node,
    corequisites: coreq.node,
    instructorPermission,
    advisories,
    confidence: gradeConfidence(tree.node, coreq.node, advisories),
  };
}

interface ParsedClause {
  node: PrereqNode | null;
  advisories: string[];
}

function parseClause(text: string, options: ParsePrereqOptions): ParsedClause {
  const body = stripLabels(text).replace(PERMISSION_CLAUSE, " ");
  PERMISSION_CLAUSE.lastIndex = 0;
  if (!body.trim()) return { node: null, advisories: [] };

  const state: ParseState = {
    tokens: tokenize(body, options.defaultSubject ?? null),
    index: 0,
    advisories: [],
    seen: new Set(),
    depth: 0,
  };

  let node = parseExpression(state);
  drainRemainder(state);

  node = normalizeNode(node);
  if (options.equivalenceOf) {
    node = normalizeNode(collapseEquivalentConjunctions(node, options.equivalenceOf));
  }

  // An expression that turned out to be nothing but prose belongs in the
  // advisory list, not in the tree, where an `all` of unevaluable clauses
  // would masquerade as a gate the planner could reason about.
  if (node && !containsCourse(node)) {
    return { node: null, advisories: [...advisoryTexts(node), ...state.advisories] };
  }
  return { node, advisories: state.advisories };
}

/** "Prerequisites: X" / "Prerequisite: X" / "Corequisites: X" → "X". */
function stripLabels(text: string): string {
  return text.replace(/^\s*(?:Co-?requisites?|Prerequisites?)\s*:?\s*/i, "");
}

/**
 * The bulletin runs both clauses together —
 * "Prerequisites: ( COMS W3203 ) Corequisites: COMS W3134, COMS W3136".
 * They gate differently, so they are separated before either is parsed.
 */
function splitCorequisites(text: string): {
  prerequisiteText: string;
  corequisiteText: string;
} {
  const match = /\bCo-?requisites?\s*:/i.exec(text);
  if (!match) return { prerequisiteText: text, corequisiteText: "" };
  return {
    prerequisiteText: text.slice(0, match.index),
    corequisiteText: text.slice(match.index),
  };
}

function gradeConfidence(
  tree: PrereqNode | null,
  coreq: PrereqNode | null,
  advisories: string[],
): PrereqConfidence {
  const hasCourse = containsCourse(tree) || containsCourse(coreq);
  if (!hasCourse) return "prose";
  const hasProse = advisories.length > 0 || containsAdvisory(tree) || containsAdvisory(coreq);
  return hasProse ? "partial" : "structured";
}

/** Every advisory string in a tree, in reading order. */
function advisoryTexts(node: PrereqNode | null): string[] {
  if (!node) return [];
  if (node.kind === "advisory") return [node.text];
  if (node.kind === "course") return [];
  return node.children.flatMap(advisoryTexts);
}

function containsCourse(node: PrereqNode | null): boolean {
  if (!node) return false;
  if (node.kind === "course") return true;
  if (node.kind === "advisory") return false;
  return node.children.some(containsCourse);
}

function containsAdvisory(node: PrereqNode | null): boolean {
  if (!node) return false;
  if (node.kind === "advisory") return true;
  if (node.kind === "course") return false;
  return node.children.some(containsAdvisory);
}

/** Every distinct course id referenced anywhere in a tree, in encounter order. */
export function courseIdsIn(node: PrereqNode | null): string[] {
  const out: string[] = [];
  const walk = (current: PrereqNode | null) => {
    if (!current) return;
    if (current.kind === "course") {
      if (!out.includes(current.courseId)) out.push(current.courseId);
      return;
    }
    if (current.kind === "advisory") return;
    current.children.forEach(walk);
  };
  walk(node);
  return out;
}
