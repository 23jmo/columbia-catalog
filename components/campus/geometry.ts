/**
 * Campus-card lane — the ring maths and extrusion primitives that both the
 * building shells and the roof profiles are built from.
 *
 * Split out of `footprints.ts` so `roofs.ts` can share the same ring handling
 * without a cycle: `footprints.ts` composes shells out of both this module and
 * `roofs.ts`, and `roofs.ts` reaches only this far down. Everything here is
 * pure — a ring in, a `BufferGeometry` out — with no scene state and no
 * dependency on the layout table.
 *
 * All coordinates are plane-local units (26 m to the unit; see
 * `METRES_PER_CAMPUS_UNIT`). Rings are `[x, z]` pairs in the plane's own
 * horizontal frame, and the geometry that comes back is in world orientation:
 * x east, y up, z south.
 */

import { BufferAttribute, BufferGeometry, ExtrudeGeometry, Shape } from "three";

/**
 * `[x, z]` pairs, plane-local. Deliberately `number[][]` rather than a tuple:
 * that is what TypeScript infers from the imported JSON, and asserting a tuple
 * over it would need a cast through `unknown` that buys nothing — every reader
 * here destructures exactly two values anyway.
 */
export type Ring = number[][];

/**
 * Twice the ring's signed area in the (x, z) plane.
 *
 * Only the SIGN is load-bearing: it says which side of a directed edge the
 * building's interior is on, which is what both the wall winding and the roof
 * inset need. Positive means the ring is counter-clockwise in (x, z), and for
 * such a ring the interior lies to the left of every edge — `(-dz, dx)`.
 */
export function ringSignedArea(ring: Ring): number {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x0, z0] = ring[index];
    const [x1, z1] = ring[(index + 1) % ring.length];
    total += x0 * z1 - x1 * z0;
  }
  return total / 2;
}

/** Ring bounds and how close the outline is to filling them. */
export interface RingBounds {
  /**
   * Area-weighted centroid — which for a cruciform plan like Low's is its
   * crossing, and which is emphatically NOT the centre of the box below. On an
   * asymmetric outline like Havemeyer's the two are four metres apart, so
   * `centroidX ± halfWidth` is not the bounding box and never was.
   */
  centroidX: number;
  centroidZ: number;
  /** Half the extent of the axis-aligned bounding box. */
  halfWidth: number;
  halfDepth: number;
  /** Ring area ÷ bounding-box area. 1 for a true rectangle, ~0.7 for an E-plan. */
  rectangularity: number;
}

export function ringBounds(ring: Ring): RingBounds | null {
  if (ring.length < 3) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  // Area-weighted centroid, accumulated over the same shoelace terms as the area.
  let weightedX = 0;
  let weightedZ = 0;
  let doubleArea = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const [x0, z0] = ring[index];
    const [x1, z1] = ring[(index + 1) % ring.length];
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x0);
    minZ = Math.min(minZ, z0);
    maxZ = Math.max(maxZ, z0);
    const cross = x0 * z1 - x1 * z0;
    doubleArea += cross;
    weightedX += (x0 + x1) * cross;
    weightedZ += (z0 + z1) * cross;
  }

  const boxWidth = maxX - minX;
  const boxDepth = maxZ - minZ;
  if (boxWidth <= 0 || boxDepth <= 0 || doubleArea === 0) return null;

  return {
    centroidX: weightedX / (3 * doubleArea),
    centroidZ: weightedZ / (3 * doubleArea),
    halfWidth: boxWidth / 2,
    halfDepth: boxDepth / 2,
    rectangularity: Math.abs(doubleArea / 2) / (boxWidth * boxDepth),
  };
}

/**
 * The ring with its duplicate points collapsed and its closing vertex dropped.
 *
 * The survey carries a closing vertex equal to the first, and occasionally two
 * points a millimetre apart. A zero-length edge has no normal, and one of those
 * poisons both of its neighbours' bisectors — so every ring consumer that cares
 * about edges runs through here first. Idempotent, which is what lets a caller
 * dedupe and then inset and rely on the two rings having matching vertex counts.
 */
export function dedupeRing(ring: Ring): Ring | null {
  const distinct: Ring = [];
  for (const [x, z] of ring) {
    const previous = distinct[distinct.length - 1];
    if (previous && Math.abs(previous[0] - x) < 1e-6 && Math.abs(previous[1] - z) < 1e-6) continue;
    distinct.push([x, z]);
  }
  const first = distinct[0];
  const last = distinct[distinct.length - 1];
  if (distinct.length > 1 && Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) {
    distinct.pop();
  }
  return distinct.length >= 3 ? distinct : null;
}

/**
 * The ring wound counter-clockwise in (x, z), so callers can assume the
 * interior is to the left of every edge and write one winding case instead of
 * two. The survey is not consistent about this and neither is the bake.
 */
export function counterClockwise(ring: Ring): Ring {
  return ringSignedArea(ring) < 0 ? [...ring].reverse() : ring;
}

/**
 * The ring with its very short edges collapsed away.
 *
 * This is the one thing a bisector offset genuinely cannot survive without
 * help. A straight skeleton handles a 1.2 m jog in a wall by letting that edge
 * vanish partway up the roof — an "edge event" — and carrying on with one fewer
 * face. Offsetting every vertex in lockstep has no way to express that, so the
 * two sides of the jog march past each other and knot the ring. Teachers
 * College has two such jogs and loses its roof entirely without this.
 *
 * Collapsing DROPS a vertex rather than merging the pair into a midpoint, so
 * every surviving vertex is still a point on the surveyed outline. That is what
 * lets `insetRing`'s containment test stay meaningful: the simplified ring is
 * inscribed in the real one, so a point inside it is inside the building.
 */
export function simplifyRing(ring: Ring, minimumEdge: number): Ring {
  const simplified = [...ring];
  while (simplified.length > 4) {
    let shortest = Infinity;
    let at = -1;
    for (let index = 0; index < simplified.length; index += 1) {
      const [x0, z0] = simplified[index];
      const [x1, z1] = simplified[(index + 1) % simplified.length];
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < shortest) {
        shortest = length;
        at = index;
      }
    }
    if (shortest >= minimumEdge || at < 0) break;
    simplified.splice((at + 1) % simplified.length, 1);
  }
  return simplified;
}

/**
 * The ring pushed inward by `distance`, vertex by vertex along its own angle
 * bisector.
 *
 * This is what lets a pitched roof follow the real outline instead of a
 * bounding box. Columbia's quad buildings are E- and H-plans — Havemeyer fills
 * only 71% of its box — so a box-derived roof would hang out over the light
 * wells by ten metres. Offsetting the surveyed ring keeps the eave on the wall.
 *
 * Not a straight-skeleton offset, and the difference shows up at exactly one
 * kind of vertex: the reflex corner at the bottom of a light well, where the
 * two walls are nearly antiparallel and the bisector runs away as
 * `1 / cos(θ/2)`. A naive offset there throws the eave metres clear of the
 * building. Two guards keep that from happening, in order of how much they can
 * be trusted:
 *
 *   1. Each vertex is pulled back along its own offset until it lies INSIDE the
 *      original ring. That is the invariant an inward offset actually has, and
 *      enforcing it directly is worth more than any amount of clamping — the
 *      worst case degrades to "this corner's eave stays on the wall", which
 *      looks like a roof detail rather than like a bug.
 *   2. The result is rejected outright if it self-intersects, has flipped
 *      winding, or has collapsed — a narrow wing insetting past its own
 *      centreline. The caller is expected to fall back to a flat roof rather
 *      than hand a knotted ring to earcut, which will happily triangulate it.
 */
export function insetRing(ring: Ring, distance: number): Ring | null {
  const distinct = dedupeRing(ring);
  if (!distinct || distance <= 0) return null;

  const inwardSign = ringSignedArea(distinct) > 0 ? 1 : -1;
  const edgeNormals = distinct.map(([x0, z0], index) => {
    const [x1, z1] = distinct[(index + 1) % distinct.length];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const length = Math.hypot(dx, dz) || 1;
    return [(-dz / length) * inwardSign, (dx / length) * inwardSign] as const;
  });

  const maximumStep = distance * 2;
  // Tried longest-first: the full offset if it stays on the building, then
  // progressively shorter ones, and finally not moving this corner at all.
  const retreats = [1, 0.6, 0.35, 0.15, 0];

  const inset: Ring = distinct.map(([x, z], index) => {
    const incoming = edgeNormals[(index - 1 + distinct.length) % distinct.length];
    const outgoing = edgeNormals[index];
    const dot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1];
    // (n₁ + n₂)·d / (1 + n₁·n₂) lands exactly on the offset corner for any
    // convex angle; the guard catches the degenerate 180° reversal.
    const scale = 1 + dot < 1e-3 ? maximumStep : distance / (1 + dot);
    let offsetX = (incoming[0] + outgoing[0]) * scale;
    let offsetZ = (incoming[1] + outgoing[1]) * scale;
    const step = Math.hypot(offsetX, offsetZ);
    if (step > maximumStep) {
      offsetX = (offsetX / step) * maximumStep;
      offsetZ = (offsetZ / step) * maximumStep;
    }

    for (const retreat of retreats) {
      const candidateX = x + offsetX * retreat;
      const candidateZ = z + offsetZ * retreat;
      if (retreat === 0 || containsPoint(distinct, candidateX, candidateZ)) {
        return [candidateX, candidateZ];
      }
    }
    return [x, z];
  });

  const originalArea = ringSignedArea(distinct);
  const insetArea = ringSignedArea(inset);
  // A flipped sign means the offset walked through the middle and turned the
  // polygon inside out; a collapsed area means it very nearly did.
  if (Math.sign(insetArea) !== Math.sign(originalArea)) return null;
  if (Math.abs(insetArea) < Math.abs(originalArea) * 0.08) return null;
  if (selfIntersects(inset)) return null;
  return inset;
}

/** Ray casting, counting crossings of a ray heading in +x from the point. */
export function containsPoint(ring: Ring, x: number, z: number): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x0, z0] = ring[index];
    const [x1, z1] = ring[previous];
    if (z0 > z !== z1 > z && x < ((x1 - x0) * (z - z0)) / (z1 - z0) + x0) inside = !inside;
  }
  return inside;
}

/**
 * Whether any two non-adjacent edges cross.
 *
 * Quadratic, and unapologetically so: these rings are the ten to twenty points
 * a surveyed building outline has, this runs once per landmark at mount, and
 * the alternative is handing a figure-eight to earcut and rendering the result.
 */
function selfIntersects(ring: Ring): boolean {
  const orientation = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) =>
    Math.sign((bx - ax) * (cz - az) - (bz - az) * (cx - ax));

  for (let i = 0; i < ring.length; i += 1) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    for (let j = i + 1; j < ring.length; j += 1) {
      // Adjacent edges share an endpoint and always "touch"; skip them.
      if (j === i || (j + 1) % ring.length === i || (i + 1) % ring.length === j) continue;
      const [cx, cz] = ring[j];
      const [dx, dz] = ring[(j + 1) % ring.length];
      const d1 = orientation(ax, az, bx, bz, cx, cz);
      const d2 = orientation(ax, az, bx, bz, dx, dz);
      const d3 = orientation(cx, cz, dx, dz, ax, az);
      const d4 = orientation(cx, cz, dx, dz, bx, bz);
      if (d1 !== d2 && d3 !== d4) return true;
    }
  }
  return false;
}

/**
 * A triangle soup with the attribute set the rest of the campus geometry uses.
 *
 * `mergeGeometries` refuses to weld geometries whose attributes differ, and the
 * roof profiles mix hand-built slopes with three's own sphere and cylinder — so
 * everything has to carry position, normal AND uv even where the uv is never
 * sampled. Normals are computed per face from the winding, which is what we
 * want anyway: a roof plane should read as a plane, not as a smoothed blob.
 */
export class TriangleSoup {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];

  get triangleCount(): number {
    return this.positions.length / 9;
  }

  /** Vertices in counter-clockwise order as seen from the outside. */
  push(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
  ): void {
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    // A degenerate triangle carries no surface; dropping it here keeps NaN
    // normals out of the merged buffer, where they would blacken whole meshes.
    if (length < 1e-12) return;
    nx /= length;
    ny /= length;
    nz /= length;

    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    // Planar uv from the horizontal footprint. Roofs are untextured today, but
    // the slot has to be filled and a world-space projection is the mapping a
    // roof texture would want if one is ever added.
    this.uvs.push(ax, -az, bx, -bz, cx, -cz);
  }

  /** Two triangles across a quad given in outward-facing order. */
  pushQuad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
  ): void {
    this.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.push(ax, ay, az, cx, cy, cz, dx, dy, dz);
  }

  build(): BufferGeometry | null {
    if (this.positions.length === 0) return null;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(this.uvs), 2));
    return geometry;
  }
}

/** One building's walls and its flat lid, as separate geometries. */
export interface ExtrudedShell {
  /**
   * The side walls. Their uvs run (horizontal distance, −height) in plane
   * units, courtesy of `ExtrudeGeometry`'s world uv generator, so a tiled
   * facade texture lands at a consistent real-world size on every wall in the
   * scene regardless of how big the building is.
   */
  walls: BufferGeometry;
  /** The lid at `height`. Kept apart so roofs can take their own material. */
  lid: BufferGeometry | null;
}

/**
 * Copies one of `ExtrudeGeometry`'s material groups into a geometry of its own.
 *
 * `mergeGeometries(parts, true)` cannot do this for us: it assigns each input
 * geometry the material index of its position in the array and discards the
 * groups the inputs already had, which is the wrong axis entirely — we want the
 * two hundred buildings collapsed and the walls and lids kept apart, not the
 * reverse. Slicing is cheap because `ExtrudeGeometry` is non-indexed, so a
 * group is a contiguous run of vertices in every attribute.
 *
 * `keepAbove` drops the triangles below it, which is how the underground lid
 * gets thrown away: the extrusion always builds both, and the bottom one is
 * buried in the ground plane where it can only cost shadow-map fill.
 */
function sliceGroup(
  source: BufferGeometry,
  materialIndex: number,
  keepAbove?: number,
): BufferGeometry | null {
  const group = source.groups.find((entry) => entry.materialIndex === materialIndex);
  if (!group || group.count === 0) return null;

  const position = source.attributes.position as BufferAttribute;
  const kept: number[] = [];
  for (let vertex = group.start; vertex < group.start + group.count; vertex += 3) {
    // Pre-rotation the extrusion runs along +z, so "height" is still z here.
    if (keepAbove !== undefined && position.getZ(vertex) < keepAbove) continue;
    kept.push(vertex);
  }
  if (kept.length === 0) return null;

  const slice = new BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    const attribute = source.attributes[name] as BufferAttribute;
    const { itemSize } = attribute;
    const array = new Float32Array(kept.length * 3 * itemSize);
    let cursor = 0;
    for (const start of kept) {
      for (let offset = 0; offset < 3; offset += 1) {
        for (let component = 0; component < itemSize; component += 1) {
          array[cursor] = attribute.array[(start + offset) * itemSize + component];
          cursor += 1;
        }
      }
    }
    slice.setAttribute(name, new BufferAttribute(array, itemSize));
  }
  return slice;
}

/**
 * One building's outline, extruded upward and split into walls and lid.
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
export function extrudeParts(
  ring: Ring,
  height: number,
  offsetX = 0,
  offsetZ = 0,
): ExtrudedShell | null {
  if (ring.length < 3 || height <= 0) return null;

  const shape = new Shape();
  const mirrored = [...ring].reverse();
  mirrored.forEach(([x, z], index) => {
    const px = x + offsetX;
    const py = -(z + offsetZ);
    if (index === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();

  const extruded = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
  });

  const walls = sliceGroup(extruded, 1);
  const lid = sliceGroup(extruded, 0, height * 0.5);
  extruded.dispose();
  if (!walls) {
    lid?.dispose();
    return null;
  }

  walls.rotateX(-Math.PI / 2);
  lid?.rotateX(-Math.PI / 2);
  return { walls, lid };
}

/**
 * Just the flat lid over a ring, at height `y`.
 *
 * Roof decks need a triangulated cap and nothing else, and re-deriving one
 * would mean re-deriving the winding rules that `extrudeParts` already gets
 * right. Extruding a unit-tall prism and keeping its top is a few wasted
 * earcut triangles once, at mount, for a guarantee that the deck faces the same
 * way as every other lid in the scene.
 */
export function lidGeometry(ring: Ring, y: number): BufferGeometry | null {
  const shell = extrudeParts(ring, 1);
  if (!shell) return null;
  shell.walls.dispose();
  if (!shell.lid) return null;
  shell.lid.translate(0, y - 1, 0);
  return shell.lid;
}

/**
 * How much of the smaller of two rings is covered by the other, 0…1.
 *
 * Sampled on a grid over the shared bounding box rather than clipped exactly.
 * Exact polygon intersection needs a general clipper — Sutherland–Hodgman only
 * handles a convex clip region, and campus outlines are emphatically not convex
 * (Hamilton is an E, Milbank wraps a courtyard). A clipper is a few hundred
 * lines and a new class of edge case for a number that is only ever compared
 * against a threshold.
 *
 * `SAMPLES` of 24 was calibrated against a 120×120 reference over every
 * overlapping pair in the generated survey: the two agree on all 64 of them at
 * the 0.1 threshold this is used with. Raising it buys precision nobody reads.
 *
 * Returns 0 when the bounding boxes miss, which is the overwhelmingly common
 * case and costs two comparisons.
 */
export function ringOverlapFraction(a: Ring, b: Ring): number {
  const SAMPLES = 24;
  const boxA = ringExtent(a);
  const boxB = ringExtent(b);
  if (!boxA || !boxB) return 0;

  const minX = Math.max(boxA.minX, boxB.minX);
  const maxX = Math.min(boxA.maxX, boxB.maxX);
  const minZ = Math.max(boxA.minZ, boxB.minZ);
  const maxZ = Math.min(boxA.maxZ, boxB.maxZ);
  if (maxX <= minX || maxZ <= minZ) return 0;

  let hits = 0;
  for (let column = 0; column < SAMPLES; column += 1) {
    const x = minX + ((column + 0.5) / SAMPLES) * (maxX - minX);
    for (let row = 0; row < SAMPLES; row += 1) {
      const z = minZ + ((row + 0.5) / SAMPLES) * (maxZ - minZ);
      if (containsPoint(a, x, z) && containsPoint(b, x, z)) hits += 1;
    }
  }

  const cellArea = ((maxX - minX) * (maxZ - minZ)) / (SAMPLES * SAMPLES);
  const smaller = Math.min(Math.abs(ringSignedArea(a)), Math.abs(ringSignedArea(b)));
  return smaller > 0 ? (hits * cellArea) / smaller : 0;
}

/** Axis-aligned extent. Distinct from `ringBounds`, whose centre is the area-weighted centroid. */
function ringExtent(ring: Ring): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (ring.length < 3) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}
