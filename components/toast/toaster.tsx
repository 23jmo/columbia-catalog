"use client";

import { useSyncExternalStore } from "react";
import {
  RiCheckboxCircleFill,
  RiErrorWarningFill,
  RiInformationFill,
} from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { NotificationViewport } from "@/components/base/notification/notification";
import {
  dismiss,
  getToastServerSnapshot,
  getToastSnapshot,
  holdToast,
  subscribeToasts,
  type Toast,
} from "@/lib/toast/store";
import { cx } from "@/utils/cx";

/**
 * The toast surface. Mounted once, in `AppShell`.
 *
 * ── What is reused and what is not ─────────────────────────────────────────
 *
 * The stack itself is BoardUI's `NotificationViewport`: portal, top-center
 * anchoring, and the spring layout animation that makes an older toast slide
 * down as a new one lands. That is the fiddly part and it already exists.
 *
 * The card is written here rather than reusing `Notification`, for one
 * reason: `Notification`'s auto-dismiss is a `setTimeout` it owns, and this
 * feature needs a timer that a popover three levels down can pause. Cards
 * below report hover, focus and pin; `lib/toast/store.ts` decides. Everything
 * visual — radii, shadow, status colours, type scale — is the same token set
 * `Notification` uses, so the two are indistinguishable on screen.
 *
 * ── Accessibility ─────────────────────────────────────────────────────────
 *
 * The region is `aria-live="polite"` and never takes focus. A save is not an
 * interruption, and stealing focus mid-typing to announce one would be worse
 * than saying nothing. Every card is reachable by Tab and carries a real
 * dismiss button, so a keyboard user is never stranded next to a toast that
 * will not go away.
 */

const STATUS_ICON = {
  success: RiCheckboxCircleFill,
  error: RiErrorWarningFill,
  info: RiInformationFill,
} as const;

const STATUS_STYLE = {
  success: "bg-notification-success-background text-notification-success-foreground",
  error: "bg-notification-error-background text-notification-error-foreground",
  info: "bg-notification-information-background text-notification-information-foreground",
} as const;

export function Toaster() {
  const { toasts } = useSyncExternalStore(
    subscribeToasts,
    getToastSnapshot,
    getToastServerSnapshot,
  );

  return (
    <NotificationViewport position="top-center" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </NotificationViewport>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const Icon = STATUS_ICON[toast.status];

  return (
    <div
      // `status` rather than `alert` even for errors: these are consequences of
      // something the reader just did, not interruptions, and `alert` on a
      // rolled-back save would talk over whatever they are reading now.
      role="status"
      aria-live="polite"
      onMouseEnter={() => holdToast(toast.id, "hover", true)}
      onMouseLeave={() => holdToast(toast.id, "hover", false)}
      onFocusCapture={() => holdToast(toast.id, "focus", true)}
      onBlurCapture={(event) => {
        // Only release when focus has genuinely left the card. Tabbing from
        // the action to the close button must not restart the countdown.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          holdToast(toast.id, "focus", false);
        }
      }}
      className={cx(
        "relative flex w-full items-start gap-3 overflow-visible p-4 pr-11",
        "rounded-2xl border border-border-button-default",
        "bg-background-primary-default shadow-dropdown",
      )}
    >
      <span
        className={cx(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          STATUS_STYLE[toast.status],
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-body-medium text-text-primary">{toast.title}</p>
        {toast.description ? (
          <p className="text-body-regular text-text-secondary">{toast.description}</p>
        ) : null}

        {toast.action || toast.secondaryAction ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <ToastActionSlot toast={toast} action={toast.action} variant="secondary" />
            <ToastActionSlot toast={toast} action={toast.secondaryAction} variant="ghost" />
          </div>
        ) : null}
      </div>

      <CloseButton
        size="xs"
        aria-label="Dismiss"
        onClick={() => dismiss(toast.id)}
        className="absolute top-3 right-3"
      />
    </div>
  );
}

/**
 * An action is either a plain button or something that renders its own UI.
 *
 * The render form is what the folder picker uses: it is handed `pin`, so it
 * can hold the toast open for as long as it is on screen, and `close`, so it
 * can dismiss the toast when it is done. Neither the store nor this component
 * needs to know what a folder is.
 */
function ToastActionSlot({
  toast,
  action,
  variant,
}: {
  toast: Toast;
  action: Toast["action"];
  variant: "secondary" | "ghost";
}) {
  if (!action) return null;

  if (action.render) {
    return (
      <>
        {action.render({
          pin: (pinned: boolean) => holdToast(toast.id, "pin", pinned),
          close: () => dismiss(toast.id),
        })}
      </>
    );
  }

  return (
    <Button
      size="small"
      variant={variant}
      onClick={() => {
        action.onPress?.();
        dismiss(toast.id);
      }}
    >
      {action.label}
    </Button>
  );
}
