/**
 * Campus lane — the geodata bake.
 *
 * Turns two public datasets into the numbers `lib/campus/layout.ts` and
 * `components/campus/campus-scene.tsx` draw. Run by hand, output committed:
 *
 *     npm run build:campus
 *
 * Committed rather than fetched at build time on purpose. Building footprints
 * change on the order of years, both upstreams are third-party services with no
 * SLA to us, and a Vercel build that can fail because Overpass is rate-limiting
 * is a bad trade for data that is effectively static.
 *
 * ---------------------------------------------------------------------------
 * The two sources, and why it takes both
 * ---------------------------------------------------------------------------
 * GEOMETRY comes from OpenStreetMap. OSM maps Columbia building-by-building
 * with the names a student would actually say, which is exactly the join key we
 * need — `resolveCampusBuilding()` hands us "Havemeyer", not a tax lot.
 *
 * HEIGHT comes from NYC Open Data's Building Footprints (`5zhs-2jue`), whose
 * `height_roof` is a photogrammetric survey in feet. OSM's own `height` tag is
 * present but not trustworthy here — it has Pupin at 14 m, which is off by a
 * factor of four.
 *
 * The two are joined by POINT-IN-POLYGON, not by OSM's `nycdoitt:bin` tag.
 * That tag is scrambled across Columbia's north campus: OSM files Pupin under
 * Mudd's BIN and Northwest Corner under Pupin's, so a BIN join silently hands
 * three neighbouring towers each other's heights. Containment gets it right,
 * and `SUSPECT` below catches the residue.
 *
 * ---------------------------------------------------------------------------
 * Projection
 * ---------------------------------------------------------------------------
 * Local ENU metres from a per-plane origin, then rotated by GRID_BEARING so the
 * Manhattan street grid lands on the axes: +x campus-east (toward Amsterdam),
 * +z campus-south (toward Butler). Broadway comes out vertical, which is how
 * every Columbia map anybody has ever read is drawn, and it keeps the road
 * stripes in `CAMPUS_ROADS` as axis-aligned rectangles.
 *
 * GRID_BEARING was not looked up — it was fitted, by rotating the core campus
 * footprints through a degree at a time and taking the angle whose axis-aligned
 * bounding box is smallest. That lands on 28.9°, which agrees with the
 * published grid rotation and, more usefully, is derived from the same polygons
 * we are about to draw.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Projection constants
// ---------------------------------------------------------------------------

/** Minimum-bounding-rectangle fit over the core campus footprints. */
const GRID_BEARING_DEGREES = 28.9;

/**
 * Metres per plane unit. Least-squares fit of the real building positions
 * against the hand-authored map this replaces, so the camera framing, the
 * road stripes and the plane bounds all keep working at their tuned values.
 * A Manhattan short block is ~80 m, so a block is a little over 3 units.
 */
const METRES_PER_UNIT = 26;

const EARTH_METRES_PER_DEGREE_LATITUDE = 111_320;

// ---------------------------------------------------------------------------
// Source geography
// ---------------------------------------------------------------------------

type PlaneId = "morningside-heights" | "manhattanville" | "cuimc";

interface PlaneSource {
  planeId: PlaneId;
  /** south, west, north, east — the order Overpass and Socrata both want. */
  bbox: [number, number, number, number];
  /**
   * The building the plane is pinned to, and the plane-local coordinate it must
   * land on. Anchoring to a landmark rather than to a lat/lon keeps the
   * generated map registered with the camera framing that was tuned by hand.
   */
  anchor: { osmName: string; x: number; z: number };
}

const PLANES: PlaneSource[] = [
  {
    planeId: "morningside-heights",
    bbox: [40.802, -73.97, 40.814, -73.956],
    anchor: { osmName: "Low Memorial Library", x: 0, z: -3.3 },
  },
  {
    planeId: "manhattanville",
    bbox: [40.814, -73.964, 40.823, -73.954],
    anchor: { osmName: "Jerome L. Greene Science Center", x: 0.2, z: -0.4 },
  },
  {
    planeId: "cuimc",
    bbox: [40.838, -73.947, 40.847, -73.937],
    anchor: { osmName: "Hammer Health Sciences Center", x: 0, z: 0 },
  },
];

// ---------------------------------------------------------------------------
// buildingId -> OSM name
// ---------------------------------------------------------------------------

/**
 * The join table. Left side is the vocabulary `lib/campus/zones.ts` resolves
 * to; right side is what OSM calls the same building. `extra` names are
 * additional OSM ways that are physically the same structure and get merged
 * into one footprint — Schermerhorn and its Extension read as one mass on a
 * card this small.
 *
 * A `buildingId` missing from OSM is not an error: the card already handles an
 * unplaced building by framing its zone, so the script warns and moves on.
 */
interface BuildingSource {
  buildingId: string;
  label: string;
  osmName: string;
  extra?: string[];
  isLandmark?: boolean;
}

const BUILDINGS: Record<PlaneId, BuildingSource[]> = {
  "morningside-heights": [
    // --- Morningside ---------------------------------------------------------
    { buildingId: "low", label: "Low Library", osmName: "Low Memorial Library", isLandmark: true },
    { buildingId: "butler", label: "Butler Library", osmName: "Butler Library", isLandmark: true },
    { buildingId: "mudd", label: "Mudd", osmName: "Mudd Hall", isLandmark: true },
    { buildingId: "nwc", label: "Northwest Corner", osmName: "Northwest Corner Building", isLandmark: true },
    { buildingId: "pupin", label: "Pupin", osmName: "Pupin Hall", isLandmark: true },
    { buildingId: "cs-building", label: "Computer Science", osmName: "Computer Science" },
    { buildingId: "cepsr", label: "Schapiro CEPSR", osmName: "Schapiro Center (CEPSR)" },
    { buildingId: "fairchild", label: "Fairchild", osmName: "Fairchild Hall" },
    { buildingId: "schermerhorn", label: "Schermerhorn Hall", osmName: "Schermerhorn Hall", extra: ["Schermerhorn Extension"] },
    { buildingId: "havemeyer", label: "Havemeyer Hall", osmName: "Havemeyer Hall" },
    { buildingId: "chandler", label: "Chandler", osmName: "Chandler Hall" },
    { buildingId: "mathematics", label: "Mathematics", osmName: "Mathematics" },
    { buildingId: "uris", label: "Uris Hall", osmName: "Uris Hall", extra: ["University Hall"] },
    { buildingId: "kent", label: "Kent Hall", osmName: "Kent Hall" },
    { buildingId: "fayerweather", label: "Fayerweather Hall", osmName: "Fayerweather Hall" },
    { buildingId: "philosophy", label: "Philosophy Hall", osmName: "Philosophy Hall" },
    { buildingId: "avery", label: "Avery Hall", osmName: "Avery Hall" },
    { buildingId: "dodge", label: "Dodge Hall", osmName: "Dodge Hall" },
    { buildingId: "journalism", label: "Journalism", osmName: "Pulitzer Hall" },
    { buildingId: "lewisohn", label: "Lewisohn Hall", osmName: "Lewisohn Hall" },
    { buildingId: "earl", label: "Earl Hall", osmName: "Earl Hall" },
    { buildingId: "st-pauls", label: "St. Paul's Chapel", osmName: "Saint Paul's Chapel" },
    { buildingId: "buell", label: "Buell Hall", osmName: "Buell Hall" },
    { buildingId: "hamilton", label: "Hamilton Hall", osmName: "Hamilton Hall" },
    { buildingId: "john-jay", label: "John Jay Hall", osmName: "John Jay Hall" },
    { buildingId: "lerner", label: "Lerner Hall", osmName: "Alfred Lerner Hall", isLandmark: true },
    { buildingId: "iab", label: "International Affairs", osmName: "Columbia School of International and Public Affairs", isLandmark: true },
    { buildingId: "knox", label: "Knox Hall", osmName: "Knox Hall" },
    { buildingId: "teachers-college", label: "Teachers College", osmName: "Russell", extra: ["Grace Dodge"] },
    // --- Barnard -------------------------------------------------------------
    { buildingId: "milstein", label: "Milstein Center", osmName: "Milstein Center for Teaching and Learning", isLandmark: true },
    { buildingId: "diana", label: "Diana Center", osmName: "The Diana Center", isLandmark: true },
    { buildingId: "barnard-hall", label: "Barnard Hall", osmName: "Barnard Hall" },
    { buildingId: "milbank", label: "Milbank Hall", osmName: "Milbank Hall" },
    { buildingId: "altschul", label: "Altschul Hall", osmName: "Altschul Hall" },
    { buildingId: "sulzberger", label: "Sulzberger Hall", osmName: "Sulzberger Hall" },
    { buildingId: "elliott", label: "Elliott Hall", osmName: "Elliott Hall" },
  ],
  manhattanville: [
    { buildingId: "jerome-greene", label: "Jerome L. Greene Science Center", osmName: "Jerome L. Greene Science Center", isLandmark: true },
    { buildingId: "lenfest", label: "Lenfest Center for the Arts", osmName: "Lenfest Center for the Arts", isLandmark: true },
    { buildingId: "forum", label: "The Forum", osmName: "The Forum" },
    { buildingId: "kravis", label: "Kravis Hall", osmName: "Henry R. Kravis Hall", isLandmark: true },
    { buildingId: "geffen", label: "Geffen Hall", osmName: "David Geffen Hall" },
    { buildingId: "studebaker", label: "Studebaker Building", osmName: "Studebaker Building" },
    { buildingId: "prentis", label: "Prentis Hall", osmName: "Prentis Hall" },
    { buildingId: "nash", label: "Nash Building", osmName: "Nash Building" },
  ],
  cuimc: [
    { buildingId: "hammer", label: "Hammer Health Sciences", osmName: "Hammer Health Sciences Center", isLandmark: true },
    { buildingId: "vagelos-education", label: "Vagelos Education Center", osmName: "Roy and Diana Vagelos Education Center", isLandmark: true },
    { buildingId: "black", label: "William Black", osmName: "William Black Building" },
    { buildingId: "georgian", label: "Georgian Building", osmName: "Georgian Building" },
    { buildingId: "ps", label: "Physicians and Surgeons", osmName: "College of Physicians and Surgeons", isLandmark: true },
    { buildingId: "milstein-hospital", label: "Milstein Hospital", osmName: "Milstein Hospital Building" },
    { buildingId: "mailman", label: "Mailman School of Public Health", osmName: "Mailman School of Public Health" },
    { buildingId: "bard", label: "Bard Hall", osmName: "Bard Hall" },
    { buildingId: "nyspi", label: "NY State Psychiatric Institute", osmName: "New York State Psychiatric Institute - Herbert Pardes Building" },
  ],
};

/**
 * Heights the survey gets wrong, in feet, with the reason. Every entry here is
 * a case where the OSM building's centroid falls inside a footprint polygon
 * that is real but is not the building — a canopy, a lightwell, an entrance
 * pavilion — so containment picks a legitimate row with a useless height.
 */
const HEIGHT_OVERRIDES_FEET: Record<string, { feet: number; why: string }> = {
  diana: { feet: 150, why: "centroid lands on the ground-floor canopy (17 ft); Diana is 11 storeys" },
  milbank: { feet: 90, why: "centroid falls in the Milbank courtyard, outside every footprint" },
  "jerome-greene": { feet: 130, why: "built 2016, postdates the footprint survey" },
  forum: { feet: 60, why: "built 2018, postdates the footprint survey" },
  kravis: { feet: 180, why: "built 2022, postdates the footprint survey" },
  geffen: { feet: 150, why: "built 2022, postdates the footprint survey" },
  "vagelos-education": { feet: 190, why: "built 2016, postdates the footprint survey" },
};

/** Below this, a matched height is assumed to be a canopy rather than a roof. */
const SUSPECT_HEIGHT_FEET = 25;

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const OVERPASS = "https://overpass-api.de/api/interpreter";
const FOOTPRINTS = "https://data.cityofnewyork.us/resource/5zhs-2jue.json";

/**
 * Overpass answers an anonymous request with a bare 406, and it rate-limits by
 * client, so every query goes through here: a real User-Agent, and a couple of
 * patient retries rather than a failed bake.
 */
async function overpass(query: string): Promise<{ elements: OsmElement[] }> {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    "User-Agent": "columbia-catalog campus-map bake (github.com/23jmo/columbia-catalog)",
  };
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(OVERPASS, { method: "POST", headers, body: `data=${encodeURIComponent(query)}` });
    if (response.ok) return (await response.json()) as { elements: OsmElement[] };
    if (attempt === 4) throw new Error(`Overpass ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const backoffSeconds = attempt * 15;
    console.log(`    Overpass ${response.status}, retrying in ${backoffSeconds}s (${attempt}/3)`);
    await new Promise((resolve) => setTimeout(resolve, backoffSeconds * 1000));
  }
  throw new Error("unreachable");
}

type LonLat = [number, number];

interface OsmBuilding {
  name: string;
  ring: LonLat[];
  levels: number | null;
}

async function fetchOsmBuildings(bbox: PlaneSource["bbox"]): Promise<OsmBuilding[]> {
  const box = bbox.join(",");
  // `out geom` gives the full node list inline, which saves a second round trip
  // for the way members. Relations are asked for too — a handful of Columbia's
  // courtyard buildings are multipolygons — and their outer ring is used.
  const query = `[out:json][timeout:90];(way["building"]["name"](${box});relation["building"]["name"](${box}););out geom;`;
  const payload = await overpass(query);
  return payload.elements.flatMap(toOsmBuilding);
}

interface OsmGeomPoint {
  lat: number;
  lon: number;
}
interface OsmElement {
  type: "way" | "relation";
  tags?: Record<string, string>;
  geometry?: OsmGeomPoint[];
  members?: { role: string; geometry?: OsmGeomPoint[] }[];
}

function toOsmBuilding(element: OsmElement): OsmBuilding[] {
  const name = element.tags?.name;
  if (!name) return [];
  const levelsRaw = element.tags?.["building:levels"];
  const levels = levelsRaw && Number.isFinite(Number(levelsRaw)) ? Number(levelsRaw) : null;

  const geometry =
    element.geometry ??
    element.members?.find((member) => member.role === "outer" && member.geometry)?.geometry;
  if (!geometry || geometry.length < 4) return [];

  return [{ name, levels, ring: geometry.map((point): LonLat => [point.lon, point.lat]) }];
}

interface Footprint {
  ring: LonLat[];
  heightFeet: number;
}

async function fetchFootprints(bbox: PlaneSource["bbox"]): Promise<Footprint[]> {
  const [south, west, north, east] = bbox;
  const params = new URLSearchParams({
    $where: `within_box(the_geom,${north},${west},${south},${east})`,
    $select: "the_geom,height_roof",
    $limit: "4000",
  });
  const response = await fetch(`${FOOTPRINTS}?${params}`);
  if (!response.ok) throw new Error(`NYC Open Data ${response.status}: ${await response.text()}`);
  const rows = (await response.json()) as {
    the_geom?: { coordinates: number[][][][] };
    height_roof?: string;
  }[];

  return rows.flatMap((row) => {
    const heightFeet = Number(row.height_roof ?? 0);
    if (!row.the_geom || !Number.isFinite(heightFeet)) return [];
    // Outer ring only. Courtyards read as solid mass at this scale, and holes
    // would double the triangle count of the context layer for nothing.
    return row.the_geom.coordinates.map((polygon): Footprint => ({
      ring: polygon[0].map(([lon, lat]): LonLat => [lon, lat]),
      heightFeet,
    }));
  });
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Plane-local point. +x campus-east, +z campus-south. */
type Point = { x: number; z: number };

/**
 * Equirectangular projection about the plane's own reference latitude, then a
 * rotation onto the street grid. Good to well under a metre over a few hundred
 * metres, which is a tenth of the smallest thing this map draws.
 */
function makeProjector(referenceLat: number, referenceLon: number) {
  const metresPerLon =
    EARTH_METRES_PER_DEGREE_LATITUDE * Math.cos((referenceLat * Math.PI) / 180);
  const bearing = (GRID_BEARING_DEGREES * Math.PI) / 180;
  const cos = Math.cos(bearing);
  const sin = Math.sin(bearing);

  return function project([lon, lat]: LonLat): Point {
    const east = (lon - referenceLon) * metresPerLon;
    const north = (lat - referenceLat) * EARTH_METRES_PER_DEGREE_LATITUDE;
    const gridEast = east * cos - north * sin;
    const gridNorth = east * sin + north * cos;
    // Campus-north is -z, matching three.js's right-handed y-up convention.
    return { x: gridEast / METRES_PER_UNIT, z: -gridNorth / METRES_PER_UNIT };
  };
}

function signedArea(ring: Point[]): number {
  let total = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    total += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
  }
  return total / 2;
}

function centroidOf(ring: Point[]): Point {
  const area = signedArea(ring);
  // A degenerate ring (all points collinear) would divide by zero; fall back to
  // the vertex mean, which is close enough for something that thin.
  if (Math.abs(area) < 1e-9) {
    return {
      x: ring.reduce((sum, point) => sum + point.x, 0) / ring.length,
      z: ring.reduce((sum, point) => sum + point.z, 0) / ring.length,
    };
  }
  let x = 0;
  let z = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j].x * ring[i].z - ring[i].x * ring[j].z;
    x += (ring[j].x + ring[i].x) * cross;
    z += (ring[j].z + ring[i].z) * cross;
  }
  return { x: x / (6 * area), z: z / (6 * area) };
}

function containsPoint(ring: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const hitsScanline = ring[i].z > point.z !== ring[j].z > point.z;
    if (!hitsScanline) continue;
    const crossingX =
      ((ring[j].x - ring[i].x) * (point.z - ring[i].z)) / (ring[j].z - ring[i].z) + ring[i].x;
    if (point.x < crossingX) inside = !inside;
  }
  return inside;
}

function boundsOf(ring: Point[]) {
  const xs = ring.map((point) => point.x);
  const zs = ring.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/**
 * Ramer–Douglas–Peucker. NYC's photogrammetric rings carry a vertex every time
 * a cornice steps by 20 cm; at card size that is invisible and it triples the
 * payload. The tolerance is in plane units — 0.04 is a little over a metre.
 */
function simplify(ring: Point[], tolerance: number): Point[] {
  if (ring.length <= 4) return ring;

  function perpendicularDistance(point: Point, start: Point, end: Point): number {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-12) return Math.hypot(point.x - start.x, point.z - start.z);
    return Math.abs(dx * (start.z - point.z) - (start.x - point.x) * dz) / length;
  }

  function recurse(points: Point[]): Point[] {
    if (points.length < 3) return points;
    let worstIndex = 0;
    let worstDistance = 0;
    for (let i = 1; i < points.length - 1; i += 1) {
      const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);
      if (distance > worstDistance) {
        worstDistance = distance;
        worstIndex = i;
      }
    }
    if (worstDistance <= tolerance) return [points[0], points[points.length - 1]];
    return [
      ...recurse(points.slice(0, worstIndex + 1)).slice(0, -1),
      ...recurse(points.slice(worstIndex)),
    ];
  }

  // Rings are closed; simplify the open chain then re-close it.
  const open = ring.slice(0, -1);
  const simplified = recurse([...open, open[0]]);
  return simplified.length >= 4 ? simplified : ring;
}

/** Counter-clockwise in the x/z plane, which is what THREE.Shape wants. */
function toCounterClockwise(ring: Point[]): Point[] {
  return signedArea(ring) < 0 ? [...ring].reverse() : ring;
}

const round = (value: number) => Math.round(value * 100) / 100;

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const FEET_PER_UNIT = METRES_PER_UNIT / 0.3048;
/** OSM's `building:levels`, when that is all there is. Academic floors run tall. */
const METRES_PER_LEVEL = 4.2;
/** Nothing on this map is shorter than a two-storey annex. */
const MINIMUM_HEIGHT_UNITS = 0.35;

/**
 * How far past the campus the neighbourhood is carried, in plane units. The
 * camera frames ~15 units and orbits, so this is a little over one screen in
 * every direction — enough that the campus never sits on a visible edge, and
 * not so much that the payload pays for blocks nobody will ever pan to.
 */
const CONTEXT_RADIUS_UNITS = 16;

interface PlacedBuilding {
  buildingId: string;
  label: string;
  plane: PlaneId;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  isLandmark?: boolean;
  /** Outer ring, plane-local, relative to the building's own centre. */
  footprint: [number, number][];
}

interface ContextBuilding {
  plane: PlaneId;
  height: number;
  footprint: [number, number][];
}

const warnings: string[] = [];

/**
 * Height for one building, in plane units, and how we got there. Ordered by how
 * much the source is trusted: an explicit correction, then the survey, then
 * OSM's storey count, then a default that at least is not zero.
 */
function resolveHeight(
  source: BuildingSource,
  ring: Point[],
  centre: Point,
  footprints: { ring: Point[]; heightFeet: number }[],
  levels: number | null,
): number {
  const override = HEIGHT_OVERRIDES_FEET[source.buildingId];
  if (override) return override.feet / FEET_PER_UNIT;

  const containing = footprints.filter((candidate) => containsPoint(candidate.ring, centre));
  // Several rings can contain the centre where a footprint was split into
  // wings; the tallest is the roof, the rest are setbacks and canopies.
  const surveyed = Math.max(0, ...containing.map((candidate) => candidate.heightFeet));

  if (surveyed >= SUSPECT_HEIGHT_FEET) return surveyed / FEET_PER_UNIT;

  if (levels && levels >= 2) {
    warnings.push(
      `${source.buildingId}: survey height ${surveyed.toFixed(0)} ft looks like a canopy — ` +
        `fell back to OSM's ${levels} levels`,
    );
    return (levels * METRES_PER_LEVEL) / METRES_PER_UNIT;
  }

  warnings.push(
    `${source.buildingId}: no usable height (survey ${surveyed.toFixed(0)} ft, no levels tag) — ` +
      `add a HEIGHT_OVERRIDES_FEET entry`,
  );
  // Footprint area is a weak proxy, but a big building with no height reads
  // less wrong as a mid-rise than as a slab.
  return Math.max(MINIMUM_HEIGHT_UNITS, Math.min(2.5, Math.sqrt(Math.abs(signedArea(ring))) * 0.9));
}

async function buildPlane(plane: PlaneSource) {
  const [south, west, north, east] = plane.bbox;
  const [osmRaw, footprintsRaw] = await Promise.all([
    fetchOsmBuildings(plane.bbox),
    fetchFootprints(plane.bbox),
  ]);
  console.log(
    `  ${plane.planeId}: ${osmRaw.length} named OSM buildings, ${footprintsRaw.length} survey footprints`,
  );

  // Project about the centre of the bbox, then re-origin onto the anchor once
  // we know where the anchor actually landed.
  const project = makeProjector((south + north) / 2, (west + east) / 2);
  const osmByName = new Map<string, OsmBuilding>();
  for (const building of osmRaw) if (!osmByName.has(building.name)) osmByName.set(building.name, building);

  const anchorSource = osmByName.get(plane.anchor.osmName);
  if (!anchorSource) throw new Error(`${plane.planeId}: anchor "${plane.anchor.osmName}" not in OSM`);
  const anchorCentre = centroidOf(anchorSource.ring.map(project));
  const offsetX = plane.anchor.x - anchorCentre.x;
  const offsetZ = plane.anchor.z - anchorCentre.z;
  const place = (point: Point): Point => ({ x: point.x + offsetX, z: point.z + offsetZ });

  // Placed, not merely projected: the height join is a containment test against
  // these rings, so they have to be in the same frame as the buildings.
  const footprints = footprintsRaw.map((footprint) => ({
    ring: footprint.ring.map(project).map(place),
    heightFeet: footprint.heightFeet,
  }));

  const placed: PlacedBuilding[] = [];
  for (const source of BUILDINGS[plane.planeId]) {
    const primary = osmByName.get(source.osmName);
    if (!primary) {
      warnings.push(`${source.buildingId}: OSM has no building named "${source.osmName}" — not drawn`);
      continue;
    }
    // Merged buildings contribute their bounds and their tallest height, but
    // only the primary ring is extruded. Two overlapping boxes at card scale
    // look like one building anyway, and one ring is half the triangles.
    const rings = [primary, ...(source.extra ?? []).flatMap((name) => osmByName.get(name) ?? [])];
    const ring = toCounterClockwise(simplify(primary.ring.map(project).map(place), 0.04));
    const centre = centroidOf(ring);
    const allPoints = rings.flatMap((entry) => entry.ring.map(project).map(place));
    const bounds = boundsOf(allPoints);

    const levels = rings.reduce<number | null>(
      (best, entry) => (entry.levels && (!best || entry.levels > best) ? entry.levels : best),
      null,
    );
    const height = Math.max(
      MINIMUM_HEIGHT_UNITS,
      ...rings.map((entry) => {
        const entryRing = entry.ring.map(project).map(place);
        return resolveHeight(source, entryRing, centroidOf(entryRing), footprints, levels);
      }),
    );

    placed.push({
      buildingId: source.buildingId,
      label: source.label,
      plane: plane.planeId,
      x: round(centre.x),
      z: round(centre.z),
      width: round(bounds.maxX - bounds.minX),
      depth: round(bounds.maxZ - bounds.minZ),
      height: round(height),
      ...(source.isLandmark ? { isLandmark: true as const } : {}),
      // Stored relative to the building's own centre so the scene can position
      // an instance by translation without touching its vertices.
      footprint: ring.map(
        (point): [number, number] => [round(point.x - centre.x), round(point.z - centre.z)],
      ),
    });
  }

  // Context: everything the survey knows about that is not one of ours. This is
  // what turns "campus floating in a void" into "campus in Morningside
  // Heights", and it is the whole reason the neighbourhood bbox is wider than
  // the campus.
  const claimed = placed.map((building) => ({
    centre: { x: building.x, z: building.z },
    ring: building.footprint.map(([x, z]) => ({ x: x + building.x, z: z + building.z })),
  }));
  const campusBounds = boundsOf(claimed.map((entry) => entry.centre));
  const context: ContextBuilding[] = [];
  for (const footprint of footprints) {
    const ring = footprint.ring.map(place);
    const centre = centroidOf(ring);
    if (claimed.some((entry) => containsPoint(entry.ring, centre))) continue;
    if (
      centre.x < campusBounds.minX - CONTEXT_RADIUS_UNITS ||
      centre.x > campusBounds.maxX + CONTEXT_RADIUS_UNITS ||
      centre.z < campusBounds.minZ - CONTEXT_RADIUS_UNITS ||
      centre.z > campusBounds.maxZ + CONTEXT_RADIUS_UNITS
    ) {
      continue;
    }
    const area = Math.abs(signedArea(ring));
    // Sheds, stair bulkheads and lot slivers. Below this they are noise that
    // costs triangles.
    if (area < 0.06) continue;
    const simplified = toCounterClockwise(simplify(ring, 0.06));
    context.push({
      plane: plane.planeId,
      height: round(Math.max(MINIMUM_HEIGHT_UNITS, footprint.heightFeet / FEET_PER_UNIT)),
      footprint: simplified.map((point): [number, number] => [round(point.x), round(point.z)]),
    });
  }

  const roads = await measureRoads(plane, place, project);

  return { placed, context, roads };
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

/**
 * Road stripes stay hand-declared — `CAMPUS_ROADS` feeds the 2D fallback, which
 * wants axis-aligned rectangles with a label, not polylines. What the bake
 * contributes is the one number the stripe cannot be eyeballed into: where the
 * street centreline actually falls on the plane.
 *
 * Reported rather than written. A road that has drifted half a unit is a
 * judgement call about the cartoon, so the script prints the measured value and
 * a human decides whether to move the stripe.
 */
const ROAD_PROBES: { plane: PlaneId; osmName: string; axis: "x" | "z"; roadId: string }[] = [
  { plane: "morningside-heights", osmName: "Broadway", axis: "x", roadId: "broadway" },
  { plane: "morningside-heights", osmName: "Amsterdam Avenue", axis: "x", roadId: "amsterdam" },
  { plane: "morningside-heights", osmName: "West 116th Street", axis: "z", roadId: "college-walk" },
  { plane: "morningside-heights", osmName: "West 120th Street", axis: "z", roadId: "w120" },
  { plane: "morningside-heights", osmName: "West 114th Street", axis: "z", roadId: "w114" },
  { plane: "manhattanville", osmName: "Broadway", axis: "x", roadId: "mv-broadway" },
  { plane: "manhattanville", osmName: "West 125th Street", axis: "z", roadId: "mv-125" },
  { plane: "cuimc", osmName: "Broadway", axis: "x", roadId: "cuimc-broadway" },
  { plane: "cuimc", osmName: "West 168th Street", axis: "z", roadId: "cuimc-168" },
];

async function measureRoads(
  plane: PlaneSource,
  place: (point: Point) => Point,
  project: (point: LonLat) => Point,
): Promise<{ roadId: string; at: number }[]> {
  const box = plane.bbox.join(",");
  const query = `[out:json][timeout:60];way["highway"]["name"](${box});out geom;`;
  const payload = await overpass(query);

  return ROAD_PROBES.filter((probe) => probe.plane === plane.planeId).flatMap((probe) => {
    const points = payload.elements
      .filter((element) => element.tags?.name === probe.osmName)
      .flatMap((element) => element.geometry ?? [])
      .map((point) => place(project([point.lon, point.lat])));
    if (points.length === 0) return [];
    const values = points.map((point) => (probe.axis === "x" ? point.x : point.z)).sort((a, b) => a - b);
    // Median, not mean: Broadway bends slightly at 120th and the mean would
    // chase the bend instead of sitting on the straight run past campus.
    return [{ roadId: probe.roadId, at: round(values[Math.floor(values.length / 2)]) }];
  });
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const OUTPUT_DIRECTORY = join(process.cwd(), "lib/campus/generated");

function emit(fileName: string, payload: unknown, note: string) {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  const path = join(OUTPUT_DIRECTORY, fileName);
  writeFileSync(path, `${JSON.stringify(payload, null, fileName.includes("layout") ? 2 : 0)}\n`);
  const kilobytes = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
  console.log(`  wrote ${fileName} (${kilobytes} KB) — ${note}`);
}

async function main() {
  console.log("Baking campus geometry from OpenStreetMap + NYC Open Data\n");

  const placed: PlacedBuilding[] = [];
  const context: ContextBuilding[] = [];
  const roads: { roadId: string; at: number }[] = [];
  const planeBounds: Record<string, { minX: number; maxX: number; minZ: number; maxZ: number }> = {};

  for (const plane of PLANES) {
    const result = await buildPlane(plane);
    placed.push(...result.placed);
    context.push(...result.context);
    roads.push(...result.roads);

    const points = result.placed.flatMap((building) =>
      building.footprint.map((point) => ({ x: point[0] + building.x, z: point[1] + building.z })),
    );
    if (points.length > 0) {
      const bounds = boundsOf(points);
      planeBounds[plane.planeId] = {
        minX: round(bounds.minX),
        maxX: round(bounds.maxX),
        minZ: round(bounds.minZ),
        maxZ: round(bounds.maxZ),
      };
    }
  }

  emit(
    "campus-layout.json",
    {
      $comment:
        "GENERATED by scripts/build-campus-map.ts — do not edit. Positions and heights " +
        "are surveyed; see that script for the sources and the join.",
      metresPerUnit: METRES_PER_UNIT,
      gridBearingDegrees: GRID_BEARING_DEGREES,
      buildings: placed.map(({ footprint: _footprint, ...rest }) => rest),
      planeExtents: planeBounds,
    },
    `${placed.length} placed buildings — imported by lib/campus/layout.ts`,
  );

  emit(
    "campus-footprints.json",
    {
      $comment:
        "GENERATED by scripts/build-campus-map.ts — do not edit. Imported ONLY by " +
        "components/campus/campus-scene.tsx so it lands in the lazy three.js chunk.",
      buildings: Object.fromEntries(placed.map((building) => [building.buildingId, building.footprint])),
      context,
    },
    `${context.length} context buildings — imported by the 3D scene only`,
  );

  if (roads.length > 0) {
    console.log("\nMeasured street centrelines — reconcile CAMPUS_ROADS `at` against these:");
    for (const road of roads) console.log(`  ${road.roadId.padEnd(16)} at = ${road.at}`);
  }
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const warning of warnings) console.log(`  ! ${warning}`);
  }
  console.log("\nDone.");
}

void main();
