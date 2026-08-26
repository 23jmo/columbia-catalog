import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { emptyGuestState } from "@/lib/onboarding/state";

import { FeedPreviewGate } from "./feed-preview-gate";
import { FeedSignInPanel } from "./feed-sign-in-panel";
import { OnboardingScreen } from "./screen";

/**
 * The last onboarding screen used to pin `h-dvh overflow-hidden` and park
 * the sign-in card at `absolute top-44`. On a phone that sheared the
 * Columbia button off the bottom, and a later `max-h` peek hid every card
 * under the gate. These assertions are the layout contract: the shell
 * scrolls, the button stays in flow, and the rest of the feed stays
 * reachable below the sign-in box.
 */
describe("onboarding feed gate layout", () => {
  it("keeps the Columbia button in the sign-in panel markup", () => {
    const html = renderToStaticMarkup(<FeedSignInPanel onSignIn={() => undefined} />);
    expect(html).toContain("Sign in with Columbia");
    expect(html).toContain("Save this and see your feed");
  });

  it("makes the locked screen the scrollport instead of clipping it", () => {
    const html = renderToStaticMarkup(
      <OnboardingScreen question="Here's your first feed." lockViewport>
        <p>gate</p>
      </OnboardingScreen>,
    );
    expect(html).toContain("h-dvh");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("pt-14");
    expect(html).not.toContain("h-dvh overflow-hidden");
    expect(html).not.toContain("h-svh overflow-hidden");
    // Room for an advance arrow this screen does not have.
    expect(html).not.toContain("pb-24");
    expect(html).toContain("safe-area-inset-bottom");
  });

  it("puts the sign-in card in flow between the first card and the rest", () => {
    const html = renderToStaticMarkup(
      <FeedPreviewGate
        state={emptyGuestState()}
        signedIn={false}
        migration={{ status: "idle" }}
        onSignIn={() => undefined}
        onFinish={() => undefined}
      />,
    );
    expect(html).toContain("Sign in with Columbia");
    expect(html).not.toContain("max-h-[min(8.5rem,22svh)]");
    expect(html).not.toContain("top-44");
    expect(html).not.toContain("sm:top-48");

    // Skeletons (and later real cards) are <article>s. The gate sits after
    // the first one so a phone can scroll the rest of the feed.
    const signInAt = html.indexOf("Sign in with Columbia");
    const firstArticle = html.indexOf("<article");
    const lastArticle = html.lastIndexOf("<article");
    expect(firstArticle).toBeGreaterThan(-1);
    expect(lastArticle).toBeGreaterThan(firstArticle);
    expect(signInAt).toBeGreaterThan(firstArticle);
    expect(signInAt).toBeLessThan(lastArticle);
  });
});
