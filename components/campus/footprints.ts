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
 *
 * A building comes out of here as a SHELL — walls and roof as separate
 * geometries — rather than as one solid. That split is what lets the walls take
 * a tiled facade texture while the roofs stay plain: a window grid wrapped over
 * the top of a building looks like a mistake, and there is no way to say
 * "not up there" with a single material. See `facade.ts` for the texture and
 * `roofs.ts` for the shapes that sit on top of the flat lids.
 */

import type { BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CampusLayoutBuilding, CampusPlaneId } from "@/lib/campus";
import data from "@/lib/campus/generated/campus-footprints.json";
import { extrudeParts, type Ring } from "./geometry";
import { roofGeometry } from "./roofs";

const CAMPUS_RINGS: Record<string, Ring> = data.buildings;
const CONTEXT: { plane: string; height: number; footprint: Ring }[] = data.context;

/**
 * Walls and roofs as separate geometries, each already welded across every
 * building that was asked for.
 *
 * Two meshes rather than one mesh with a two-slot material array: the draw call
 * count is identical either way — the GPU issues one per material — and two
 * plain meshes keep the scene declarative, with each material staying a JSX
 * child that React owns and disposes instead of a hand-managed array.
 */
export interface CampusShell {
  walls: BufferGeometry;
  /** Flat lids plus any curated profile. Null only if every wall was degenerate. */
  roofs: BufferGeometry | null;
}

export function hasFootprint(buildingId: string): boolean {
  return Array.isArray(CAMPUS_RINGS[buildingId]) && CAMPUS_RINGS[buildingId].length >= 3;
}

/** One building's walls and roof, moved into its place on the plane. */
function buildingParts(building: CampusLayoutBuilding): CampusShell | null {
  const ring = CAMPUS_RINGS[building.buildingId];
  if (!ring || ring.length < 3) return null;

  const shell = extrudeParts(ring, building.height, building.x, building.z);
  if (!shell) return null;

  const roofs: BufferGeometry[] = [];
  if (shell.lid) roofs.push(shell.lid);

  // The curated profile is built in the building's own local frame, so it has
  // to be walked out to the layout position the way the extrusion already was.
  const profile = roofGeometry(building.buildingId, ring, building.height);
  if (profile) {
    profile.translate(building.x, 0, building.z);
    roofs.push(profile);
  }

  return { walls: shell.walls, roofs: mergeAndDispose(roofs) };
}

function mergeAndDispose(parts: BufferGeometry[]): BufferGeometry | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const merged = mergeGeometries(parts);
  // `mergeGeometries` copies; the parts are garbage the moment it returns and
  // three will not collect their GPU buffers for us.
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * A single building as ONE solid, for the pin.
 *
 * The pin is the exception to the wall/roof split: it is drawn in the accent
 * colour with an emissive pulse and no texture at all, so keeping it whole
 * saves a mesh and lets `<Edges>` trace the whole silhouette — dome included —
 * in a single pass.
 */
export function buildingGeometry(building: CampusLayoutBuilding): BufferGeometry | null {
  const parts = buildingParts(building);
  if (!parts) return null;
  return mergeAndDispose(parts.roofs ? [parts.walls, parts.roofs] : [parts.walls]);
}

/**
 * Every listed building welded into one shell.
 *
 * This is the whole reason the card can afford real outlines. The old map drew
 * identical boxes, so drei's `<Instances>` collapsed the campus into a single
 * draw call; unique footprints make instancing impossible. Merging at mount
 * gets the draw calls back down to one per material — the cost moves to ~200
 * earcut triangulations that run once, off the critical path, inside a chunk
 * that only loads when the card has already decided to render in 3D.
 */
export function mergedShell(buildings: readonly CampusLayoutBuilding[]): CampusShell | null {
  return weld(
    buildings
      .map((building) => buildingParts(building))
      .filter((parts): parts is CampusShell => parts !== null),
  );
}

/**
 * The neighbourhood: every surveyed building on the plane that is not Columbia's.
 *
 * Without this the campus floats in an empty grey field and reads as a diagram.
 * With it, Broadway has a wall of pre-war apartment blocks on both sides and the
 * card reads as a place. Scenery — no curated roofs, no outlines — and it must
 * never compete with the pin.
 */
export function contextShell(plane: CampusPlaneId): CampusShell | null {
  return weld(
    CONTEXT.filter((entry) => entry.plane === plane)
      .map((entry) => extrudeParts(entry.footprint, entry.height))
      .filter((shell) => shell !== null)
      .map((shell) => ({ walls: shell.walls, roofs: shell.lid })),
  );
}

function weld(shells: readonly CampusShell[]): CampusShell | null {
  if (shells.length === 0) return null;
  const walls = mergeAndDispose(shells.map((shell) => shell.walls));
  if (!walls) return null;
  return {
    walls,
    roofs: mergeAndDispose(
      shells.map((shell) => shell.roofs).filter((roof): roof is BufferGeometry => roof !== null),
    ),
  };
}
