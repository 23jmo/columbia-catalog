import { CampusCard } from "@/components/campus/campus-card";
import type { InstructorPageData } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";
import { weekdayListLabel } from "./format";

/**
 * Where this person actually stands, three times a week.
 *
 * A fun fact, deliberately — it sits near the bottom of the page with the rest
 * of the trivia. But it is the fun fact with the best answer-per-pixel on the
 * page: "Havemeyer" is a word, and the same word rendered as a massing model
 * on the Morningside plan tells a first-year which end of campus they will be
 * walking to, which no list of building names does.
 *
 * EVERY building gets a point on the map, not just the busiest one. The card's
 * default behaviour — pin the first, count the rest — is right for a section,
 * which meets in one room; it is wrong here, where "which parts of campus does
 * this person live on" is the entire question the map is being asked.
 *
 * `data.buildings` is ordered most-used first, so the pulsing pin lands on the
 * room they teach in most and the others are drawn as plain markers. They are
 * NOT joined into a path: `connectStops={false}`. A dashed line between Mudd
 * and Havemeyer would draw a walk this person never takes — these are a set of
 * places, not an itinerary. (The schedule page, whose stops really are a walk
 * in order, keeps the path.)
 *
 * The card degrades on its own: no WebGL, or `prefers-reduced-motion`, and it
 * renders the flat plan instead. Nothing here needs to know which happened.
 */

export interface InstructorClassroomMapProps {
  data: InstructorPageData;
  className?: string;
}

export function InstructorClassroomMap({ data, className }: InstructorClassroomMapProps) {
  // No published room means no map. An empty plan of Morningside with no pin
  // on it is not a degraded state, it is a decoration that answers nothing.
  if (data.buildings.length === 0) return null;

  const others = data.buildings.length - 1;
  const days = data.teachingDays.length > 0 ? weekdayListLabel(data.teachingDays) : null;

  return (
    <section
      className={cx(
        "flex w-full flex-col gap-2.5 rounded-[20px] bg-background-secondary-default px-2.5 py-3",
        className,
      )}
      aria-labelledby="instructor-classroom-map-heading"
    >
      <div className="flex w-full flex-col gap-0.5 px-1.5 pt-1">
        <p id="instructor-classroom-map-heading" className="text-body-medium text-text-secondary">
          Where they teach
        </p>
        <p className="text-title-2-medium text-pretty text-text-primary">
          {others > 0 ? `${data.buildings.length} buildings this term` : data.buildings[0]}
        </p>
      </div>

      <CampusCard
        buildingNames={data.buildings}
        label={data.buildings[0]}
        meta={days ? `${days} · ${data.termLabel}` : data.termLabel}
        routeStops={data.buildings.map((building, index) => ({
          buildingNames: [building],
          label: building,
          // The most-used room gets the pulsing pin; the rest get markers.
          highlighted: index === 0,
        }))}
        connectStops={false}
      />

      {/*
        The names in full, under the map.

        The map can only show the buildings it can place — anything the campus
        layout does not know, and anything off the Morningside plan, has no
        point to draw. Printing the list means the answer is complete even when
        the picture is not, and it is the part that survives a screen reader.
      */}
      <p className="px-1.5 text-caption-1-regular text-pretty text-text-secondary">
        {data.buildings.join(" · ")}
      </p>
    </section>
  );
}
