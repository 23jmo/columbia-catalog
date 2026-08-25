import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { emptyGuestState } from "@/lib/onboarding/state";

import { FeedPreviewGate } from "./feed-preview-gate";
import { FeedSignInPanel } from "./feed-sign-in-panel";
import { OnboardingScreen } from "./screen";

/**
 * The last onboarding screen used to pin `h-dvh overflow-hidden` and park
 * the sign-in card at `absolute top-44`. On a phone that sheared the
 * Columbia button off the bottom, and the document lock stopped anyone
 * from scrolling to it. These assertions are the layout contract that
 * keeps the button in the document flow.
 */
describe("onboarding feed gate layout", () => {
  it("keeps the Columbia button in the sign-in panel markup", () => {
    const html = renderToStaticMarkup(<FeedSignInPanel onSignIn={() => undefined} />);
    expect(html).toContain("Sign in with Columbia");
    expect(html).toContain("Save this and see your feed");
  });

  it("does not pin the locked screen to a clipped viewport", () => {
    const html = renderToStaticMarkup(
      <OnboardingScreen question="Here's your first feed." lockViewport>
        <p>gate</p>
      </OnboardingScreen>,
    );
    expect(html).toContain("min-h-dvh");
    expect(html).not.toContain("h-dvh overflow-hidden");
    expect(html).not.toContain("h-svh overflow-hidden");
    // Room for an advance arrow this screen does not have.
    expect(html).not.toContain("pb-24");
    expect(html).toContain("safe-area-inset-bottom");
  });

  it("puts the sign-in card in flow under a clipped peek, not at a fixed top", () => {
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
    expect(html).toContain("max-h-[min(11rem,28svh)]");
    expect(html).not.toContain("top-44");
    expect(html).not.toContain("sm:top-48");
  });
});
