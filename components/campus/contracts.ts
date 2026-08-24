/**
 * Campus-card lane contracts.
 *
 * Written in the same narrow style as `components/course/contracts.ts`: the
 * smallest surface that makes the card correct, not a mirror of the lane's
 * internals. The drawer already holds `Meeting.buildingName` strings straight
 * out of the parser, so that is exactly what the card takes — messy, nullable,
 * unnormalised. Cleaning them is this lane's job, not the caller's.
 *
 * Nothing in this file imports three.js, React DOM, or the scene. It is safe to
 * import from a server component to type a lazy boundary.
 */

import type { CampusZone } from "@/lib/types";
import type { CampusPlaneId } from "@/lib/campus";

/** Plane-local point on a day's walking route. */
export interface CampusRoutePoint {
  x: number;
  z: number;
  highlighted: boolean;
  /**
   * Roof height of the building at this point, in plane units.
   *
   * Needed because a marker drawn at ground level inside a building is drawn
   * inside a solid mesh and is simply not visible — the buildings are extruded
   * to their real heights, so a dot at y=0.28 sitting on a 2.1-unit building's
   * own footprint is behind six storeys of it. A marker that identifies a
   * BUILDING has to clear that building.
   */
  height?: number;
  /**
   * Identity of the building this stop resolved to.
   *
   * The 3D scene does not need it — it draws a marker at (x, z) and the reader
   * sees which building is under it. The flat map has no depth to make that
   * obvious, so it tints the building's own rectangle instead, and to do that
   * it has to know which rectangle.
   */
  buildingId?: string;
}

/** One stop on a day's walking route, drawn on the campus map. */
export interface CampusRouteStop {
  buildingNames: ReadonlyArray<string | null>;
  label: string;
  meta?: string | null;
  /** The class the reader clicked — gets the pulsing pin. */
  highlighted?: boolean;
}

export interface CampusCardProps {
  /**
   * Buildings to highlight, in meeting order. Raw directory/bulletin strings
   * are expected ("833 Seeley W. Mudd Building", "Room TBA", null).
   *
   * The card pins the first one it can identify and counts the rest, because a
   * section that meets in two buildings is a fact worth stating even though
   * only one pin fits in a card this size.
   */
  buildingNames: ReadonlyArray<string | null>;
  /** Room, printed beside the building in the caption. e.g. "833". */
  roomLabel?: string | null;
  /** Overrides the generated caption headline. */
  label?: string | null;
  /**
   * Second line of the in-map marker — the drawer passes the meeting day and
   * time, so the card answers "where is this, and when" in one glance without
   * the reader's eye ever leaving the map.
   */
  meta?: string | null;
  className?: string;
  /**
   * Forces the 2D fallback. The card decides this for itself from WebGL support
   * and `prefers-reduced-motion`; the prop exists for the drawer's mobile
   * breakpoint (spec §17: "static image fallback on mobile") and for tests.
   */
  forceFallback?: boolean;
  /**
   * Ordered stops for that day's schedule. When set, the map draws a path
   * between buildings on the same campus and highlights the `highlighted`
   * stop with the usual pulsing pin.
   */
  routeStops?: ReadonlyArray<CampusRouteStop> | null;
  /**
   * Join the stops with a dashed path. True for a day's schedule, where the
   * stops ARE a walk in order; false for a set of places with no sequence, like
   * every building one instructor teaches in over a term. Drawing a path
   * through those would invent a journey nobody makes.
   */
  connectStops?: boolean;
}

/** Why the flat map is on screen. Drives the fallback's hint line. */
export type CampusFallbackReason =
  | "reduced-motion"
  | "no-webgl"
  | "forced"
  /** The 3D scene is still being fetched — the fallback is the loading state. */
  | "loading";

export interface CampusCardFallbackProps extends Omit<CampusCardProps, "forceFallback"> {
  reason?: CampusFallbackReason;
}

/**
 * The label that rides on the pin, in both renderers.
 *
 * The card used to carry this as a strip of text under the map. It reads better
 * on the map: a name beside a building IS the answer to "where does this meet",
 * where the same name in a caption is a fact you have to carry back up to the
 * picture yourself. Three lines at most, and the third is usually absent —
 * anything longer stops being a map label and starts being a paragraph sitting
 * on a campus.
 */
export interface CampusMarker {
  /**
   * "Havemeyer Hall" — the building, never the room, unless the caller passed
   * an explicit `label` to override it.
   */
  title: string;
  /** "M 4:10pm-6:40pm", or null when the caller passed no meeting time. */
  meta: string | null;
  /**
   * The one caveat worth printing: "Not on the map" for a building we can name
   * but not draw, or "+2 other locations" for a section that meets in more than
   * one place. Null in the ordinary case, which is most of them.
   */
  note: string | null;
}

/**
 * The caption both renderers share, derived once so the 3D card and the flat
 * map can never disagree about what they are showing.
 */
export interface CampusCaption {
  /** "Mudd 833", "Diana Center", "Location not published yet". */
  headline: string;
  /** What the map itself prints, over the pin. See `CampusMarker`. */
  marker: CampusMarker;
  /** "Morningside", "Barnard", "Medical Center". */
  zoneLabel: string;
  campusZone: CampusZone;
  plane: CampusPlaneId;
  /** Extra meeting locations beyond the pinned one. 0 for most sections. */
  additionalLocationCount: number;
  /**
   * Full sentence for screen readers and for the canvas's `aria-label`. The
   * canvas itself is inert to assistive tech; this is what replaces it.
   */
  description: string;
}
