"use client";

import type { ReactNode } from "react";
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";

import { CloseButton } from "@/components/base/buttons/close-button";
import { cx } from "@/utils/cx";

/**
 * The dialog shell the profile screen's three editors share.
 *
 * Lifted out of the first one that needed it rather than reached for up front:
 * the degree editor, the transcript importer and the erase confirmation all
 * want the same overlay, the same entering/exiting motion and the same close
 * affordance, and three copies of that markup would drift.
 *
 * Motion and surface treatment match `components/shell/account-menu.tsx`'s
 * sign-in modal, which is the app's existing dialog precedent.
 */

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Buttons pinned under the body. */
  footer?: ReactNode;
  /** Wider than the default 480px, for the transcript review table. */
  size?: "default" | "wide";
  /**
   * Which stacking tier the overlay sits in.
   *
   * `page` (z-50) is right for a dialog opened from the page itself, which is
   * every profile-screen editor.
   *
   * `above-surface` (z-200) is REQUIRED when the trigger lives inside one of
   * the app's z-100 top surfaces — the settings modal, the course drawer. Both
   * that surface and this overlay portal to `<body>`, so they are siblings in
   * one stacking context and the z-indexes compete directly: at z-50 this
   * dialog opens, takes focus and traps the keyboard while rendering entirely
   * underneath the surface's opaque scrim. The user sees a frozen page and no
   * dialog. There is no visual cue that anything opened at all.
   */
  layer?: "page" | "above-surface";
}

export function ProfileModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "default",
  layer = "page",
}: ProfileModalProps) {
  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      className={cx(
        "fixed inset-0 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]",
        layer === "above-surface" ? "z-200" : "z-50",
        "transition-opacity duration-200 ease-out",
        "data-[entering]:opacity-0 data-[exiting]:opacity-0",
      )}
    >
      <AriaModal
        className={cx(
          "w-full outline-none",
          size === "wide" ? "max-w-[720px]" : "max-w-[480px]",
          "transition duration-200 ease-out",
          "data-[entering]:scale-95 data-[entering]:opacity-0 data-[entering]:blur-[3px]",
          "data-[exiting]:scale-95 data-[exiting]:opacity-0 data-[exiting]:blur-[3px]",
          /*
           * Reduced motion neutralises the scale and the blur and keeps the
           * fade. `transition-none` would be wrong here -- it would drop the
           * opacity too, and the dialog would hard-cut into view over the page
           * it is covering. Same shape as HOVER_CARD_SURFACE.
           */
          "motion-reduce:data-[entering]:scale-100 motion-reduce:data-[exiting]:scale-100",
          "motion-reduce:data-[entering]:blur-none motion-reduce:data-[exiting]:blur-none",
        )}
      >
        <AriaDialog
          aria-label={title}
          className={cx(
            "relative flex max-h-[85dvh] w-full flex-col rounded-3xl border border-border-button-default",
            "bg-background-primary-default p-6 shadow-xs outline-none dark:bg-background-secondary-default",
          )}
        >
          <CloseButton
            size="2xs"
            aria-label={`Close ${title}`}
            onClick={onClose}
            className="absolute top-4 right-4"
          />

          <div className="flex flex-col gap-1.5 pr-8">
            <h2 className="text-title-2-medium text-text-primary">{title}</h2>
            {description ? (
              <div className="text-body-regular text-pretty text-text-secondary">
                {description}
              </div>
            ) : null}
          </div>

          {/* The body scrolls, the header and footer do not — a 60-row
              transcript review must not push the confirm button off-screen. */}
          <div className="-mx-1 mt-5 min-h-0 flex-1 overflow-y-auto px-1">{children}</div>

          {footer ? (
            <div className="mt-5 flex shrink-0 flex-wrap items-center justify-end gap-2.5">
              {footer}
            </div>
          ) : null}
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
