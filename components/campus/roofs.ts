/**
 * Campus-card lane — roof profiles for the buildings you would recognise.
 *
 * WHY this is a hand-written table and not more survey data: the card's
 * footprints come from NYC Open Data's 3D Building Model, which is LOD 1.5 —
 * a surveyed outline extruded to a single roof height. There is no public LOD2
 * dataset for Morningside Heights, so nothing anywhere in the pipeline knows
 * that Low has a dome. Every building in the scene is therefore a flat-topped
 * prism, and a flat-topped prism the size of Low is unrecognisable: the one
 * silhouette that says "Columbia" is exactly the one the data cannot express.
 *
 * So the roofs are curated. Two kinds cover the campus:
 *
 *   - `dome`, for the three domed buildings, whose dimensions are read off the
 *     buildings and are the load-bearing claim in this file.
 *   - `skirt`, a pitched band that follows the surveyed outline inward and
 *     upward, optionally in two tiers for a mansard. This covers the McKim,
 *     Mead & White quad, whose buildings carry low copper hips behind their
 *     cornices, and the steeper roofs at Barnard and Teachers College.
 *
 * A skirt follows the RING, not a bounding box, which matters more than it
 * sounds: Havemeyer fills 71% of its box and Milbank 67%, so a box-derived roof
 * would hang ten metres out over their light wells. See `insetRing`.
 *
 * Everything here is expressed in metres and converted once, because the
 * numbers came off a building and should stay legible as building dimensions.
 * Geometry comes back in the building's own local frame with y absolute, which
 * is the same frame the rings are stored in — `footprints.ts` translates both.
 */

import { CylinderGeometry, SphereGeometry, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { METRES_PER_CAMPUS_UNIT } from "@/lib/campus";
import {
  TriangleSoup,
  counterClockwise,
  dedupeRing,
  insetRing,
  lidGeometry,
  ringBounds,
  simplifyRing,
  type Ring,
} from "./geometry";

/** One pitch of a roof: pull the eave line in this far, and raise it this much. */
interface RoofTier {
  insetMetres: number;
  riseMetres: number;
}

type RoofProfile =
  | {
      kind: "dome";
      radiusMetres: number;
      /** Height of the dome itself above the drum — Low's is shallow, Earl's is not. */
      riseMetres: number;
      /** The straight collar the dome springs from. */
      drumMetres: number;
      /** Optional lantern on the crown. */
      lanternMetres?: number;
    }
  | { kind: "skirt"; tiers: readonly RoofTier[] };

/**
 * The low copper hip behind a Beaux-Arts cornice, which is what almost the
 * whole 1897 quad has. Shallow on purpose: at the card's scale a steep roof on
 * a 63-metre building reads as a barn, and the point of these is to break the
 * flat grey lids up, not to draw attention away from the pin.
 */
const QUAD_HIP: RoofProfile = { kind: "skirt", tiers: [{ insetMetres: 5, riseMetres: 4 }] };

const ROOF_BY_BUILDING: Record<string, RoofProfile> = {
  // Low Memorial Library. The dome is the reason this file exists — a ~30 m
  // rotunda on a 60 m square, shallow, on a low attic drum.
  low: { kind: "dome", radiusMetres: 15, riseMetres: 10, drumMetres: 5 },
  // Earl Hall: the same Pantheon idea at a quarter of the size, and rounder.
  earl: { kind: "dome", radiusMetres: 6.5, riseMetres: 5, drumMetres: 2 },
  // St Paul's Chapel: a dome over the crossing, on a tall drum, with a lantern.
  "st-pauls": { kind: "dome", radiusMetres: 7, riseMetres: 8, drumMetres: 10, lanternMetres: 5 },

  // Buell Hall — the oldest building on campus and the only Second Empire one:
  // a mansard, which is two tiers, steep then almost flat.
  buell: {
    kind: "skirt",
    tiers: [
      { insetMetres: 2.5, riseMetres: 6 },
      { insetMetres: 5, riseMetres: 1.5 },
    ],
  },

  // The steeper roofs: Barnard's and Teachers College's, which are pitched
  // rather than hidden behind a cornice.
  milbank: { kind: "skirt", tiers: [{ insetMetres: 6, riseMetres: 9 }] },
  "barnard-hall": { kind: "skirt", tiers: [{ insetMetres: 5, riseMetres: 6 }] },
  "teachers-college": { kind: "skirt", tiers: [{ insetMetres: 5, riseMetres: 8 }] },

  // The quad.
  hamilton: QUAD_HIP,
  havemeyer: QUAD_HIP,
  schermerhorn: QUAD_HIP,
  fayerweather: QUAD_HIP,
  philosophy: QUAD_HIP,
  kent: QUAD_HIP,
  mathematics: QUAD_HIP,
  journalism: QUAD_HIP,
  lewisohn: QUAD_HIP,
  chandler: QUAD_HIP,
  avery: QUAD_HIP,
  dodge: QUAD_HIP,
};

export function hasRoofProfile(buildingId: string): boolean {
  return buildingId in ROOF_BY_BUILDING;
}

/** How many segments a dome of this radius earns. Small domes do not need 32. */
function domeSegments(radiusUnits: number): number {
  return Math.max(12, Math.min(32, Math.round(radiusUnits * 40)));
}

/**
 * Drum, dome and optional lantern, centred on the footprint's centroid.
 *
 * The centroid rather than the bounding box centre because Low is cruciform:
 * an area-weighted centroid lands on its crossing, which is where the rotunda
 * actually is, and a box centre would too — but St Paul's is a Latin cross and
 * there the two differ by several metres.
 */
function domeGeometry(
  profile: Extract<RoofProfile, { kind: "dome" }>,
  ring: Ring,
  height: number,
): BufferGeometry | null {
  const bounds = ringBounds(ring);
  if (!bounds) return null;

  const radius = profile.radiusMetres / METRES_PER_CAMPUS_UNIT;
  const rise = profile.riseMetres / METRES_PER_CAMPUS_UNIT;
  const drum = profile.drumMetres / METRES_PER_CAMPUS_UNIT;
  // A dome wider than the building it sits on is a bug in the table, not a
  // building; clamping keeps a typo from producing a mushroom.
  const fitted = Math.min(radius, Math.min(bounds.halfWidth, bounds.halfDepth) * 0.92);
  const segments = domeSegments(fitted);

  const parts: BufferGeometry[] = [];

  const collar = new CylinderGeometry(fitted, fitted, drum, segments, 1, true).toNonIndexed();
  collar.translate(0, height + drum / 2, 0);
  parts.push(collar);

  // A hemisphere squashed to the profile's rise. Non-uniform scaling is safe
  // here: `BufferGeometry.scale` runs the normals through a normal matrix, so
  // the shading stays correct on the flattened shell.
  const shell = new SphereGeometry(fitted, segments, Math.max(6, segments >> 1), 0, Math.PI * 2, 0, Math.PI / 2)
    .toNonIndexed();
  shell.scale(1, rise / fitted, 1);
  shell.translate(0, height + drum, 0);
  parts.push(shell);

  if (profile.lanternMetres) {
    const lanternHeight = profile.lanternMetres / METRES_PER_CAMPUS_UNIT;
    const lanternRadius = fitted * 0.22;
    const lantern = new CylinderGeometry(lanternRadius, lanternRadius, lanternHeight, 8).toNonIndexed();
    lantern.translate(0, height + drum + rise + lanternHeight / 2, 0);
    parts.push(lantern);
  }

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) return null;
  merged.translate(bounds.centroidX, 0, bounds.centroidZ);
  return merged;
}

/**
 * The tier's inset, shortened until the ring survives it.
 *
 * The buildings that need this are the ones with courtyards and light wells —
 * Milbank, Hamilton, Teachers College — where a five-metre offset has to
 * negotiate a slot barely wider than that, and `insetRing` rightly refuses. A
 * shorter inset gives a steeper, narrower roof, which is a far better answer
 * than the flat lid those buildings would otherwise keep: the deep-plan
 * buildings are exactly the ones whose flat tops read worst.
 */
function insetTier(ring: Ring, insetMetres: number): Ring | null {
  for (const shortening of [1, 0.6, 0.35]) {
    const inner = insetRing(ring, (insetMetres * shortening) / METRES_PER_CAMPUS_UNIT);
    if (inner) return inner;
  }
  return null;
}

/**
 * A pitched band from one ring up and in to the next, plus a deck on top.
 *
 * The rings are normalised counter-clockwise first so there is exactly one
 * winding case to get right: for a counter-clockwise ring in (x, z) the
 * interior is to the left of every edge, which puts the outward face of the
 * band on the (outer[i] → inner[i] → inner[i+1]) diagonal.
 */
function skirtGeometry(
  profile: Extract<RoofProfile, { kind: "skirt" }>,
  ring: Ring,
  height: number,
): BufferGeometry | null {
  const deduped = dedupeRing(ring);
  if (!deduped) return null;

  const soup = new TriangleSoup();
  // Simplified against the FIRST tier's inset, since that is the step that has
  // to clear the building's own jogs; later tiers start from a ring this one
  // has already smoothed.
  let outer = counterClockwise(
    simplifyRing(deduped, (profile.tiers[0].insetMetres * 0.6) / METRES_PER_CAMPUS_UNIT),
  );
  let y = height;

  for (const tier of profile.tiers) {
    const inner = insetTier(outer, tier.insetMetres);
    // The inset ate the wing even at its shortest. A flat top is a worse roof
    // than a pitched one but an infinitely better one than a self-intersecting
    // knot, so stop here and let the building's own lid show through.
    if (!inner) break;
    const top = y + tier.riseMetres / METRES_PER_CAMPUS_UNIT;

    for (let index = 0; index < outer.length; index += 1) {
      const next = (index + 1) % outer.length;
      soup.pushQuad(
        outer[index][0], y, outer[index][1],
        inner[index][0], top, inner[index][1],
        inner[next][0], top, inner[next][1],
        outer[next][0], y, outer[next][1],
      );
    }

    outer = inner;
    y = top;
  }

  if (soup.triangleCount === 0) return null;

  const parts: BufferGeometry[] = [];
  const slopes = soup.build();
  if (slopes) parts.push(slopes);
  const deck = lidGeometry(outer, y);
  if (deck) parts.push(deck);
  if (parts.length === 0) return null;

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * The curated roof for a building, in the building's local frame, or null when
 * it has none — which is most of them, and correct: Butler, Pupin, Mudd and the
 * whole modern campus really are flat on top.
 */
export function roofGeometry(buildingId: string, ring: Ring, height: number): BufferGeometry | null {
  const profile = ROOF_BY_BUILDING[buildingId];
  if (!profile || ring.length < 3) return null;
  return profile.kind === "dome"
    ? domeGeometry(profile, ring, height)
    : skirtGeometry(profile, ring, height);
}
