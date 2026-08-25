import { describe, expect, it } from "vitest";

import { parseMarkdown, safeHref } from "./markdown";

describe("safeHref", () => {
  it("keeps https and in-app paths", () => {
    expect(safeHref("https://vergil.columbia.edu/x")).toMatch(/^https:\/\//);
    expect(safeHref("/course/COMS4111W")).toBe("/course/COMS4111W");
  });

  it("drops javascript and protocol-relative URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example/x")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
  });
});

describe("parseMarkdown", () => {
  it("parses headings, lists, and emphasis", () => {
    const blocks = parseMarkdown("## Why this\n\nTake **Databases** — it is *close*.\n\n- one\n- two");
    expect(blocks[0]).toMatchObject({ type: "h", level: 2 });
    expect(blocks[1]).toMatchObject({ type: "p" });
    expect(blocks[2]).toMatchObject({ type: "ul" });
    const paragraph = blocks[1] as { children: unknown[] };
    expect(paragraph.children).toEqual([
      { type: "text", value: "Take " },
      { type: "strong", children: [{ type: "text", value: "Databases" }] },
      { type: "text", value: " — it is " },
      { type: "em", children: [{ type: "text", value: "close" }] },
      { type: "text", value: "." },
    ]);
  });

  it("keeps fenced code and ordered lists", () => {
    const blocks = parseMarkdown("```\nCOMS W4111\n```\n\n1. first\n2. second");
    expect(blocks[0]).toEqual({ type: "pre", value: "COMS W4111" });
    expect(blocks[1]).toMatchObject({ type: "ol" });
  });

  it("renders a safe link and leaves an unsafe one as text", () => {
    const safe = parseMarkdown("[Vergil](https://vergil.columbia.edu/)");
    expect(safe[0]).toMatchObject({ type: "p" });
    const children = (safe[0] as { children: { type: string }[] }).children;
    expect(children[0]).toMatchObject({ type: "link", href: "https://vergil.columbia.edu/" });

    const unsafe = parseMarkdown("[x](javascript:alert(1))");
    expect((unsafe[0] as { children: { type: string; value?: string }[] }).children[0]).toMatchObject(
      { type: "text", value: "[x](javascript:alert(1))" },
    );
  });

  it("treats incomplete markers as text so a stream does not throw", () => {
    const blocks = parseMarkdown("Wait **still");
    expect(blocks[0]).toEqual({
      type: "p",
      children: [{ type: "text", value: "Wait **still" }],
    });
  });
});
