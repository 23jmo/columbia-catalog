/**
 * Schedule lane (UI) — pure adapters from domain shapes to week-grid rectangles.
 *
 * Everything that ends up drawn on the week canvas passes through here, and
 * nothing here imports React. That is deliberate: layout maths and conflict
 * marking are the parts most likely to be wrong, so they live in a file a test
 * can call directly (`schedule-ui.test.ts`).
 *
 * The domain logic itself is NOT reimplemented. Flattening sections into
 * meetings, ordering a day, and deciding what collides all come from
 * `lib/schedule` — this module only translates the result into the
 * `WeekGridBlock` shape `components/course/contracts.ts` fixes for us.
 *
 * IMPORT STYLE: relative paths, not `@/`. This module and its test are the only
 * things in this directory a test runner loads, and relative paths resolve
 * whatever the runner's alias configuration happens to be — the same call
 * `lib/schedule` made. The `.tsx` files here use `@/` like the rest of the app.
 */

import type {
  ConflictKind,
  CustomBlock,
  ScheduleConflict,
  Section,
  Weekday,
} from "../../lib/types";
import type { PlannedMeeting, WeekGridBlock } from "../course/contracts";
import { GRID_END_MINUTE, GRID_START_MINUTE, WEEKDAYS } from "../../lib/constants";
import { conflictedIds, detectConflicts } from "../../lib/schedule/conflicts";
import { toTimedItems, type TimedItem } from "../../lib/schedule/timeline";

export type WeekGridTone = WeekGridBlock["tone"];

// ---------------------------------------------------------------------------
// Block identity
// ---------------------------------------------------------------------------

/**
 * One section meets several times a week, so a section id is not unique per
 * rectangle. `WeekGridBlock` carries no owner field, so the owner is encoded
 * into `blockId` and recovered with `ownerIdOf` — that is how a conflict, which
 * is reported against section/block ids, finds every rectangle it touches.
 */
const BLOCK_ID_SEPARATOR = "@";

export function blockIdFor(ownerId: string, weekday: Weekday, startMinute: number): string {
  return `${ownerId}${BLOCK_ID_SEPARATOR}${weekday}${BLOCK_ID_SEPARATOR}${startMinute}`;
}

/** The section id or custom-block id a rectangle belongs to. */
export function ownerIdOf(blockId: string): string {
  const parts = blockId.split(BLOCK_ID_SEPARATOR);
  // Ids we did not mint (a caller passing hand-built blocks) are their own owner.
  return parts.length > 2 ? parts.slice(0, -2).join(BLOCK_ID_SEPARATOR) : blockId;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** "Mudd 833", "Mudd", "833", or nothing — never a stray separator. */
function placeSublabel(buildingName: string | null, room: string | null): string | null {
  const parts = [buildingName, room].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(" ") : null;
}

function timedItemToBlock(item: TimedItem, tone: WeekGridTone): WeekGridBlock {
  return {
    blockId: blockIdFor(item.id, item.weekday, item.startMinute),
    label: item.label,
    sublabel: placeSublabel(item.buildingName, item.room),
    weekday: item.weekday,
    startMinute: item.startMinute,
    endMinute: item.endMinute,
    tone,
  };
}

/**
 * Sections and custom blocks in one pass.
 *
 * `toTimedItems` already drops zero- and negative-length meetings and sorts the
 * week, so a custom block is never a second-class citizen on the grid — spec §8.
 */
export function sectionsToBlocks(
  sections: readonly Section[],
  customBlocks: readonly CustomBlock[] = [],
  tone: WeekGridTone = "plan",
): WeekGridBlock[] {
  return toTimedItems(sections, customBlocks).map((item) => timedItemToBlock(item, tone));
}

/** Custom blocks alone, for callers that hold no sections. */
export function customBlocksToBlocks(
  customBlocks: readonly CustomBlock[],
  tone: WeekGridTone = "plan",
): WeekGridBlock[] {
  return sectionsToBlocks([], customBlocks, tone);
}

/**
 * `PlannedMeeting[]` — what the course drawer hands us via `PrimaryPlanSnapshot`.
 *
 * These are already flattened per weekday, and they carry a caller-authored
 * `label` we must preserve rather than re-derive, so they do not go through
 * `toTimedItems`.
 */
export function plannedMeetingsToBlocks(
  meetings: readonly PlannedMeeting[],
  tone: WeekGridTone = "plan",
): WeekGridBlock[] {
  return meetings
    .filter((meeting) => meeting.endMinute > meeting.startMinute)
    .map((meeting) => ({
      blockId: blockIdFor(meeting.ownerId, meeting.weekday, meeting.startMinute),
      label: meeting.label,
      sublabel: meeting.buildingName,
      weekday: meeting.weekday,
      startMinute: meeting.startMinute,
      endMinute: meeting.endMinute,
      tone,
    }));
}

// ---------------------------------------------------------------------------
// Conflict marking
// ---------------------------------------------------------------------------

/**
 * Which conflicts repaint a rectangle.
 *
 * A time overlap and a duplicate course are things the reader can *see* on the
 * grid — two rectangles sitting on top of each other, or the same course twice.
 * A commute warning is about the gap between rectangles, not the rectangles
 * themselves; recolouring both ends would claim a clash that is not there. Those
 * are surfaced by `PlanSummary` instead.
 */
const VISIBLE_CLASH_KINDS: readonly ConflictKind[] = ["overlap", "duplicate_course"];

/** Repaints every rectangle involved in a visible clash with the `conflict` tone. */
export function markConflicts(
  blocks: readonly WeekGridBlock[],
  conflicts: readonly ScheduleConflict[],
): WeekGridBlock[] {
  const clashing = conflictedIds(
    conflicts.filter((conflict) => VISIBLE_CLASH_KINDS.includes(conflict.kind)),
  );
  if (clashing.size === 0) return [...blocks];
  return blocks.map((block) =>
    clashing.has(ownerIdOf(block.blockId)) ? { ...block, tone: "conflict" as const } : block,
  );
}

// ---------------------------------------------------------------------------
// The one call the UI makes
// ---------------------------------------------------------------------------

export interface WeekGridInput {
  /** Sections committed to the plan. */
  sections?: readonly Section[];
  /** Non-course commitments in the plan. Full participants (spec §8). */
  customBlocks?: readonly CustomBlock[];
  /** Committed meetings when the caller holds a `PrimaryPlanSnapshot`, not sections. */
  plannedMeetings?: readonly PlannedMeeting[];
  /** Sections previewed from the drawer or the watchlist — translucent candidates. */
  candidateSections?: readonly Section[];
  /** The same preview, expressed as meetings. */
  candidateMeetings?: readonly PlannedMeeting[];
}

/**
 * Every rectangle for one week, toned.
 *
 * Candidates are included in conflict detection — the entire point of previewing
 * a watched section onto the grid is to find out whether it breaks the plan, so
 * a candidate that lands on a committed meeting comes back as `conflict`, and so
 * does the committed meeting it lands on.
 */
export function toWeekGridBlocks(input: WeekGridInput): WeekGridBlock[] {
  const planned = splitPlannedMeetings(input.plannedMeetings ?? []);
  const candidate = splitPlannedMeetings(input.candidateMeetings ?? []);

  const planSections = [...(input.sections ?? []), ...planned.sections];
  const planCustomBlocks = [...(input.customBlocks ?? []), ...planned.customBlocks];
  const candidateSections = [...(input.candidateSections ?? []), ...candidate.sections];

  const blocks = [
    ...sectionsToBlocks(input.sections ?? [], input.customBlocks ?? [], "plan"),
    ...plannedMeetingsToBlocks(input.plannedMeetings ?? [], "plan"),
    ...sectionsToBlocks(input.candidateSections ?? [], [], "candidate"),
    ...plannedMeetingsToBlocks(input.candidateMeetings ?? [], "candidate"),
  ];

  const conflicts = detectConflicts(
    [...planSections, ...candidateSections],
    [...planCustomBlocks, ...candidate.customBlocks],
  );

  return markConflicts(blocks, conflicts).sort(compareBlocks);
}

/**
 * `PlannedMeeting` back into the two shapes `detectConflicts` understands.
 *
 * A meeting with a `courseId` is a section meeting and must reach duplicate-course
 * detection as one; a meeting without is a custom block. These synthesized records
 * exist only to be analysed — the rectangles the reader sees are built separately
 * from the caller's own labels, so the placeholder fields here never render.
 */
function splitPlannedMeetings(meetings: readonly PlannedMeeting[]): {
  sections: Section[];
  customBlocks: CustomBlock[];
} {
  const sectionsById = new Map<string, Section>();
  const customBlocks: CustomBlock[] = [];

  for (const meeting of meetings) {
    if (meeting.endMinute <= meeting.startMinute) continue;

    if (meeting.courseId == null) {
      customBlocks.push({
        blockId: meeting.ownerId,
        label: meeting.label,
        weekday: meeting.weekday,
        startMinute: meeting.startMinute,
        endMinute: meeting.endMinute,
      });
      continue;
    }

    const existing =
      sectionsById.get(meeting.ownerId) ?? synthesizeSection(meeting.ownerId, meeting.courseId);
    existing.meetings.push({
      weekday: meeting.weekday,
      startMinute: meeting.startMinute,
      endMinute: meeting.endMinute,
      buildingName: meeting.buildingName,
      room: null,
    });
    sectionsById.set(meeting.ownerId, existing);
  }

  return { sections: [...sectionsById.values()], customBlocks };
}

function synthesizeSection(sectionId: string, courseId: string): Section {
  return {
    sectionId,
    courseId,
    termCode: "",
    callNumber: "",
    sectionCode: "",
    component: null,
    methodOfInstruction: null,
    gradingMode: null,
    minUnit: null,
    maxUnit: null,
    instructors: [],
    meetings: [],
    enrollmentCount: null,
    enrollmentCap: null,
    waitlistCount: null,
    waitlistCap: null,
    status: "unknown",
    sourceAsOf: null,
    lastSeenAt: null,
    detailUrl: null,
    note: null,
    openTo: null,
  };
}

// ---------------------------------------------------------------------------
// Grid geometry
// ---------------------------------------------------------------------------

/**
 * Column order. `WEEKDAYS` is Mo–Fr and `ALL_WEEKDAYS` starts on Sunday, but a
 * week grid that shows a Saturday lab wants it after Friday, not before Monday.
 */
const COLUMN_ORDER: readonly Weekday[] = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * Which columns to draw: the weekday base (Mo–Fr) plus any day something
 * actually meets. A Saturday section is rare and is exactly the thing a student
 * must not miss, so it grows a column instead of being dropped.
 */
export function gridWeekdays(
  blocks: readonly WeekGridBlock[],
  base: readonly Weekday[] = WEEKDAYS,
): Weekday[] {
  const shown = new Set<Weekday>(base);
  for (const block of blocks) shown.add(block.weekday);
  return COLUMN_ORDER.filter((day) => shown.has(day));
}

export interface GridBounds {
  startMinute: number;
  endMinute: number;
}

const MINUTES_PER_DAY = 24 * 60;

function floorToHour(minute: number): number {
  return Math.floor(minute / 60) * 60;
}

function ceilToHour(minute: number): number {
  return Math.ceil(minute / 60) * 60;
}

/**
 * Vertical bounds. Defaults come from `GRID_START_MINUTE`/`GRID_END_MINUTE`, but
 * an 8am default must never clip a 7:40am section — a clipped meeting is a
 * meeting the student does not know they have. Expansion snaps to the hour so
 * the ruled lines stay on the hour.
 */
export function gridBounds(
  blocks: readonly WeekGridBlock[],
  startMinute: number = GRID_START_MINUTE,
  endMinute: number = GRID_END_MINUTE,
): GridBounds {
  // A non-finite bound would propagate straight into a CSS percentage and blank
  // the canvas, so garbage is replaced with the default rather than clamped.
  let start = Number.isFinite(startMinute) ? startMinute : GRID_START_MINUTE;
  let end = Number.isFinite(endMinute) ? endMinute : GRID_END_MINUTE;

  for (const block of blocks) {
    if (!Number.isFinite(block.startMinute) || !Number.isFinite(block.endMinute)) continue;
    if (block.endMinute <= block.startMinute) continue;
    if (block.startMinute < start) start = floorToHour(block.startMinute);
    if (block.endMinute > end) end = ceilToHour(block.endMinute);
  }

  // Clamped before the repair below, not after: a start past the end of the day
  // leaves `start + 60` above the ceiling too, so the repair cannot open the
  // window and the function returns an inverted one. Reserving the last hour
  // guarantees there is always somewhere for `end` to land.
  start = Math.min(Math.max(0, start), MINUTES_PER_DAY - 60);
  end = Math.min(MINUTES_PER_DAY, end);
  // A caller can still hand us an inverted window; one empty hour beats a NaN height.
  if (end <= start) end = Math.min(MINUTES_PER_DAY, start + 60);
  return { startMinute: start, endMinute: end };
}

/** An hour of air above the first meeting and below the last. */
const FIT_PADDING_MINUTES = 60;

/** Never collapse below this, or a single seminar gets a comically tall band. */
const MIN_FIT_SPAN_MINUTES = 6 * 60;

/**
 * Vertical bounds that *fit* the blocks instead of always spanning the default
 * window.
 *
 * `gridBounds` only ever grows: a plan whose earliest class is 4:10pm still
 * rendered the full 8am–10pm canvas, so roughly two thirds of the week grid
 * was ruled empty space and the real meetings were compressed into bands too
 * short to read their own labels. Fitting reclaims that height for the blocks
 * that exist.
 *
 * It only ever contracts *within* whatever `gridBounds` returned, so the
 * clipping guarantee that function documents still holds — an out-of-window
 * meeting expands the canvas first, and the fit is applied to the expanded
 * window. Padding and the minimum span keep the result from hugging the
 * blocks so tightly that the grid reads as a bar chart.
 */
export function fitGridBounds(
  blocks: readonly WeekGridBlock[],
  startMinute?: number,
  endMinute?: number,
): GridBounds {
  const outer = gridBounds(blocks, startMinute, endMinute);

  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const block of blocks) {
    if (block.endMinute <= block.startMinute) continue;
    earliest = Math.min(earliest, block.startMinute);
    latest = Math.max(latest, block.endMinute);
  }

  // Nothing to fit around: an empty week keeps the full default canvas rather
  // than collapsing to a sliver that says nothing about the term's shape.
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return outer;

  let start = Math.max(outer.startMinute, floorToHour(earliest) - FIT_PADDING_MINUTES);
  let end = Math.min(outer.endMinute, ceilToHour(latest) + FIT_PADDING_MINUTES);

  // Grow back toward the outer window — downward first, since a day reads more
  // naturally with its later hours shown than its earlier ones.
  if (end - start < MIN_FIT_SPAN_MINUTES) {
    end = Math.min(outer.endMinute, start + MIN_FIT_SPAN_MINUTES);
    start = Math.max(outer.startMinute, end - MIN_FIT_SPAN_MINUTES);
  }

  // `outer` is already valid, and both moves above only ever pull inward from
  // it, so this can only fire if a future edit breaks that. Cheap insurance
  // against handing the renderer a zero or negative height.
  if (end <= start) return outer;

  return { startMinute: start, endMinute: end };
}

/**
 * Every hour boundary that opens a band inside the window. The closing edge is
 * excluded: it labels nothing and the grid's own border already draws it.
 */
export function hourMarks(bounds: GridBounds): number[] {
  const marks: number[] = [];
  for (let minute = ceilToHour(bounds.startMinute); minute < bounds.endMinute; minute += 60) {
    marks.push(minute);
  }
  return marks;
}

export interface PositionedBlock extends WeekGridBlock {
  /** Zero-based column within this rectangle's overlap cluster. */
  lane: number;
  /** Columns the cluster needs. Rendered width is `1 / laneCount` of the day. */
  laneCount: number;
}

function compareBlocks(a: WeekGridBlock, b: WeekGridBlock): number {
  const byDay = COLUMN_ORDER.indexOf(a.weekday) - COLUMN_ORDER.indexOf(b.weekday);
  if (byDay !== 0) return byDay;
  return compareWithinDay(a, b);
}

function compareWithinDay(a: WeekGridBlock, b: WeekGridBlock): number {
  if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
  // Longest first, so the block that spans the cluster takes the leftmost lane
  // and the short ones stack to its right — the shape a reader expects.
  if (a.endMinute !== b.endMinute) return b.endMinute - a.endMinute;
  return a.blockId.localeCompare(b.blockId);
}

/**
 * Side-by-side layout for one day.
 *
 * Blocks are walked in start order and split into clusters of transitively
 * overlapping rectangles. Within a cluster each rectangle takes the first lane
 * whose previous occupant has already finished; the cluster's lane count is the
 * denominator for every member's width. Two 10:10 lectures therefore render as
 * two half-width rectangles rather than one hiding the other.
 */
export function layoutDay(blocks: readonly WeekGridBlock[]): PositionedBlock[] {
  const ordered = [...blocks]
    .filter((block) => block.endMinute > block.startMinute)
    .sort(compareWithinDay);

  const positioned: PositionedBlock[] = [];
  let cluster: PositionedBlock[] = [];
  /** End minute of the last rectangle placed in each lane of the open cluster. */
  const laneEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const closeCluster = () => {
    for (const block of cluster) block.laneCount = laneEnds.length;
    positioned.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const block of ordered) {
    // Nothing left in the open cluster reaches this rectangle: start a new one,
    // so an afternoon pair does not inherit the morning pair's width.
    if (cluster.length > 0 && block.startMinute >= clusterEnd) closeCluster();

    let lane = laneEnds.findIndex((end) => end <= block.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.endMinute);
    } else {
      laneEnds[lane] = block.endMinute;
    }

    cluster.push({ ...block, lane, laneCount: 1 });
    clusterEnd = Math.max(clusterEnd, block.endMinute);
  }

  if (cluster.length > 0) closeCluster();
  return positioned;
}

/** Every day's rectangles laid out, keyed by weekday. */
export function layoutWeek(
  blocks: readonly WeekGridBlock[],
  days: readonly Weekday[],
): Map<Weekday, PositionedBlock[]> {
  const byDay = new Map<Weekday, PositionedBlock[]>();
  for (const day of days) {
    byDay.set(
      day,
      layoutDay(blocks.filter((block) => block.weekday === day)),
    );
  }
  return byDay;
}

/** Fraction of the window a minute sits at, clamped so nothing escapes the grid. */
export function fractionOf(minute: number, bounds: GridBounds): number {
  const span = bounds.endMinute - bounds.startMinute;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (minute - bounds.startMinute) / span));
}

/** Blocks grouped by weekday in column order, sorted — what the agenda list reads. */
export function groupBlocksByWeekday(
  blocks: readonly WeekGridBlock[],
): { weekday: Weekday; blocks: WeekGridBlock[] }[] {
  const byDay = new Map<Weekday, WeekGridBlock[]>();
  for (const block of blocks) {
    const list = byDay.get(block.weekday);
    if (list) list.push(block);
    else byDay.set(block.weekday, [block]);
  }
  return COLUMN_ORDER.filter((day) => byDay.has(day)).map((weekday) => ({
    weekday,
    blocks: (byDay.get(weekday) ?? []).sort(compareWithinDay),
  }));
}
