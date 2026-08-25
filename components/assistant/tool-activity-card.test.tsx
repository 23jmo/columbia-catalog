import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ToolActivity } from "@/lib/agent/transcript";
import { ThinkingLine, ToolActivityCard } from "./tool-activity-card";

const sample: ToolActivity[] = [
  { toolCallId: "1", name: "search_courses", label: "Searching the catalog", state: "done" },
  { toolCallId: "2", name: "recommend_courses", label: "Ranking courses for you", state: "running" },
];

describe("ToolActivityCard", () => {
  const html = renderToStaticMarkup(<ToolActivityCard activity={sample} isRunning />);

  it("uses the template copy while a step is still in flight", () => {
    expect(html).toContain("1 step left");
  });

  it("raises the running step into a pill, after the finished ones", () => {
    expect(html).toContain("rounded-full");
    expect(html).toContain("line-through");
    expect(html).toContain("aria-expanded=\"true\"");
    expect(html.indexOf("Searching the catalog")).toBeLessThan(
      html.indexOf("Ranking courses for you"),
    );
  });
});

describe("ThinkingLine", () => {
  it("pairs the ornament with the thinking label, not a spinner", () => {
    const html = renderToStaticMarkup(<ThinkingLine label="Thinking" />);
    expect(html).toContain("Thinking");
    expect(html).not.toContain("animate-spin");
  });
});
