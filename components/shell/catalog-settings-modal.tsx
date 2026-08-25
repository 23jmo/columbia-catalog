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
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" role="presentation">
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
          "relative transform-gpu transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[opacity,transform,filter]",
          visible ? "scale-100 opacity-100 blur-0" : "scale-[0.85] opacity-0 blur-[4px]",
        )}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          tabIndex={-1}
          className="relative flex h-[614px] max-h-[calc(100dvh-32px)] w-[871px] max-w-[calc(100vw-32px)] overflow-clip rounded-3xl bg-background-full shadow-xs outline-none"
        >
          <nav
            aria-label="Settings sections"
            className="flex w-[274px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-separator-border bg-background-secondary-default p-2.5"
          >
            <div className="flex w-full flex-col gap-1.5 pt-1">
              <span className="pl-2 text-body-medium text-text-secondary">Settings</span>
              <div className="flex w-full flex-col gap-1">
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
                        "flex w-full cursor-pointer items-center gap-2 rounded-2lg p-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
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

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between px-8 pt-8 pb-3">
              <h2 className="text-title-3-medium text-text-primary">{PAGE_TITLES[page]}</h2>
              <button
                type="button"
                aria-label="Close settings"
                onClick={onClose}
                className={cx(
                  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full",
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
                className="h-full overflow-y-auto px-8 pb-8"
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
