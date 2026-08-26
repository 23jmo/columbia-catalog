"use client";

import { useSyncExternalStore } from "react";
import { RiCloseLine } from "@remixicon/react";

import { NotificationViewport } from "@/components/base/notification/notification";
import {
  dismiss,
  getToastServerSnapshot,
  getToastSnapshot,
  subscribeToasts,
} from "@/lib/toast/store";
import { cx } from "@/utils/cx";

/**
 * The toast surface for the onboarding route, anchored bottom-centre.
 *
 * ── Why not `components/toast/toaster.tsx` ──────────────────────────────────
 *
 * Same store, same queue, same dedupe, same dismissal — this is not a second
 * toast mechanism and deliberately does not own one. `lib/toast/store.ts` is
 * still the only place a toast exists; only the anchor and the card are
 * different, and both differ for the same reason.
 *
 * The app's `Toaster` is pinned `top-center`, which on every other screen sits
 * over a nav bar and is exactly right. On this route the top-centre of the
 * viewport is the ornament and the question — the two things the whole screen
 * exists to show — and a 400px card lands squarely on them. Anchoring is baked
 * into `Toaster` itself, so honouring "pinned bottom-centre" without touching a
 * file this lane does not own meant rendering the same store through the same
 * `NotificationViewport` at the other edge.
 *
 * The card is quieter than the app's: no status icon, no colour. The one toast
 * this route raises is an offer, not a consequence of something the student
 * just did, and a success-green tick on "want to import your transcript?"
 * would be answering a question nobody asked.
 */
export function OnboardingToaster() {
  const { toasts } = useSyncExternalStore(
    subscribeToasts,
    getToastSnapshot,
    getToastServerSnapshot,
  );

  return (
    <NotificationViewport position="bottom-center" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={cx(
            "relative flex w-full items-start gap-3 rounded-2xl border bg-background-full p-4 pr-11 shadow-dropdown",
            toast.status === "error"
              ? "border-text-error-primary/40"
              : "border-border-button-default",
          )}
        >
          <div className="min-w-0 flex-1">
            <p
              className={cx(
                "text-body-medium",
                toast.status === "error" ? "text-text-error-primary" : "text-text-primary",
              )}
            >
              {toast.title}
            </p>
            {toast.description ? (
              <p className="mt-0.5 text-caption-1-regular text-text-secondary">
                {toast.description}
              </p>
            ) : null}
            {toast.action?.label ? (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onPress?.();
                  // The offer has been taken; leaving it on screen would sit
                  // over the panel it just opened.
                  dismiss(toast.id);
                }}
                className="mt-2 cursor-pointer rounded-lg text-body-medium text-accent-500 underline-offset-4 hover:underline"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
            className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-background-secondary-hover hover:text-text-primary"
          >
            <RiCloseLine className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </NotificationViewport>
  );
}
