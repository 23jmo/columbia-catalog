import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ToolActivity } from "@/lib/agent/transcript";
import { ThinkingLine, ToolActivityCard, activityTasks } from "./tool-activity-card";

const sample: ToolActivity[] = [
  { toolCallId: "1", name: "search_courses", label: "Searching the catalog", state: "done" },
  { toolCallId: "2", name: "recommend_courses", label: "Ranking courses for you", state: "running" },
];

const withFailure: ToolActivity[] = [
  {
    toolCallId: "1",
    name: "get_ratings",
    label: "Reading reviews",
    state: "failed",
    errorText: "CULPA is not responding",
  },
  { toolCallId: "2", name: "search_courses", label: "Searching the catalog", state: "running" },
];

describe("activityTasks", () => {
  it("makes one task of the turn, so no two lines say the same sentence", () => {
    const tasks = activityTasks(sample);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].steps.map((step) => step.label)).toEqual([
      "Searching the catalog",
      "Ranking courses for you",
    ]);
  });

  it("keeps the template copy on the header, in both tenses", () => {
    const [task] = activityTasks(sample);
    expect(task.runningTitle).toBe("1 step left");
    expect(task.title).toBe("1 step");
  });

  it("counts the unreadable calls out of the finished total", () => {
    const [task] = activityTasks([
      { toolCallId: "1", name: "a", label: "A", state: "done" },
      { toolCallId: "2", name: "b", label: "B", state: "failed", errorText: "no" },
    ]);
    expect(task.title).toBe("1 step · 1 couldn't be read");
  });

  it("hangs a failure off its own step rather than under the card", () => {
    const [task] = activityTasks(withFailure);
    expect(task.steps[0].chips?.[0].label).toBe("CULPA is not responding");
    expect(task.steps[1].chips).toBeUndefined();
  });
});

describe("ToolActivityCard", () => {
  const html = renderToStaticMarkup(<ToolActivityCard activity={sample} isRunning />);

  it("shimmers the header while a step is still being withheld", () => {
    expect(html).toContain("1 step left");
    expect(html).toContain("agent-progress-loading-text");
    expect(html).toContain('aria-expanded="true"');
  });

  it("draws the tree guide instead of numbering the rows", () => {
    // The branch elbow from agent-log's `RowConnector`, which is the whole
    // reason this is a log and not a checklist.
    expect(html).toContain("M0.5 0 V8");
  });

  it("keeps the call in flight out of the tree, and names it on the timer", () => {
    expect(html).toContain("Searching the catalog");
    // Once, on the elapsed line — never as a branch of work already done.
    expect(html.split("Ranking courses for you")).toHaveLength(2);
    expect(html).toContain("Ranking courses for you 0.0s");
  });

  it("shows a failed call's reason on the row that failed", () => {
    const failed = renderToStaticMarkup(<ToolActivityCard activity={withFailure} isRunning />);
    expect(failed).toContain("CULPA is not responding");
    expect(failed).toContain("text-foreground-icon-error");
  });

  it("folds itself once the last call lands", () => {
    const settled = sample.map((entry) => ({ ...entry, state: "done" as const }));
    const done = renderToStaticMarkup(<ToolActivityCard activity={settled} isRunning={false} />);
    expect(done).toContain("2 steps");
    expect(done).toContain('aria-expanded="false"');
    expect(done).not.toContain("Searching the catalog");
  });
});

describe("ThinkingLine", () => {
  it("pairs the ornament with the thinking label, not a spinner", () => {
    const html = renderToStaticMarkup(<ThinkingLine label="Thinking" />);
    expect(html).toContain("Thinking");
    expect(html).not.toContain("animate-spin");
  });

  it("uses thread-sized type and a well wide enough for the disc's bleed", () => {
    const html = renderToStaticMarkup(<ThinkingLine label="Thinking" />);
    expect(html).toContain("text-headline-regular");
    expect(html).toContain("size-10");
  });

  it("shimmers the label while the agent is working", () => {
    const html = renderToStaticMarkup(<ThinkingLine label="Thinking" />);
    expect(html).toContain("agent-progress-loading-text");
  });
});
