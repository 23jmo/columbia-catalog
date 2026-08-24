"use client";

/**
 * Campus-card lane — the 3D scene.
 *
 * Split out of `campus-card.tsx` so that this file, and the ~600 KB of three.js
 * behind it, is only ever fetched when the card has actually decided to render
 * in 3D. The card imports it through `next/dynamic({ ssr: false })`; nothing
 * here runs on the server.
 *
 * What this draws is surveyed, not stylised: real building outlines from NYC
 * Open Data, real roof heights, and the surrounding neighbourhood behind them.
 * See `scripts/build-campus-map.ts` for where the numbers come from and
 * `./footprints.ts` for how they become geometry.
 *
 * Two things are NOT surveyed, and are marked as such where they are defined:
 * the roof profiles in `./roofs.ts` (the survey is LOD 1.5 and does not know
 * that Low has a dome) and the facade grid in `./facade.ts`.
 *
 * Performance rules this scene is built around (spec §19 — the drawer's
 * open-time budget is a hard bar, and this card may not touch it):
 *
 *   - Real outlines rule out instancing, so the campus is MERGED instead: one
 *     shell for the muted mass, one for landmarks, one for the neighbourhood,
 *     each split into walls and roofs so the two can take different materials.
 *     Six draw calls, plus the pin, its marker and the ground.
 *   - ONE facade texture, drawn into a canvas once and shared by all three
 *     wall materials. It tiles in world units, so no mesh needs its own uvs.
 *   - `frameloop="demand"` unless the pulse is actually running. When the card
 *     scrolls out of view or the tab is hidden the parent flips `animate` off
 *     and the renderer goes quiet; orbiting still redraws, because drei's
 *     controls call `invalidate()` themselves.
 *   - Shadows are rendered ONCE. Geometry and light are both static, so
 *     `shadowMap.autoUpdate` is off and a single update is forced whenever the
 *     plane or the pin changes. Orbiting re-reads the same shadow map.
 *   - The environment map is generated procedurally from three's own
 *     `RoomEnvironment`. It is what makes the walls read as surfaces rather
 *     than as flat fills, and it costs one small render at mount — no HDRI, no
 *     CDN, no network at all.
 *   - DPR is capped at 1.75. A 3× retina buffer for a 320 px card is pure heat.
 *
 * Colours arrive fully resolved from `palette.ts` — see that file for why the
 * BoardUI tokens cannot be handed to three.js directly.
 */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Html, Instance, Instances, Line, OrbitControls } from "@react-three/drei";
import {
  PMREMGenerator,
  type BufferGeometry,
  type Mesh,
  type MeshStandardMaterial,
  type OrthographicCamera,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CAMPUS_VIEW_WIDTH_UNITS, buildingsOnPlane, campusPlane, roadsOnPlane } from "@/lib/campus";
import type { CampusLayoutBuilding, CampusPlaneId, CampusRoad } from "@/lib/campus";
import { buildingGeometry, contextShell, mergedShell, type CampusShell } from "./footprints";
import { groundLabel } from "./labels";
import type { CampusMarker } from "./contracts";
import type { CampusRoutePoint } from "./contracts";
import { facadeMaps, type FacadeMaps } from "./facade";
import { blendToward, shadeAgainst, type CampusPalette } from "./palette";

export interface CampusSceneProps {
  plane: CampusPlaneId;
  /** Plane-local point the camera centres on. */
  focus: { x: number; z: number };
  /** The building to highlight, or null when we only know the campus. */
  pinned: CampusLayoutBuilding | null;
  palette: CampusPalette;
  /**
   * Drives both the idle drift and the marker pulse, and picks the frameloop
   * mode. False whenever the card is off-screen, the tab is hidden, or the
   * reader asked for reduced motion.
   */
  animate: boolean;
  /** Accessible name for the canvas — the same sentence the caption carries. */
  description: string;
  /** Printed over the pin, inside the frame. */
  marker: CampusMarker;
  /**
   * Fires once the renderer exists and has been handed its first frame. The
   * card keeps the flat map underneath until this lands, so the swap happens on
   * a drawn model rather than on an empty canvas element.
   */
  onReady?: () => void;
  /** Fires if the GPU drops the context, so the card can fall back to 2D. */
  onContextLost?: () => void;
  /** Same-plane walking path between day's classes. */
  route?: ReadonlyArray<CampusRoutePoint> | null;
  /** See `DayRoute` — false draws the stops as a set, not a walk. */
  connectStops?: boolean;
}

/**
 * World units across the viewport, shared with the flat map so the cross-fade
 * does not change scale.
 *
 * The old cartoon framed 15 units, and that was right for it: it drew thirty
 * buildings and nothing else, so a tighter crop lost nothing. Now that the
 * neighbourhood is in the scene, framing that tight puts the pin in an
 * anonymous field of grey blocks with no campus in sight — the survey only pays
 * off if enough of it is on screen to recognise.
 */
const VIEW_WORLD_WIDTH = CAMPUS_VIEW_WIDTH_UNITS;
/** Isometric-ish view direction. Not a true 2:1 iso — a touch higher reads better. */
const CAMERA_DIRECTION = { x: 1, y: 0.92, z: 1 };
const CAMERA_DISTANCE = 40;
/**
 * How far the asphalt reaches past the plane's own rectangle. The bake carries
 * the neighbourhood well beyond the campus bounding box, and ground that
 * stopped at the last Columbia building would leave those blocks hovering.
 */
const GROUND_OVERSCAN_UNITS = 20;
/**
 * Cap height of a street name, in plane units — 26 m to the unit, so this is
 * about six metres of lettering. Larger than any real road marking, because the
 * card frames 680 m of city into a box a few hundred pixels wide and a name at
 * true scale would be a smudge.
 */
const ROAD_LABEL_HEIGHT = 0.52;

/**
 * Drawn after the city, since it ignores depth and would otherwise be painted
 * over by anything that happens to be sorted later.
 */
const ROAD_LABEL_RENDER_ORDER = 3;

/**
 * How far along its own street a name sits from whatever the camera is centred
 * on, in plane units (~94 m).
 *
 * Not zero, because the labels ignore depth: a name placed at the focus lands
 * squarely on the accent-coloured building the whole card exists to point at,
 * and "Amsterdam Ave" written across the pin reads as a bug rather than as a
 * street. Far enough to clear the widest building on campus, near enough that
 * it is still obviously *this* stretch of the street.
 */
const ROAD_LABEL_OFFSET = 3.6;

/**
 * How far a building's roof leans over its own street, as a fraction of the
 * building's height.
 *
 * An isometric roof is drawn displaced up-screen from the footprint it stands
 * on, so a tall building overhangs the street it fronts *on screen* even though
 * it does not in the world. A label that ignores depth then lands on the
 * accent-coloured box however far along the street we push it — the collision
 * is in screen space, and no amount of offsetting along the road fixes it. So
 * the one name that would deface the pin is skipped instead; the other majors
 * still orient the reader, and the pin's own plate already names the place.
 *
 * Proportional to height rather than constant, because that is what the lean
 * actually is: a flat constant either lets 2.1-unit IAB overhang Amsterdam
 * unchecked or drops both of low-rise Kent Hall's streets for no reason.
 * Calibrated against exactly those two — IAB clears at anything above 0.33,
 * Kent keeps both of its streets below 0.52.
 */
const ROAD_LABEL_LEAN_PER_UNIT_HEIGHT = 0.45;

function roadBox(road: CampusRoad) {
  const length = road.to - road.from;
  const center = (road.from + road.to) / 2;
  return road.orientation === "north-south"
    ? { position: [road.at, 0, center] as const, scale: [road.width, 1, length] as const }
    : { position: [center, 0, road.at] as const, scale: [length, 1, road.width] as const };
}

/**
 * Disposes a geometry when it is replaced or unmounted.
 *
 * `useMemo` alone is not enough: three's buffers live on the GPU and React has
 * no idea they exist, so a plane change would leak a whole campus every time.
 * Callers keep their own `useMemo` — the dependency list has to be a literal
 * for the compiler to check it, so it cannot be hidden behind this hook.
 */
function useDisposed<T extends BufferGeometry | null>(geometry: T): T {
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry;
}

/** The same, for a shell — which is two geometries and so two leaks. */
function useDisposedShell(shell: CampusShell | null): CampusShell | null {
  useEffect(
    () => () => {
      shell?.walls.dispose();
      shell?.roofs?.dispose();
    },
    [shell],
  );
  return shell;
}

/**
 * One shell, drawn as its walls and its roofs.
 *
 * The split exists so the window grid stops at the eaves: a facade texture is
 * only meaningful on a vertical surface, and tiling it across a roof — where
 * its uvs would be a plan projection — looks like a rendering bug rather than
 * like a building. Roofs get the same colour a step further from the ground and
 * no map at all.
 */
function ShellMeshes({
  shell,
  color,
  ground,
  roughness,
  roofContrast,
  facade,
  castShadow,
  recessed = false,
}: {
  shell: CampusShell;
  color: string;
  ground: string;
  roughness: number;
  roofContrast: number;
  facade: FacadeMaps | null;
  castShadow: boolean;
  /**
   * Lose every depth tie against the rest of the scene.
   *
   * `footprints.ts` drops the neighbourhood buildings that are really one of
   * ours surveyed twice, which is most of this problem. What it deliberately
   * does NOT drop is a genuine neighbour that merely abuts a campus building —
   * Mudd and Prentis each touch one at a few percent of their area, and those
   * buildings are real. Where such a pair also happens to share a roof height
   * to the centimetre, the depth buffer has no basis to order the two lids and
   * the roof breaks into a speckled patchwork that crawls as the camera moves.
   *
   * A polygon offset settles it by rule instead of by rounding: the scenery is
   * pushed a hair deeper, so campus always wins the tie. Cheaper and more
   * honest than nudging the survey's heights, which would be inventing data to
   * work around a renderer detail.
   */
  recessed?: boolean;
}) {
  return (
    <>
      <mesh geometry={shell.walls} castShadow={castShadow} receiveShadow>
        <meshStandardMaterial
          color={color}
          map={facade?.color ?? null}
          // Glass reads as glass because it is smoother than the wall around
          // it, not because it is a different colour — the roughness map is
          // doing at least as much work here as the colour map is.
          roughnessMap={facade?.roughness ?? null}
          roughness={roughness}
          metalness={0}
          polygonOffset={recessed}
          polygonOffsetFactor={recessed ? 1 : 0}
          polygonOffsetUnits={recessed ? 1 : 0}
        />
      </mesh>
      {shell.roofs ? (
        <mesh geometry={shell.roofs} castShadow={castShadow} receiveShadow>
          <meshStandardMaterial
            color={shadeAgainst(color, ground, roofContrast)}
            roughness={Math.min(1, roughness + 0.1)}
            metalness={0}
            polygonOffset={recessed}
            polygonOffsetFactor={recessed ? 1 : 0}
            polygonOffsetUnits={recessed ? 1 : 0}
          />
        </mesh>
      ) : null}
    </>
  );
}

/**
 * Three's `RoomEnvironment` rendered to a PMREM cube, assigned as the scene's
 * environment. This is the single biggest visual difference between "flat
 * shaded boxes" and "buildings": it gives every wall a soft gradient from the
 * ambient surround instead of one constant Lambert value per face.
 *
 * Installed from `useFrame` rather than an effect for the same reason
 * `CameraRig` fits the camera there: `scene` and `gl` are renderer state, and
 * writing to them is a render-loop concern that React's own rules (rightly)
 * will not let a component do to a hook's return value.
 */
function ProceduralEnvironment({ intensity }: { intensity: number }) {
  const installed = useRef(false);
  const generated = useRef<{ dispose: () => void } | null>(null);

  useFrame(({ gl, scene }) => {
    if (installed.current) return;
    installed.current = true;

    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;

    // The room scene and the generator are both scratch; only the cube texture
    // outlives this frame.
    room.traverse((object) => {
      (object as Mesh).geometry?.dispose?.();
    });
    generator.dispose();
    generated.current = { dispose: () => target.dispose() };
  });

  useEffect(() => () => generated.current?.dispose(), []);

  return null;
}

/**
 * Renders the shadow map once per scene change instead of once per frame.
 *
 * Nothing that casts a shadow ever moves — the light is fixed, the buildings
 * are baked, and the camera orbiting does not change where a shadow falls. So
 * the map is rebuilt only when the plane or the pin actually changes shape,
 * and every frame in between reuses it for free.
 */
function StaticShadows({ signature }: { signature: string }) {
  const rendered = useRef<string | null>(null);

  useFrame(({ gl }) => {
    if (rendered.current === signature) return;
    rendered.current = signature;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  });

  return null;
}

/**
 * Positions the camera and picks an orthographic zoom that keeps the same
 * number of world units on screen at every card width. Re-runs on resize, which
 * is what stops the map from cropping when the drawer becomes a mobile sheet.
 */
function CameraRig({ focus, animate }: { focus: { x: number; z: number }; animate: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  // The fit runs inside `useFrame` rather than an effect on purpose: mutating
  // the camera is a render-loop concern, and doing it from the frame callback's
  // own `state` keeps us off React's rendering values entirely.
  const needsFit = useRef(true);
  const lastCanvasWidth = useRef(0);
  const baseAzimuth = useRef<number | null>(null);

  useEffect(() => {
    // A new pin means a new camera target. Demand one frame so the refit lands
    // even while the scene is otherwise idle.
    needsFit.current = true;
    baseAzimuth.current = null;
    invalidate();
  }, [focus.x, focus.z, invalidate]);

  useFrame((state) => {
    const { camera, size, controls, clock } = state;

    if (needsFit.current || size.width !== lastCanvasWidth.current) {
      const orthographic = camera as OrthographicCamera;
      orthographic.position.set(
        focus.x + CAMERA_DIRECTION.x * CAMERA_DISTANCE,
        CAMERA_DIRECTION.y * CAMERA_DISTANCE,
        focus.z + CAMERA_DIRECTION.z * CAMERA_DISTANCE,
      );
      // R3F's orthographic camera spans `size.width / zoom` world units, so this
      // is "pixels per world unit". The floor keeps a very narrow card readable
      // rather than letting the campus collapse into confetti.
      orthographic.zoom = Math.max(10, size.width / VIEW_WORLD_WIDTH);
      orthographic.lookAt(focus.x, 0, focus.z);
      orthographic.updateProjectionMatrix();
      lastCanvasWidth.current = size.width;
      needsFit.current = false;
    }

    if (!animate || !controls) return;
    // A slow lateral sway, not a turntable: enough to say "this is a model",
    // small enough that nobody has to track it. Suppressed entirely under
    // reduced motion, which is what `animate === false` means here.
    const orbit = controls as unknown as {
      setAzimuthalAngle?: (angle: number) => void;
      getAzimuthalAngle?: () => number;
      update?: () => void;
    };
    if (!orbit.setAzimuthalAngle || !orbit.getAzimuthalAngle) return;
    if (baseAzimuth.current === null) baseAzimuth.current = orbit.getAzimuthalAngle();
    orbit.setAzimuthalAngle(baseAzimuth.current + Math.sin(clock.elapsedTime * 0.22) * 0.06);
    orbit.update?.();
  });

  return null;
}

/**
 * Street names, lying on the asphalt.
 *
 * One per major road, placed where the road passes closest to what the camera
 * is looking at, so whichever way the reader orbits there is a name in frame
 * without repeating it down the whole street. `focus` is the orbit target, so
 * this tracks the pin rather than the plane.
 *
 * `meshBasicMaterial`, not standard: these are paint, and paint that took the
 * scene's key light would go dim on the shaded half of the map, which is
 * exactly where a reader most needs to know which street they are looking at.
 *
 * WHY they ignore depth entirely: a street is a narrow slot between two rows of
 * buildings, and an isometric camera looks at the ground *through* the near row.
 * Depth-tested, the name of the street is hidden by the buildings on it — which
 * is physically honest and completely useless. Every printed map resolves this
 * the same way, by letting the label float over whatever is in front of it, and
 * a reader reads it as an annotation rather than as paint that has stopped
 * obeying the world.
 */
function RoadLabels({
  plane,
  focus,
  palette,
  pinned,
}: {
  plane: CampusPlaneId;
  focus: { x: number; z: number };
  palette: CampusPalette;
  pinned: CampusLayoutBuilding | null;
}) {
  const labels = useMemo(
    () =>
      roadsOnPlane(plane)
        .filter((road) => road.isMajor && !runsUnderPin(road, pinned))
        .map((road) => ({
          road,
          // Haloed in the road's own colour, so the name still reads where it
          // strays off the asphalt onto a roof.
          label: groundLabel(road.label, palette.roadLabel, palette.road, ROAD_LABEL_HEIGHT),
        }))
        .filter((entry): entry is { road: CampusRoad; label: NonNullable<typeof entry.label> } =>
          entry.label !== null,
        ),
    [plane, palette.roadLabel, palette.road, pinned],
  );

  return (
    <>
      {labels.map(({ road, label }) => {
        const alongAxis = road.orientation === "north-south" ? focus.z : focus.x;
        // Held clear of the road's own ends, so a label never runs off the
        // stripe it belongs to.
        const margin = label.width / 2 + 0.5;
        const along = offsetAlongRoad(alongAxis, road.from + margin, road.to - margin);
        const position: [number, number, number] =
          road.orientation === "north-south" ? [road.at, 0.05, along] : [along, 0.05, road.at];
        return (
          <mesh
            key={road.roadId}
            position={position}
            // Flat on the ground, then a quarter turn for the avenues so the
            // name runs along its own street rather than across it. The turn is
            // anticlockwise: the grid is drawn with +z running campus-SOUTH, so
            // the other direction lays every avenue name out upside down.
            rotation={[-Math.PI / 2, 0, road.orientation === "north-south" ? Math.PI / 2 : 0]}
            renderOrder={ROAD_LABEL_RENDER_ORDER}
          >
            <planeGeometry args={[label.width, label.height]} />
            <meshBasicMaterial
              map={label.texture}
              transparent
              opacity={0.9}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

/** Does this street pass close enough to the pin that its name would sit on it? */
function runsUnderPin(road: CampusRoad, pinned: CampusLayoutBuilding | null): boolean {
  if (!pinned) return false;
  const [pinAt, pinExtent] =
    road.orientation === "north-south" ? [pinned.x, pinned.width] : [pinned.z, pinned.depth];
  const overhang = pinExtent / 2 + pinned.height * ROAD_LABEL_LEAN_PER_UNIT_HEIGHT;
  return Math.abs(road.at - pinAt) < overhang;
}

/**
 * Where along a street its name goes, given where the camera is looking.
 *
 * Offset away from the focus, in whichever direction has the room for it, and
 * never past the ends of the street itself. Falls back to the nearer end when
 * a street is too short to hold the name anywhere else — a name slightly off
 * its stripe still tells the reader which street it is.
 */
function offsetAlongRoad(focusAlong: number, min: number, max: number): number {
  if (min >= max) return (min + max) / 2;
  const roomAhead = max - focusAlong;
  const roomBehind = focusAlong - min;
  const target =
    roomAhead >= roomBehind ? focusAlong + ROAD_LABEL_OFFSET : focusAlong - ROAD_LABEL_OFFSET;
  return Math.min(Math.max(target, min), max);
}

/**
 * The building's name and meeting time, on a plate above the pin.
 *
 * DOM rather than geometry, through drei's `<Html>`. Text is the one thing a
 * canvas is worse at than the browser is: this way it is real type at the
 * device's own resolution, it inherits the card's tokens so it flips with the
 * theme for free, and it costs no draw call. `pointerEvents: none` because the
 * plate sits over the middle of the frame and must never eat a drag.
 *
 * `aria-hidden`, deliberately: the canvas already carries the whole sentence as
 * its `aria-label`, and a screen reader that met both would hear the building
 * named twice.
 */
function PinLabel({
  marker,
  anchor,
  height,
}: {
  marker: CampusMarker;
  anchor: { x: number; z: number };
  height: number;
}) {
  return (
    <Html
      position={[anchor.x, height, anchor.z]}
      center
      zIndexRange={[20, 0]}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <div
        aria-hidden
        className="-translate-y-1/2 whitespace-nowrap rounded-lg border border-border-table bg-background-primary-default/92 px-2.5 py-1.5 text-center shadow-sm backdrop-blur-[2px]"
      >
        <p className="text-body-2-semibold text-text-primary">{marker.title}</p>
        {marker.meta ? (
          <p className="text-caption-2-regular text-text-secondary">{marker.meta}</p>
        ) : null}
        {marker.note ? (
          <p className="text-caption-2-regular text-text-tertiary">{marker.note}</p>
        ) : null}
      </div>
    </Html>
  );
}

/**
 * The other stops on the map: a dot each, and — when they are a sequence — a
 * dashed path joining them.
 *
 * `connect` is what separates the two callers. A day's schedule IS an ordered
 * walk, and the path is the point of drawing it. An instructor's buildings are
 * a SET: they teach in Mudd and in Havemeyer, not from one to the other, and a
 * line between them would draw a commute that nobody makes.
 */
function DayRoute({
  route,
  palette,
  connect,
}: {
  route: ReadonlyArray<CampusRoutePoint>;
  palette: CampusPalette;
  connect: boolean;
}) {
  const linePoints = useMemo(
    () => route.map((point) => [point.x, 0.35, point.z] as [number, number, number]),
    [route],
  );

  if (linePoints.length === 0) return null;

  return (
    <>
      {connect && linePoints.length >= 2 ? (
        <Line points={linePoints} color={palette.marker} lineWidth={2} dashed dashScale={2} gapSize={0.4} />
      ) : null}
      {route.map((point, index) =>
        point.highlighted ? null : (
          <mesh
            key={`stop-${index}`}
            /*
              A trail dot stays at ground level, where the dashed path is. A
              building marker sits ABOVE the roof: the buildings are solid
              extrusions, so a marker on a building's own footprint at ground
              level is inside it and invisible. Uris Hall's neighbour is 2.1
              units tall; the dot was being drawn six storeys under it.
            */
            position={[point.x, connect ? 0.28 : (point.height ?? 0) + 0.62, point.z]}
          >
            {/*
              Bigger and in the marker colour when the stops are the subject
              rather than the trail. On an instructor's map every one of these
              IS a place they teach, so a dim grey speck reads as scenery when
              it is meant to read as an answer.
            */}
            <sphereGeometry args={[connect ? 0.22 : 0.42, 14, 14]} />
            <meshStandardMaterial
              color={connect ? palette.building : palette.marker}
              emissive={connect ? palette.building : palette.marker}
              emissiveIntensity={connect ? 0.15 : 0.35}
            />
          </mesh>
        ),
      )}
    </>
  );
}

/** The highlighted building plus its marker. The only thing that animates. */
function PinnedMarker({
  pinned,
  focus,
  palette,
  animate,
}: {
  pinned: CampusLayoutBuilding | null;
  focus: { x: number; z: number };
  palette: CampusPalette;
  animate: boolean;
}) {
  const ringRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);

  const anchor = pinned ? { x: pinned.x, z: pinned.z } : focus;
  const footprint = pinned ? Math.max(pinned.width, pinned.depth) : 1.6;
  const pinHeight = (pinned?.height ?? 0) + 1.0;

  // Extruded in absolute plane coordinates, so the mesh itself sits at the
  // origin and the group's translation is only used by the marker.
  const geometry = useDisposed(
    useMemo(() => (pinned ? buildingGeometry(pinned) : null), [pinned]),
  );

  useFrame(({ clock }) => {
    if (!animate) return;
    // One shared phase drives both the ring and the emissive lift, so the
    // building and its halo breathe together instead of beating against
    // each other.
    const phase = (Math.sin(clock.elapsedTime * 1.9) + 1) / 2;
    if (ringRef.current) {
      const scale = 1 + phase * 0.22;
      ringRef.current.scale.set(scale, scale, 1);
      const material = ringRef.current.material as { opacity: number };
      material.opacity = 0.5 - phase * 0.28;
    }
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = 0.18 + phase * 0.22;
    }
  });

  return (
    <>
      {geometry ? (
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial
            ref={materialRef}
            color={palette.highlight}
            emissive={palette.highlight}
            emissiveIntensity={0.18}
            roughness={0.55}
            metalness={0}
          />
          <Edges color={palette.outline} threshold={20} />
        </mesh>
      ) : null}

      <group position={[anchor.x, 0, anchor.z]}>
        {/* Ground halo. `depthWrite={false}` keeps it from z-fighting the ground
            plane it sits a hair above. */}
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[footprint * 0.66, footprint * 0.82, 40]} />
          <meshBasicMaterial color={palette.marker} transparent opacity={0.5} depthWrite={false} />
        </mesh>

        {/* Downward pin, so the eye lands on the roof rather than the sky. */}
        <mesh position={[0, pinHeight + 0.45, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.26, 0.66, 6]} />
          <meshStandardMaterial
            color={palette.highlight}
            emissive={palette.highlight}
            emissiveIntensity={0.35}
            roughness={0.4}
          />
        </mesh>
      </group>
    </>
  );
}

function CampusModel({
  plane,
  pinned,
  palette,
  focus,
  animate,
  marker,
  route,
  connectStops = true,
}: {
  plane: CampusPlaneId;
  pinned: CampusLayoutBuilding | null;
  palette: CampusPalette;
  focus: { x: number; z: number };
  animate: boolean;
  marker: CampusMarker;
  route?: ReadonlyArray<CampusRoutePoint> | null;
  connectStops?: boolean;
}) {
  const ground = campusPlane(plane);
  const roads = useMemo(() => roadsOnPlane(plane).map(roadBox), [plane]);

  // Every building the card is about, beyond the one wearing the pin. A dot
  // floating over a roof says "something is here"; the accent colour on the
  // building itself says "this is one of yours", which is the thing a card
  // headlined "2 buildings this term" has to make true at a glance.
  const stopBuildingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const point of route ?? []) {
      if (point.buildingId && point.buildingId !== pinned?.buildingId) ids.add(point.buildingId);
    }
    return ids;
  }, [route, pinned?.buildingId]);

  // Split by role rather than coloured per-vertex: two materials is one extra
  // draw call, and it keeps the palette readable as palette rather than as
  // colour attributes buried in a buffer.
  const onPlane = useMemo(
    () =>
      buildingsOnPlane(plane).filter(
        (entry) => entry.buildingId !== pinned?.buildingId && !stopBuildingIds.has(entry.buildingId),
      ),
    [plane, pinned?.buildingId, stopBuildingIds],
  );
  const muted = useDisposedShell(
    useMemo(() => mergedShell(onPlane.filter((entry) => !entry.isLandmark)), [onPlane]),
  );
  const landmarks = useDisposedShell(
    useMemo(() => mergedShell(onPlane.filter((entry) => entry.isLandmark)), [onPlane]),
  );
  // Welded into one shell, so however many stops a term has they cost the same
  // single extra draw call the muted mass and the landmarks each cost.
  const alsoTaught = useDisposedShell(
    useMemo(
      () =>
        mergedShell(
          buildingsOnPlane(plane).filter((entry) => stopBuildingIds.has(entry.buildingId)),
        ),
      [plane, stopBuildingIds],
    ),
  );
  const context = useDisposedShell(useMemo(() => contextShell(plane), [plane]));
  // Built once per chunk and cached there, so this memo is only keeping the
  // canvas work off re-renders, not owning the texture's lifetime.
  const facade = useMemo(() => facadeMaps(), []);

  const groundWidth = ground.maxX - ground.minX + GROUND_OVERSCAN_UNITS * 2;
  const groundDepth = ground.maxZ - ground.minZ + GROUND_OVERSCAN_UNITS * 2;
  const groundCenter: [number, number, number] = [
    (ground.minX + ground.maxX) / 2,
    -0.15,
    (ground.minZ + ground.maxZ) / 2,
  ];

  return (
    <>
      {/* Key light from the south-west, matching the direction the isometric
          camera looks from, plus a weak fill so the shaded faces stay readable
          in dark mode rather than going to black. The environment map does most
          of the ambient work now, so the old flat ambient is much lower. */}
      <ProceduralEnvironment intensity={0.42} />
      <ambientLight intensity={0.32} />
      <directionalLight
        position={[-8, 14, 10]}
        intensity={1.15}
        castShadow
        // Tight and square: a shadow camera scaled to the whole plane would
        // spend most of its 1024 texels on empty asphalt and give the campus
        // itself blocky, aliased contact shadows.
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[10, 6, -8]} intensity={0.3} />

      <mesh position={groundCenter} receiveShadow>
        <boxGeometry args={[groundWidth, 0.3, groundDepth]} />
        <meshStandardMaterial color={palette.ground} roughness={0.95} metalness={0} />
      </mesh>

      {/* Roads: one instanced mesh, laid a sliver above the ground. Still boxes,
          because a street IS a rectangle — nothing was lost to the survey here. */}
      <Instances limit={Math.max(roads.length, 1)} range={roads.length}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={palette.road} roughness={0.9} metalness={0} />
        {roads.map((road, index) => (
          <Instance
            key={index}
            position={[road.position[0], 0.01, road.position[2]]}
            scale={[road.scale[0], 0.06, road.scale[2]]}
          />
        ))}
      </Instances>

      {/* The neighbourhood. Drawn first and flattest: it is the reason the
          campus reads as Morningside Heights and not as a diagram, and it must
          never pull the eye off the pin. */}
      {context ? (
        // Receives shadow but does NOT cast one. A thousand buildings throwing
        // their own shadows turns the card into visual noise and buries the
        // campus in it — the neighbourhood is allowed to catch light, not to
        // draw attention. Its roofs barely separate from its walls for the same
        // reason: scenery may have detail, not contrast.
        <ShellMeshes
          shell={context}
          color={palette.context}
          ground={palette.ground}
          roughness={1}
          roofContrast={0.08}
          facade={facade}
          castShadow={false}
          recessed
        />
      ) : null}

      {muted ? (
        <ShellMeshes
          shell={muted}
          color={palette.building}
          ground={palette.ground}
          roughness={0.85}
          roofContrast={0.16}
          facade={facade}
          castShadow
        />
      ) : null}

      {alsoTaught ? (
        // Accent pulled partway back toward an ordinary Columbia building, and
        // without the pinned one's emissive lift, edge lines or pulse. At full
        // accent these out-shouted the pin — they are usually the bigger boxes,
        // so equal saturation is not equal loudness.
        <ShellMeshes
          shell={alsoTaught}
          color={blendToward(palette.highlight, palette.building, 0.42)}
          ground={palette.ground}
          roughness={0.85}
          roofContrast={0.12}
          facade={facade}
          castShadow
        />
      ) : null}

      {landmarks ? (
        <ShellMeshes
          shell={landmarks}
          color={palette.landmark}
          ground={palette.ground}
          roughness={0.75}
          roofContrast={0.2}
          facade={facade}
          castShadow
        />
      ) : null}

      <RoadLabels plane={plane} focus={focus} palette={palette} pinned={pinned} />

      {route && route.length > 0 ? (
        <DayRoute route={route} palette={palette} connect={connectStops} />
      ) : null}

      <PinnedMarker pinned={pinned} focus={focus} palette={palette} animate={animate} />
      <PinLabel
        marker={marker}
        anchor={pinned ? { x: pinned.x, z: pinned.z } : focus}
        // Clear of the cone, which already reaches a unit above the roof.
        height={(pinned?.height ?? 0) + 2.3}
      />
      <StaticShadows signature={`${plane}:${pinned?.buildingId ?? "none"}`} />
    </>
  );
}

export default function CampusScene({
  plane,
  focus,
  pinned,
  palette,
  animate,
  description,
  marker,
  onReady,
  onContextLost,
  route,
  connectStops,
}: CampusSceneProps) {
  return (
    <Canvas
      orthographic
      shadows="soft"
      // Frames are only produced on demand unless the marker is pulsing. This
      // is the single biggest reason the card can sit inside a drawer without
      // costing anything when nobody is looking at it.
      frameloop={animate ? "always" : "demand"}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      camera={{ position: [12, 12, 12], zoom: 30, near: 0.1, far: 200 }}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }}
      aria-label={description}
      role="img"
      onCreated={({ gl, invalidate }) => {
        const canvas = gl.domElement;
        // One demanded frame guarantees there is something to look at before
        // the card cross-fades the flat map out.
        invalidate();
        requestAnimationFrame(() => onReady?.());
        const handleLost = (event: Event) => {
          // Preventing the default keeps three from tearing down before we have
          // swapped in the flat map, so the reader never sees a blank frame.
          event.preventDefault();
          onContextLost?.();
        };
        canvas.addEventListener("webglcontextlost", handleLost);
      }}
    >
      <CameraRig focus={focus} animate={animate} />
      <CampusModel
        plane={plane}
        pinned={pinned}
        palette={palette}
        focus={focus}
        animate={animate}
        marker={marker}
        route={route}
        connectStops={connectStops}
      />
      <OrbitControls
        makeDefault
        target={[focus.x, 0, focus.z]}
        // A mini window, not a viewer: orbit and a little zoom, never pan, and
        // never below the horizon where the model has no underside.
        enablePan={false}
        enableZoom
        minZoom={12}
        maxZoom={90}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.55}
        zoomSpeed={0.6}
      />
    </Canvas>
  );
}
