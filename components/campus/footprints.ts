/**
 * Campus-card lane — surveyed footprints → three.js geometry.
 *
 * WHY this lives under `components/campus/` and not in `lib/campus/`:
 * `lib/campus/index.ts` promises that "nothing in here pulls three.js, so
 * importing zone resolution costs a consumer nothing". Zone resolution is
 * imported by the drawer, the schedule and the search lane; the 230 KB of
 * polygon rings this file reads are of interest to exactly one component. Put
 * it in `lib/campus` and every one of those consumers ships the neighbourhood
 * of Morningside Heights in their first payload. Here, it lands in the same
 * lazily-imported chunk as three.js itself.
 *
 * The rings come from `scripts/build-campus-map.ts` — NYC Open Data's
 * photogrammetric survey, projected onto the street grid. Campus buildings are
 * stored relative to their own centroid so the layout table stays the single
 * source of truth for where a building is; context buildings are stored in
 * absolute plane coordinates, because nothing ever needs to move one.
 */

import { BufferGeometry, ExtrudeGeometry, Shape } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CampusLayoutBuilding, CampusPlaneId } from "@/lib/campus";
import data from "@/lib/campus/generated/campus-footprints.json";

/**
 * `[x, z]` pairs, plane-local. Deliberately `number[][]` rather than a tuple:
 * that is what TypeScript infers from the imported JSON, and asserting a tuple
 * over it would need a cast through `unknown` that buys nothing — every reader
 * below destructures exactly two values anyway.
 */
type Ring = number[][];

const CAMPUS_RINGS: Record<string, Ring> = data.buildings;
const CONTEXT: { plane: string; height: number; footprint: Ring }[] = data.context;

/**
 * One building's outline, extruded upward.
 *
 * `ExtrudeGeometry` builds in the XY plane and extrudes along +z, so the ring
 * is laid out as (x, -z) and the result rotated -90° about X: that maps a shape
 * point (px, py) at extrusion depth d to world (px, d, -py), which puts the
 * outline back where it came from with the extrusion running up +y.
 *
 * The (x, -z) mapping mirrors the ring, which flips its winding — hence the
 * reverse. Without it every wall's normal points inward and the whole campus
 * lights from the wrong side.
 */
function extrude(ring: Ring, height: number, offsetX = 0, offsetZ = 0): BufferGeometry {
  const shape = new Shape();
  const mirrored = [...ring].reverse();
  mirrored.forEach(([x, z], index) => {
    const px = x + offsetX;
    const py = -(z + offsetZ);
    if (index === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function hasFootprint(buildingId: string): boolean {
  return Array.isArray(CAMPUS_RINGS[buildingId]) && CAMPUS_RINGS[buildingId].length >= 3;
}

/** A single building, extruded in place. Used for the pin, which needs its own material. */
export function buildingGeometry(building: CampusLayoutBuilding): BufferGeometry | null {
  const ring = CAMPUS_RINGS[building.buildingId];
  if (!ring || ring.length < 3) return null;
  return extrude(ring, building.height, building.x, building.z);
}

/**
 * Every listed building welded into ONE geometry.
 *
 * This is the whole reason the card can afford real outlines. The old map drew
 * identical boxes, so drei's `<Instances>` collapsed the campus into a single
 * draw call; unique footprints make instancing impossible. Merging at mount
 * gets the draw call back — the cost moves to ~200 earcut triangulations that
 * run once, off the critical path, inside a chunk that only loads when the card
 * has already decided to render in 3D.
 */
export function mergedGeometry(
  buildings: readonly CampusLayoutBuilding[],
): BufferGeometry | null {
  const parts = buildings
    .map((building) => buildingGeometry(building))
    .filter((geometry): geometry is BufferGeometry => geometry !== null);
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts);
  // `mergeGeometries` copies; the parts are garbage the moment it returns and
  // three will not collect their GPU buffers for us.
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * The neighbourhood: every surveyed building on the plane that is not Columbia's.
 *
 * Without this the campus floats in an empty grey field and reads as a diagram.
 * With it, Broadway has a wall of pre-war apartment blocks on both sides and the
 * card reads as a place. One merged geometry, one flat material, no outlines —
 * it is scenery, and it must never compete with the pin.
 */
export function contextGeometry(plane: CampusPlaneId): BufferGeometry | null {
  const parts = CONTEXT.filter((entry) => entry.plane === plane).map((entry) =>
    extrude(entry.footprint, entry.height),
  );
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}
