import type { Metadata } from "next";
import { Suspense } from "react";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { OnboardingToaster } from "@/components/onboarding/onboarding-toaster";
import { AuthErrorToast } from "@/components/onboarding/auth-error-toast";
import {
  SOCIAL_DESCRIPTION,
  SOCIAL_IMAGE_ALT,
  SOCIAL_TITLE,
} from "@/lib/marketing/social";
import { listPrograms } from "@/lib/requirements/programs";

/**
 * `/onboarding` — the guess-and-confirm flow.
 *
 * ── A server shell around a client wizard ───────────────────────────────────
 *
 * The only thing this page does on the server is read the program registry,
 * which lives in code and is the same for every visitor. Guest answers live
 * in the browser until sign-in flushes them.
 *
 * That makes the whole route prerenderable, and it is — but only because it
 * takes no dynamic input. It used to `await searchParams` to pick up the
 * `auth_error` a failed OAuth lands here with, and awaiting search params is
 * enough on its own to force a server render on every single visit. The
 * document then came from the function region rather than the CDN edge, and
 * carried `cache-control: private, no-store`, for a query param that is absent
 * from all but a handful of visits. `AuthErrorToast` reads it from the browser
 * now; its header has the argument.
 *
 * Unsigned visitors are sent here by `proxy.ts`. This route itself never
 * bounces anyone away: a signed-in student who wants to redo setup follows a
 * link from their profile, and sending them home would make the wizard
 * unreachable exactly when they have decided they want it.
 *
 * ── No shell: this route is a takeover ──────────────────────────────────────
 *
 * Every other route wraps itself in `AppShell` — nav rail, mobile hamburger,
 * header. This one renders the flow as the page's only child, edge to edge,
 * with nothing to wander off into. A student in setup has one job, and a nav
 * rail is five invitations to abandon it half-finished; a half-finished profile
 * is worse than none, because it holds enough coursework to look answered and
 * not enough to audit against.
 *
 * The cost of dropping the shell is that everything the shell mounts has to be
 * accounted for. Most of it should not be here: `RefreshWorker` crawls the
 * directory on idle and has no business competing with a first-run flow for
 * bandwidth, and the bookmark, watchlist and plan providers all serve surfaces
 * this route does not have. A toast surface is the exception and is mounted
 * below — the coursework screen offers the transcript import through it, and
 * without a surface the offer would never appear. It is `OnboardingToaster`
 * rather than the app's `Toaster` for one reason, explained there: the app's is
 * pinned top-centre, which on this route is where the question is.
 */

export const metadata: Metadata = {
  metadataBase: new URL("https://lionplan.org"),
  title: "Get started · LionPlan",
  description:
    "Tell us your school, your major and what you've taken, and we'll work out what you should take next.",
  openGraph: {
    title: SOCIAL_TITLE,
    description: SOCIAL_DESCRIPTION,
    url: "https://lionplan.org",
    siteName: "LionPlan",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: SOCIAL_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SOCIAL_TITLE,
    description: SOCIAL_DESCRIPTION,
    images: [{ url: "/twitter-image", alt: SOCIAL_IMAGE_ALT }],
  },
};

export default function OnboardingPage() {
  /*
   * `listPrograms()` reads authored + parsed programs from the registry. Cores
   * are filtered out inside the step: a Columbia College student cannot elect
   * out of the Core, so offering it as a checkbox would imply they could.
   */
  const programOptions = listPrograms().map((program) => ({
    id: program.id,
    name: program.name,
    kind: program.kind,
    school: program.school,
    origin: program.origin,
  }));

  return (
    <>
      {/* The one toast surface on this route. Same store, bottom edge. */}
      <OnboardingToaster />
      {/*
        `useSearchParams` makes its subtree client-rendered, which Next requires
        a Suspense boundary for. Both this boundary's fallback and its child
        render nothing — the toast is raised from an effect — so the boundary is
        a formality rather than a hole in the page.
      */}
      <Suspense fallback={null}>
        <AuthErrorToast />
      </Suspense>
      <OnboardingFlow programOptions={programOptions} />
    </>
  );
}
