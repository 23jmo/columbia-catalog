/**
 * Campus lane — the surveyed map.
 *
 * Everything in here except the road stripes is GENERATED. The numbers come
 * from `lib/campus/generated/campus-layout.json`, which `scripts/build-campus-map.ts`
 * bakes out of OpenStreetMap geometry and NYC Open Data's photogrammetric
 * building survey. To change a position or a height, fix the source or add an
 * override in that script and re-run `npm run build:campus` — editing the JSON
 * by hand will be silently reverted by the next bake.
 *
 * This replaced a hand-authored cartoon. That map optimised for legibility over
 * accuracy and said so in its own header; measured against the real footprints
 * it placed the average building 68 m from where it stands, and Mudd 144 m —
 * a block and a half. The three relationships it was tuned to protect all
 * survive the change, because they were true to begin with:
 *
 *   1. Low at the north end of the College Walk axis, Butler at the south end,
 *      facing each other across 116th. They come out at x = 0.00 and x = 0.00.
 *   2. Broadway as a hard western edge with Barnard beyond it. The measured
 *      centreline lands at x = -5.11; the cartoon guessed -4.9.
 *   3. Engineering tall and clustered in the north-east.
 *
 * What the survey adds on top is the campus's actual symmetry — Philosophy and
 * Lewisohn at mirrored x, Fayerweather and Mathematics likewise — which is the
 * McKim, Mead & White plan, and which no amount of eyeballing had produced.
 *
 * ---------------------------------------------------------------------------
 * Coordinate system
 * ---------------------------------------------------------------------------
 * Right-handed, y-up, matching three.js:
 *
 *   +x = campus east      +z = campus SOUTH      +y = up
 *
 * "Campus" east rather than true east: the projection is rotated onto the
 * Manhattan street grid (28.9°, fitted from the footprints themselves), so
 * Broadway runs vertically and the road stripes below stay axis-aligned
 * rectangles. One unit is 26 m, so a short block is a little over three units.
 *
 * ---------------------------------------------------------------------------
 * Planes, and why there are only three
 * ---------------------------------------------------------------------------
 * Morningside and Barnard share ONE plane. They are across a street from each
 * other (a 5-minute walk in `ZONE_WALK_MINUTES`), and the Broadway split is
 * only legible if both sides are on screen at once.
 *
 * Manhattanville and CUIMC get their own planes because they are 9 and 52
 * blocks north respectively. Drawn to scale on a shared plane, the card would
 * be 95% empty asphalt. The card frames one plane at a time and captions the
 * distance in words instead — which is the honest way to render "the Medical
 * Center is a subway ride, not a walk".
 */

import type { CampusZone } from "../types";
import generated from "./generated/campus-layout.json";
import { CAMPUS_BUILDINGS, resolveCampusBuilding, resolveCampusZone } from "./zones";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type CampusPlaneId = "morningside-heights" | "manhattanville" | "cuimc";

export interface CampusLayoutBuilding {
  /** Matches `Building.buildingId` in `lib/campus/zones.ts`. */
  buildingId: string;
  /** Short label for the card caption — not the full legal name. */
  label: string;
  campusZone: CampusZone;
  plane: CampusPlaneId;
  /** Plane-local centroid of the real footprint. +x east, +z south. */
  x: number;
  z: number;
  /** Axis-aligned extent of the real footprint, in plane units. */
  width: number;
  depth: number;
  /** Surveyed roof height above grade, in plane units (1 unit = 26 m). */
  height: number;
  /**
   * Landmarks are the buildings that make the map readable even when they are
   * not the target — the card keeps them at a slightly higher contrast than the
   * rest of the muted mass.
   */
  isLandmark?: boolean;
}

export type RoadOrientation = "north-south" | "east-west";

/** A flat stripe on the ground plane. Purely orientation furniture. */
export interface CampusRoad {
  roadId: string;
  label: string;
  plane: CampusPlaneId;
  orientation: RoadOrientation;
  /**
   * Position on the perpendicular axis (x for north-south, z for east-west).
   * Measured: the bake prints the median centreline of the real OSM way and
   * these are reconciled against it by hand.
   */
  at: number;
  /** Extent along the road's own axis. Clamped to the plane at module load. */
  from: number;
  to: number;
  width: number;
  /** Named roads get a label in the 2D fallback; minor cross streets do not. */
  isMajor?: boolean;
}

export interface CampusPlane {
  planeId: CampusPlaneId;
  label: string;
  /** Zones drawn on this plane. */
  zones: CampusZone[];
  /** Ground rectangle, plane-local. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Metres per plane unit — see the bake script for how this was fitted. */
export const METRES_PER_CAMPUS_UNIT = generated.metresPerUnit;

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

const ZONE_BY_BUILDING_ID = new Map(
  CAMPUS_BUILDINGS.map((entry) => [entry.buildingId, entry.campusZone] as const),
);

function planeIdOf(value: string): CampusPlaneId {
  if (value === "morningside-heights" || value === "manhattanville" || value === "cuimc") return value;
  throw new Error(`Generated layout names an unknown plane: ${value}`);
}

/**
 * The generated table, with `campusZone` joined on rather than baked in. The
 * bake has no opinion about zones — `zones.ts` is the only place that decides
 * whether Milstein is Barnard — so reading it back through that table is what
 * makes the two impossible to disagree.
 */
export const CAMPUS_LAYOUT_BUILDINGS: readonly CampusLayoutBuilding[] = generated.buildings.map(
  (entry): CampusLayoutBuilding => {
    const campusZone = ZONE_BY_BUILDING_ID.get(entry.buildingId);
    // A loud throw rather than a filter: a building that the bake can place but
    // the zone table has never heard of is a mistake in one of the two lists,
    // and silently dropping it would hide it until someone noticed a hole in
    // the map months later.
    if (!campusZone) {
      throw new Error(
        `Generated layout places "${entry.buildingId}", which lib/campus/zones.ts does not know. ` +
          `Add it to ADDITIONAL_BUILDINGS (and give it aliases) or drop it from BUILDINGS in ` +
          `scripts/build-campus-map.ts.`,
      );
    }
    return {
      buildingId: entry.buildingId,
      label: entry.label,
      campusZone,
      plane: planeIdOf(entry.plane),
      x: entry.x,
      z: entry.z,
      width: entry.width,
      depth: entry.depth,
      height: entry.height,
      ...("isLandmark" in entry && entry.isLandmark ? { isLandmark: true as const } : {}),
    };
  },
);

// ---------------------------------------------------------------------------
// Planes
// ---------------------------------------------------------------------------

/**
 * Breathing room around the outermost building, in plane units. The ground
 * rectangle is what the card draws asphalt on, so it wants to reach past the
 * last roof far enough that an orbit never swings the camera over the edge of
 * the world.
 */
const PLANE_PADDING_UNITS = 2;

const PLANE_LABELS: Record<CampusPlaneId, { label: string; zones: CampusZone[] }> = {
  "morningside-heights": { label: "Morningside Heights", zones: ["morningside", "barnard"] },
  manhattanville: { label: "Manhattanville", zones: ["manhattanville"] },
  cuimc: { label: "Columbia University Irving Medical Center", zones: ["cuimc"] },
};

/**
 * Derived from the buildings rather than declared, so a re-bake that adds a
 * building at the edge of campus cannot leave it hanging off the ground plane.
 */
export const CAMPUS_PLANES: readonly CampusPlane[] = (
  Object.keys(PLANE_LABELS) as CampusPlaneId[]
).map((planeId) => {
  const entries = CAMPUS_LAYOUT_BUILDINGS.filter((entry) => entry.plane === planeId);
  return {
    planeId,
    ...PLANE_LABELS[planeId],
    minX: Math.min(...entries.map((e) => e.x - e.width / 2)) - PLANE_PADDING_UNITS,
    maxX: Math.max(...entries.map((e) => e.x + e.width / 2)) + PLANE_PADDING_UNITS,
    minZ: Math.min(...entries.map((e) => e.z - e.depth / 2)) - PLANE_PADDING_UNITS,
    maxZ: Math.max(...entries.map((e) => e.z + e.depth / 2)) + PLANE_PADDING_UNITS,
  };
});

/**
 * Which plane a zone is drawn on. "other" and "unknown" have no place on any
 * map, so they borrow Morningside's plane and the card renders it unhighlighted
 * — a campus with no pin on it, which is exactly the honest picture.
 */
export function planeForZone(zone: CampusZone): CampusPlaneId {
  switch (zone) {
    case "manhattanville":
      return "manhattanville";
    case "cuimc":
      return "cuimc";
    default:
      return "morningside-heights";
  }
}

export function campusPlane(planeId: CampusPlaneId): CampusPlane {
  const plane = CAMPUS_PLANES.find((candidate) => candidate.planeId === planeId);
  // The union type makes this unreachable; the throw exists so a future plane
  // added to the union without a record here fails loudly instead of silently
  // rendering an empty card.
  if (!plane) throw new Error(`Unknown campus plane: ${planeId}`);
  return plane;
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

/**
 * Still hand-declared, because the 2D fallback wants labelled rectangles rather
 * than polylines and because which streets are worth drawing is a cartography
 * decision. What is NOT hand-guessed any more is `at`: every value below is the
 * median centreline the bake measured off the real OSM way, printed by
 * `npm run build:campus`.
 *
 * `from`/`to` are left at ±Infinity and clamped to the plane at module load, so
 * a street always spans the ground it is drawn on however the plane resizes.
 */
const ROAD_SOURCES: readonly Omit<CampusRoad, "from" | "to">[] = [
  // Broadway is the one road that has to read. Barnard is west of it, most of
  // the College is east of it, and the whole map hangs off that fact.
  {
    roadId: "broadway",
    label: "Broadway",
    plane: "morningside-heights",
    orientation: "north-south",
    at: -5.11,
    width: 0.9,
    isMajor: true,
  },
  {
    roadId: "amsterdam",
    label: "Amsterdam Ave",
    plane: "morningside-heights",
    orientation: "north-south",
    at: 5.1,
    width: 0.9,
    isMajor: true,
  },
  {
    roadId: "college-walk",
    label: "College Walk · 116th",
    plane: "morningside-heights",
    orientation: "east-west",
    at: 0.69,
    width: 0.8,
    isMajor: true,
  },
  { roadId: "w120", label: "W 120th St", plane: "morningside-heights", orientation: "east-west", at: -11.63, width: 0.6 },
  { roadId: "w114", label: "W 114th St", plane: "morningside-heights", orientation: "east-west", at: 7.17, width: 0.6 },
  {
    roadId: "mv-broadway",
    label: "Broadway",
    plane: "manhattanville",
    orientation: "north-south",
    at: 2.68,
    width: 0.9,
    isMajor: true,
  },
  {
    roadId: "mv-125",
    label: "W 125th St",
    plane: "manhattanville",
    orientation: "east-west",
    at: 3.14,
    width: 0.8,
    isMajor: true,
  },
  {
    roadId: "cuimc-broadway",
    label: "Broadway",
    plane: "cuimc",
    orientation: "north-south",
    at: 11.12,
    width: 0.9,
    isMajor: true,
  },
  {
    roadId: "cuimc-168",
    label: "W 168th St",
    plane: "cuimc",
    orientation: "east-west",
    at: 1.68,
    width: 0.8,
    isMajor: true,
  },
];

export const CAMPUS_ROADS: readonly CampusRoad[] = ROAD_SOURCES.map((road) => {
  const plane = CAMPUS_PLANES.find((candidate) => candidate.planeId === road.plane)!;
  return road.orientation === "north-south"
    ? { ...road, from: plane.minZ, to: plane.maxZ }
    : { ...road, from: plane.minX, to: plane.maxX };
});

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const LAYOUT_BY_BUILDING_ID = new Map(
  CAMPUS_LAYOUT_BUILDINGS.map((entry) => [entry.buildingId, entry] as const),
);

export function layoutBuildingById(buildingId: string): CampusLayoutBuilding | null {
  return LAYOUT_BY_BUILDING_ID.get(buildingId) ?? null;
}

export function buildingsOnPlane(planeId: CampusPlaneId): CampusLayoutBuilding[] {
  return CAMPUS_LAYOUT_BUILDINGS.filter((entry) => entry.plane === planeId);
}

export function roadsOnPlane(planeId: CampusPlaneId): CampusRoad[] {
  return CAMPUS_ROADS.filter((road) => road.plane === planeId);
}

/**
 * Everything the card needs from one raw location string, in one call.
 *
 * `layout` is null whenever the building is real but not drawn (or not
 * identified at all) — the card treats that as "frame the plane, pin its
 * centre" rather than as an error.
 */
export interface CampusLocation {
  /** The raw string we were handed, for the caption. */
  rawName: string | null;
  campusZone: CampusZone;
  plane: CampusPlaneId;
  buildingId: string | null;
  /** Canonical building name, or null when unidentified. */
  buildingLabel: string | null;
  layout: CampusLayoutBuilding | null;
}

export function resolveCampusLocation(rawName: string | null): CampusLocation {
  const zone = resolveCampusZone(rawName);
  const match = resolveCampusBuilding(rawName);
  const layout = match ? layoutBuildingById(match.buildingId) : null;
  return {
    rawName,
    campusZone: zone,
    plane: planeForZone(zone),
    buildingId: match?.buildingId ?? null,
    buildingLabel: layout?.label ?? match?.name ?? null,
    layout,
  };
}

/**
 * Plane-local focus point for the camera / viewBox: the pin, or, with nothing
 * to pin, the centre of gravity of the campus itself.
 *
 * Morningside's is Low's plaza rather than the middle of the bounding box —
 * the box is dragged north-west by Barnard and by the outliers up at 122nd,
 * and framing on it would put the recognisable campus in a corner.
 */
const PLANE_DEFAULT_FOCUS: Record<CampusPlaneId, { x: number; z: number } | null> = {
  "morningside-heights": { x: 0, z: -3.3 },
  manhattanville: null,
  cuimc: null,
};

export function focusPointFor(location: CampusLocation): { x: number; z: number } {
  if (location.layout) return { x: location.layout.x, z: location.layout.z };
  const declared = PLANE_DEFAULT_FOCUS[location.plane];
  if (declared) return declared;
  const plane = campusPlane(location.plane);
  return { x: (plane.minX + plane.maxX) / 2, z: (plane.minZ + plane.maxZ) / 2 };
}
