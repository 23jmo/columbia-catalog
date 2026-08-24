/**
 * Campus lane — tests for the pure zone/layout resolution.
 *
 * Relative imports throughout: there is no vitest config in the repo and the
 * `@/` alias is a Next.js/tsconfig path that plain vitest does not resolve.
 * Run with `npx vitest run lib/campus`.
 *
 * The strings in `BULLETIN_LOCATIONS` are verbatim from
 * `lib/ingest/__fixtures__/bulletin-cs.html` — every distinct location the COMS
 * Fall 2026 schedule actually prints. If a parser change makes one of these
 * fail, the card silently loses its pin, so they are asserted individually
 * rather than as a blob.
 */

import { describe, expect, it } from "vitest";
import {
  CAMPUS_BUILDINGS,
  isLocationUnassigned,
  isRemoteLocation,
  resolveCampusBuilding,
  resolveCampusZone,
  resolveCampusZones,
} from "./zones";
import {
  CAMPUS_LAYOUT_BUILDINGS,
  CAMPUS_PLANES,
  CAMPUS_ROADS,
  buildingsOnPlane,
  campusPlane,
  focusPointFor,
  layoutBuildingById,
  planeForZone,
  resolveCampusLocation,
} from "./layout";
import { ZONE_WALK_MINUTES, isCrossCampus } from "../constants";

// ---------------------------------------------------------------------------
// Real strings, straight from the fixture
// ---------------------------------------------------------------------------

/** [location as printed, expected building id, expected zone] */
const BULLETIN_LOCATIONS: ReadonlyArray<readonly [string, string, string]> = [
  ["451 Computer Science Bldg", "cs-building", "morningside"],
  ["833 Seeley W. Mudd Building", "mudd", "morningside"],
  ["1127 Seeley W. Mudd Building", "mudd", "morningside"],
  ["1024 Seeley W. Mudd Building", "mudd", "morningside"],
  ["501 Schermerhorn Hall", "schermerhorn", "morningside"],
  ["963 Ext Schermerhorn Hall", "schermerhorn", "morningside"],
  ["502 Northwest Corner", "nwc", "morningside"],
  ["301 Pupin Laboratories", "pupin", "morningside"],
  ["142 Uris Hall", "uris", "morningside"],
  ["415 Schapiro Cepser", "cepsr", "morningside"],
  ["417 International Affairs Bldg", "iab", "morningside"],
  ["209 Havemeyer Hall", "havemeyer", "morningside"],
  ["253 Engineering Terrace", "engineering-terrace", "morningside"],
  ["402 Chandler", "chandler", "morningside"],
  ["310 Fayerweather", "fayerweather", "morningside"],
  ["304 Hamilton Hall", "hamilton", "morningside"],
  ["Cin Alfred Lerner Hall", "lerner", "morningside"],
  ["413 Kent Hall", "kent", "morningside"],
  ["312 Mathematics Building", "mathematics", "morningside"],
  ["601 Fairchild Life Sciences Bldg", "fairchild", "morningside"],
  ["601b Fairchild Life Sciences Bldg", "fairchild", "morningside"],
  // Buildings the Fall 2026 crawl turned up that the table used to miss, in the
  // spellings the sources actually printed — including the ALL CAPS and the
  // room codes the Directory glues onto the front.
  ["Carman Hall", "carman", "morningside"],
  ["Broadway Residence Hall", "broadway-hall", "morningside"],
  ["Martin Luther King Building", "mlk", "morningside"],
  ["80 Claremont Ave", "claremont-80", "morningside"],
  ["C01 80 Claremont", "claremont-80", "morningside"],
  ["KRAFT CENTER", "kraft", "morningside"],
  ["Ren Kraft Center", "kraft", "morningside"],
  ["5AB KRAFT CENTER", "kraft", "morningside"],
  ["Watson Hall", "watson", "morningside"],
  ["Davis International House", "international-house", "morningside"],
  ["B-100 Heyman Center For Humanities", "heyman", "morningside"],
  ["Casa Hispanica", "casa-hispanica", "morningside"],
  ["Casa Hispánica", "casa-hispanica", "morningside"],
  ["Ll104 R&D Science Center", "altschul", "barnard"],
  ["Ll227 R&D Science Center", "altschul", "barnard"],
];

describe("resolveCampusBuilding — verbatim Bulletin locations", () => {
  for (const [raw, buildingId, zone] of BULLETIN_LOCATIONS) {
    it(`resolves ${JSON.stringify(raw)}`, () => {
      const match = resolveCampusBuilding(raw);
      expect(match?.buildingId).toBe(buildingId);
      expect(resolveCampusZone(raw)).toBe(zone);
    });
  }
});

// ---------------------------------------------------------------------------
// Messy inputs the resolver has to survive
// ---------------------------------------------------------------------------

describe("resolveCampusZone — abbreviations and bare names", () => {
  it("resolves a bare abbreviation students actually use", () => {
    expect(resolveCampusZone("Mudd")).toBe("morningside");
    expect(resolveCampusZone("NWC")).toBe("morningside");
    expect(resolveCampusZone("IAB")).toBe("morningside");
    expect(resolveCampusZone("CEPSR")).toBe("morningside");
  });

  it("survives the room number sitting on either end", () => {
    expect(resolveCampusBuilding("Mudd 833")?.buildingId).toBe("mudd");
    expect(resolveCampusBuilding("833 Mudd")?.buildingId).toBe("mudd");
    expect(resolveCampusBuilding("Diana Center Rm 501")?.buildingId).toBe("diana");
    expect(resolveCampusBuilding("Room 501 Diana Center")?.buildingId).toBe("diana");
  });

  it("peels a LETTERED room code the Bulletin glued onto the front", () => {
    // Real Fall 2026 values. `LEADING_ROOM` cannot touch these — it only peels
    // digits — so before the fallback every one of them lost its pin.
    expect(resolveCampusBuilding("Cin Alfred Lerner Hall")?.buildingId).toBe("lerner");
    expect(resolveCampusBuilding("Ubg Dodge Fitness Center")?.buildingId).toBe("dodge-fitness");
    // The gym must never be confused with Dodge Hall on the quad.
    expect(resolveCampusBuilding("Dodge Fitness Center")?.buildingId).toBe("dodge-fitness");
    expect(resolveCampusBuilding("Dodge Hall")?.buildingId).toBe("dodge");
    expect(resolveCampusBuilding("501 Dodge Building")?.buildingId).toBe("dodge");
    expect(resolveCampusBuilding("Ll013 Barnard Hall")?.buildingId).toBe("barnard-hall");
    expect(resolveCampusBuilding("Ll002 Milstein Center")?.buildingId).toBe("milstein");
    expect(resolveCampusBuilding("Ll200 Diana Center")?.buildingId).toBe("diana");
  });

  it("does not eat a first word that is part of the building's real name", () => {
    // The whole trap: the Bulletin prints "Cin Alfred Lerner Hall" and "Ext
    // Schermerhorn Hall" in identical shape and case, but only the first has a
    // room on the front. Nothing may strip a leading word while the full string
    // still resolves on its own.
    expect(resolveCampusBuilding("Low Memorial Library")?.buildingId).toBe("low");
    expect(resolveCampusBuilding("Kent Hall")?.buildingId).toBe("kent");
    expect(resolveCampusBuilding("Uris Hall")?.buildingId).toBe("uris");
    expect(resolveCampusBuilding("Knox Hall")?.buildingId).toBe("knox");
  });

  it("still refuses a name it cannot place, rather than guessing off the front", () => {
    // Dropping the leading token must not turn an unknown building into a
    // confident wrong pin — a wrong room on the map is worse than no map.
    expect(resolveCampusBuilding("Zzz Qqq Nonexistent Pavilion")).toBeNull();
    expect(resolveCampusBuilding("Ll104")).toBeNull();
  });

  it("is case- and punctuation-insensitive", () => {
    expect(resolveCampusBuilding("417 MATHEMATICS BUILDING")?.buildingId).toBe("mathematics");
    expect(resolveCampusBuilding("st. paul's chapel")?.buildingId).toBe("st-pauls");
    expect(resolveCampusBuilding("Jerome L. Greene Science Center")?.buildingId).toBe(
      "jerome-greene",
    );
  });

  it("expands the abbreviations the Bulletin prints", () => {
    expect(resolveCampusBuilding("Lenfest Ctr for the Arts")?.buildingId).toBe("lenfest");
    expect(resolveCampusBuilding("601 Fairchild Life Sciences Bldg")?.buildingId).toBe("fairchild");
  });

  it("never lets a room code claim a building", () => {
    // "501" alone must not match anything; a two/three character needle would
    // otherwise fuzzy-match half the table.
    expect(resolveCampusBuilding("501")).toBeNull();
    expect(resolveCampusZone("501")).toBe("unknown");
    expect(resolveCampusBuilding("Rm 4")).toBeNull();
  });
});

describe("resolveCampusZone — buildings the sources renamed or share", () => {
  it("follows Barnard's rebrand of Altschul without splitting the building", () => {
    // Fall 2026 has nineteen meetings in the "R&D Science Center" and none in
    // Altschul Hall. Both spellings have to land on one entry: two entries
    // would put two outlines on one footprint, which is the z-fighting the
    // context de-duplication exists to prevent.
    expect(resolveCampusBuilding("R&D Science Center")?.buildingId).toBe("altschul");
    expect(resolveCampusBuilding("Altschul Hall")?.buildingId).toBe("altschul");
  });

  it("does not let the Science Center steal CUIMC's Vagelos Education Center", () => {
    // Same donors, two buildings, fifty blocks apart. The longer alias has to
    // win, or every medical-school meeting pins on Barnard.
    expect(resolveCampusBuilding("Vagelos Education Center")?.buildingId).toBe("vagelos-education");
    expect(resolveCampusZone("Vagelos Education Center")).toBe("cuimc");
  });

  it("sends Riverside Church and the MLK Building to the same doors", () => {
    // The MLK Building is a floor of classrooms inside the church; the
    // registrar's own entrance is through it. One pin, two names for it.
    expect(resolveCampusBuilding("Riverside Church")?.buildingId).toBe("mlk");
    expect(resolveCampusBuilding("River Side Church")?.buildingId).toBe("mlk");
  });

  it("will not let a bare 'Broadway' claim the residence hall", () => {
    // "Broadway" is a street, a subway line and half the addresses on the west
    // side of campus. Only the full name resolves.
    expect(resolveCampusBuilding("Broadway")).toBeNull();
    expect(resolveCampusBuilding("Broadway Residence Hall")?.buildingId).toBe("broadway-hall");
  });
});

describe("resolveCampusZone — ambiguous names", () => {
  it("keeps the two Milsteins apart", () => {
    // Barnard's Milstein Center vs the Medical Center's Milstein Hospital.
    expect(resolveCampusZone("Milstein Center")).toBe("barnard");
    expect(resolveCampusZone("Milstein Hospital Building")).toBe("cuimc");
    // A bare "Milstein" in a course catalog means the teaching building.
    expect(resolveCampusZone("Milstein")).toBe("barnard");
  });

  it("keeps the two Lehmans apart", () => {
    // Barnard's Lehman Hall vs SIPA's Lehman Library, which is inside IAB.
    expect(resolveCampusZone("Lehman Hall")).toBe("barnard");
    expect(resolveCampusBuilding("Lehman Library")?.buildingId).toBe("iab");
    expect(resolveCampusZone("Lehman Library")).toBe("morningside");
  });

  it("prefers an identified building over a zone keyword inside its name", () => {
    // "Hammer Health Sciences Center" contains "health sciences", which is also
    // a CUIMC zone keyword — the building lookup must win, not tie.
    const match = resolveCampusBuilding("Hammer Health Sciences Center");
    expect(match?.buildingId).toBe("hammer");
    expect(resolveCampusZone("Hammer Health Sciences Center")).toBe("cuimc");
  });
});

describe("resolveCampusZone — null, TBA and non-places", () => {
  it("treats null as unknown", () => {
    expect(resolveCampusZone(null)).toBe("unknown");
    expect(isLocationUnassigned(null)).toBe(true);
  });

  it("recognises every way the sources say 'no location'", () => {
    // "None None" is verbatim: the Bulletin template renders it when both the
    // room and the building are null.
    for (const raw of ["", "   ", "TBA", "tbd", "Room TBA", "To be announced", "None None"]) {
      expect(isLocationUnassigned(raw)).toBe(true);
      expect(resolveCampusZone(raw)).toBe("unknown");
      expect(resolveCampusBuilding(raw)).toBeNull();
    }
  });

  it("classifies online sections as 'other', not 'unknown'", () => {
    // We know where they are not: on any campus. That is a different fact from
    // failing to identify a building.
    expect(resolveCampusZone("Online")).toBe("other");
    expect(resolveCampusZone("Online - Asynchronous")).toBe("other");
    expect(isRemoteLocation("Online")).toBe(true);
    expect(isRemoteLocation("833 Seeley W. Mudd Building")).toBe(false);
    expect(isLocationUnassigned("Online")).toBe(false);
  });

  it("falls back to a zone keyword when the building is unrecognised", () => {
    expect(resolveCampusZone("Some Unlisted Barnard Annex")).toBe("barnard");
    expect(resolveCampusZone("Manhattanville — building TBD")).toBe("manhattanville");
    expect(resolveCampusZone("Washington Heights clinic")).toBe("cuimc");
  });

  it("returns unknown for genuine nonsense rather than guessing", () => {
    expect(resolveCampusZone("Zzyzx Pavilion")).toBe("unknown");
    expect(resolveCampusZone("qqqq")).toBe("unknown");
  });

  it("places genuinely off-campus Columbia addresses in 'other'", () => {
    expect(resolveCampusZone("Lamont-Doherty Earth Observatory")).toBe("other");
    expect(resolveCampusZone("Nevis Laboratories")).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// Cross-campus pairs — the reason zones exist at all
// ---------------------------------------------------------------------------

describe("cross-campus pairs", () => {
  it("does not hard-warn on the Broadway crossing", () => {
    const barnardZone = resolveCampusZone("Diana Center");
    const collegeZone = resolveCampusZone("833 Seeley W. Mudd Building");
    expect(barnardZone).toBe("barnard");
    expect(collegeZone).toBe("morningside");
    // Morningside↔Barnard is a soft pair in lib/constants — a 5 minute walk.
    expect(isCrossCampus(barnardZone, collegeZone)).toBe(false);
    expect(ZONE_WALK_MINUTES[barnardZone][collegeZone]).toBeLessThanOrEqual(10);
  });

  it("hard-warns on Morningside → Manhattanville", () => {
    const from = resolveCampusZone("501 Schermerhorn Hall");
    const to = resolveCampusZone("Jerome L. Greene Science Center");
    expect(isCrossCampus(from, to)).toBe(true);
    expect(ZONE_WALK_MINUTES[from][to]).toBeGreaterThan(10);
  });

  it("hard-warns on Morningside → Medical Center", () => {
    const from = resolveCampusZone("142 Uris Hall");
    const to = resolveCampusZone("Vagelos Education Center");
    expect(from).toBe("morningside");
    expect(to).toBe("cuimc");
    expect(isCrossCampus(from, to)).toBe(true);
    expect(ZONE_WALK_MINUTES[from][to]).toBeGreaterThan(30);
  });

  it("collapses a meeting list to its distinct zones, in order", () => {
    expect(
      resolveCampusZones([
        "833 Seeley W. Mudd Building",
        "327 Seeley W. Mudd Building",
        "Diana Center",
        null,
      ]),
    ).toEqual(["morningside", "barnard", "unknown"]);
  });
});

// ---------------------------------------------------------------------------
// Layout dataset invariants
// ---------------------------------------------------------------------------

describe("campus layout", () => {
  it("stays within the card's drawing budget", () => {
    // Not a legibility cap any more — the map is surveyed, so "how many
    // buildings" is a question about payload and draw calls rather than about
    // clutter. The scene merges every footprint into one geometry, so this
    // bounds the bake, not the frame time: a re-bake that suddenly places 300
    // buildings means the OSM query grew a wildcard, not that campus did.
    expect(CAMPUS_LAYOUT_BUILDINGS.length).toBeLessThanOrEqual(64);
  });

  it("only positions buildings the zone table knows", () => {
    const knownIds = new Set(CAMPUS_BUILDINGS.map((b) => b.buildingId));
    for (const entry of CAMPUS_LAYOUT_BUILDINGS) {
      expect(knownIds.has(entry.buildingId)).toBe(true);
    }
  });

  it("agrees with the zone table about every building's zone", () => {
    const zoneById = new Map(CAMPUS_BUILDINGS.map((b) => [b.buildingId, b.campusZone]));
    for (const entry of CAMPUS_LAYOUT_BUILDINGS) {
      expect(entry.campusZone).toBe(zoneById.get(entry.buildingId));
    }
  });

  it("has no duplicate building ids", () => {
    const ids = CAMPUS_LAYOUT_BUILDINGS.map((entry) => entry.buildingId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every building inside its plane's ground rectangle", () => {
    for (const entry of CAMPUS_LAYOUT_BUILDINGS) {
      const plane = campusPlane(entry.plane);
      expect(entry.x - entry.width / 2).toBeGreaterThanOrEqual(plane.minX);
      expect(entry.x + entry.width / 2).toBeLessThanOrEqual(plane.maxX);
      expect(entry.z - entry.depth / 2).toBeGreaterThanOrEqual(plane.minZ);
      expect(entry.z + entry.depth / 2).toBeLessThanOrEqual(plane.maxZ);
    }
  });

  it("places Low north of College Walk and Butler south of it", () => {
    const low = layoutBuildingById("low");
    const butler = layoutBuildingById("butler");
    const collegeWalk = CAMPUS_ROADS.find((road) => road.roadId === "college-walk");
    expect(low && butler && collegeWalk).toBeTruthy();
    // +z is south, so "north of the walk" means a smaller z.
    expect(low!.z).toBeLessThan(collegeWalk!.at);
    expect(butler!.z).toBeGreaterThan(collegeWalk!.at);
    // They face each other across the axis.
    expect(Math.abs(low!.x - butler!.x)).toBeLessThan(0.5);
  });

  it("puts every Barnard building west of Broadway", () => {
    const broadway = CAMPUS_ROADS.find((road) => road.roadId === "broadway");
    expect(broadway).toBeTruthy();
    for (const entry of buildingsOnPlane("morningside-heights")) {
      if (entry.campusZone !== "barnard") continue;
      expect(entry.x + entry.width / 2, entry.buildingId).toBeLessThan(broadway!.at);
    }
  });

  it("keeps the main campus block east of Broadway", () => {
    // Deliberately scoped to the block between 114th and 120th rather than to
    // every Morningside building. Columbia owns real estate on both sides of
    // Broadway — Knox is on 122nd, west of it — so "all College buildings are
    // east" was a fact about the old cartoon, not about the campus. What is
    // true, and what the map's readability actually rests on, is that the
    // acropolis between the two cross streets is entirely east.
    const broadway = CAMPUS_ROADS.find((road) => road.roadId === "broadway")!;
    const north = CAMPUS_ROADS.find((road) => road.roadId === "w120")!;
    const south = CAMPUS_ROADS.find((road) => road.roadId === "w114")!;
    // Named, not inferred: a building that lands west of Broadway without being
    // on this list is a bake that went wrong, and the test should say so.
    const WEST_OF_BROADWAY = new Set([
      // 606 W 115th, 612 W 116th and 612 W 115th: Columbia's, on the west
      // side of the street, inside the band, and not on the acropolis.
      "kraft",
      "casa-hispanica",
      "watson",
    ]);
    const onTheBlock = buildingsOnPlane("morningside-heights").filter(
      (entry) =>
        entry.campusZone !== "barnard" &&
        !WEST_OF_BROADWAY.has(entry.buildingId) &&
        entry.z > north.at &&
        entry.z < south.at,
    );
    expect(onTheBlock.length).toBeGreaterThan(15);
    for (const entry of onTheBlock) {
      expect(entry.x - entry.width / 2, entry.buildingId).toBeGreaterThan(broadway.at);
    }
  });

  it("never places two buildings on the same spot", () => {
    // This used to assert that no two bounding BOXES overlapped, which was a
    // cartoon invariant: hand-placed boxes that overlap merge into one blob.
    // Real footprints overlap at the box level all the time — Mudd's long slab
    // and the Computer Science building genuinely interlock — and they still
    // read as two buildings because the scene extrudes their actual outlines.
    //
    // What is still worth guarding is the failure the bake can actually have:
    // two building ids resolving to the same OSM way, which would stack two
    // pins on one roof. Half a unit is 13 m — closer than any two distinct
    // Columbia buildings' centroids get.
    const MINIMUM_SEPARATION_UNITS = 0.5;
    for (const plane of CAMPUS_PLANES) {
      const entries = buildingsOnPlane(plane.planeId);
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          const a = entries[i];
          const b = entries[j];
          expect(
            Math.hypot(a.x - b.x, a.z - b.z),
            `${a.buildingId} and ${b.buildingId} share a centroid`,
          ).toBeGreaterThan(MINIMUM_SEPARATION_UNITS);
        }
      }
    }
  });

  it("routes every zone to a plane that exists", () => {
    for (const zone of ["morningside", "barnard", "manhattanville", "cuimc", "other", "unknown"] as const) {
      expect(() => campusPlane(planeForZone(zone))).not.toThrow();
    }
  });
});

describe("resolveCampusLocation", () => {
  it("returns a drawable pin for a placed building", () => {
    const location = resolveCampusLocation("833 Seeley W. Mudd Building");
    expect(location.buildingId).toBe("mudd");
    expect(location.plane).toBe("morningside-heights");
    expect(location.layout).not.toBeNull();
    expect(focusPointFor(location)).toEqual({ x: location.layout!.x, z: location.layout!.z });
  });

  it("frames the plane when the building is real but undrawn", () => {
    // Lehman Hall is a known Barnard building the bake does not place — OSM has
    // no way by that name, since the site is now the Milstein Center. Knox Hall
    // used to be this test's example and is now surveyed and drawn, which is
    // the change working.
    const location = resolveCampusLocation("Lehman Hall");
    expect(location.campusZone).toBe("barnard");
    expect(location.buildingId).toBe("lehman");
    expect(location.layout).toBeNull();
    expect(location.buildingLabel).toBe("Lehman Hall");
    // Barnard shares Morningside's plane, so an unplaced Barnard building falls
    // back to the same Low-plaza focus.
    expect(focusPointFor(location)).toEqual({ x: 0, z: -3.3 });
  });

  it("degrades to an unpinned Morningside plane for TBA", () => {
    const location = resolveCampusLocation("Room TBA");
    expect(location.campusZone).toBe("unknown");
    expect(location.buildingId).toBeNull();
    expect(location.buildingLabel).toBeNull();
    expect(location.plane).toBe("morningside-heights");
  });

  it("sends Manhattanville and CUIMC to their own planes", () => {
    expect(resolveCampusLocation("Lenfest Center for the Arts").plane).toBe("manhattanville");
    expect(resolveCampusLocation("Vagelos Education Center").plane).toBe("cuimc");
    expect(buildingsOnPlane("cuimc").every((b) => b.campusZone === "cuimc")).toBe(true);
  });
});
