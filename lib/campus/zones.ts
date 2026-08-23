/**
 * Campus lane — building-name → `CampusZone` resolution.
 *
 * This is the pure half of the lane: no DOM, no three.js, no React. Everything
 * the 3D card and the drawer need to answer "which campus is this section on?"
 * happens here, so it can be unit-tested against the real, messy strings the
 * sources actually publish.
 *
 * WHY a second resolver at all when `lib/schedule/buildings.ts` already has
 * `zoneOf`: that one is a deliberately conservative substring matcher over a
 * short demo table, and it misses most of what the Bulletin actually prints.
 * Sampling `lib/ingest/__fixtures__/bulletin-cs.html` — the only fixture that
 * still carries locations, since the Directory now hides them behind Vergil —
 * the location cell looks like this:
 *
 *     "451 Computer Science Bldg"      room number glued to an abbreviation
 *     "601b Fairchild Life Sciences Bldg"   room number with a suffix letter
 *     "963 Ext Schermerhorn Hall"      a wing marker in the middle
 *     "Cin Alfred Lerner Hall"         a venue marker instead of a room
 *     "502 Northwest Corner"           the word "Building" simply dropped
 *     "415 Schapiro Cepser"            CEPSR, misspelled at the source
 *     "402 Chandler" / "310 Fayerweather"   "Hall"/"Laboratories" dropped
 *     "Room TBA" / "None None" / ""    three different ways of saying nothing
 *
 * So this module owns the cleaning rules (strip the room token, expand the
 * abbreviations, drop the wing markers) and a per-building alias table, and it
 * reuses `DEMO_BUILDINGS` for the zone facts that already exist rather than
 * restating them. When the ingest lane lands a real `buildings` table, only
 * `CAMPUS_BUILDINGS` has to change.
 */

import type { Building, CampusZone } from "../types";
import { DEMO_BUILDINGS } from "../schedule/buildings";

// ---------------------------------------------------------------------------
// The building table
// ---------------------------------------------------------------------------

function building(buildingId: string, name: string, campusZone: CampusZone): Building {
  return { buildingId, name, lat: null, lng: null, campusZone };
}

/**
 * Buildings the schedule lane's table does not carry yet. Deliberately kept as
 * an *additive* list: zones for buildings that already exist come from
 * `DEMO_BUILDINGS`, so the two lanes can never disagree about, say, whether
 * Milbank is Barnard.
 */
const ADDITIONAL_BUILDINGS: Building[] = [
  // Morningside — the three most common Bulletin locations that the demo table
  // is missing, plus the landmarks a campus map is wrong without.
  building("cs-building", "Computer Science Building", "morningside"),
  building("cepsr", "Schapiro CEPSR", "morningside"),
  building("fairchild", "Fairchild Life Sciences Building", "morningside"),
  building("john-jay", "John Jay Hall", "morningside"),
  building("earl", "Earl Hall", "morningside"),
  building("st-pauls", "St. Paul's Chapel", "morningside"),
  building("buell", "Buell Hall", "morningside"),
  building("teachers-college", "Teachers College", "morningside"),
  // Dodge PHYSICAL FITNESS Center — the gym under the north end of campus, and
  // emphatically not Dodge Hall, which is the arts building on the quad two
  // hundred metres away. Without its own entry the gym's ~90 Bulletin meetings
  // score against the bare "dodge" alias and pin on the wrong building, which
  // is worse than not drawing them: the reader is told a confident wrong room.
  // It has no surveyed footprint yet, so it resolves to a zone and the card
  // says "Not on the map" — honest, and the pin goes nowhere false.
  building("dodge-fitness", "Dodge Physical Fitness Center", "morningside"),

  // Residence halls, which are classroom buildings twice a week: the Core
  // assigns Lit Hum and CC seminars to lounges in Carman and Broadway, and
  // between them that is fifty Fall 2026 meetings — more than Mathematics,
  // Lewisohn and Knox put together.
  building("carman", "Carman Hall", "morningside"),
  building("broadway-hall", "Broadway Residence Hall", "morningside"),

  // The registrar's classroom inventory calls this suite the Martin Luther
  // King Building, at 645 W 120th. You reach it through Riverside Church at
  // 91 Claremont, and the church is what the survey knows and the map draws —
  // so the pin is the church and the name is the one on the timetable. Twenty
  // three of the twenty five meetings up there say "Martin Luther King
  // Building"; none of them say which door.
  building("mlk", "Martin Luther King Building", "morningside"),

  building("kraft", "Kraft Center", "morningside"),
  building("international-house", "International House", "morningside"),

  // Real, sited, and absent from OpenStreetMap, which is the only source of
  // outlines we have. They resolve to a zone and the card says "Not on the
  // map" — the same honest degradation as `dodge-fitness` above.
  building("claremont-80", "80 Claremont Avenue", "morningside"),
  building("watson", "Watson Hall", "morningside"),
  building("heyman", "Heyman Center for the Humanities", "morningside"),
  building("casa-hispanica", "Casa Hispánica", "morningside"),

  // Manhattanville. Prentis is at 125th and Broadway — Columbia calls it
  // Manhattanville even though students think of it as "up past the gym".
  building("prentis", "Prentis Hall", "manhattanville"),
  // The business school's two halves and the old industrial building the
  // engineering school kept. All three are drawn on the Manhattanville plane,
  // so the zone table has to know them or the map throws at import.
  building("kravis", "Henry R. Kravis Hall", "manhattanville"),
  building("geffen", "David Geffen Hall", "manhattanville"),
  building("nash", "Nash Building", "manhattanville"),

  // Barnard
  building("sulzberger", "Sulzberger Hall", "barnard"),
  building("elliott", "Elliott Hall", "barnard"),

  // CUIMC. Note the deliberate collision with Barnard's Milstein Center — see
  // the alias table for how the two are told apart.
  building("milstein-hospital", "Milstein Hospital Building", "cuimc"),
  building("mailman", "Allan Rosenfield Building", "cuimc"),
  building("ps", "College of Physicians and Surgeons", "cuimc"),
  building("bard", "Bard Hall", "cuimc"),
  building("nyspi", "New York State Psychiatric Institute", "cuimc"),

  // Genuinely off-campus Columbia addresses. These are "other", not "unknown":
  // we know exactly where they are, they are just nowhere you can walk to
  // between classes.
  building("lamont", "Lamont-Doherty Earth Observatory", "other"),
  building("nevis", "Nevis Laboratories", "other"),
  building("reid-hall", "Reid Hall", "other"),
  building("baker", "Baker Athletics Complex", "other"),
];

/** Every building this lane can place, zone-authoritative. */
export const CAMPUS_BUILDINGS: readonly Building[] = [...DEMO_BUILDINGS, ...ADDITIONAL_BUILDINGS];

// ---------------------------------------------------------------------------
// Aliases
// ---------------------------------------------------------------------------

/**
 * Extra spellings per building id, in the form a reader would type or a source
 * would print. Normalised (lowercased, punctuation-free) before use, so entries
 * here can stay readable.
 *
 * The matcher prefers the LONGEST alias that matches, which is what keeps the
 * two Milsteins apart: "Milstein Hospital Building" hits `milsteinhospital`
 * (16 chars) before it hits Barnard's `milstein` (8). A bare "Milstein"
 * resolves to Barnard on purpose — in a course catalog the teaching building
 * is overwhelmingly the intended one.
 */
const ALIASES_BY_BUILDING_ID: Record<string, string[]> = {
  // --- Morningside -----------------------------------------------------------
  mudd: ["mudd", "seeley w mudd", "seeley mudd", "s w mudd", "mudd hall"],
  "engineering-terrace": ["engineering terrace", "eng terrace", "et"],
  cepsr: ["cepsr", "schapiro cepsr", "schapiro cepser", "schapiro", "schapiro center"],
  "cs-building": ["computer science building", "computer science", "csb"],
  fairchild: ["fairchild life sciences building", "fairchild life sciences", "fairchild"],
  nwc: ["northwest corner building", "northwest corner", "nwc"],
  pupin: ["pupin laboratories", "pupin lab", "pupin"],
  havemeyer: ["havemeyer hall", "havemeyer"],
  chandler: ["chandler laboratories", "chandler lab", "chandler"],
  mathematics: ["mathematics building", "mathematics", "math building"],
  lewisohn: ["lewisohn hall", "lewisohn"],
  journalism: ["journalism building", "journalism hall", "journalism", "pulitzer hall"],
  dodge: ["dodge hall", "dodge"],
  // Longer than the bare "dodge" alias, and `aliasScore` prefers the longest
  // match, so "Dodge Fitness Center" lands here rather than on the arts building.
  "dodge-fitness": [
    "dodge physical fitness center",
    "dodge fitness center",
    "dodge gym",
    "marcellus hartley dodge fitness center",
  ],
  carman: ["carman hall", "carman"],
  // No bare "broadway": it is a street, a residence hall and half the
  // addresses on the west side of campus.
  "broadway-hall": ["broadway residence hall", "broadway hall"],
  // "Riverside Church" and "Martin Luther King Building" are the same doors.
  // Both land here, so the two meetings that name the church pin with the
  // twenty three that name the classrooms inside it.
  mlk: [
    "martin luther king building",
    "martin luther king",
    "riverside church",
    "river side church",
  ],
  kraft: [
    "robert k kraft center for jewish student life",
    "kraft center for jewish student life",
    "kraft center",
  ],
  "international-house": ["davis international house", "international house"],
  "claremont-80": ["80 claremont avenue", "80 claremont ave", "80 claremont"],
  watson: ["watson hall"],
  // The Bulletin drops the "the"; OSM keeps it.
  heyman: ["heyman center for the humanities", "heyman center for humanities", "heyman center"],
  // `normalizeWords` strips the accent to a space, so the accented spelling
  // compacts to "casahispnica" and the plain one to "casahispanica". Neither
  // is a typo, and only listing both matches whichever the source prints.
  "casa-hispanica": ["casa hispanica", "casa hispnica"],
  low: ["low memorial library", "low library", "low plaza", "low rotunda", "low"],
  earl: ["earl hall", "earl"],
  "st-pauls": ["st pauls chapel", "saint pauls chapel", "st pauls"],
  uris: ["uris hall", "uris"],
  schermerhorn: ["schermerhorn hall", "schermerhorn extension", "schermerhorn"],
  avery: ["avery hall", "avery"],
  fayerweather: ["fayerweather hall", "fayerweather"],
  philosophy: ["philosophy hall", "philosophy"],
  kent: ["kent hall", "kent"],
  buell: ["buell hall", "maison francaise", "buell"],
  hamilton: ["hamilton hall", "hamilton"],
  "john-jay": ["john jay hall", "john jay"],
  lerner: ["alfred lerner hall", "lerner hall", "lerner", "roone arledge auditorium"],
  butler: ["butler library", "butler"],
  // SIPA's Lehman Library lives in IAB — not Barnard's Lehman Hall. Listing it
  // here (longer alias) is what stops "Lehman Library" landing across Broadway.
  iab: [
    "international affairs building",
    "international affairs bldg",
    "international affairs",
    "lehman library",
    "sipa",
    "iab",
  ],
  knox: ["knox hall", "knox"],
  "teachers-college": [
    "teachers college",
    "zankel hall",
    "horace mann",
    "thompson hall",
    "russell hall",
    "macy hall",
  ],

  // --- Barnard ---------------------------------------------------------------
  "barnard-hall": ["barnard hall", "lefrak gymnasium", "held auditorium"],
  diana: ["diana center", "the diana", "diana"],
  milbank: ["milbank hall", "milbank"],
  // Barnard rebranded Altschul as the Roy and Diana Vagelos Science Center and
  // the Bulletin followed: Fall 2026 has nineteen meetings in the "R&D Science
  // Center" and not one in Altschul Hall. Same building, so same entry —
  // splitting them would put two outlines on one footprint. The longer alias
  // beats CUIMC's bare "vagelos", which is the Education Center uptown.
  altschul: [
    "roy and diana vagelos science center",
    "vagelos science center",
    "r d science center",
    "altschul hall",
    "altschul",
  ],
  milstein: ["milstein center", "milstein teaching and learning center", "milstein"],
  lehman: ["lehman hall", "lehman auditorium"],
  sulzberger: ["sulzberger hall", "sulzberger"],
  elliott: ["elliott hall", "elliott"],

  // --- Manhattanville --------------------------------------------------------
  "jerome-greene": [
    "jerome l greene science center",
    "jerome greene science center",
    "jerome greene",
    "greene science center",
    "jlg",
  ],
  lenfest: ["lenfest center for the arts", "lenfest center", "lenfest"],
  forum: ["the forum", "forum"],
  studebaker: ["studebaker building", "studebaker"],
  prentis: ["prentis hall", "prentis"],
  kravis: ["henry r kravis hall", "kravis hall", "kravis"],
  // Not Lincoln Center's David Geffen Hall — Columbia Business School's, on
  // the Manhattanville campus.
  geffen: ["david geffen hall", "geffen hall", "geffen"],
  nash: ["nash building", "nash"],

  // --- CUIMC -----------------------------------------------------------------
  hammer: ["hammer health sciences center", "armand hammer", "hammer building", "hammer"],
  black: ["william black medical research building", "william black", "black building"],
  "vagelos-education": [
    "roy and diana vagelos education center",
    "vagelos education center",
    "vagelos",
  ],
  georgian: ["georgian building", "georgian"],
  "alumni-auditorium": ["alumni auditorium"],
  bard: ["bard hall", "bard"],
  nyspi: [
    "new york state psychiatric institute",
    "nys psychiatric institute",
    "psychiatric institute",
    "nyspi",
  ],
  "milstein-hospital": ["milstein hospital building", "milstein hospital"],
  mailman: ["allan rosenfield building", "mailman school of public health", "mailman"],
  ps: [
    "college of physicians and surgeons",
    "physicians and surgeons",
    "vagelos college of physicians and surgeons",
    "p and s",
  ],

  // --- Off-campus ------------------------------------------------------------
  lamont: ["lamont doherty earth observatory", "lamont doherty", "lamont campus"],
  nevis: ["nevis laboratories", "nevis labs", "nevis"],
  "reid-hall": ["reid hall", "columbia global center paris"],
  baker: ["baker athletics complex", "baker field", "wien stadium"],
};

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Lowercase, strip punctuation, collapse whitespace. Keeps word boundaries. */
function normalizeWords(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Word-boundary-free form used for matching, e.g. "seeleywmuddbuilding". */
function compact(words: string): string {
  return words.replace(/ /g, "");
}

/** Abbreviations the Bulletin prints, expanded so one alias covers both forms. */
const ABBREVIATIONS: Record<string, string> = {
  bldg: "building",
  blg: "building",
  bldgs: "buildings",
  ctr: "center",
  cntr: "center",
  aud: "auditorium",
  lib: "library",
  labs: "laboratories",
  lab: "laboratories",
  univ: "university",
  // The source misspells CEPSR as "Cepser"; normalise both to the same token.
  cepser: "cepsr",
};

/**
 * Tokens that mark a wing, a venue or a room and never identify a building.
 * "963 Ext Schermerhorn Hall" and "Cin Alfred Lerner Hall" are both real.
 */
const NOISE_TOKENS = new Set(["ext", "cin", "rm", "room", "the", "columbia", "university"]);

/** Room designators that lead: "833 Mudd", "601b Fairchild", "Room 501 Diana". */
const LEADING_ROOM = /^(?:(?:rm|room)\s+)?\d{1,4}[a-z]?\s+/;
/** Room designators that trail: "Diana Center Rm 501", "Mudd 833". */
const TRAILING_ROOM = /\s+(?:(?:rm|room)\s+)?\d{1,4}[a-z]?$/;

/**
 * Strings that mean "no location was published". Kept separate from "we could
 * not identify this building" because the product treats them the same way but
 * the tests must prove we recognise them rather than falling through by luck.
 *
 * "None None" is verbatim from the Bulletin — it is what the template renders
 * when both the room and the building are null.
 */
const UNASSIGNED_PATTERN =
  /^(?:|tba|tbd|tba tba|to be announced|to be determined|none|none none|n a|na|unassigned|no room|room tba|location tba|off campus tba)$/;

/**
 * Locations that are not a place at all. Resolved to "other" rather than
 * "unknown" because "unknown" means *we failed*, and here we did not: we know
 * the section does not meet on any Columbia campus. The commute estimate for
 * "other" over-charges a remote class by a few minutes, which is why
 * `isRemoteLocation` is exported — a caller that cares can skip the leg
 * entirely instead of paying it.
 */
const REMOTE_PATTERN =
  /\b(online|remote|virtual|asynchronous|synchronous online|web based|zoom|courseworks)\b/;

/** Zone words that identify a campus even when the building is unrecognised. */
const ZONE_KEYWORDS: ReadonlyArray<readonly [RegExp, CampusZone]> = [
  [/\bbarnard\b/, "barnard"],
  [/\b(manhattanville|west harlem)\b/, "manhattanville"],
  [
    /\b(cuimc|medical center|health sciences|washington heights|presbyterian|nyp|dental|nursing school)\b/,
    "cuimc",
  ],
  [/\b(morningside|main campus)\b/, "morningside"],
];

// ---------------------------------------------------------------------------
// The alias index
// ---------------------------------------------------------------------------

export interface CampusBuildingMatch {
  buildingId: string;
  /** Canonical display name — always the table's spelling, never the source's. */
  name: string;
  campusZone: CampusZone;
}

interface AliasEntry {
  alias: string;
  building: CampusBuildingMatch;
}

/**
 * Flat alias list, sorted longest-first. Built once at module load; the whole
 * table is ~40 buildings and ~150 aliases, so a linear scan is far cheaper than
 * anything cleverer and stays trivially debuggable.
 */
const ALIAS_INDEX: readonly AliasEntry[] = (() => {
  const entries: AliasEntry[] = [];
  for (const b of CAMPUS_BUILDINGS) {
    const match: CampusBuildingMatch = {
      buildingId: b.buildingId,
      name: b.name,
      campusZone: b.campusZone,
    };
    const spellings = new Set<string>([b.name, ...(ALIASES_BY_BUILDING_ID[b.buildingId] ?? [])]);
    for (const spelling of spellings) {
      const alias = compact(normalizeWords(spelling));
      if (alias.length >= 3) entries.push({ alias, building: match });
    }
  }
  return entries.sort((a, b) => b.alias.length - a.alias.length);
})();

/**
 * How strongly `candidate` matches `alias`. Higher wins; 0 means no match.
 *
 * The length floors are the whole safety story. A three-letter alias like "low"
 * may only match the entire string, or a room code ("501 LOW") would let any
 * building claim any other. Containment needs six characters, which is enough
 * that "Ext Schermerhorn Hall" resolves but "402 Chandler" cannot accidentally
 * match something because it shares four letters.
 */
function aliasScore(candidate: string, alias: string): number {
  if (candidate === alias) return 3000 + alias.length;
  if (alias.length >= 4 && (candidate.startsWith(alias) || candidate.endsWith(alias))) {
    return 2000 + alias.length;
  }
  if (alias.length >= 6 && candidate.includes(alias)) return 1000 + alias.length;
  return 0;
}

function bestMatch(candidate: string): CampusBuildingMatch | null {
  if (candidate.length < 3) return null;
  let best: CampusBuildingMatch | null = null;
  let bestScore = 0;
  for (const entry of ALIAS_INDEX) {
    const score = aliasScore(candidate, entry.alias);
    if (score > bestScore) {
      bestScore = score;
      best = entry.building;
    }
  }
  return best;
}

/** Strip room tokens, expand abbreviations, drop wing/venue markers. */
function cleanLocation(words: string): string {
  let out = words;
  // Room designators can sit on both ends ("Room 501 Diana Center Rm 2"), so
  // peel repeatedly rather than once.
  for (let pass = 0; pass < 2; pass += 1) {
    out = out.replace(LEADING_ROOM, "").replace(TRAILING_ROOM, "").trim();
  }
  const tokens = out
    .split(" ")
    .map((token) => ABBREVIATIONS[token] ?? token)
    .filter((token) => token.length > 0 && !NOISE_TOKENS.has(token));
  return tokens.join(" ");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** True when the source published no location at all ("TBA", "None None", ""). */
export function isLocationUnassigned(rawName: string | null | undefined): boolean {
  if (rawName == null) return true;
  return UNASSIGNED_PATTERN.test(normalizeWords(rawName));
}

/** True when the section meets online rather than in a room. */
export function isRemoteLocation(rawName: string | null | undefined): boolean {
  if (rawName == null) return false;
  return REMOTE_PATTERN.test(normalizeWords(rawName));
}

/**
 * Resolve a raw location string to a known building, or null.
 *
 * Matching runs twice: once against the untouched string, once against the
 * cleaned one. WHY both — a handful of Columbia addresses genuinely begin with
 * a number ("3009 Broadway"), and the room-stripping pass would eat it.
 */
export function resolveCampusBuilding(
  rawName: string | null | undefined,
): CampusBuildingMatch | null {
  if (rawName == null) return null;
  const words = normalizeWords(rawName);
  if (!words || UNASSIGNED_PATTERN.test(words)) return null;

  const direct = bestMatch(compact(words));
  if (direct) return direct;

  const cleaned = cleanLocation(words);
  if (!cleaned) return null;
  const tidied = bestMatch(compact(cleaned));
  if (tidied) return tidied;

  return bestMatch(compact(withoutLeadingCode(cleaned)));
}

/**
 * The name minus its first word, for the case where that word is a room the
 * Bulletin glued onto the front of the building.
 *
 * `LEADING_ROOM` already peels a NUMERIC room ("309 Havemeyer Hall"). What it
 * cannot peel is the lettered kind — "Cin Alfred Lerner Hall", "Ubg Dodge
 * Fitness Center", "Ar4 Dodge Fitness Center", "Ll104 R&D Science Center" —
 * because no pattern distinguishes those from a building whose real name starts
 * with a short word. The Bulletin prints "Cin Alfred Lerner Hall" and "Ext
 * Schermerhorn Hall" in identical shape and identical case, and only one of
 * them has a room on the front; "Ext Schermerhorn Hall" IS the building.
 *
 * So this does not try to recognise a room code. It asks a different question —
 * does the rest of the string name a building we know? — and is reached only
 * after the whole string has already failed to. "Ext Schermerhorn Hall" matches
 * on the first attempt and never arrives here. A guess is only ever accepted
 * because it resolved, which makes the building table, not a regex, the thing
 * deciding what counts as a room code.
 *
 * The length guard is what stops this from eating a real first word: room codes
 * are terse, and no building in the table is identified by dropping five or more
 * characters off its front.
 */
function withoutLeadingCode(words: string): string {
  const boundary = words.indexOf(" ");
  if (boundary < 0 || boundary > 5) return "";
  return words.slice(boundary + 1);
}

/**
 * Building name → campus zone. Satisfies `CourseDetailIntegrations.
 * resolveCampusZone` in `components/course/contracts.ts`.
 *
 * Order matters: an identified building always beats a keyword, so
 * "Barnard Hall" and "Hammer Health Sciences Center" resolve from the table
 * rather than from the words "barnard" and "health sciences" that happen to be
 * inside them.
 */
export function resolveCampusZone(buildingName: string | null): CampusZone {
  if (buildingName == null) return "unknown";

  const words = normalizeWords(buildingName);
  if (!words || UNASSIGNED_PATTERN.test(words)) return "unknown";

  const match = resolveCampusBuilding(buildingName);
  if (match) return match.campusZone;

  if (REMOTE_PATTERN.test(words)) return "other";

  for (const [pattern, zone] of ZONE_KEYWORDS) {
    if (pattern.test(words)) return zone;
  }
  return "unknown";
}

/**
 * Zones for a whole meeting list, de-duplicated and in first-seen order. The
 * drawer uses this to decide whether a section is a single-campus commitment or
 * a Broadway-crossing one.
 */
export function resolveCampusZones(buildingNames: ReadonlyArray<string | null>): CampusZone[] {
  const seen: CampusZone[] = [];
  for (const name of buildingNames) {
    const zone = resolveCampusZone(name);
    if (!seen.includes(zone)) seen.push(zone);
  }
  return seen;
}
