"use client";

import { useState, useTransition, type ComponentType, type ReactNode } from "react";
import { RiCustomerServiceLine, RiSettings4Line } from "@remixicon/react";

import { CatalogSettingsModal } from "@/components/shell/catalog-settings-modal";
import { haptic } from "@/lib/haptics";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

function Collapsible({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={cx(
        "flex min-w-0 items-center overflow-hidden transition-[max-width,opacity] duration-300 ease-in-out motion-reduce:transition-none",
        collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100",
      )}
    >
      {children}
    </span>
  );
}

function SecondaryNavItem({
  icon: Icon,
  label,
  collapsed,
  onClick,
  disabled,
}: {
  icon: IconComponent;
  label: string;
  collapsed: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cx(
        "flex cursor-pointer items-center overflow-hidden rounded-2lg p-2 text-left",
        "transition-[width,background-color,opacity] duration-300 ease-in-out motion-reduce:transition-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        "hover:bg-background-secondary-hover disabled:cursor-not-allowed disabled:opacity-50",
        collapsed ? "size-9 justify-center" : "w-full",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <Collapsible collapsed={collapsed}>
          <span className="text-body-medium whitespace-nowrap text-text-secondary">{label}</span>
        </Collapsible>
      </span>
    </button>
  );
}

/**
 * Footer links below primary nav — Support (Stripe tip) and Settings modal.
 */
export function SidebarSecondaryNav({ collapsed }: { collapsed: boolean }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [supportPending, startSupport] = useTransition();

  const paymentLink = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK?.trim();

  const openSupport = () => {
    haptic("selection");
    if (paymentLink) {
      window.open(paymentLink, "_blank", "noopener,noreferrer");
      return;
    }
    startSupport(() => {
      window.location.assign("/api/support/checkout");
    });
  };

  return (
    <>
      <nav className={cx("flex w-full flex-col gap-1", !collapsed && "px-0.5")} aria-label="Secondary">
        <SecondaryNavItem
          icon={RiCustomerServiceLine}
          label="Support"
          collapsed={collapsed}
          onClick={openSupport}
          disabled={supportPending}
        />
        <SecondaryNavItem
          icon={RiSettings4Line}
          label="Settings"
          collapsed={collapsed}
          onClick={() => {
            haptic("selection");
            setSettingsOpen(true);
          }}
        />
      </nav>

      <CatalogSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSupport={openSupport}
      />
    </>
  );
}
