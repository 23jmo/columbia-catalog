"use client";

import { useState } from "react";
import { RiMenuLine } from "@remixicon/react";
import { Modal as AriaModal, ModalOverlay as AriaModalOverlay } from "react-aria-components";

import { AccountMenu } from "@/components/shell/account-menu";
import { CatalogSidebar } from "@/components/shell/catalog-sidebar";
import type { ShellNavKey } from "@/components/shell/nav";
import { TermSwitcher } from "@/components/shell/term-switcher";
import { ShellWordmark } from "@/components/shell/wordmark";
import { cx } from "@/utils/cx";

/**
 * The phone/tablet half of the app chrome: a sticky bar plus a slide-in sheet
 * carrying the same three destinations as the desktop rail. Rendered below
 * `lg`; the rail takes over above it.
 */
export function MobileNavBar({ activeNav }: { activeNav: ShellNavKey }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-border-table bg-background-full px-3 pt-[env(safe-area-inset-top,0px)] lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={isOpen}
            onClick={() => setIsOpen(true)}
            className={cx(
              "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-2lg",
              "text-foreground-icon-secondary transition-colors duration-150 ease",
              "hover:bg-background-secondary-hover hover:text-foreground-icon-primary",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <RiMenuLine className="size-5" aria-hidden />
          </button>
          <ShellWordmark compact />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <TermSwitcher compact />
          <AccountMenu compact />
        </div>
      </header>

      <AriaModalOverlay
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        isDismissable
        className={cx(
          "fixed inset-0 z-50 flex bg-black/20 backdrop-blur-[2px] lg:hidden",
          "transition-opacity duration-200 ease-out",
          "data-[entering]:opacity-0 data-[exiting]:opacity-0",
        )}
      >
        <AriaModal
          className={cx(
            "h-full w-[288px] max-w-[86vw] outline-none pl-[env(safe-area-inset-left,0px)]",
            "transition-transform duration-200 ease-out",
            "data-[entering]:-translate-x-full data-[exiting]:-translate-x-full",
          )}
        >
          <CatalogSidebar
            activeNav={activeNav}
            mobile
            flat
            fluid
            onClose={() => setIsOpen(false)}
            onNavigate={() => setIsOpen(false)}
            className="h-full"
          />
        </AriaModal>
      </AriaModalOverlay>
    </>
  );
}
