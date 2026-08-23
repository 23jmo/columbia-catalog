"use client";

/**
 * Campus-card lane — the 3D scene.
 *
 * Split out of `campus-card.tsx` so that this file, and the ~600 KB of three.js
 * behind it, is only ever fetched when the card has actually decided to render
 * in 3D. The card imports it through `next/dynamic({ ssr: false })`; nothing
 * here runs on the server.
 *
 * Performance rules this scene is built around (spec §19 — the drawer's
 * open-time budget is a hard bar, and this card may not touch it):
 *
 *   - Every un-targeted building is ONE instanced mesh, so the whole campus is
 *     two draw calls (buildings, roads) plus the highlight and its marker.
 *   - `frameloop="demand"` unless the pulse is actually running. When the card
 *     scrolls out of view or the tab is hidden the parent flips `animate` off
 *     and the renderer goes quiet; orbiting still redraws, because drei's
 *     controls call `invalidate()` themselves.
 *   - DPR is capped at 1.75. A 3× retina buffer for a 320 px card is pure heat.
 *   - No shadow maps, no post-processing, no loaded assets. The cartoon look
 *     comes from flat-shaded Lambert boxes and a two-light key/fill rig, which
 *     is also the cheapest thing that is not unlit.
 *
 * Colours arrive fully resolved from `palette.ts` — see that file for why the
 * BoardUI tokens cannot be handed to three.js directly.
 */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Instance, Instances, OrbitControls } from "@react-three/drei";
import type { Mesh, MeshLambertMaterial, OrthographicCamera } from "three";
import { buildingsOnPlane, campusPlane, roadsOnPlane } from "@/lib/campus";
import type { CampusLayoutBuilding, CampusPlaneId, CampusRoad } from "@/lib/campus";
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

/** World units across the viewport. Chosen so a city block reads at card size. */
const VIEW_WORLD_WIDTH = 15;
/** Isometric-ish view direction. Not a true 2:1 iso — a touch higher reads better. */
const CAMERA_DIRECTION = { x: 1, y: 0.92, z: 1 };
const CAMERA_DISTANCE = 40;

function roadBox(road: CampusRoad) {
  const length = road.to - road.from;
  const center = (road.from + road.to) / 2;
  return road.orientation === "north-south"
    ? { position: [road.at, 0, center] as const, scale: [road.width, 1, length] as const }
    : { position: [center, 0, road.at] as const, scale: [length, 1, road.width] as const };
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
  const materialRef = useRef<MeshLambertMaterial>(null);

  const anchor = pinned ? { x: pinned.x, z: pinned.z } : focus;
  const footprint = pinned ? Math.max(pinned.width, pinned.depth) : 1.6;
  const pinHeight = (pinned?.height ?? 0) + 1.0;

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
    <group position={[anchor.x, 0, anchor.z]}>
      {pinned ? (
        <mesh position={[0, pinned.height / 2, 0]} scale={[pinned.width, pinned.height, pinned.depth]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial
            ref={materialRef}
            color={palette.highlight}
            emissive={palette.highlight}
            emissiveIntensity={0.18}
            flatShading
          />
          <Edges color={palette.outline} threshold={15} />
        </mesh>
      ) : null}

      {/* Ground halo. `depthWrite={false}` keeps it from z-fighting the ground
          plane it sits a hair above. */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[footprint * 0.66, footprint * 0.82, 40]} />
        <meshBasicMaterial color={palette.marker} transparent opacity={0.5} depthWrite={false} />
      </mesh>

      {/* Downward pin, so the eye lands on the roof rather than the sky. */}
      <mesh position={[0, pinHeight + 0.45, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.26, 0.66, 6]} />
        <meshLambertMaterial color={palette.highlight} emissive={palette.highlight} emissiveIntensity={0.3} />
      </mesh>
    </group>
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
  const muted = useMemo(
    () => buildingsOnPlane(plane).filter((entry) => entry.buildingId !== pinned?.buildingId),
    [plane, pinned?.buildingId],
  );

  const groundWidth = ground.maxX - ground.minX;
  const groundDepth = ground.maxZ - ground.minZ;
  const groundCenter: [number, number, number] = [
    (ground.minX + ground.maxX) / 2,
    -0.15,
    (ground.minZ + ground.maxZ) / 2,
  ];

  return (
    <>
      {/* Key light from the south-west, matching the direction the isometric
          camera looks from, plus a weak fill so the shaded faces stay readable
          in dark mode rather than going to black. */}
      <ambientLight intensity={1.9} />
      <directionalLight position={[-8, 14, 10]} intensity={2.1} />
      <directionalLight position={[10, 6, -8]} intensity={0.7} />

      <mesh position={groundCenter}>
        <boxGeometry args={[groundWidth, 0.3, groundDepth]} />
        <meshLambertMaterial color={palette.ground} />
      </mesh>

      {/* Roads: one instanced mesh, laid a sliver above the ground. */}
      <Instances limit={Math.max(roads.length, 1)} range={roads.length}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color={palette.road} />
        {roads.map((road, index) => (
          <Instance
            key={index}
            position={[road.position[0], 0.01, road.position[2]]}
            scale={[road.scale[0], 0.06, road.scale[2]]}
          />
        ))}
      </Instances>

      {/* Every un-targeted building: one instanced mesh, per-instance colour. */}
      <Instances limit={Math.max(muted.length, 1)} range={muted.length}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial flatShading />
        {muted.map((entry) => (
          <Instance
            key={entry.buildingId}
            position={[entry.x, entry.height / 2, entry.z]}
            scale={[entry.width, entry.height, entry.depth]}
            color={entry.isLandmark ? palette.landmark : palette.building}
          />
        ))}
      </Instances>

      <PinnedMarker pinned={pinned} focus={focus} palette={palette} animate={animate} />
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
