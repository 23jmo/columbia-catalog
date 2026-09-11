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
    expect(html).toContain("sm:rounded-2xl");
  });

  it("leaves no unscoped class for the desktop branch to inherit", () => {
    /*
     * The bug this exists for: the folded shape carried a bare `items-center`
     * that nothing above `sm` overrode, so at desktop width the box was
     * `sm:flex-col` AND `items-center` — a column centring its children. The
     * `w-full` textarea was unaffected, but the `shrink-0` control row
     * collapsed to its own width and floated to the middle, so `+`, the term
     * and send sat in the centre of the box instead of spanning it. It
     * corrected itself on click, because focus ends the folded state, which is
     * why it read as a flicker rather than as broken layout.
     *
     * The rule that prevents the next one: a class in the folded branch either
     * has an `sm:` counterpart or is scoped `max-sm:` itself. Alignment is
     * checked here because it is the property that had no counterpart; the
     * shape classes are covered by the test above.
     */
    const shell = html.match(/<div class="relative flex gap-2[^"]*"/)?.[0] ?? "";
    expect(shell).not.toBe("");
    expect(shell).toContain("max-sm:items-center");
    // The unscoped form is the bug, verbatim.
    expect(shell).not.toMatch(/(^|\s)items-center/);
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
