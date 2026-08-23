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
   * Rendered under the caption — the drawer passes the meeting day and time so
   * the card answers "where is this, and when" in one glance.
   */
  meta?: string | null;
  className?: string;
  /**
   * Forces the 2D fallback. The card decides this for itself from WebGL support
   * and `prefers-reduced-motion`; the prop exists for the drawer's mobile
   * breakpoint (spec §17: "static image fallback on mobile") and for tests.
   */
  forceFallback?: boolean;
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
 * The caption both renderers share, derived once so the 3D card and the flat
 * map can never disagree about what they are showing.
 */
export interface CampusCaption {
  /** "Mudd 833", "Diana Center", "Location not published yet". */
  headline: string;
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
