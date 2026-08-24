import type { Metadata } from "next";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { OnboardingToaster } from "@/components/onboarding/onboarding-toaster";
import { listPrograms } from "@/lib/requirements/programs";

/**
 * `/onboarding` — the guess-and-confirm flow.
 *
 * ── A server shell around a client wizard, and nothing more ─────────────────
 *
 * The only thing this page does on the server is read the program registry,
 * which lives in code and is the same for every visitor. Everything else is a
 * guest's own state in their own browser, so there is nothing here to
 * personalise and nothing to fetch per request.
 *
 * That is why there is no session check and no redirect. Onboarding is
 * guest-allowed by design — a visitor completes all five steps, sees the first
 * feed, and only then meets the sign-in gate. A route that required an account
 * to reach would invert the whole flow.
 *
 * ── No shell: this route is a takeover ──────────────────────────────────────
 *
 * Every other route wraps itself in `AppShell` — nav rail, mobile tab bar,
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
 *
 * ── Why this route does not redirect a returning visitor away ───────────────
 *
 * The completion cookie (`cc_onboarded`) exists so OTHER routes can skip
 * sending someone here. This route itself always renders: a student who wants
 * to redo their setup types the URL or follows a link from their profile, and
 * bouncing them off it would make the wizard unreachable exactly when someone
 * has decided they want it.
 */

export const metadata: Metadata = {
  title: "Get started · Columbia Catalog",
  description:
    "Tell us your school, your major and what you've taken, and we'll work out what you should take next.",
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
      <OnboardingFlow programOptions={programOptions} />
    </>
  );
}
