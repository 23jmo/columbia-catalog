/**
 * Campus-card lane — the marker's text.
 *
 * The card has no caption strip any more: everything a reader is told about
 * where a section meets is on a plate inside the map, and both renderers get
 * that plate from `buildCampusCaption`. That makes this module the only thing
 * standing between the parsed `building_name` strings and the words on screen,
 * which is worth pinning down — a regression here is silent, because the map
 * still draws perfectly with the wrong name on it.
 */

import { describe, expect, it } from "vitest";
import { buildCampusCaption, pickPinnedLocation } from "./caption";

const MEETING_TIME = "M W 4:10pm-5:25pm";

function markerFor(buildingNames: (string | null)[], extra?: { roomLabel?: string; label?: string }) {
  return buildCampusCaption({ buildingNames, meta: MEETING_TIME, ...extra }).marker;
}

describe("buildCampusCaption — the marker inside the map", () => {
  it("names the building and prints the meeting time under it", () => {
    expect(markerFor(["Havemeyer Hall"])).toEqual({
      title: "Havemeyer Hall",
      meta: MEETING_TIME,
      note: null,
    });
  });

  it("uses the layout table's name, not the timetable's spelling", () => {
    // The bulletin says "Dodge Fitness Center"; the map calls it by its full
    // name, and the plate has to agree with the map it sits on.
    expect(markerFor(["Dodge Fitness Center"]).title).toBe("Dodge Physical Fitness Center");
  });

  it("leaves the room number off the plate", () => {
    // A massing model cannot show a reader inside a building, and the meetings
    // table directly above the card already prints the room.
    expect(markerFor(["Havemeyer Hall"], { roomLabel: "309" }).title).toBe("Havemeyer Hall");
  });

  it("lets an explicit label outrank the building name", () => {
    expect(markerFor(["Havemeyer Hall"], { label: "Two campuses" }).title).toBe("Two campuses");
  });

  it("says how many other places the section also meets", () => {
    expect(markerFor(["Havemeyer Hall", "Pupin Laboratories"]).note).toBe("+1 other location");
    expect(markerFor(["Havemeyer Hall", "Pupin Laboratories", "Mudd"]).note).toBe(
      "+2 other locations",
    );
  });

  it("admits when a real building is not drawn", () => {
    // Dodge is underground — the survey has no polygon for it at all, so "not
    // on the map" is the true answer rather than a gap to be filled.
    expect(markerFor(["Dodge Fitness Center"]).note).toBe("Not on the map");
  });

  it("prefers the actionable caveat when both are true", () => {
    // Two buildings, neither of them drawn — the only way both caveats apply
    // at once, because a mixed list pins the one the map CAN point at.
    expect(markerFor(["Dodge Fitness Center", "Engineering Terrace"]).note).toBe(
      "+1 other location",
    );
  });

  it("keeps both caveats in the description a screen reader hears", () => {
    const caption = buildCampusCaption({
      buildingNames: ["Dodge Fitness Center", "Engineering Terrace"],
      meta: MEETING_TIME,
    });
    expect(caption.description).toContain("not drawn on the map");
    expect(caption.description).toContain("1 other location");
  });

  it("says something honest when there is no location to show", () => {
    expect(markerFor(["To be announced"]).title).toBe("Location not published yet");
    expect(markerFor([]).title).toBe("Location not published yet");
    expect(markerFor(["Online"]).title).toBe("Meets online");
  });

  it("shows what the source said when the name is unrecognised", () => {
    expect(markerFor(["Somewhere Else Entirely"]).title).toBe("Somewhere Else Entirely");
  });

  it("carries no meeting time when the caller passed none", () => {
    expect(buildCampusCaption({ buildingNames: ["Havemeyer Hall"] }).marker.meta).toBeNull();
  });
});

describe("pickPinnedLocation", () => {
  it("pins the first placeable location, not the first non-null one", () => {
    // A MoWe lecture in Dodge and a Fr section in Havemeyer should frame the
    // building the map can actually point at.
    const { location } = pickPinnedLocation(["Dodge Fitness Center", "Havemeyer Hall"]);
    expect(location.layout?.buildingId).toBe("havemeyer");
  });

  it("counts places, not meetings", () => {
    const { additionalLocationCount } = pickPinnedLocation([
      "Havemeyer Hall",
      "Havemeyer Hall",
      "Havemeyer Hall",
    ]);
    expect(additionalLocationCount).toBe(0);
  });

  it("ignores unassigned slots when counting", () => {
    const { additionalLocationCount } = pickPinnedLocation(["Havemeyer Hall", "To be announced", null]);
    expect(additionalLocationCount).toBe(0);
  });
});
