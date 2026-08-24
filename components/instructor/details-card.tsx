import { InstructorLinks } from "@/components/instructor/instructor-link";
import type { InstructorPageData } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";
import { countLabel, weekdayListLabel } from "./format";

/**
 * The facts that do not fit a chart: which days they are on campus, which
 * buildings they teach in, their largest room, and who they share a section
 * with.
 *
 * Every row is omitted rather than filled with a dash when the registrar
 * published nothing — an empty row invites the reader to believe we checked and
 * found zero, which is a different claim from "not published".
 */

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-2lg bg-background-primary-default p-3">
      <dt className="text-caption-2-regular text-text-tertiary">{label}</dt>
      <dd className="text-body-medium text-pretty text-text-primary">{children}</dd>
    </div>
  );
}

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
    <section
      className={cx(
        "flex w-full flex-col gap-2.5 rounded-[20px] bg-background-secondary-default px-2.5 py-3",
        className,
      )}
      aria-labelledby="instructor-details-heading"
    >
      <p
        id="instructor-details-heading"
        className="px-1.5 pt-1 text-body-medium text-text-secondary"
      >
        On campus
      </p>

      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
    </section>
  );
}
