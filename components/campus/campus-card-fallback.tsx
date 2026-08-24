/**
 * Campus-card lane — the flat map.
 *
 * This is not a placeholder. It is the card as it renders for anyone who asked
 * for reduced motion, has no WebGL, or is on the mobile breakpoint (spec §17),
 * and it has to be a thing you would ship on its own — so it draws the same
 * dataset, the same pin, and the same caption as the 3D scene, just in plan
 * view instead of isometric.
 *
 * "The same dataset" includes the route: a card given several stops draws all
 * of them here too. It did not always — the props arrived and were dropped on
 * the floor — which meant a reader on reduced motion was told an instructor
 * teaches in one building when the 3D reader could see four.
 *
 * No `"use client"`: it has no state and no effects, so the drawer can render
 * it on the server and let the 3D scene hydrate over the top. That is also what
 * makes it a legitimate `loading` state for the lazy boundary rather than a
 * layout-shifting spinner.
 *
 * Colours come from BoardUI tokens as Tailwind `fill-*` / `stroke-*` utilities
 * (Tailwind v4 derives those from the same `--color-*` variables), so this file
 * flips under `.dark` for free and never needs the palette reader.
 */

import { cx } from "@/utils/cx";
import {
  CAMPUS_VIEW_WIDTH_UNITS,
  buildingsOnPlane,
  campusPlane,
  focusPointFor,
  roadsOnPlane,
} from "@/lib/campus";
import type { CampusPlaneId, CampusRoad } from "@/lib/campus";
import { buildCampusCaption } from "./caption";
import { routePointsOnPlane } from "./route";
import type {
  CampusCardFallbackProps,
  CampusFallbackReason,
  CampusMarker,
  CampusRoutePoint,
  CampusRouteStop,
} from "./contracts";

/** Map viewport, in plane units. 16:10 to match the 3D card's frame exactly. */
const VIEW_ASPECT = 10 / 16;
/** Matches the 3D scene exactly — see `CAMPUS_VIEW_WIDTH_UNITS` for why. */
const MAX_VIEW_WIDTH = CAMPUS_VIEW_WIDTH_UNITS;

/**
 * Ink scale.
 *
 * Everything drawn below is in plane units, which is right for the things that
 * are actually the size of a thing — a building rect, the ring around the pin.
 * It is wrong for ink: label type, stroke weights, corner radii are screen
 * affordances, and expressing them in world units means they shrink whenever
 * the viewport frames more ground. The sizes were tuned against a 16-unit
 * frame, so scale them back up to hold their on-screen size now that the map
 * frames the real survey instead of the old cartoon.
 */
const INK = MAX_VIEW_WIDTH / 16;

const REASON_HINT: Record<CampusFallbackReason, string | null> = {
  "reduced-motion": "Flat map — motion reduced",
  "no-webgl": "Flat map — 3D unavailable",
  forced: null,
  loading: null,
};

/**
 * Window the plane onto the focus point, then push the window back inside the
 * plane's bounds so the card never frames empty ground on one side.
 */
function computeViewBox(planeId: CampusPlaneId, focus: { x: number; z: number }) {
  const plane = campusPlane(planeId);
  const planeWidth = plane.maxX - plane.minX;

  const width = Math.min(MAX_VIEW_WIDTH, planeWidth + 1.5);
  const height = width * VIEW_ASPECT;

  const clampAxis = (center: number, size: number, min: number, max: number) => {
    if (size >= max - min) return (min + max) / 2 - size / 2;
    return Math.min(Math.max(center - size / 2, min), max - size);
  };

  return {
    x: clampAxis(focus.x, width, plane.minX, plane.maxX),
    y: clampAxis(focus.z, height, plane.minZ, plane.maxZ),
    width,
    height,
  };
}

/**
 * Where to centre the frame.
 *
 * The caption's focus point is one building, which is the right answer for a
 * card about one building. When the card is about several, centring on one of
 * them can push the others off the edge — the frame is already as wide as the
 * plane allows, so panning is the only freedom left. Centring the stops'
 * bounding box spends that freedom on showing all of them.
 */
function framePoint(
  focus: { x: number; z: number },
  stops: ReadonlyArray<CampusRoutePoint>,
): { x: number; z: number } {
  if (stops.length < 2) return focus;
  const xs = stops.map((stop) => stop.x);
  const zs = stops.map((stop) => stop.z);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
}

function roadRect(road: CampusRoad) {
  return road.orientation === "north-south"
    ? { x: road.at - road.width / 2, y: road.from, width: road.width, height: road.to - road.from }
    : { x: road.from, y: road.at - road.width / 2, width: road.to - road.from, height: road.width };
}

export function CampusCardFallback({
  buildingNames,
  roomLabel,
  label,
  meta,
  className,
  reason = "forced",
  routeStops,
  connectStops = true,
}: CampusCardFallbackProps) {
  const caption = buildCampusCaption({ buildingNames, roomLabel, label, meta });
  const hint = REASON_HINT[reason];

  return (
    <figure
      className={cx(
        "overflow-hidden rounded-2lg border border-border-table bg-background-primary-default",
        className,
      )}
    >
      <div className="relative aspect-[16/10]">
        <CampusMiniMap
          plane={caption.plane}
          pinnedBuildingId={caption.location.layout?.buildingId ?? null}
          focus={focusPointFor(caption.location)}
          description={caption.description}
          marker={caption.marker}
          routeStops={routeStops}
          connectStops={connectStops}
          className="absolute inset-0 size-full"
        />
        {hint ? (
          <p className="absolute bottom-1.5 left-2 rounded bg-background-primary-default/85 px-1.5 py-0.5 text-caption-2-regular text-text-tertiary">
            {hint}
          </p>
        ) : null}
      </div>
    </figure>
  );
}

export interface CampusMiniMapProps {
  plane: CampusPlaneId;
  /** Building to fill with the accent colour, or null for an unpinned campus. */
  pinnedBuildingId: string | null;
  /** Plane-local point the viewport centres on. */
  focus: { x: number; z: number };
  description: string;
  /** Printed over the pin. Omitted by callers that want a bare map. */
  marker?: CampusMarker | null;
  /**
   * Every place this card is about, not just the pinned one. Stops that resolve
   * to this plane get their footprint tinted and a dot dropped on them.
   */
  routeStops?: ReadonlyArray<CampusRouteStop> | null;
  /** Join the stops with a dashed path. See `CampusCardProps.connectStops`. */
  connectStops?: boolean;
  className?: string;
}

/**
 * The map itself, without the card chrome.
 *
 * Exported because the 3D card renders it as an underlay while the three.js
 * chunk is still in flight — the reader sees the right campus immediately and
 * it is replaced by the model rather than by a first paint from nothing.
 */
export function CampusMiniMap({
  plane,
  pinnedBuildingId,
  focus,
  description,
  marker,
  routeStops,
  connectStops = true,
  className,
}: CampusMiniMapProps) {
  const stops = routeStops ? routePointsOnPlane(routeStops, plane) : [];
  const view = computeViewBox(plane, framePoint(focus, stops));
  const buildings = buildingsOnPlane(plane);
  const roads = roadsOnPlane(plane);
  const pinned = buildings.find((entry) => entry.buildingId === pinnedBuildingId) ?? null;
  const stopBuildingIds = new Set(
    stops.map((stop) => stop.buildingId).filter((id): id is string => Boolean(id)),
  );
  const ringRadius = pinned ? Math.max(pinned.width, pinned.depth) * 0.9 : 1.5;

  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid slice"
      className={cx("block bg-background-secondary-default", className)}
      role="img"
      aria-label={description}
    >
      {/* Roads first: buildings sit on top of them, the way a map reads. */}
      {roads.map((road) => {
        const rect = roadRect(road);
        return (
          <rect
            key={road.roadId}
            {...rect}
            className={cx("fill-background-full", road.isMajor ? "opacity-90" : "opacity-60")}
          />
        );
      })}

      {roads
        .filter((road) => road.isMajor)
        .map((road) => {
          // Road labels ride along their own axis, which for the avenues
          // means a quarter turn. Placed at the near edge of the viewport so
          // they land in the frame whichever way the map is panned.
          const isVertical = road.orientation === "north-south";
          const x = isVertical ? road.at : view.x + 0.4 * INK;
          const y = isVertical ? view.y + 0.5 * INK : road.at;
          return (
            <text
              key={`${road.roadId}-label`}
              x={x}
              y={y}
              dy={isVertical ? 0 : -0.18 * INK}
              fontSize={0.42 * INK}
              className="fill-text-tertiary"
              style={{ letterSpacing: "0.02em" }}
              transform={isVertical ? `rotate(90 ${x} ${y})` : undefined}
              textAnchor="start"
              dominantBaseline={isVertical ? "middle" : "auto"}
            >
              {road.label}
            </text>
          );
        })}

      {buildings.map((entry) => {
        const isPinned = pinned?.buildingId === entry.buildingId;
        // A stop that is not the pinned one still gets accent ink, two steps
        // down the ramp: enough to read as "one of ours" at a glance, not so
        // much that the eye loses which building the card is actually about.
        const isStop = !isPinned && stopBuildingIds.has(entry.buildingId);
        return (
          <rect
            key={entry.buildingId}
            x={entry.x - entry.width / 2}
            y={entry.z - entry.depth / 2}
            width={entry.width}
            height={entry.depth}
            rx={0.18 * INK}
            className={cx(
              isPinned
                ? "fill-accent-500"
                : isStop
                  ? "fill-accent-200"
                  : entry.isLandmark
                    ? "fill-background-tertiary-default"
                    : "fill-background-quaternary-default",
              isPinned ? "stroke-accent-600" : isStop ? "stroke-accent-400" : "stroke-border-table",
            )}
            strokeWidth={0.06 * INK}
          />
        );
      })}

      {/* The walk between stops, when the stops are a walk. Dashed and drawn
          under the dots, exactly as the 3D scene draws it. */}
      {connectStops && stops.length >= 2 ? (
        <polyline
          points={stops.map((stop) => `${stop.x},${stop.z}`).join(" ")}
          className="fill-none stroke-accent-500"
          strokeWidth={0.1 * INK}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${0.34 * INK} ${0.3 * INK}`}
          opacity={0.7}
        />
      ) : null}

      {stops.map((stop, index) => (
        <circle
          key={`${stop.buildingId ?? "stop"}-${index}`}
          cx={stop.x}
          cy={stop.z}
          r={(stop.highlighted ? 0.28 : 0.2) * INK}
          className={cx(
            stop.highlighted ? "fill-accent-600" : "fill-accent-500",
            "stroke-background-primary-default",
          )}
          strokeWidth={0.07 * INK}
        />
      ))}

      {/* Static ring — this renderer is the reduced-motion target, so nothing
          here may animate. When no building could be placed the ring still
          draws, on the plane's centre, so the card says "this campus" rather
          than saying nothing at all. */}
      <circle
        cx={pinned ? pinned.x : focus.x}
        cy={pinned ? pinned.z : focus.z}
        r={ringRadius}
        className="fill-none stroke-accent-500"
        strokeWidth={0.09 * INK}
        opacity={pinned ? 0.55 : 0.3}
        strokeDasharray={pinned ? undefined : `${0.4 * INK} ${0.3 * INK}`}
      />
      {marker ? (
        <MapMarker
          marker={marker}
          x={pinned ? pinned.x : focus.x}
          z={pinned ? pinned.z - ringRadius : focus.z - ringRadius}
          ringDiameter={ringRadius * 2}
          view={view}
        />
      ) : null}
    </svg>
  );
}

/** Type sizes for the marker's three lines, in ink units. */
const MARKER_LINES = [
  { size: 0.5, className: "fill-text-primary", weight: 600 },
  { size: 0.38, className: "fill-text-secondary", weight: 400 },
  { size: 0.34, className: "fill-text-tertiary", weight: 400 },
] as const;

/**
 * The pin's label, as SVG.
 *
 * Sized by counting characters rather than by measuring: SVG has no layout pass
 * to ask, and this renderer has to work on the server where there is no text
 * metrics API at all. 0.54em per character is the average advance of this
 * weight over the alphabet, which is close enough for a plate that only has to
 * be wider than its text and is deliberately translucent at the edges anyway.
 */
function MapMarker({
  marker,
  x,
  z,
  ringDiameter,
  view,
}: {
  marker: CampusMarker;
  x: number;
  z: number;
  /** Full height of the ring `z` sits on top of — what a flipped plate must clear. */
  ringDiameter: number;
  view: { x: number; y: number; width: number; height: number };
}) {
  const lines = [marker.title, marker.meta, marker.note]
    .map((text, index) => ({ text, ...MARKER_LINES[index] }))
    .filter((line): line is { text: string } & (typeof MARKER_LINES)[number] => Boolean(line.text));

  const gap = 0.16 * INK;
  const padX = 0.42 * INK;
  const padY = 0.3 * INK;
  const textHeight =
    lines.reduce((total, line) => total + line.size * INK, 0) + gap * (lines.length - 1);
  const plateHeight = textHeight + padY * 2;
  const plateWidth =
    Math.max(...lines.map((line) => line.text.length * line.size * 0.54 * INK)) + padX * 2;

  // Above the pin by default, below it when there is no room — a plate clipped
  // by the top of the frame is worse than one on the other side of its own pin.
  //
  // `z` is the TOP of the ring, so flipping has to step over the ring's whole
  // height to land underneath it. Stepping a stem's worth instead put the plate
  // straight back down on the building it was labelling and hid it — which only
  // became obvious on a card about several buildings, where the extra "+n other
  // location" line makes the plate tall enough to trigger the flip in the first
  // place.
  const stem = 0.34 * INK;
  const above = z - stem - plateHeight;
  const flipped = above < view.y + 0.2 * INK;
  const top = flipped ? z + ringDiameter + stem : above;

  // Slide back inside the frame horizontally. The pin can sit anywhere, but the
  // plate is chrome and chrome does not get cropped.
  const left = Math.min(
    Math.max(x - plateWidth / 2, view.x + 0.2 * INK),
    view.x + view.width - plateWidth - 0.2 * INK,
  );

  let baseline = top + padY;
  return (
    <g>
      <rect
        x={left}
        y={top}
        width={plateWidth}
        height={plateHeight}
        rx={0.34 * INK}
        className="fill-background-primary-default stroke-border-table"
        opacity={0.92}
        strokeWidth={0.05 * INK}
      />
      {lines.map((line) => {
        const y = baseline + line.size * INK * 0.78;
        baseline += line.size * INK + gap;
        return (
          <text
            key={line.text}
            x={left + plateWidth / 2}
            y={y}
            fontSize={line.size * INK}
            textAnchor="middle"
            className={line.className}
            style={{ fontWeight: line.weight }}
          >
            {line.text}
          </text>
        );
      })}
    </g>
  );
}
