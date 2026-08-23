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
 * Performance rules this scene is built around (spec §19 — the drawer's
 * open-time budget is a hard bar, and this card may not touch it):
 *
 *   - Real outlines rule out instancing, so the campus is MERGED instead: one
 *     geometry for the muted mass, one for landmarks, one for the
 *     neighbourhood. Three draw calls, plus the pin, its marker and the ground.
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
import { Edges, Instance, Instances, OrbitControls } from "@react-three/drei";
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
import { buildingGeometry, contextGeometry, mergedGeometry } from "./footprints";
import type { CampusPalette } from "./palette";

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
  /**
   * Fires once the renderer exists and has been handed its first frame. The
   * card keeps the flat map underneath until this lands, so the swap happens on
   * a drawn model rather than on an empty canvas element.
   */
  onReady?: () => void;
  /** Fires if the GPU drops the context, so the card can fall back to 2D. */
  onContextLost?: () => void;
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
}: {
  plane: CampusPlaneId;
  pinned: CampusLayoutBuilding | null;
  palette: CampusPalette;
  focus: { x: number; z: number };
  animate: boolean;
}) {
  const ground = campusPlane(plane);
  const roads = useMemo(() => roadsOnPlane(plane).map(roadBox), [plane]);

  // Split by role rather than coloured per-vertex: two materials is one extra
  // draw call, and it keeps the palette readable as palette rather than as
  // colour attributes buried in a buffer.
  const onPlane = useMemo(
    () => buildingsOnPlane(plane).filter((entry) => entry.buildingId !== pinned?.buildingId),
    [plane, pinned?.buildingId],
  );
  const muted = useDisposed(
    useMemo(() => mergedGeometry(onPlane.filter((entry) => !entry.isLandmark)), [onPlane]),
  );
  const landmarks = useDisposed(
    useMemo(() => mergedGeometry(onPlane.filter((entry) => entry.isLandmark)), [onPlane]),
  );
  const context = useDisposed(useMemo(() => contextGeometry(plane), [plane]));

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
        // draw attention.
        <mesh geometry={context} receiveShadow>
          <meshStandardMaterial color={palette.context} roughness={1} metalness={0} />
        </mesh>
      ) : null}

      {muted ? (
        <mesh geometry={muted} castShadow receiveShadow>
          <meshStandardMaterial color={palette.building} roughness={0.85} metalness={0} />
        </mesh>
      ) : null}

      {landmarks ? (
        <mesh geometry={landmarks} castShadow receiveShadow>
          <meshStandardMaterial color={palette.landmark} roughness={0.75} metalness={0} />
        </mesh>
      ) : null}

      <PinnedMarker pinned={pinned} focus={focus} palette={palette} animate={animate} />
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
  onReady,
  onContextLost,
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
      <CampusModel plane={plane} pinned={pinned} palette={palette} focus={focus} animate={animate} />
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
