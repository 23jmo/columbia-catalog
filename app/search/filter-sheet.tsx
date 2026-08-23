"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { cx } from "@/utils/cx";

/**
 * The phone-width home for the filter panel.
 *
 * `Filters` is layout-agnostic by design, so this file only supplies a
 * container: a bottom sheet, because at 390px a filter panel that pushes the
 * results off screen loses the thing being filtered. Filters apply live while
 * the sheet is open — there is no Apply button, since a toggle costs a
 * synchronous pass over an in-memory array.
 *
 * Modal behaviour is hand-rolled rather than pulled from a dialog library:
 * Escape and the backdrop close it, focus moves in on open and returns to the
 * trigger on close, and Tab cycles inside while it is open.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface FilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function FilterSheet({ isOpen, onClose, children }: FilterSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // The page behind must not scroll under the sheet.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusTo.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:hidden" role="presentation">
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[85dvh] w-full flex-col rounded-t-2lg",
          "border-t border-border-table bg-background-primary-default shadow-xl outline-none",
        )}
      >
        <div className="flex items-center justify-between border-b border-border-table px-4 py-3">
          <h2 className="text-headline-semibold text-text-primary">Filters</h2>
          <CloseButton size="md" aria-label="Close filters" onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">
          {children}
        </div>

        <div className="border-t border-border-table p-3">
          {/* Results are already filtered behind the sheet; this only dismisses. */}
          <Button className="w-full" onClick={onClose}>
            See results
          </Button>
        </div>
      </div>
    </div>
  );
}
