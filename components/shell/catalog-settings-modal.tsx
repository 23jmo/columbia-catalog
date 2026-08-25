"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RiCloseLine, RiSchoolLine, RiSettings6Line } from "@remixicon/react";

import { cx } from "@/utils/cx";

import { CatalogSettingsAccount } from "./catalog-settings-account";
import { CatalogSettingsGeneral } from "./catalog-settings-general";

type CatalogSettingsPage = "general" | "account";

const PAGE_TITLES: Record<CatalogSettingsPage, string> = {
  general: "General",
  account: "Account",
};

export interface CatalogSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSupport: () => void;
  defaultPage?: CatalogSettingsPage;
}

/**
 * Columbia-specific settings — same BoardUI modal shell, catalog content.
 *
 * Desktop keeps the 871×614 two-pane layout. Below `sm` the panel goes
 * edge-to-edge, the section picker becomes a horizontal tab bar, and the
 * content column gets the full width.
 */
export function CatalogSettingsModal({
  isOpen,
  onClose,
  onSupport,
  defaultPage = "general",
}: CatalogSettingsModalProps) {
  const [page, setPage] = useState<CatalogSettingsPage>(defaultPage);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [contentScrolled, setContentScrolled] = useState(false);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
      setPage(defaultPage);
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      unmountTimer.current = setTimeout(() => setMounted(false), 320);
    }
    return () => {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
    };
  }, [isOpen, defaultPage]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  const navItems: { page: CatalogSettingsPage; label: string; icon: typeof RiSettings6Line }[] = [
    { page: "general", label: "General", icon: RiSettings6Line },
    { page: "account", label: "Account", icon: RiSchoolLine },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close settings"
        tabIndex={-1}
        onClick={onClose}
        className={cx(
          "absolute inset-0 cursor-default bg-black/70 transition-opacity duration-300 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        className={cx(
          "relative w-full transform-gpu transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[opacity,transform,filter] sm:w-auto",
          visible
            ? "translate-y-0 scale-100 opacity-100 blur-0"
            : "translate-y-4 scale-[0.98] opacity-0 blur-[4px] sm:translate-y-0 sm:scale-[0.85]",
        )}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          tabIndex={-1}
          className={cx(
            "relative flex overflow-clip bg-background-full shadow-xs outline-none",
            // Phone: full-height sheet. Desktop: centered card.
            "h-[100dvh] max-h-[100dvh] w-full flex-col rounded-none",
            "sm:h-[614px] sm:max-h-[calc(100dvh-32px)] sm:w-[871px] sm:max-w-[calc(100vw-32px)] sm:flex-row sm:rounded-3xl",
          )}
        >
          {/* Section picker — horizontal tabs on phone, left rail on desktop */}
          <nav
            aria-label="Settings sections"
            className={cx(
              "shrink-0 border-separator-border bg-background-secondary-default",
              "flex w-full flex-row gap-1 border-b p-2",
              "sm:w-[274px] sm:flex-col sm:gap-5 sm:overflow-y-auto sm:border-r sm:border-b-0 sm:p-2.5",
            )}
          >
            <div className="flex w-full flex-col gap-1.5 sm:pt-1">
              <span className="hidden pl-2 text-body-medium text-text-secondary sm:block">Settings</span>
              <div className="flex w-full flex-row gap-1 sm:flex-col">
                {navItems.map((item) => {
                  const selected = item.page === page;
                  return (
                    <button
                      key={item.page}
                      type="button"
                      aria-current={selected ? "page" : undefined}
                      onClick={() => {
                        setPage(item.page);
                        setContentScrolled(false);
                      }}
                      className={cx(
                        "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2lg p-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring sm:flex-none sm:justify-start sm:p-2",
                        selected
                          ? "bg-background-secondary-hover"
                          : "hover:bg-background-secondary-hover/60",
                      )}
                    >
                      <item.icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                      <span
                        className={cx(
                          "truncate text-body-medium",
                          selected ? "text-text-primary" : "text-text-secondary",
                        )}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2 sm:px-8 sm:pt-8 sm:pb-3">
              <h2 className="text-title-3-medium text-text-primary">{PAGE_TITLES[page]}</h2>
              <button
                type="button"
                aria-label="Close settings"
                onClick={onClose}
                className={cx(
                  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full sm:size-6",
                  "bg-background-tertiary-default text-foreground-icon-secondary",
                  "transition-colors duration-150 hover:bg-background-tertiary-hover",
                  "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                )}
              >
                <RiCloseLine className="size-4" aria-hidden />
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              <div
                className="h-full overflow-y-auto px-4 pb-6 sm:px-8 sm:pb-8"
                onScroll={(event) => setContentScrolled(event.currentTarget.scrollTop > 0)}
              >
                {page === "account" ? (
                  <CatalogSettingsAccount onClose={onClose} />
                ) : (
                  <CatalogSettingsGeneral onSupport={onSupport} />
                )}
              </div>
              <div
                aria-hidden
                className={cx(
                  "pointer-events-none absolute inset-x-0 top-0 h-10 bg-linear-to-b from-background-primary-default to-transparent",
                  "transition-opacity duration-200 ease-out",
                  contentScrolled ? "opacity-100" : "opacity-0",
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
