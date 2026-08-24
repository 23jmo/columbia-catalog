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
}

export function ProfileModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "default",
}: ProfileModalProps) {
  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      className={cx(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]",
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
