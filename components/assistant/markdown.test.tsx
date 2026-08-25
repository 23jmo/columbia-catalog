import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssistantMarkdown } from "./markdown";

describe("AssistantMarkdown", () => {
  it("renders bold, a list, and an in-app link", () => {
    const html = renderToStaticMarkup(
      <AssistantMarkdown source={"Take **Databases**.\n\n- one\n- two\n\n[Open](/course/COMS4111W)"} />,
    );
    expect(html).toContain("<strong");
    expect(html).toContain("Databases");
    expect(html).toContain("<ul");
    expect(html).toContain('href="/course/COMS4111W"');
  });

  it("does not turn a javascript href into an anchor", () => {
    const html = renderToStaticMarkup(
      <AssistantMarkdown source={"[x](javascript:alert(1))"} />,
    );
    expect(html).not.toContain("<a");
    expect(html).toContain("[x](javascript:alert(1))");
  });
});
