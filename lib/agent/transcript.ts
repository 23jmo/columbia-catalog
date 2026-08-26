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

import type { CampusMapArtifact, InstructorArtifact, ScheduleArtifact } from "@/lib/agent/present";
import {
  ONBOARDING_HREF,
  type OnboardingArtifact,
} from "@/lib/agent/present-onboarding";
import { ALL_WEEKDAYS } from "@/lib/constants";
import type { FeedCard } from "@/lib/recommend/feed";
import { formatCourseId, toCourseId, type CourseId } from "@/lib/requirements/code";
import type { Weekday } from "@/lib/types";

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
  show_schedule: "Putting your week on screen",
  show_campus_map: "Putting the campus map on screen",
  show_instructor: "Putting the instructor on screen",
  show_onboarding: "Opening degree setup",
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

function asWeekday(value: unknown): Weekday | null {
  return typeof value === "string" && (ALL_WEEKDAYS as readonly string[]).includes(value)
    ? (value as Weekday)
    : null;
}

function asTone(value: unknown): ScheduleArtifact["blocks"][number]["tone"] {
  return value === "candidate" || value === "conflict" ? value : "plan";
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

/**
 * Course ids already rendered as cards earlier in the thread.
 *
 * The recommend tool merges these into `excludeCourseIds` so a follow-up
 * cannot reprint the same six even if the model forgets to pass them.
 */
export function shownCourseIds(messages: readonly UIMessage[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const card of feedCards(message)) {
      if (seen.has(card.courseId)) continue;
      seen.add(card.courseId);
      ids.push(card.courseId);
    }
  }
  return ids;
}

/**
 * Drop cards this thread has already shown.
 *
 * A second unfiltered `recommend_courses` returns the same ranked list.
 * Hiding the repeats is the last line of defence when the model still
 * called with empty filters.
 */
export function unseenFeedCards(
  cards: readonly FeedCard[],
  alreadyShown: ReadonlySet<string>,
): FeedCard[] {
  return cards.filter((card) => !alreadyShown.has(card.courseId));
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
 * Schedule and campus map
 * ========================================================================== */

/**
 * Calendars and maps the present tools returned.
 *
 * Same shallow guard as `readFeedCard`: the server just serialised these, so
 * we check the handful a card cannot render without and skip the rest. A
 * payload missing `kind` is some other tool's JSON that happens to have
 * `blocks` or `buildingNames`.
 */
export function scheduleArtifacts(message: UIMessage): ScheduleArtifact[] {
  const found: ScheduleArtifact[] = [];
  for (const payload of toolPayloads(message)) {
    if (payload.kind !== "schedule_card") continue;
    const artifact = readScheduleArtifact(payload);
    if (artifact) found.push(artifact);
  }
  return found;
}

export function campusMapArtifacts(message: UIMessage): CampusMapArtifact[] {
  const found: CampusMapArtifact[] = [];
  for (const payload of toolPayloads(message)) {
    if (payload.kind !== "campus_map_card") continue;
    const artifact = readCampusMapArtifact(payload);
    if (artifact) found.push(artifact);
  }
  return found;
}

export function instructorArtifacts(message: UIMessage): InstructorArtifact[] {
  const found: InstructorArtifact[] = [];
  for (const payload of toolPayloads(message)) {
    if (payload.kind !== "instructor_card") continue;
    const artifact = readInstructorArtifact(payload);
    if (artifact) found.push(artifact);
  }
  return found;
}

export function onboardingArtifacts(message: UIMessage): OnboardingArtifact[] {
  const found: OnboardingArtifact[] = [];
  for (const payload of toolPayloads(message)) {
    const artifact = readOnboardingArtifact(payload);
    if (artifact) found.push(artifact);
  }
  return found;
}

/**
 * One visual beat in a turn, in the order `message.parts` actually arrived.
 *
 * The thread used to concatenate every text part, then dump every card under
 * that blob. That threw away the only order the SDK preserves: the model
 * writes, a tool returns, the model writes again. Walk the parts instead.
 * Lookup tools (search, get_course, …) produce no beat — they still show in
 * the activity strip — so prose on either side of a lookup stays one block.
 *
 * A model that writes the whole answer and only then calls tools will still
 * land the cards at the end. That is the order it produced, not a renderer
 * limitation.
 */
export type TurnBlock =
  | { kind: "text"; text: string }
  | { kind: "schedule"; artifact: ScheduleArtifact }
  | { kind: "campus_map"; artifact: CampusMapArtifact }
  | { kind: "instructor"; artifact: InstructorArtifact }
  | { kind: "onboarding"; artifact: OnboardingArtifact }
  | { kind: "feed"; cards: FeedCard[] };

export function turnBlocks(
  message: UIMessage,
  alreadyShown: ReadonlySet<string> = new Set(),
): TurnBlock[] {
  const blocks: TurnBlock[] = [];
  const seen = new Set(alreadyShown);
  const pending: string[] = [];

  const flushText = () => {
    const text = pending.splice(0).join("\n\n");
    if (text) blocks.push({ kind: "text", text });
  };

  for (const part of message.parts) {
    if (part.type === "text") {
      if (part.text.trim().length > 0) pending.push(part.text);
      continue;
    }
    if (!isToolUIPart(part) || part.state !== "output-available") continue;
    const payload = readOutput(part.output);
    if (!payload) continue;
    const visual = visualBlock(payload, seen);
    if (!visual) continue;
    flushText();
    blocks.push(visual);
  }

  flushText();
  return blocks;
}

function visualBlock(payload: Payload, seen: Set<string>): TurnBlock | null {
  if (payload.kind === "schedule_card") {
    const artifact = readScheduleArtifact(payload);
    return artifact ? { kind: "schedule", artifact } : null;
  }
  if (payload.kind === "campus_map_card") {
    const artifact = readCampusMapArtifact(payload);
    return artifact ? { kind: "campus_map", artifact } : null;
  }
  if (payload.kind === "instructor_card") {
    const artifact = readInstructorArtifact(payload);
    return artifact ? { kind: "instructor", artifact } : null;
  }
  if (payload.kind === "onboarding_prompt") {
    const artifact = readOnboardingArtifact(payload);
    return artifact ? { kind: "onboarding", artifact } : null;
  }

  const cards: FeedCard[] = [];
  for (const row of asArray(payload.cards)) {
    const card = readFeedCard(row);
    if (!card || seen.has(card.courseId)) continue;
    seen.add(card.courseId);
    cards.push(card);
  }
  return cards.length > 0 ? { kind: "feed", cards } : null;
}

function toolPayloads(message: UIMessage): Payload[] {
  const payloads: Payload[] = [];
  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue;
    const payload = readOutput(part.output);
    if (payload) payloads.push(payload);
  }
  return payloads;
}

function readScheduleArtifact(record: Payload): ScheduleArtifact | null {
  const termCode = asString(record.termCode);
  if (!termCode) return null;
  const blocks = asArray(record.blocks).flatMap((row) => {
    const block = asPayload(row);
    if (!block) return [];
    const blockId = asString(block.blockId);
    const label = asString(block.label);
    const weekday = asWeekday(block.weekday);
    if (!blockId || !label || !weekday) return [];
    if (typeof block.startMinute !== "number" || typeof block.endMinute !== "number") return [];
    return [
      {
        blockId,
        label,
        sublabel: asString(block.sublabel),
        weekday,
        startMinute: block.startMinute,
        endMinute: block.endMinute,
        tone: asTone(block.tone),
      },
    ];
  });
  return {
    kind: "schedule_card",
    termCode,
    planId: asString(record.planId),
    planName: asString(record.planName),
    blocks,
    ...(asArray(record.weekdays).length > 0
      ? {
          weekdays: asArray(record.weekdays).filter((day): day is Weekday => asWeekday(day) !== null),
        }
      : {}),
    commitmentIds: asArray(record.commitmentIds).filter((id): id is string => typeof id === "string"),
    unknownMeetingSectionIds: asArray(record.unknownMeetingSectionIds).filter(
      (id): id is string => typeof id === "string",
    ),
    unresolvedSectionIds: asArray(record.unresolvedSectionIds).filter((id): id is string => typeof id === "string"),
  };
}

function readCampusMapArtifact(record: Payload): CampusMapArtifact | null {
  const buildingNames = asArray(record.buildingNames).filter(
    (name): name is string | null => typeof name === "string" || name === null,
  );
  const routeStops = asArray(record.routeStops).flatMap((row) => {
    const stop = asPayload(row);
    if (!stop) return [];
    const label = asString(stop.label);
    if (!label) return [];
    return [
      {
        buildingNames: asArray(stop.buildingNames).filter(
          (name): name is string | null => typeof name === "string" || name === null,
        ),
        label,
        meta: asString(stop.meta),
        highlighted: stop.highlighted === true,
      },
    ];
  });
  return {
    kind: "campus_map_card",
    buildingNames,
    roomLabel: asString(record.roomLabel),
    label: asString(record.label),
    meta: asString(record.meta),
    routeStops: routeStops.length > 0 ? routeStops : null,
    connectStops: record.connectStops === true,
    weekday: asWeekday(record.weekday),
  };
}

function readInstructorArtifact(record: Payload): InstructorArtifact | null {
  if (record.found === false) return null;
  const name = asString(record.name);
  const slug = asString(record.slug);
  if (!name || !slug) return null;

  const courses = asArray(record.courses).flatMap((row) => {
    const course = asPayload(row);
    if (!course) return [];
    const courseId = asString(course.courseId);
    const code = asString(course.code);
    const title = asString(course.title);
    if (!courseId || !code || !title) return [];
    return [{ courseId, code, title }];
  });

  const reputation = asPayload(record.reputation);

  return {
    kind: "instructor_card",
    found: true,
    name,
    slug,
    subtitle: asString(record.subtitle),
    subjects: asArray(record.subjects).filter((value): value is string => typeof value === "string"),
    termLabel: asString(record.termLabel),
    courseCount: typeof record.courseCount === "number" ? record.courseCount : courses.length,
    sectionCount: typeof record.sectionCount === "number" ? record.sectionCount : 0,
    courses,
    teachingDays: asArray(record.teachingDays).filter((day): day is Weekday => asWeekday(day) !== null),
    buildings: asArray(record.buildings).filter((value): value is string => typeof value === "string"),
    reputation: reputation && typeof reputation.sampleSize === "number" ? (reputation as unknown as InstructorArtifact["reputation"]) : null,
  };
}

function readOnboardingArtifact(record: Payload): OnboardingArtifact | null {
  if (record.kind !== "onboarding_prompt") return null;
  if (asString(record.href) !== ONBOARDING_HREF) return null;
  if (record.reason !== "no_degree") return null;
  return { kind: "onboarding_prompt", href: ONBOARDING_HREF, reason: "no_degree" };
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
    suggestions.push("Show me more like these");
  }
  if (names.has("get_unmet_requirements") && onboardingArtifacts(message).length === 0) {
    suggestions.push("What's the fastest way to finish?");
  }
  if (courses.length > 1) {
    suggestions.push("Do any of these clash?");
  }
  if (names.has("search_courses") && !names.has("recommend_courses")) {
    suggestions.push("Which of these fits my degree?");
  }
  if (names.has("show_schedule") && !names.has("show_campus_map")) {
    suggestions.push("Where do these meet?");
  }
  if (names.has("show_campus_map") && !names.has("show_schedule")) {
    suggestions.push("Does this fit my week?");
  }
  if (names.has("show_instructor")) {
    suggestions.push("Where do they teach?");
  }

  return suggestions.slice(0, 3);
}
