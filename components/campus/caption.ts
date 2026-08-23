/**
 * Campus-card lane — the shared caption.
 *
 * Pure, so the 3D scene and the flat fallback are guaranteed to describe the
 * same place, and so the sentence a screen reader gets is the same sentence a
 * sighted reader gets. Lives outside the components on purpose: neither
 * renderer should be the one that "knows" what the card is about.
 */

import { ZONE_LABEL } from "@/lib/constants";
import { isLocationUnassigned, isRemoteLocation, resolveCampusLocation } from "@/lib/campus";
import type { CampusLocation } from "@/lib/campus";
import type { CampusCaption } from "./contracts";

/**
 * First identifiable location, plus how many others the section also uses.
 *
 * "Identifiable" deliberately means *placeable*, not merely non-null: a section
 * that meets in Mudd on Monday and "TBA" on Wednesday should pin Mudd.
 */
export function pickPinnedLocation(buildingNames: ReadonlyArray<string | null>): {
  location: CampusLocation;
  additionalLocationCount: number;
} {
  const distinct: string[] = [];
  for (const name of buildingNames) {
    if (name == null || isLocationUnassigned(name)) continue;
    if (!distinct.includes(name)) distinct.push(name);
  }

  const resolved = distinct.map(resolveCampusLocation);
  const pinned =
    resolved.find((candidate) => candidate.layout != null) ??
    resolved.find((candidate) => candidate.buildingId != null) ??
    resolved[0] ??
    resolveCampusLocation(null);

  // Count *other* places, not other meetings — a MoWeFr lecture in one room is
  // one location, and saying "+2 more" about it would be a lie.
  const additionalLocationCount = Math.max(0, distinct.length - 1);
  return { location: pinned, additionalLocationCount };
}

export function buildCampusCaption(args: {
  buildingNames: ReadonlyArray<string | null>;
  roomLabel?: string | null;
  label?: string | null;
}): CampusCaption & { location: CampusLocation } {
  const { location, additionalLocationCount } = pickPinnedLocation(args.buildingNames);
  const zoneLabel = ZONE_LABEL[location.campusZone];

  let headline: string;
  if (args.label) {
    headline = args.label;
  } else if (location.buildingLabel) {
    headline = args.roomLabel ? `${location.buildingLabel} ${args.roomLabel}` : location.buildingLabel;
  } else if (isRemoteLocation(location.rawName)) {
    headline = "Meets online";
  } else if (location.rawName) {
    // Unrecognised but non-empty: show what the source said rather than
    // pretending we know better. Provenance beats polish.
    headline = location.rawName;
  } else {
    headline = "Location not published yet";
  }

  const description = buildDescription({
    headline,
    zoneLabel,
    location,
    additionalLocationCount,
  });

  return {
    headline,
    zoneLabel,
    campusZone: location.campusZone,
    plane: location.plane,
    additionalLocationCount,
    description,
    location,
  };
}

function buildDescription(args: {
  headline: string;
  zoneLabel: string;
  location: CampusLocation;
  additionalLocationCount: number;
}): string {
  const { headline, zoneLabel, location, additionalLocationCount } = args;
  const extra =
    additionalLocationCount > 0
      ? ` This section also meets in ${additionalLocationCount} other location${
          additionalLocationCount === 1 ? "" : "s"
        }.`
      : "";

  if (location.campusZone === "unknown") {
    return `Campus map. ${headline}. The published location could not be matched to a building.${extra}`;
  }
  if (location.campusZone === "other") {
    return `Campus map. ${headline}. Not on a Columbia campus.${extra}`;
  }
  if (location.layout) {
    return `Campus map of ${zoneLabel}, with ${headline} highlighted.${extra}`;
  }
  return `Campus map of ${zoneLabel}. ${headline} is on this campus but is not drawn on the map.${extra}`;
}
