import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SourceList } from "./source-list";

describe("SourceList", () => {
  const html = renderToStaticMarkup(
    <SourceList
      courses={[
        { courseId: "COMSW4111", code: "COMS 4111W", title: "Introduction to Databases", source: "search_courses" },
        { courseId: "COMSW4118", code: "COMS 4118W", title: "Operating Systems I", source: "search_courses" },
      ]}
    />,
  );

  it("collapses to a count instead of dumping a table", () => {
    expect(html).toContain("Also looked at 2 courses");
    expect(html).not.toContain("What this answer is based on");
    expect(html).not.toContain("divide-y");
    expect(html).toContain("aria-expanded=\"false\"");
  });

  it("keeps each course title to one truncated line", () => {
    expect(html).toContain("truncate");
    expect(html).toContain("COMS 4111W");
  });
});
