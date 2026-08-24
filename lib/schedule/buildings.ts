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
 * ── Coordinates ───────────────────────────────────────────────────────────
 *
 * Centroids of named building footprints from OpenStreetMap, fetched via the
 * Overpass API and mirrored into the `buildings` table by migration 0025.
 * Data © OpenStreetMap contributors, ODbL 1.0, which permits storing and
 * redistributing them with attribution.
 *
 * Every number here is a matched footprint. None is interpolated, averaged, or
 * recalled — coordinates from memory would be a guess presented as fact, and
 * unlike a missing seat count a wrong one does not look wrong: it renders as a
 * confident walking time on a student's schedule.
 *
 * Nine of the sixty buildings had no confident OSM match and keep `null`
 * coordinates on purpose: Engineering Terrace, the Journalism Building,
 * Teachers College, Lehman Hall, Alumni Auditorium (a room inside another
 * building), the Allan Rosenfield Building, and the three off-campus sites.
 * `walkMinutesBetween` falls back to `ZONE_WALK_MINUTES` for any pair that is
 * missing one — honest and coarse, rather than precise and invented.
 *
 * What this buys: within-campus walks are now measured rather than flat.
 * Mudd → Havemeyer is 186 m and Mudd → Lerner is 440 m; before this they
 * returned the same number.
 */

import type { Building, CampusZone } from "../types";

/**
 * Coordinates are optional because nine of the sixty genuinely have none — see
 * the header. A building declared without them is not an oversight to be
 * tidied up later; it is a building OSM does not name, and `walkMinutesBetween`
 * falls back to the zone estimate for it on purpose.
 */
function building(
  buildingId: string,
  name: string,
  campusZone: CampusZone,
  lat: number | null = null,
  lng: number | null = null,
): Building {
  return { buildingId, name, lat, lng, campusZone };
}

export const DEMO_BUILDINGS: Building[] = [
  // Morningside
  building("mudd", "Seeley W. Mudd Building", "morningside", 40.809354, -73.959963),
  building("nwc", "Northwest Corner Building", "morningside", 40.810013, -73.96195),
  building("pupin", "Pupin Laboratories", "morningside", 40.80999, -73.961399),
  building("schermerhorn", "Schermerhorn Hall", "morningside", 40.808525, -73.960432),
  building("havemeyer", "Havemeyer Hall", "morningside", 40.809288, -73.962169),
  building("mathematics", "Mathematics Building", "morningside", 40.809017, -73.962732),
  building("hamilton", "Hamilton Hall", "morningside", 40.806803, -73.961676),
  building("fayerweather", "Fayerweather Hall", "morningside", 40.808065, -73.960469),
  building("kent", "Kent Hall", "morningside", 40.807214, -73.961399),
  building("philosophy", "Philosophy Hall", "morningside", 40.807439, -73.960937),
  building("lewisohn", "Lewisohn Hall", "morningside", 40.808391, -73.963193),
  building("uris", "Uris Hall", "morningside", 40.808981, -73.961277),
  building("lerner", "Alfred Lerner Hall", "morningside", 40.806874, -73.964038),
  building("butler", "Butler Library", "morningside", 40.806367, -73.963191),
  building("iab", "International Affairs Building", "morningside", 40.807508, -73.959774),
  building("avery", "Avery Hall", "morningside", 40.808267, -73.960944),
  building("dodge", "Dodge Hall", "morningside", 40.807973, -73.963189),
  building("journalism", "Journalism Building", "morningside"),
  building("knox", "Knox Hall", "morningside", 40.811949, -73.961836),
  building("low", "Low Memorial Library", "morningside", 40.808224, -73.961835),
  building("engineering-terrace", "Engineering Terrace", "morningside"),
  building("chandler", "Chandler Laboratories", "morningside", 40.809626, -73.962282),

  // Barnard
  building("barnard-hall", "Barnard Hall", "barnard", 40.809143, -73.963943),
  building("diana", "Diana Center", "barnard", 40.809861, -73.962966),
  building("milbank", "Milbank Hall", "barnard", 40.810446, -73.962845),
  building("altschul", "Altschul Hall", "barnard", 40.810081, -73.963341),
  building("milstein", "Milstein Center", "barnard", 40.809688, -73.963649),
  building("lehman", "Lehman Hall", "barnard"),

  // Manhattanville
  building("jerome-greene", "Jerome L. Greene Science Center", "manhattanville", 40.816874, -73.958215),
  building("lenfest", "Lenfest Center for the Arts", "manhattanville", 40.817234, -73.958697),
  building("forum", "The Forum", "manhattanville", 40.816334, -73.958497),
  building("studebaker", "Studebaker Building", "manhattanville", 40.818349, -73.957849),

  // CUIMC (Washington Heights)
  building("hammer", "Hammer Health Sciences Center", "cuimc", 40.84275, -73.942597),
  building("black", "William Black Medical Research Building", "cuimc", 40.841612, -73.941817),
  building("vagelos-education", "Roy and Diana Vagelos Education Center", "cuimc", 40.844758, -73.942687),
  building("georgian", "Georgian Building", "cuimc", 40.841752, -73.940396),
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
