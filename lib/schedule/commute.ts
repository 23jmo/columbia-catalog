/**
 * Schedule lane — commute analysis.
 *
 * Spec §7: for every back-to-back pair in a plan, compute walking minutes and
 * compare them against the passing period. Cross-campus transitions hard-warn
 * (Morningside ↔ Manhattanville ~14 min, Morningside ↔ CUIMC ~35 min); tight
 * intra-Morningside walks get a soft note.
 *
 * Custom blocks are included: walking from a Manhattanville lecture to a shift
 * that starts fifteen minutes later is exactly the failure this catches.
 *
 * Pure. Importable from the MCP server.
 */

import type {
  Building,
  CampusZone,
  CommuteLeg,
  CustomBlock,
  ScheduleConflict,
  Section,
  Weekday,
} from "../types";
import { WEEKDAY_LABEL, ZONE_LABEL, ZONE_WALK_MINUTES, isCrossCampus } from "../constants";
import { DEMO_BUILDINGS, findBuilding, normalizeBuildingName } from "./buildings";
import { isRemoteLocation, resolveCampusBuilding } from "../campus/zones";
import { groupByWeekday, toTimedItems, type TimedItem } from "./timeline";

/** Slack below which a technically-possible walk still deserves a soft note. */
export const TIGHT_BUFFER_MINUTES = 5;

/** Metres a student covers per minute at an unhurried pace. */
const METRES_PER_MINUTE = 78;
/** Street grid detour factor over straight-line distance. */
const STREET_FACTOR = 1.3;

export interface CommuteOptions {
  /** Override the soft-note threshold. Defaults to `TIGHT_BUFFER_MINUTES`. */
  tightBufferMinutes?: number;
}

/**
 * A `CommuteLeg` plus the ids of the two things being walked between.
 *
 * `CommuteLeg` in `lib/types` is the shared shape and deliberately carries no
 * ids — but the grid needs to highlight the exact two blocks a warning is
 * about, so the analyzer returns this widened form. It is assignable to
 * `CommuteLeg` everywhere, including across the MCP boundary.
 */
export interface CommuteLegDetail extends CommuteLeg {
  /** Section id or custom block id the student is leaving. */
  fromId: string;
  /** Section id or custom block id the student is heading to. */
  toId: string;
}

/**
 * Walking minutes between two resolved buildings.
 *
 * Zone estimates are authoritative across campuses — they encode the shuttle-or-
 * subway reality that straight-line distance does not. Geocodes, when both
 * buildings have them and both sit in the same zone, refine the within-campus
 * number. A missing geocode or an unknown building never throws; it falls back
 * to the zone table, which has an entry for every zone pair including "unknown".
 */
export function walkMinutesBetween(from: Building | null, to: Building | null): number {
  const fromZone: CampusZone = from?.campusZone ?? "unknown";
  const toZone: CampusZone = to?.campusZone ?? "unknown";
  const zoneEstimate = ZONE_WALK_MINUTES[fromZone][toZone];

  const sameZone = fromZone === toZone && fromZone !== "unknown";
  if (
    sameZone &&
    from &&
    to &&
    from.lat != null &&
    from.lng != null &&
    to.lat != null &&
    to.lng != null
  ) {
    const metres = haversineMetres(from.lat, from.lng, to.lat, to.lng) * STREET_FACTOR;
    return Math.max(1, Math.round(metres / METRES_PER_MINUTE));
  }

  return zoneEstimate;
}

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMetres = 6_371_000;
  const toRadians = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMetres * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Every back-to-back transition in the week, with the walk it demands and the
 * gap actually available. Overlapping pairs are left to `detectConflicts` —
 * a negative gap is a time conflict, not a commute.
 */
/**
 * Resolve a raw location string to something with a campus zone.
 *
 * `findBuilding` scans the caller's own table and is deliberately conservative,
 * so it gives up on strings the Bulletin actually prints — "451 Computer
 * Science Bldg", "502 Northwest Corner", "415 Schapiro Cepser" (CEPSR is
 * misspelled at the source), "601b Fairchild Life Sciences Bldg". A miss is not
 * harmless here: an unresolved end makes the zone "unknown", and
 * `ZONE_WALK_MINUTES.unknown` is a guess, so the student is warned about a walk
 * we never actually measured.
 *
 * The caller's table stays the authority — it carries lat/lng, which lets
 * `walkMinutesBetween` refine same-zone legs. `resolveCampusBuilding` is only
 * consulted when that table has no answer, and it contributes a zone alone.
 */
function resolveLocation(
  rawName: string | null | undefined,
  buildings: readonly Building[],
): Building | null {
  const known = findBuilding(rawName, buildings);
  if (known) return known;

  const alias = resolveCampusBuilding(rawName);
  if (!alias) return null;
  return {
    buildingId: alias.buildingId,
    name: alias.name,
    // The alias table is names and zones only; no coordinates to offer.
    lat: null,
    lng: null,
    campusZone: alias.campusZone,
  };
}

export function analyzeCommute(
  sections: readonly Section[],
  blocks: readonly CustomBlock[] = [],
  buildings: readonly Building[] = DEMO_BUILDINGS,
): CommuteLegDetail[] {
  const legs: CommuteLegDetail[] = [];
  const byDay = groupByWeekday(toTimedItems(sections, blocks));

  for (const [weekday, items] of byDay) {
    for (let i = 0; i < items.length - 1; i += 1) {
      const from = items[i];
      const to = items[i + 1];

      const gapMinutes = to.startMinute - from.endMinute;
      if (gapMinutes < 0) continue; // overlap — reported as a conflict instead
      if (isSamePlace(from, to)) continue; // same room, nobody walks anywhere

      // Nobody walks to a Zoom link. An online end has no location to cross,
      // so charging it the "unknown" zone penalty would invent a commute.
      if (isRemoteLocation(from.buildingName) || isRemoteLocation(to.buildingName)) continue;

      const fromBuilding = resolveLocation(from.buildingName, buildings);
      const toBuilding = resolveLocation(to.buildingName, buildings);
      const walkMinutes = walkMinutesBetween(fromBuilding, toBuilding);

      legs.push({
        weekday,
        fromId: from.id,
        toId: to.id,
        fromLabel: placeLabel(from),
        toLabel: placeLabel(to),
        fromZone: fromBuilding?.campusZone ?? "unknown",
        toZone: toBuilding?.campusZone ?? "unknown",
        walkMinutes,
        gapMinutes,
        feasible: gapMinutes >= walkMinutes,
      });
    }
  }

  return legs;
}

function isSamePlace(a: TimedItem, b: TimedItem): boolean {
  if (!a.buildingName || !b.buildingName) return false;
  return normalizeBuildingName(a.buildingName) === normalizeBuildingName(b.buildingName);
}

function placeLabel(item: TimedItem): string {
  return item.buildingName ?? item.label;
}

/** Ids of the two items a leg connects, when the leg carries them. */
function legInvolves(leg: CommuteLeg | CommuteLegDetail): string[] {
  return "fromId" in leg && "toId" in leg ? [leg.fromId, leg.toId] : [];
}

/**
 * Legs turned into the warnings the grid renders inline.
 *
 * Severity, in the order it is decided:
 *
 * 1. A walk that does not fit the gap between two *resolved* buildings is
 *    hard. It is not a preference, the student cannot be in both places.
 * 2. A cross-campus transition (spec §7: Morningside ↔ Manhattanville,
 *    Morningside ↔ CUIMC) hard-warns whenever the slack is thinner than a
 *    passing period. Barnard ↔ Morningside is not cross-campus — `isCrossCampus`
 *    already treats that pair as one campus, which is how students treat it.
 *    A cross-campus hop with hours to spare is still worth saying out loud, so
 *    it drops to a soft note rather than disappearing.
 * 3. A tight intra-campus walk is a soft note.
 * 4. Anything involving an unresolved building stays soft. Our estimate there
 *    is a guess and a guess should never shout.
 */
export function commuteConflicts(
  legs: readonly (CommuteLeg | CommuteLegDetail)[],
  options: CommuteOptions = {},
): ScheduleConflict[] {
  const tightBuffer = options.tightBufferMinutes ?? TIGHT_BUFFER_MINUTES;
  const conflicts: ScheduleConflict[] = [];

  for (const leg of legs) {
    const zonesKnown = leg.fromZone !== "unknown" && leg.toZone !== "unknown";
    const crossCampus = zonesKnown && isCrossCampus(leg.fromZone, leg.toZone);
    const slack = leg.gapMinutes - leg.walkMinutes;
    const involves = legInvolves(leg);
    const where = `${leg.fromLabel} to ${leg.toLabel} on ${WEEKDAY_LABEL[leg.weekday]}`;
    const zones = `${ZONE_LABEL[leg.fromZone]} → ${ZONE_LABEL[leg.toZone]}`;

    if (!leg.feasible) {
      conflicts.push({
        kind: "commute",
        severity: zonesKnown ? "hard" : "soft",
        message: crossCampus
          ? `${zones}: ${where} is about a ${leg.walkMinutes} min trip with only ${leg.gapMinutes} min between. Not makeable.`
          : `${where} is about a ${leg.walkMinutes} min walk with only ${leg.gapMinutes} min between.`,
        involves,
        weekday: leg.weekday,
      });
      continue;
    }

    if (crossCampus) {
      conflicts.push({
        kind: "commute",
        // Cross-campus with no real buffer is a hard warning per spec §7 — the
        // walk technically fits, but one late dismissal breaks it.
        severity: slack < tightBuffer ? "hard" : "soft",
        message: `${zones} on ${WEEKDAY_LABEL[leg.weekday]}: ${leg.walkMinutes} min from ${leg.fromLabel} to ${leg.toLabel}, ${leg.gapMinutes} min available.`,
        involves,
        weekday: leg.weekday,
      });
      continue;
    }

    if (slack < tightBuffer) {
      conflicts.push({
        kind: "commute",
        severity: "soft",
        message: `Tight: ${where} leaves ${slack} min to spare after a ${leg.walkMinutes} min walk.`,
        involves,
        weekday: leg.weekday,
      });
    }
  }

  return conflicts;
}

/** Walking minutes per weekday, for the plan summary. */
export function totalWalkMinutesByDay(
  legs: readonly CommuteLeg[],
): Partial<Record<Weekday, number>> {
  const totals: Partial<Record<Weekday, number>> = {};
  for (const leg of legs) {
    totals[leg.weekday] = (totals[leg.weekday] ?? 0) + leg.walkMinutes;
  }
  return totals;
}
