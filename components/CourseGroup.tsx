import { SectionCard } from "./SectionCard";
import { formatCredits } from "@/lib/format";
import type { Section } from "@/lib/types";

export function CourseGroup({ sections }: { sections: Section[] }) {
  const first = sections[0];
  const uniqueTitles = new Set(sections.map((row) => row.title));
  const heading = uniqueTitles.size === 1 ? first.title : first.courseIdentifier;
  const enrolled = sections.reduce((sum, row) => sum + row.enrollment.enrolled, 0);
  const capacity = sections.reduce((sum, row) => sum + row.enrollment.capacity, 0);

  return (
    <section className="border-t border-line pt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-gold">{first.courseIdentifier}</p>
          <h2 className="font-display text-2xl text-navy-deep">{heading}</h2>
        </div>
        <p className="text-sm text-ink-soft">
          {sections.length} {sections.length === 1 ? "section" : "sections"}
          {" · "}
          {formatCredits(first.credits)}
          {" · "}
          <span className="tabular-nums">
            {enrolled}/{capacity}
          </span>
        </p>
      </div>
      <div className="grid gap-3">
        {sections.map((section) => (
          <SectionCard key={section.classIdentifier} section={section} />
        ))}
      </div>
    </section>
  );
}
