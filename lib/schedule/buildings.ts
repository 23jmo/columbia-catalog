/**
 * Schedule lane — building → campus-zone reference.
 *
 * Spec §7: "Buildings are geocoded once."
 *
 * ── Why this lives in code and not in a query ─────────────────────────────
 *
 * The `buildings` table exists and is populated, but it was seeded *from this
 * list* — same 60 names, same zones, same null coordinates. Reading it back
 * would buy no information and cost a great deal: `analyzePlan` and
 * `walkMinutesBetween` are pure synchronous functions that run in the browser
 * on every plan edit, and making them async to fetch a list that changes
 * roughly never is the wrong trade. Columbia does not publish a building
 * registry, so this is not observed data that could go stale behind us — it is
 * reference data, and reference data belongs next to the code that reads it.
 *
 * The table stays because `meetings.building_id` is a foreign key into it and
 * because a future geocode pass needs somewhere to write.
 *
 * ── The part that is genuinely missing ────────────────────────────────────
 *
 * `lat` and `lng` are `null` on every row here, and that is a deliberate
 * refusal rather than an oversight: coordinates recalled from memory would be
 * a guess presented as fact. `walkMinutesBetween` therefore degrades to the
 * zone-level estimates in `ZONE_WALK_MINUTES` — honest, coarse, and correct
 * about the one thing that matters most (a Morningside → CUIMC hop is not
 * walkable between classes). It refines automatically the moment a real
 * lat/lng pair arrives from a real source. See .plans/BLOCKERS.md.
 */

import type { Building, CampusZone } from "../types";

function building(buildingId: string, name: string, campusZone: CampusZone): Building {
  return { buildingId, name, lat: null, lng: null, campusZone };
}

export const DEMO_BUILDINGS: Building[] = [
  // Morningside
  building("mudd", "Seeley W. Mudd Building", "morningside"),
  building("nwc", "Northwest Corner Building", "morningside"),
  building("pupin", "Pupin Laboratories", "morningside"),
  building("schermerhorn", "Schermerhorn Hall", "morningside"),
  building("havemeyer", "Havemeyer Hall", "morningside"),
  building("mathematics", "Mathematics Building", "morningside"),
  building("hamilton", "Hamilton Hall", "morningside"),
  building("fayerweather", "Fayerweather Hall", "morningside"),
  building("kent", "Kent Hall", "morningside"),
  building("philosophy", "Philosophy Hall", "morningside"),
  building("lewisohn", "Lewisohn Hall", "morningside"),
  building("uris", "Uris Hall", "morningside"),
  building("lerner", "Alfred Lerner Hall", "morningside"),
  building("butler", "Butler Library", "morningside"),
  building("iab", "International Affairs Building", "morningside"),
  building("avery", "Avery Hall", "morningside"),
  building("dodge", "Dodge Hall", "morningside"),
  building("journalism", "Journalism Building", "morningside"),
  building("knox", "Knox Hall", "morningside"),
  building("low", "Low Memorial Library", "morningside"),
  building("engineering-terrace", "Engineering Terrace", "morningside"),
  building("chandler", "Chandler Laboratories", "morningside"),

  // Barnard
  building("barnard-hall", "Barnard Hall", "barnard"),
  building("diana", "Diana Center", "barnard"),
  building("milbank", "Milbank Hall", "barnard"),
  building("altschul", "Altschul Hall", "barnard"),
  building("milstein", "Milstein Center", "barnard"),
  building("lehman", "Lehman Hall", "barnard"),

  // Manhattanville
  building("jerome-greene", "Jerome L. Greene Science Center", "manhattanville"),
  building("lenfest", "Lenfest Center for the Arts", "manhattanville"),
  building("forum", "The Forum", "manhattanville"),
  building("studebaker", "Studebaker Building", "manhattanville"),

  // CUIMC (Washington Heights)
  building("hammer", "Hammer Health Sciences Center", "cuimc"),
  building("black", "William Black Medical Research Building", "cuimc"),
  building("vagelos-education", "Roy and Diana Vagelos Education Center", "cuimc"),
  building("georgian", "Georgian Building", "cuimc"),
  building("alumni-auditorium", "Alumni Auditorium", "cuimc"),
];

/** Lowercased, punctuation-free, whitespace-free form used for fuzzy matching. */
export function normalizeBuildingName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Directory strings are messy — "417 MATHEMATICS BUILDING", "Mudd", "Diana
 * Center Rm 501". Match when either normalized name contains the other, with a
 * length floor so a two-letter room code can never claim a building.
 */
export function findBuilding(
  rawName: string | null | undefined,
  buildings: readonly Building[],
): Building | null {
  if (!rawName) return null;
  const needle = normalizeBuildingName(rawName);
  if (needle.length < 3) return null;

  for (const candidate of buildings) {
    if (normalizeBuildingName(candidate.name) === needle) return candidate;
    if (normalizeBuildingName(candidate.buildingId) === needle) return candidate;
  }
  for (const candidate of buildings) {
    const name = normalizeBuildingName(candidate.name);
    const id = normalizeBuildingName(candidate.buildingId);
    if (name.length >= 4 && needle.includes(name)) return candidate;
    if (needle.length >= 4 && name.includes(needle)) return candidate;
    if (id.length >= 4 && needle.includes(id)) return candidate;
  }
  return null;
}

/** Zone for a raw meeting location string. Unknown buildings resolve to "unknown". */
export function zoneOf(
  rawName: string | null | undefined,
  buildings: readonly Building[],
): CampusZone {
  return findBuilding(rawName, buildings)?.campusZone ?? "unknown";
}
