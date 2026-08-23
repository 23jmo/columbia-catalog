/**
 * Campus-card lane — public surface.
 *
 * `CampusCard` is a client component that pulls in three.js behind a dynamic
 * import, so a drawer that only needs the flat map should import
 * `CampusCardFallback` (or `CampusMiniMap`) directly rather than through here.
 */

export { CampusCard, CampusCard as default } from "./campus-card";
export {
  CampusCardFallback,
  CampusCaptionBlock,
  CampusMiniMap,
  type CampusMiniMapProps,
} from "./campus-card-fallback";
export { buildCampusCaption, pickPinnedLocation } from "./caption";
export { NEUTRAL_CAMPUS_PALETTE, cssColorToHex, readCampusPalette, type CampusPalette } from "./palette";
export type {
  CampusCaption,
  CampusCardFallbackProps,
  CampusCardProps,
  CampusFallbackReason,
} from "./contracts";
