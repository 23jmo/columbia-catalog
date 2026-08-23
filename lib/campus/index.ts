/**
 * Campus lane — public surface.
 *
 * Pure data and pure functions only. The 3D card lives in
 * `components/campus/**` and is lazy-loaded; nothing in here pulls three.js, so
 * importing zone resolution costs a consumer nothing.
 */

export {
  CAMPUS_BUILDINGS,
  isLocationUnassigned,
  isRemoteLocation,
  resolveCampusBuilding,
  resolveCampusZone,
  resolveCampusZones,
  type CampusBuildingMatch,
} from "./zones";

export {
  CAMPUS_LAYOUT_BUILDINGS,
  METRES_PER_CAMPUS_UNIT,
  CAMPUS_PLANES,
  CAMPUS_ROADS,
  buildingsOnPlane,
  campusPlane,
  focusPointFor,
  layoutBuildingById,
  planeForZone,
  resolveCampusLocation,
  roadsOnPlane,
  type CampusLayoutBuilding,
  type CampusLocation,
  type CampusPlane,
  type CampusPlaneId,
  type CampusRoad,
  type RoadOrientation,
} from "./layout";
