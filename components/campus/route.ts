/**
 * Resolve route stops to plane-local coordinates.
 *
 * Shared by both renderers: the 3D scene turns these into markers floating over
 * each roof, and the flat map turns them into tinted footprints. Resolving once
 * here is what keeps the two from disagreeing about which buildings a card is
 * about.
 */

import { resolveCampusLocation } from "@/lib/campus";
import type { CampusPlaneId } from "@/lib/campus";
import type { CampusRouteStop, CampusRoutePoint } from "./contracts";
import { pickPinnedLocation } from "./caption";

export function routePointsOnPlane(
  routeStops: ReadonlyArray<CampusRouteStop>,
  plane: CampusPlaneId,
): CampusRoutePoint[] {
  const points: CampusRoutePoint[] = [];
  for (const stop of routeStops) {
    const { location } = pickPinnedLocation(stop.buildingNames);
    if (location.plane !== plane || !location.layout) continue;
    points.push({
      x: location.layout.x,
      z: location.layout.z,
      highlighted: stop.highlighted ?? false,
      height: location.layout.height,
      buildingId: location.layout.buildingId,
    });
  }
  return points;
}

/** Building names for the highlighted stop — drives the main pin. */
export function highlightedStopBuildings(
  routeStops: ReadonlyArray<CampusRouteStop>,
): ReadonlyArray<string | null> {
  const highlighted = routeStops.find((stop) => stop.highlighted);
  if (highlighted) return highlighted.buildingNames;
  const first = routeStops.find((stop) =>
    stop.buildingNames.some((name) => resolveCampusLocation(name).layout != null),
  );
  return first?.buildingNames ?? [];
}
