"use client";

import type { ReactNode } from "react";
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";

import { cx } from "@/utils/cx";

import "./sheet.css";

/**
 * The one overlay the schedule uses.
 *
 * A bottom sheet on a phone — anchored to the thumb, dragged edge at the top,
 * safe-area padding under the last button — and a centred dialog from `sm`
 * up. One component so the three flows (a class, adding, sharing) open the
 * same way and close the same way: tap outside, Escape, or the close control.
 *
 * Controlled, not trigger-based: the week grid opens a sheet from a tap on
 * any of forty rectangles, and a `DialogTrigger` wants exactly one button.
 */

export interface SheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Visually hidden when false; the title is still announced. */
  showTitle?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
}

export function Sheet({ isOpen, onOpenChange, title, showTitle = true, children, className }: SheetProps) {
  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center sm:p-4"
    >
      <AriaModal className="sheet-panel w-full outline-none sm:max-w-md">
        <AriaDialog
          className={cx(
            "flex max-h-[88dvh] flex-col overflow-hidden outline-none",
            "rounded-t-3xl border border-border-button-default bg-background-primary-default shadow-dropdown",
            "pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:rounded-2xl sm:pb-0",
            className,
          )}
        >
          {({ close }) => (
            <>
              <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-button-default sm:hidden" />
              <h2
                slot="title"
                className={cx(
                  "shrink-0 px-5 pt-3 text-headline-semibold text-text-primary sm:pt-5",
                  !showTitle && "sr-only",
                )}
              >
                {title}
              </h2>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                {typeof children === "function" ? children(close) : children}
              </div>
            </>
          )}
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
