import { Fact } from "@/components/course/panel";
import { InstructorLinks } from "@/components/instructor/instructor-link";
import type { InstructorPageData } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";
import { countLabel, weekdayListLabel } from "./format";
import { InstructorSection } from "./section-block";

/**
 * The facts that do not fit a chart: which days they are on campus, which
 * buildings they teach in, their largest room, and who they share a section
 * with.
 *
 * Every row is omitted rather than filled with a dash when the registrar
 * published nothing — an empty row invites the reader to believe we checked and
 * found zero, which is a different claim from "not published".
 */

export interface InstructorDetailsCardProps {
  data: InstructorPageData;
  className?: string;
}

export function InstructorDetailsCard({ data, className }: InstructorDetailsCardProps) {
  const hasAnything =
    data.teachingDays.length > 0 ||
    data.buildings.length > 0 ||
    data.largestSection != null ||
    data.coTeachers.length > 0;

  if (!hasAnything) return null;

  return (
    <div className={cx("w-full", className)}>
      <InstructorSection id="instructor-details" title="On campus">
        {/*
          The shared `Fact` from the drawer's panel kit, not a local one. This
          file used to define its own component of the same name that rendered a
          filled `bg-background-primary-default` tile — so the course page's
          "Workload and grading" facts were small-caps labels over strong values
          sitting flush against the block, and these were pale slabs indented
          inside it. Same component name, same job, two looks.
        */}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {data.teachingDays.length > 0 ? (
          <Fact label="Teaching days">{weekdayListLabel(data.teachingDays)}</Fact>
        ) : null}

        {data.largestSection ? (
          <Fact label="Largest section">
            <span className="tabular-nums">
              {countLabel(data.largestSection.enrolled)} students
            </span>{" "}
            <span className="text-text-secondary">
              in {data.largestSection.code} §{data.largestSection.sectionCode}
            </span>
          </Fact>
        ) : null}

        {data.buildings.length > 0 ? (
          <Fact label={data.buildings.length === 1 ? "Building" : "Buildings"}>
            {data.buildings.join(" · ")}
          </Fact>
        ) : null}

        {data.coTeachers.length > 0 ? (
          <Fact label={data.coTeachers.length === 1 ? "Co-teaches with" : "Co-teaches with"}>
            {/*
              Through the shared component, not a hand-rolled `Link`: the
              registrar lists "Staff" and "TBA" as co-instructors on real
              sections, and a hand-rolled link sends those to `/instructor/staff`
              — a confident 404. `InstructorLinks` renders a placeholder as
              plain text, and keeps the hover treatment identical to every
              other name in the app.
            */}
            <InstructorLinks names={data.coTeachers} separator=" · " />
          </Fact>
        ) : null}
        </dl>
      </InstructorSection>
    </div>
  );
}
