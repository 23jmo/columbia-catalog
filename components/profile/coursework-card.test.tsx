import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COURSE_SOURCE_LABEL, type CourseSource, type TakenCourse } from "@/lib/profile/types";
import { CourseworkCard } from "./coursework-card";

/**
 * `CourseSource` is documented "Always displayed", and the reason is in the
 * `lib/profile/types.ts` header rather than in any style guide: a degree audit
 * built on self-report is useful, one that PRESENTS as official is dangerous,
 * and the difference is whether the provenance travels with the row.
 *
 * A layout pass once put that label in a `hidden … md:inline` column, which
 * satisfied the letter of "the UI shows it" on a laptop and dropped it entirely
 * on the screen most of this record is actually read on. So the assertion is
 * not "the string is somewhere in the markup" — it is that the element carrying
 * it is not gated behind a breakpoint.
 */

function courseworkMarkup(source: CourseSource): string {
  const course: TakenCourse = {
    courseId: "COMS3261W",
    source,
    termLabel: "Fall 2024",
    points: 3,
  } as TakenCourse;

  return renderToStaticMarkup(
    <CourseworkCard
      courses={[course]}
      titles={{ COMS3261W: "COMPUTER SCIENCE THEORY" }}
      suggestions={[]}
      unmatchedCourseIds={[]}
      crossCounted={[]}
    />,
  );
}

/** The element wrapping a given piece of text, so its classes can be read. */
function elementAround(html: string, text: string): string {
  const match = new RegExp(`<[a-z]+[^>]*>${text}</[a-z]+>`).exec(html);
  if (!match) throw new Error(`"${text}" is not in the markup at all`);
  return match[0];
}

describe("coursework card provenance", () => {
  const sources = Object.keys(COURSE_SOURCE_LABEL) as CourseSource[];

  it.each(sources)("shows where a %s course came from", (source) => {
    expect(courseworkMarkup(source)).toContain(COURSE_SOURCE_LABEL[source]);
  });

  it.each(sources)("never hides the %s label behind a breakpoint", (source) => {
    const label = COURSE_SOURCE_LABEL[source];
    const element = elementAround(courseworkMarkup(source), label);

    // `hidden` with a breakpoint-prefixed reveal is the shape that regressed:
    // invisible at the default width, visible only once the viewport is wide
    // enough. Responsive classes that only change how it sits — widths,
    // alignment, truncation — are fine, so this looks for the display gate
    // rather than for any `sm:`/`md:` prefix.
    expect(element).not.toMatch(/class="[^"]*\bhidden\b/);
  });
});

describe("coursework card rows", () => {
  it("leads with the course name and repairs registrar casing", () => {
    const html = courseworkMarkup("picker");
    expect(html).toContain("Computer Science Theory");
    expect(html).not.toContain("COMPUTER SCIENCE THEORY");
  });

  it("keeps the course code on the row alongside the name", () => {
    expect(courseworkMarkup("picker")).toContain("COMS W3261");
  });
});
