import { renderToStaticMarkup } from "react-dom/server";
import type { ChatStatus } from "ai";
import { describe, expect, it } from "vitest";

import { Composer } from "./composer";

/**
 * The phone composer folds to a pill at rest and becomes the full field the
 * moment there is anything to protect. `isFocused` is internal, so a static
 * render always starts unfocused — which is exactly the state worth pinning,
 * because it is the one the predicate has to get right on its own.
 */
function markup(value: string, status: ChatStatus) {
  return renderToStaticMarkup(
    <Composer
      value={value}
      onChange={() => {}}
      onSubmit={() => {}}
      onStop={() => {}}
      onNewThread={() => {}}
      status={status}
      canStartNewThread
      promptsUsed={0}
      promptsLimit={20}
      termLabel="Spring 2026"
    />,
  );
}

describe("Composer, folded", () => {
  const html = markup("", "ready");

  it("is a pill when empty and idle", () => {
    expect(html).toContain("rounded-full");
    expect(html).toContain("flex-row");
    expect(html).not.toContain("min-h-[7rem] flex-col");
  });

  it("keeps the desktop field regardless, via the sm: branch", () => {
    // The collapse must never reach a wide screen. These are emitted inside a
    // media query, so their presence is what guarantees that.
    expect(html).toContain("sm:min-h-[7rem]");
    expect(html).toContain("sm:flex-col");
    expect(html).toContain("sm:rounded-3xl");
  });

  it("drops the controls that have nowhere to sit in one row", () => {
    // `max-sm:hidden` on new-thread, history and the rate-limit footnote.
    expect(html.match(/max-sm:hidden/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toContain("max-sm:contents");
  });
});

describe("Composer, unfolded", () => {
  it("opens as soon as there is a half-typed question to protect", () => {
    const html = markup("what should I take", "ready");
    expect(html).toContain("min-h-[7rem] flex-col");
    expect(html).not.toContain("max-sm:contents");
  });

  it("stays open while the answer is streaming, so stop stays reachable", () => {
    // Empty value — only `isBusy` is holding it open.
    const html = markup("", "streaming");
    expect(html).toContain("min-h-[7rem] flex-col");
    expect(html).not.toContain("max-sm:contents");
  });
});
