import { RiErrorWarningLine } from "@remixicon/react";

/**
 * Why a sign-in did not take.
 *
 * `/auth/callback` bounces a rejected sign-in back to
 * `/onboarding?auth_error=<reason>`. A student who signed in with a personal
 * Gmail — or whose account was refused for any other reason — would otherwise
 * land on the first question signed out, with the page looking exactly as it
 * does when someone simply closes Google's chooser. They would try again, get
 * the same nothing, and conclude the site is broken.
 *
 * A cancelled sign-in still redirects with no error param and still shows
 * nothing, which is right: changing your mind is not a failure.
 */

const REASONS: Record<string, { title: string; description: string }> = {
  ineligible_domain: {
    title: "You have to sign in with a Columbia email",
    description: "Use a columbia.edu or barnard.edu Google account.",
  },
  exchange_failed: {
    title: "Sign-in did not complete",
    description:
      "Google signed you in but the hand-off back to this site failed. Trying again usually works; if it does not, the link may have already been used.",
  },
  missing_code: {
    title: "Sign-in did not complete",
    description: "That sign-in link is incomplete. Start again from the sign-in button.",
  },
  not_configured: {
    title: "Sign-in is not available",
    description: "Sign-in is not available on this deployment.",
  },
};

export function authErrorCopy(reason?: string | string[]): { title: string; description: string } {
  const key = Array.isArray(reason) ? reason[0] : reason;
  if (!key) {
    return { title: "Sign-in did not complete", description: "Please try again." };
  }
  return (
    REASONS[key] ?? {
      title: "Sign-in did not complete",
      description: "Please try again.",
    }
  );
}

export function AuthErrorNotice({ reason }: { reason?: string | string[] }) {
  const key = Array.isArray(reason) ? reason[0] : reason;
  if (!key) return null;

  const message = authErrorCopy(reason);

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-2lg bg-background-secondary-default p-3"
    >
      <RiErrorWarningLine
        className="mt-px size-4 shrink-0 text-foreground-icon-tertiary"
        aria-hidden
      />
      <p className="text-caption-1-regular text-text-secondary">
        {message.title}. {message.description}
      </p>
    </div>
  );
}
