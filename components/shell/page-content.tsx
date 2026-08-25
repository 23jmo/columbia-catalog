import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

/**
 * Shared page column — the same gutters `/search` uses.
 *
 * AppShell supplies the outer padding (`px-4 py-5 sm:px-6 xl:px-8 xl:py-7`).
 * This adds the inner `px-3` gutter and a centred max width so every screen
 * shares two vertical edges with search. Pass `className` to override width
 * or gap (`max-w-4xl`, `gap-5`, etc.).
 *
 * ── Why the inner gutter starts at `sm` ─────────────────────────────────────
 *
 * Stacked on the shell's own `px-4`, this used to spend 28px a side on a phone
 * — 56px of a 390px screen, leaving a 334px measure for content that is mostly
 * dense tabular rows. The nested gutter exists to inset a centred column from
 * the shell's padding at desktop widths; below `sm` there is no centred column,
 * the max width never binds, and the shell's own 16px is already the page
 * margin. Dropping it there returns 24px to the content and lines these pages
 * up with the routes that sit directly under `<main>`.
 */
export function PageContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "mx-auto flex w-full min-w-0 max-w-[1320px] flex-col gap-6 px-0 sm:px-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
