import type { ComponentType, ReactNode } from "react";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type StatTone = "default" | "alert" | "accent";

export interface StatProps {
  icon?: IconComponent;
  label: string;
  /** The number. Set in tabular-nums so a strip of these does not jitter. */
  value: ReactNode;
  /** The qualifier under the number — units, context, "no soft notes". */
  detail?: ReactNode;
  tone?: StatTone;
}

/**
 * One number, stated loudly.
 *
 * The previous version rendered its value at `title-3` (18px) — barely larger
 * than the 12px label above it — so a four-stat strip read as eight lines of
 * near-identical text rather than four numbers. `title-1` (24px) at the small
 * end and `display-3` (40px) in `emphasis` mode restores the ratio that makes
 * a stat legible at a glance: the number should dominate its own card.
 *
 * Tone is never carried by colour alone (spec §18) — the icon changes with it
 * and callers pass an explicit `detail` string, so an alert stat still reads
 * as an alert in greyscale.
 */
const TONE_VALUE_CLASS: Record<StatTone, string> = {
  default: "text-text-primary",
  alert: "text-status-rose-text",
  accent: "text-accent-600",
};

const TONE_ICON_CLASS: Record<StatTone, string> = {
  default: "text-foreground-icon-tertiary",
  alert: "text-status-rose-text",
  accent: "text-accent-500",
};

export function Stat({ icon: Icon, label, value, detail, tone = "default" }: StatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2lg bg-background-inner-default p-3.5">
      <dt className="flex items-center gap-1.5">
        {Icon ? (
          <Icon className={cx("size-4 shrink-0", TONE_ICON_CLASS[tone])} aria-hidden />
        ) : null}
        <span className="text-caption-1-medium truncate text-text-secondary">{label}</span>
      </dt>
      <dd className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cx(
            "text-title-1-semibold -tracking-[0.01em] tabular-nums",
            TONE_VALUE_CLASS[tone],
          )}
        >
          {value}
        </span>
        {detail ? (
          <span className="text-caption-2-regular truncate text-text-tertiary">{detail}</span>
        ) : null}
      </dd>
    </div>
  );
}

/** A responsive strip of `Stat`s. Semantic `<dl>` so the pairs stay associated. */
export function StatStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cx("grid grid-cols-2 gap-2.5 sm:grid-cols-4", className)}>{children}</dl>
  );
}
