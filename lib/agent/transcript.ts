/**
 * Reading a turn: what the assistant did, and what it stood on.
 *
 * ── Why this is a module and not JSX ───────────────────────────────────────
 *
 * The chat surface has three things to render out of one `UIMessage`: the
 * prose, a list of the tools that ran, and the courses the answer is actually
 * about. Only the first is a string the SDK hands over ready to use. The other
 * two have to be dug out of `message.parts` — a discriminated union with five
 * tool states, whose payloads are `unknown` because a tool's output shape is
 * the tool's business — and doing that inside a component would put the one
 * genuinely fiddly part of this feature somewhere a test cannot reach.
 *
 * So it lives here, pure, and the components stay dumb.
 *
 * ── The right-hand pane is the grounding, made visible ─────────────────────
 *
 * `lib/agent/grounding.ts` enforces the spec's hardest rule: the assistant may
 * state only facts a tool returned. That check runs after the fact and records
 * a verdict the student never sees.
 *
 * `citedCourses` below is the same idea pointed the other way. Rather than
 * asking "did it cite anything it shouldn't", it collects what the tools DID
 * return and puts it on screen next to the answer. A student reading "you
 * should take COMS W4111" can see the row the claim came from, with its seat
 * count and its instructor, without taking the sentence on trust. That is the
 * difference between a chatbot that talks about a catalog and one that is
 * demonstrably reading it.
 *
 * ── Failure is expected and never thrown ───────────────────────────────────
 *
 * Every function here is defensive to the point of dullness, because the input
 * is a partially-streamed union: a tool call exists before its input does, an
 * input exists before its output does, and an output is `unknown` until it is
 * proven otherwise. Anything unrecognised is skipped rather than reported. A
 * pane that renders nothing is a bad pane; a pane that throws takes the answer
 * down with it.
 */

import { getToolName, isToolUIPart, type UIMessage } from "ai";

import type { FeedCard } from "@/lib/recommend/feed";
import { formatCourseId, toCourseId, type CourseId } from "@/lib/requirements/code";

/* ==========================================================================
 * Tool activity
 * ========================================================================== */

/**
 * One tool call, flattened to what the UI shows.
 *
 * `state` collapses the SDK's five into three, because the two the UI does not
 * distinguish — `input-streaming` and `input-available` — look identical to a
 * reader: the tool is running. Approval states cannot occur here; nothing this
 * agent calls requires one, and the two proposal tools deliberately return a
 * proposal rather than acting.
 */
export interface ToolActivity {
  toolCallId: string;
  name: string;
  /** Human-facing label. Falls back to the raw name if we have no wording. */
  label: string;
  state: "running" | "done" | "failed";
  /** Present only on failure, and shown rather than swallowed. */
  errorText?: string;
}

/**
 * What each tool is doing, in the student's words rather than ours.
 *
 * Present tense and specific. "Running search_courses" tells a student nothing
 * they can act on; "Searching the catalog" tells them the assistant did not
 * just make the answer up, which is the entire reason the activity list is on
 * screen. Anything missing here falls back to the tool name, which is ugly and
 * honest — a silent blank would hide a tool call from the person it is being
 * run on behalf of.
 */
const TOOL_LABELS: Record<string, string> = {
  search_courses: "Searching the catalog",
  get_course: "Reading a course listing",
  get_sections: "Checking this term's sections",
  get_ratings: "Reading reviews",
  check_conflicts: "Checking your schedule for clashes",
  check_requirements: "Checking this against your degree",
  get_my_schedule: "Reading your schedule",
  add_section: "Drafting a change to your plan",
  remove_section: "Drafting a change to your plan",
  watch_section: "Setting up a seat alert",
  list_watches: "Reading your seat alerts",
  list_bookmark_folders: "Reading your saved folders",
  list_bookmarks: "Reading what you've saved",
  propose_bookmark: "Drafting a save",
  propose_unbookmark: "Drafting a change to your saves",
  get_courses_taken: "Reading your coursework",
  get_unmet_requirements: "Working out what your degree still needs",
  recommend_courses: "Ranking courses for you",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/** Every tool call in one message, in the order the model made them. */
export function toolActivity(message: UIMessage): ToolActivity[] {
  const activity: ToolActivity[] = [];

  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    const name = getToolName(part);

    /*
     * `output-error` before `output-available`: a part carrying an error also
     * carries a state, and reading them in the other order would report a
     * failed call as a successful one with no output.
     */
    const state: ToolActivity["state"] =
      part.state === "output-error" ? "failed" : part.state === "output-available" ? "done" : "running";

    activity.push({
      toolCallId: part.toolCallId,
      name,
      label: toolLabel(name),
      state,
      ...(part.state === "output-error" && part.errorText ? { errorText: part.errorText } : {}),
    });
  }

  return activity;
}

/* ==========================================================================
 * What the answer stands on
 * ========================================================================== */

/**
 * A course the tools returned, as the pane renders it.
 *
 * Deliberately thin. This is a pointer to the course page, not a second copy
 * of it — the moment this grows a seat count it has to grow a provenance stamp
 * too, and then it is the course card, which already exists and is already
 * correct. `whyShown` is the exception, because it is the one fact that exists
 * only in this conversation.
 */
export interface CitedCourse {
  courseId: CourseId;
  /** `"COMS W4111"` — printed form, which is what a student recognises. */
  code: string;
  title: string | null;
  /** The tool that produced it, so the pane can group by where it came from. */
  source: string;
  /** Present when the recommendation engine said why. Never invented. */
  whyShown?: string;
}

/** A tool payload, once we have established it is an object. */
type Payload = Record<string, unknown>;

function asPayload(value: unknown): Payload | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Payload)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The tools emit JSON, but not always as an object.
 *
 * `bridgeMcpTool` returns MCP content, which is a string of JSON; the engine
 * tools return a real object. Both reach here as `unknown`, and a string that
 * fails to parse is not an error worth reporting — it is a tool whose output
 * this pane does not know how to read, which is the normal case for most of
 * the eighteen.
 */
function readOutput(output: unknown): Payload | null {
  if (typeof output === "string") {
    try {
      return asPayload(JSON.parse(output));
    } catch {
      return null;
    }
  }
  return asPayload(output);
}

/**
 * Turn one recommendation's `reasons` into a sentence.
 *
 * Only the first reason, and only its kind — the pane is a glance, not a
 * second copy of the card. The wording tracks `RecommendationReason` exactly,
 * because the distinction between "this counts for something" and "you might
 * like it" is the one the whole engine exists to keep separate, and collapsing
 * it here would undo that at the last step.
 */
function describeReason(reasons: unknown): string | undefined {
  const first = asPayload(asArray(reasons)[0]);
  if (!first) return undefined;

  const label = asString(first.groupLabel);
  switch (first.kind) {
    case "required":
      return label ? `Clears ${label}` : "Clears a requirement";
    case "interesting_and_counts":
      return label ? `Your interests, and clears ${label}` : "Matches your interests, and counts";
    case "because_you_took":
      return "Close to what you've taken";
    case "unlocks":
      return "Opens up later courses";
    default:
      return undefined;
  }
}

/**
 * One row from a tool payload, if it is a course at all.
 *
 * Both shapes are accepted because both occur: the engine tools emit
 * `courseId` + `code`, while several bridged MCP tools emit only a printed
 * code. Deriving the id from the code rather than requiring one is what lets a
 * `search_courses` result appear in the pane alongside a `recommend_courses`
 * one.
 */
function readCourse(row: unknown, source: string): CitedCourse | null {
  const record = asPayload(row);
  if (!record) return null;

  const rawId = asString(record.courseId);
  const rawCode = asString(record.code);
  const courseId = rawId ?? (rawCode ? toCourseId(rawCode) : null);
  if (!courseId) return null;

  return {
    courseId,
    code: rawCode ?? formatCourseId(courseId),
    title: asString(record.title),
    source,
    ...(describeReason(record.reasons) ? { whyShown: describeReason(record.reasons) } : {}),
  };
}

/**
 * The keys under which a tool payload keeps its courses.
 *
 * A list rather than a per-tool mapping: the same reader then works for the
 * bridged MCP tools without this file having to know which of the eighteen
 * returns what, and a tool added later shows up in the pane for free if it
 * uses any of these names. `withheld` is included on purpose — a course held
 * back for an unmet prerequisite is exactly what a student asking "why not
 * that one" needs to see.
 */
const COURSE_KEYS = [
  "cards",
  "recommendations",
  "courses",
  "results",
  "withheld",
  "sections",
] as const;

/**
 * Every course the tools in this message returned, deduplicated, in order.
 *
 * First mention wins on collision. A course returned by `recommend_courses`
 * and then again by `get_course` should keep the reason that explains why it
 * is in the conversation at all; the later, barer row would overwrite it with
 * nothing.
 */
export function citedCourses(message: UIMessage): CitedCourse[] {
  const seen = new Map<string, CitedCourse>();

  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue;

    const payload = readOutput(part.output);
    if (!payload) continue;
    const source = getToolName(part);

    for (const key of COURSE_KEYS) {
      for (const row of asArray(payload[key])) {
        const course = readCourse(row, source);
        if (course && !seen.has(course.courseId)) seen.set(course.courseId, course);
      }
    }
  }

  return [...seen.values()];
}

/* ==========================================================================
 * Section cards
 * ========================================================================== */

/**
 * The section cards `recommend_courses` returned.
 *
 * ── Why the assistant emits whole cards ────────────────────────────────────
 *
 * A course code is not something a student can register for. The decision is
 * the *section* — who teaches it, when it meets, whether it has seats — and the
 * act at the end of it is opening that section in Vergil. An assistant that
 * names COMS W4111 and stops has handed back a search result; one that puts the
 * Tuesday/Thursday section on screen with its call number and a link has
 * finished the job.
 *
 * So `recommend_courses` goes through `buildFeed` and returns the same
 * `FeedCard` the home feed renders, and this reads them back out so the chat
 * can render them with `FeedCardView` — the identical component, including its
 * seat provenance stamp and its Open-in-Vergil button. Nothing about a card in
 * a conversation is a second implementation of a card on a page.
 *
 * ── The guard is deliberately shallow ──────────────────────────────────────
 *
 * These arrive as `unknown` off a JSON round trip. Rather than re-validate
 * every field of a type the server just serialised, this checks the handful the
 * card cannot render without — an id, a code, and a `best` section carrying the
 * two things that make it a section rather than a course. A row missing any of
 * them is skipped, because a card with no call number and no link is an empty
 * shell, and `citedCourses` will still list it as evidence.
 */
export function feedCards(message: UIMessage): FeedCard[] {
  const seen = new Map<string, FeedCard>();

  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue;

    const payload = readOutput(part.output);
    if (!payload) continue;

    for (const row of asArray(payload.cards)) {
      const card = readFeedCard(row);
      if (card && !seen.has(card.courseId)) seen.set(card.courseId, card);
    }
  }

  return [...seen.values()];
}

function readFeedCard(row: unknown): FeedCard | null {
  const record = asPayload(row);
  if (!record) return null;

  if (!asString(record.courseId) || !asString(record.code)) return null;

  const best = asPayload(record.best);
  if (!best || !asString(best.sectionId) || !asString(best.vergilUrl)) return null;

  return record as unknown as FeedCard;
}

/* ==========================================================================
 * Prose
 * ========================================================================== */

/**
 * The assistant's text, concatenated.
 *
 * A single turn can produce several text parts — the model writes, calls a
 * tool, then writes again — and they are one answer as far as the reader is
 * concerned. Joined with a blank line rather than a space so the second half
 * does not run into the first mid-sentence.
 */
export function proseOf(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
}

/* ==========================================================================
 * Follow-ups
 * ========================================================================== */

/**
 * What to offer next, generated from the result set rather than from a list.
 *
 * The spec asks for "suggested follow-ups generated from the actual result
 * set", and the distinction matters: three fixed suggestions under every
 * answer are decoration, and a student learns to stop reading them within two
 * turns. These are only emitted when the turn actually produced the thing they
 * refer to — no recommendations, no "why not the others"; nothing withheld, no
 * question about prerequisites.
 *
 * Capped at three. A fourth is a menu, and a menu is what the student came
 * here to avoid.
 */
export function suggestedFollowUps(message: UIMessage): string[] {
  const suggestions: string[] = [];
  const names = new Set(toolActivity(message).map((entry) => entry.name));
  const courses = citedCourses(message);

  if (names.has("recommend_courses") && courses.length > 0) {
    suggestions.push("Why these and not others?");
  }
  if (names.has("get_unmet_requirements")) {
    suggestions.push("What's the fastest way to finish?");
  }
  if (courses.length > 1) {
    suggestions.push("Do any of these clash?");
  }
  if (names.has("search_courses") && !names.has("recommend_courses")) {
    suggestions.push("Which of these fits my degree?");
  }

  return suggestions.slice(0, 3);
}
