/**
 * Campus-card lane — the flat map.
 *
 * This is not a placeholder. It is the card as it renders for anyone who asked
 * for reduced motion, has no WebGL, or is on the mobile breakpoint (spec §17),
 * and it has to be a thing you would ship on its own — so it draws the same
 * dataset, the same pin, and the same caption as the 3D scene, just in plan
 * view instead of isometric.
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
import { buildingsOnPlane, campusPlane, focusPointFor, roadsOnPlane } from "@/lib/campus";
import type { CampusPlaneId, CampusRoad } from "@/lib/campus";
import { buildCampusCaption } from "./caption";
import type { CampusCardFallbackProps, CampusFallbackReason } from "./contracts";

/** Map viewport, in plane units. 16:10 to match the 3D card's frame exactly. */
const VIEW_ASPECT = 10 / 16;
const MAX_VIEW_WIDTH = 16;

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
}: CampusCardFallbackProps) {
  const caption = buildCampusCaption({ buildingNames, roomLabel, label });
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
          className="absolute inset-0 size-full"
        />
        {hint ? (
          <p className="absolute bottom-1.5 left-2 rounded bg-background-primary-default/85 px-1.5 py-0.5 text-caption-2-regular text-text-tertiary">
            {hint}
          </p>
        ) : null}
      </div>

      <CampusCaptionBlock
        headline={caption.headline}
        zoneLabel={caption.zoneLabel}
        meta={meta}
        additionalLocationCount={caption.additionalLocationCount}
        isPlaced={caption.location.layout != null}
      />
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
  className,
}: CampusMiniMapProps) {
  const view = computeViewBox(plane, focus);
  const buildings = buildingsOnPlane(plane);
  const roads = roadsOnPlane(plane);
  const pinned = buildings.find((entry) => entry.buildingId === pinnedBuildingId) ?? null;

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
          const x = isVertical ? road.at : view.x + 0.4;
          const y = isVertical ? view.y + 0.5 : road.at;
          return (
            <text
              key={`${road.roadId}-label`}
              x={x}
              y={y}
              dy={isVertical ? 0 : -0.18}
              fontSize={0.42}
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
        return (
          <rect
            key={entry.buildingId}
            x={entry.x - entry.width / 2}
            y={entry.z - entry.depth / 2}
            width={entry.width}
            height={entry.depth}
            rx={0.18}
            className={cx(
              isPinned
                ? "fill-accent-500"
                : entry.isLandmark
                  ? "fill-background-tertiary-default"
                  : "fill-background-quaternary-default",
              isPinned ? "stroke-accent-600" : "stroke-border-table",
            )}
            strokeWidth={0.06}
          />
        );
      })}

      {/* Static ring — this renderer is the reduced-motion target, so nothing
          here may animate. When no building could be placed the ring still
          draws, on the plane's centre, so the card says "this campus" rather
          than saying nothing at all. */}
      <circle
        cx={pinned ? pinned.x : focus.x}
        cy={pinned ? pinned.z : focus.z}
        r={pinned ? Math.max(pinned.width, pinned.depth) * 0.9 : 1.5}
        className="fill-none stroke-accent-500"
        strokeWidth={0.09}
        opacity={pinned ? 0.55 : 0.3}
        strokeDasharray={pinned ? undefined : "0.4 0.3"}
      />
      {pinned ? (
        <text
          x={pinned.x}
          y={pinned.z - Math.max(pinned.width, pinned.depth) * 0.9 - 0.28}
          fontSize={0.48}
          textAnchor="middle"
          className="fill-text-primary"
          style={{ fontWeight: 600 }}
        >
          {pinned.label}
        </text>
      ) : null}
    </svg>
  );
}

/**
 * Shared by both renderers so the text under the map is identical whichever one
 * is on screen — swapping from flat to 3D must not change a single word.
 */
export function CampusCaptionBlock({
  headline,
  zoneLabel,
  meta,
  additionalLocationCount,
  isPlaced,
}: {
  headline: string;
  zoneLabel: string;
  meta?: string | null;
  additionalLocationCount: number;
  isPlaced: boolean;
}) {
  return (
    <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border-table px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-body-2-semibold text-text-primary">{headline}</p>
        {meta ? <p className="text-caption-2-regular text-text-secondary">{meta}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-caption-1-medium text-text-secondary">{zoneLabel}</p>
        {additionalLocationCount > 0 ? (
          <p className="text-caption-2-regular text-text-tertiary">
            +{additionalLocationCount} other location{additionalLocationCount === 1 ? "" : "s"}
          </p>
        ) : !isPlaced ? (
          <p className="text-caption-2-regular text-text-tertiary">Not on the map</p>
        ) : null}
      </div>
    </figcaption>
  );
}
