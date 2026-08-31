import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CHAT_PATH } from "@/lib/agent/history-format";

import { ChatFab } from "./chat-fab";

/**
 * The button is a link, not a click handler that pushes. That is the whole
 * contract: a student with JS off, or a crawler, still reaches `/chat`.
 */
function markup(hidden?: boolean) {
  return renderToStaticMarkup(<ChatFab hidden={hidden} />);
}

describe("ChatFab", () => {
  it("is a link to the chat page", () => {
    const html = markup();
    expect(html).toContain(`href="${CHAT_PATH}"`);
    expect(html).toContain("Open chat");
    // Opts the link into the iOS switch overlay — it is not a <button>.
    expect(html).toContain("data-haptic");
  });

  it("renders nothing when asked to hide", () => {
    expect(markup(true)).toBe("");
  });

  it("stays on the viewport, not in the page card's transform", () => {
    // `fixed` is the property that would attach to the mobile shell's
    // `translate3d` if this were mounted inside that card. The class is the
    // cheap assertion that the button still claims the viewport.
    expect(markup()).toContain("fixed");
  });
});
