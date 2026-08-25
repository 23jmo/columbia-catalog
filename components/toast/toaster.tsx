"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  RiCheckboxCircleFill,
  RiErrorWarningFill,
  RiInformationFill,
} from "@remixicon/react";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { NotificationViewport } from "@/components/base/notification/notification";
import {
  dismiss,
  getToastServerSnapshot,
  getToastSnapshot,
  holdToast,
  isToastHeld,
  isToastHeldServerSnapshot,
  subscribeToastHold,
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
 * anchoring, `mode="popLayout"`, and the spring layout animation that makes an
 * older toast slide down as a new one lands. That is the fiddly part and it
 * already exists.
 *
 * The card is written here rather than reusing `Notification`, for one
 * reason: `Notification`'s auto-dismiss is a `setTimeout` it owns, and this
 * feature needs a timer that a popover three levels down can pause. Cards
 * below report hover, focus and pin; `lib/toast/store.ts` decides. Everything
 * visual — radii, shadow, status colours, type scale — is the same token set
 * `Notification` uses, so the two are indistinguishable on screen.
 *
 * ── Motion ────────────────────────────────────────────────────────────────
 *
 * The viewport animates the *stack* — where each card sits once it exists.
 * Arrival and departure are the card's own, and belong here because they are
 * the part that carries meaning.
 *
 * A toast at top-center comes from off the top edge, so it enters travelling
 * down and leaves retreating back up: the same path, run backwards. Entry is
 * a zero-bounce spring — a catalog is not a place for a springy toast — and
 * lands from `scale: 0.96` rather than from nothing, so the card reads as
 * something that moved into view rather than something conjured. Exit is
 * roughly half the duration and eased *in*, accelerating away; because the
 * viewport is `popLayout` the card leaves the flow on its first exit frame,
 * so the toast below closes the gap at the same time instead of after.
 *
 * The whole card enters as one piece. Staggering the icon and text behind the
 * card's own arrival would make a reader wait through two animations to reach
 * one sentence, and this is a surface people trigger over and over while
 * saving classes — the kind of place where extra motion turns into a tax.
 *
 * ── The countdown ─────────────────────────────────────────────────────────
 *
 * The store can pause a toast's timer, and until now nothing said so. The
 * hairline along the bottom edge is that timer made visible: it drains for
 * exactly `duration`, and it freezes — mid-drain, exactly where it was — the
 * moment the toast is hovered, focused, or pinned open by the folder picker.
 * It is a CSS animation with its `animation-play-state` toggled rather than a
 * ticking value, so a five-second countdown costs zero re-renders and pauses
 * on the compositor.
 *
 * Errors have no bar, and need none: they are the toasts that do not
 * auto-dismiss.
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

const STATUS_COUNTDOWN = {
  success: "bg-notification-success-foreground",
  error: "bg-notification-error-foreground",
  info: "bg-notification-information-foreground",
} as const;

/**
 * Zero bounce, and ~320ms: long enough for a 400×140 card not to snap, short
 * enough that the sentence is readable before the motion has finished.
 */
const ENTER_TRANSITION = { type: "spring", duration: 0.32, bounce: 0 } as const;

/** Faster than the entrance and eased in — the card accelerates away. */
const EXIT_TRANSITION = { duration: 0.15, ease: [0.4, 0, 1, 1] } as const;

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
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      // `status` rather than `alert` even for errors: these are consequences of
      // something the reader just did, not interruptions, and `alert` on a
      // rolled-back save would talk over whatever they are reading now.
      role="status"
      aria-live="polite"
      initial={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, y: -14, scale: 0.96, filter: "blur(4px)" }
      }
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        transition: reduceMotion ? { duration: 0.15 } : ENTER_TRANSITION,
      }}
      exit={
        reduceMotion
          ? { opacity: 0, transition: { duration: 0.1 } }
          : {
              opacity: 0,
              y: -6,
              scale: 0.96,
              filter: "blur(2px)",
              transition: EXIT_TRANSITION,
            }
      }
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
        <p className="text-body-medium text-balance text-text-primary">{toast.title}</p>
        {toast.description ? (
          <p className="text-body-regular text-pretty text-text-secondary">
            {toast.description}
          </p>
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
        // The glyph is 20px; the pseudo-element takes the target to the 40px
        // minimum without moving anything that is visible.
        className="absolute top-3 right-3 before:absolute before:-inset-2.5 before:content-['']"
      />

      <ToastCountdown toast={toast} />
    </motion.div>
  );
}

/**
 * The bottom-edge hairline that drains over the toast's lifetime.
 *
 * The card is `overflow-visible` so the folder picker can escape it, which
 * means the bar needs its own clip layer. That layer sits inside the card's
 * 1px border, so its radius is the card's minus that border — 15, not 16 —
 * which is what keeps the two curves concentric instead of merely close.
 */
function ToastCountdown({ toast }: { toast: Toast }) {
  const subscribe = useCallback(
    (listener: () => void) => subscribeToastHold(toast.id, listener),
    [toast.id],
  );
  const held = useSyncExternalStore(
    subscribe,
    () => isToastHeld(toast.id),
    isToastHeldServerSnapshot,
  );

  if (toast.duration === null) return null;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[15px]"
    >
      <span
        // Restart the drain when a `dedupeKey` replaces this toast in place.
        // Same id, same DOM node — without a fresh key the bar would keep
        // running down from wherever the previous message left it.
        key={toast.createdAt}
        className={cx(
          // 2px, not the 3px `Notification` uses. On a card this quiet — grey
          // body text, one small status dot — a 3px saturated rule was the
          // loudest thing on it and pulled rank on the action button. At 2px
          // it reads as a margin note about time, which is all it is.
          "animate-toast-countdown absolute inset-x-0 bottom-0 h-0.5 origin-left",
          STATUS_COUNTDOWN[toast.status],
        )}
        style={{
          animationDuration: `${toast.duration}ms`,
          animationPlayState: held ? "paused" : "running",
        }}
      />
    </span>
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
