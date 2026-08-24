/**
 * Parser for the Bulletin's degree-requirement tables.
 *
 * WHY THIS EXISTS: `bulletin.ts` already fetches these department pages every
 * week for meeting times, and throws the requirement tables away. They are the
 * only public, machine-readable statement of what a Columbia degree requires —
 * spec §22 open question 4 calls a full degree audit "the largest possible
 * future feature", and this is the data it needs.
 *
 * STRUCTURE — verified against `__fixtures__/bulletin-cs.html` and against the
 * live CC/SEAS/Economics pages:
 *
 *   <h3>Mathematics Requirement (6-11 points)</h3>      ← heading, owns points
 *   <table class="sc_courselist">
 *     <tr class="even areaheader firstrow">            ← GROUP BOUNDARY
 *       <td colspan="2"><span class="courselistcomment areaheader">
 *         Calculus Requirement: Select one of the following courses:
 *       </span></td><td class="hourscol"></td></tr>
 *     <tr class="odd">
 *       <td class="codecol"><a class="bubblelink code">MATH UN1201</a></td>
 *       <td>CALCULUS III</td><td class="hourscol">3</td></tr>
 *     <tr class="even lastrow">
 *       <td colspan="2"><span class="courselistcomment">Note that …</span></td>
 *   </table>
 *
 * ── The four things that make this harder than it looks ─────────────────────
 *
 * 1. **The audit unit is the areaheader, not the table and not the heading.**
 *    One `<h3>` owns three tables on the CS page (Calculus, Linear Algebra,
 *    Probability). One table can hold several areaheaders. Grouping by table or
 *    by heading lets a student satisfy "Mathematics" three times with three
 *    calculus courses.
 *
 * 2. **`or` rows are continuations, not courses.** The Bulletin renders an
 *    alternative as its own row whose code cell begins "or":
 *
 *        COMS W1004  PROGRAMMING IN JAVA
 *        or COMS W1007
 *
 *    Those are one requirement with two satisfactions. Read naively they become
 *    two required courses and every student is short one.
 *
 * 3. **`&` cells are sequences.** `MATH UN1101&amp; MATH UN1102&amp;
 *    MATH UN1201&amp; MATH UN2010` is one row and four courses, all required
 *    together. Combined with "Select one of the following sequences:" this is
 *    where `sequence_choice` comes from.
 *
 * 4. **Some tables name no courses at all.** The Economics major table's rows
 *    are pointers — "All economics core courses", "Select a mathematics
 *    sequence". They parse to groups with zero candidates. `parseRequirements`
 *    reports them in `unresolved` rather than emitting an unsatisfiable
 *    requirement, because a group nobody can ever complete is worse than a
 *    missing one.
 *
 * WHAT THIS PARSER DOES NOT DO: it never emits `attested`. Deciding that a
 * requirement is unverifiable is a judgement about the world, not about the
 * markup, and it belongs to a person transcribing the page. Prose the parser
 * cannot turn into a rule becomes `unresolved`, which is a request for a human,
 * not a silently degraded requirement.
 */

import { parse, type HTMLElement } from "node-html-parser";

import { splitCodeSequence, toCourseId } from "../../requirements/code";
import type {
  Program,
  ProgramKind,
  RequirementGroup,
  RequirementRule,
  School,
} from "../../requirements/types";
import { cleanText } from "./shared";

/** A group the parser recognised as a requirement but could not turn into a rule. */
export interface UnresolvedGroup {
  label: string;
  /** The prose that defeated it, so a human transcriber knows what to read. */
  text: string;
  /** Heading the group sat under, for locating it on the page. */
  heading: string | null;
}

export interface ParsedRequirements {
  groups: RequirementGroup[];
  unresolved: UnresolvedGroup[];
}

export interface RequirementParseOptions {
  /** Only parse under the heading whose text contains this, e.g. "Major in Computer Science". */
  section?: string;
  /** Stop at the next heading containing any of these. */
  stopAt?: string[];
  sourceUrl?: string;
}

// ---------------------------------------------------------------------------
// Row classification
// ---------------------------------------------------------------------------

type Row =
  | { kind: "areaheader"; text: string }
  | { kind: "comment"; text: string }
  | { kind: "course"; codes: string[]; title: string; points: string; isOr: boolean };

/**
 * The `n` a "select N" phrase asks for.
 *
 * The Bulletin spells these as words far more often than digits, and it is not
 * consistent about capitalisation or about whether "courses" follows.
 */
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function selectCount(text: string): number | null {
  const lower = text.toLowerCase();
  if (!/\b(select|choose|complete)\b/.test(lower)) return null;

  const digit = /\b(?:select|choose|complete)\s+(?:at least\s+)?(\d+)\b/.exec(lower);
  if (digit) return Number(digit[1]);

  const word = /\b(?:select|choose|complete)\s+(?:at least\s+)?([a-z]+)\b/.exec(lower);
  if (word && WORD_NUMBERS[word[1]] != null) return WORD_NUMBERS[word[1]];

  // "Select one of the following" with no count word is still one.
  if (/\b(?:select|choose)\s+(?:a|an|the)\b/.test(lower)) return 1;
  return null;
}

/** Does this areaheader describe a choice between whole sequences? */
function isSequenceChoice(text: string): boolean {
  return /\bsequences?\b/i.test(text) && /\b(select|choose|one of)\b/i.test(text);
}

function classifyRow(row: HTMLElement): Row | null {
  const areaheader = row.querySelector(".courselistcomment.areaheader");
  if (areaheader) {
    const text = cleanText(areaheader.textContent);
    return text ? { kind: "areaheader", text } : null;
  }

  const comment = row.querySelector(".courselistcomment");
  if (comment) {
    const text = cleanText(comment.textContent);
    return text ? { kind: "comment", text } : null;
  }

  const codeCell = row.querySelector("td.codecol");
  if (!codeCell) return null;

  const raw = cleanText(codeCell.textContent);
  if (!raw) return null;

  // "or COMS W1007" — an alternative to the row above, not a new requirement.
  const isOr = /^or\s+/i.test(raw);
  const codeText = raw.replace(/^or\s+/i, "");

  const codes = splitCodeSequence(codeText).filter((code) => toCourseId(code) !== null);
  if (codes.length === 0) return null;

  const cells = row.querySelectorAll("td");
  const title = cells.length > 1 ? cleanText(cells[1].textContent) : "";
  const points = cleanText(row.querySelector("td.hourscol")?.textContent ?? "");

  return { kind: "course", codes, title, points, isOr };
}

// ---------------------------------------------------------------------------
// Group assembly
// ---------------------------------------------------------------------------

interface Accumulator {
  label: string;
  headerText: string;
  notes: string[];
  /** Each entry is one satisfaction option; an option may itself be a sequence. */
  options: string[][];
}

function slugify(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

/**
 * Turn one accumulated area into a rule.
 *
 * The decision tree, in the order it must be applied:
 *
 *   any option longer than one course   → sequence_choice  (the `&` form)
 *   header says "select N"              → n_of with that N
 *   header says nothing about selecting → all_of
 *
 * "Select N" beats "all of" because a table whose header says select-one and
 * whose body lists six courses is a choice, not six requirements — getting this
 * backwards is the single most damaging misread available here.
 */
function ruleFor(area: Accumulator): RequirementRule | null {
  const flat = area.options.flat();
  if (flat.length === 0) return null;

  const hasSequences = area.options.some((option) => option.length > 1);
  if (hasSequences && (isSequenceChoice(area.headerText) || area.options.length > 1)) {
    return {
      kind: "sequence_choice",
      sequences: area.options.map((courses, index) => ({
        label: courses.join(" + "),
        courses,
      })),
    };
  }

  const n = selectCount(area.headerText);
  if (n != null) {
    return { kind: "n_of", n, courses: flat };
  }

  return { kind: "all_of", courses: flat };
}

/**
 * Strip the "Select one of the following courses:" tail off an area label.
 *
 * "Calculus Requirement: Select one of the following courses:" is a name and an
 * instruction welded together. The name is what belongs on a card; the
 * instruction is already encoded in the rule.
 */
function labelFor(headerText: string): string {
  const beforeColon = headerText.split(/:\s*/)[0]?.trim();
  const candidate = beforeColon && beforeColon.length > 2 ? beforeColon : headerText;
  return candidate
    .replace(/\s*\((?:[\d\s–—-]+points?)\)\s*$/i, "")
    .replace(/\s+Requirement$/i, "")
    .trim();
}

export function parseRequirementTables(
  html: string,
  options: RequirementParseOptions = {},
): ParsedRequirements {
  const root = parse(html);
  const groups: RequirementGroup[] = [];
  const unresolved: UnresolvedGroup[] = [];
  const usedIds = new Set<string>();

  // Walk headings and tables in document order — a table belongs to the last
  // heading seen, which is the only way the CS page's one-heading-three-tables
  // shape can be attributed correctly.
  const nodes = root.querySelectorAll(
    "h1, h2, h3, h4, h5, h6, table.sc_courselist",
  );

  let heading: string | null = null;
  let inSection = options.section == null;

  for (const node of nodes) {
    const tag = node.tagName?.toLowerCase() ?? "";

    if (tag !== "table") {
      heading = cleanText(node.textContent) || null;
      if (options.section && heading) {
        if (heading.toLowerCase().includes(options.section.toLowerCase())) {
          inSection = true;
        } else if (inSection && options.stopAt?.some((stop) =>
          heading!.toLowerCase().includes(stop.toLowerCase()),
        )) {
          inSection = false;
        }
      }
      continue;
    }

    if (!inSection) continue;

    // Each table opens with an implicit area named by the enclosing heading,
    // so a table with no areaheader row still produces one group.
    let area: Accumulator = {
      label: labelFor(heading ?? "Requirement"),
      headerText: heading ?? "",
      notes: [],
      options: [],
    };

    const flush = () => {
      const rule = ruleFor(area);
      if (!rule) {
        if (area.options.length === 0 && area.headerText) {
          unresolved.push({
            label: area.label,
            text: [area.headerText, ...area.notes].join(" "),
            heading,
          });
        }
        return;
      }
      let id = slugify(area.label, `group-${groups.length}`);
      while (usedIds.has(id)) id = `${id}-${groups.length}`;
      usedIds.add(id);

      groups.push({
        id,
        label: area.label,
        note: area.notes.length > 0 ? area.notes.join(" ") : undefined,
        rule,
        sourceUrl: options.sourceUrl,
      });
    };

    for (const row of node.querySelectorAll("tr")) {
      const parsed = classifyRow(row);
      if (!parsed) continue;

      if (parsed.kind === "areaheader") {
        flush();
        area = {
          label: labelFor(parsed.text),
          headerText: parsed.text,
          notes: [],
          options: [],
        };
        continue;
      }

      if (parsed.kind === "comment") {
        area.notes.push(parsed.text);
        continue;
      }

      const courses = parsed.codes;
      if (parsed.isOr && area.options.length > 0) {
        /*
         * An "or" row extends the PREVIOUS option rather than adding one.
         *
         * `COMS W1004` followed by `or COMS W1007` has to become a single
         * choice between two courses. Appending it as its own option is what
         * produces that: the pair then reads as two ways to satisfy one slot,
         * and `ruleFor` turns a multi-option area under a select-one header
         * into `n_of { n: 1 }`.
         */
        area.options.push(courses);
        if (!/\bselect|choose|one of\b/i.test(area.headerText)) {
          // No select-N header, but an "or" proves this is a choice. Say so,
          // otherwise `ruleFor` would emit `all_of` over both alternatives and
          // require a student to take W1004 AND W1007.
          area.headerText = `${area.headerText} Select one of the following:`.trim();
        }
        continue;
      }

      area.options.push(courses);
    }

    flush();
  }

  return { groups, unresolved };
}

/**
 * Parse one department page into a `Program`.
 *
 * `origin` is hardcoded to `"parsed"` and cannot be overridden by the caller.
 * That is the point: nothing that came out of this file may present itself as
 * a human-checked transcription.
 */
export function parseProgram(
  html: string,
  meta: {
    id: string;
    name: string;
    school: School;
    kind: ProgramKind;
    department?: string;
    sourceUrl: string;
    edition: string;
    section?: string;
    stopAt?: string[];
  },
): { program: Program; unresolved: UnresolvedGroup[] } {
  const { groups, unresolved } = parseRequirementTables(html, {
    section: meta.section,
    stopAt: meta.stopAt,
    sourceUrl: meta.sourceUrl,
  });

  return {
    program: {
      id: meta.id,
      kind: meta.kind,
      school: meta.school,
      name: meta.name,
      department: meta.department,
      groups,
      sourceUrl: meta.sourceUrl,
      origin: "parsed",
      edition: meta.edition,
    },
    unresolved,
  };
}
