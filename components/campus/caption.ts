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
import type { CampusCaption, CampusMarker } from "./contracts";

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
  /** Meeting day and time, printed under the building name on the map. */
  meta?: string | null;
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

  // The pin names the BUILDING and nothing else. A room number is the one thing
  // a reader looking at a massing model cannot use — they cannot see inside —
  // and the meetings table directly above the card already prints it. An
  // explicit `label` is a deliberate caller override and outranks both.
  const markerTitle = args.label ?? location.buildingLabel ?? headline;

  const description = buildDescription({
    headline,
    zoneLabel,
    location,
    additionalLocationCount,
  });

  return {
    headline,
    marker: buildMarker({
      title: markerTitle,
      location,
      additionalLocationCount,
      meta: args.meta ?? null,
    }),
    zoneLabel,
    campusZone: location.campusZone,
    plane: location.plane,
    additionalLocationCount,
    description,
    location,
  };
}

/**
 * Which single caveat the map prints, if any.
 *
 * Deliberately one line and not two. A section that meets in three places, in a
 * building we cannot draw, has two true things to say and room for neither —
 * "+2 other locations" wins because it is the one the reader can act on, and
 * both survive in `description` for anyone listening rather than looking.
 */
function buildMarker(args: {
  title: string;
  location: CampusLocation;
  additionalLocationCount: number;
  meta: string | null;
}): CampusMarker {
  const { title, location, additionalLocationCount, meta } = args;
  const note =
    additionalLocationCount > 0
      ? `+${additionalLocationCount} other location${additionalLocationCount === 1 ? "" : "s"}`
      : location.buildingId != null && location.layout == null
        ? "Not on the map"
        : null;
  return { title, meta, note };
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
