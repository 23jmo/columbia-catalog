import { RiErrorWarningLine } from "@remixicon/react";

/**
 * Why a sign-in did not take.
 *
 * `/auth/callback` bounces a rejected sign-in back to `/?auth_error=<reason>`
 * and, until now, nothing rendered it. A student who signed in with a personal
 * Gmail — or whose account was refused for any other reason — landed on the
 * home page signed out, with the page looking exactly as it does when someone
 * simply closes Google's chooser. They would try again, get the same nothing,
 * and conclude the site is broken.
 *
 * A cancelled sign-in still redirects with no error param and still shows
 * nothing, which is right: changing your mind is not a failure.
 */

const REASONS: Record<string, string> = {
  ineligible_domain:
    "That Google account is not a Columbia or Barnard one. Saving plans and watching sections need a columbia.edu or barnard.edu address — everything else here is free to read without signing in.",
  exchange_failed:
    "Google signed you in but the hand-off back to this site failed. Trying again usually works; if it does not, the link may have already been used.",
  missing_code: "That sign-in link is incomplete. Start again from the sign-in button.",
  not_configured: "Sign-in is not available on this deployment.",
};

export function AuthErrorNotice({ reason }: { reason?: string | string[] }) {
  const key = Array.isArray(reason) ? reason[0] : reason;
  if (!key) return null;

  // An unrecognised reason still gets a message. Silence is the failure mode
  // this component exists to remove, so falling back to nothing would reinstate
  // it for exactly the cases nobody anticipated.
  const message = REASONS[key] ?? "Sign-in did not complete. Please try again.";

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-2lg bg-background-secondary-default p-3"
    >
      <RiErrorWarningLine
        className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
        aria-hidden
      />
      <p className="text-caption-1-regular text-text-secondary">{message}</p>
    </div>
  );
}
