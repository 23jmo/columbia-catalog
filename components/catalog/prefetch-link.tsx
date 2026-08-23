"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { usePrefetchOnIntent } from "@/hooks/use-prefetch-on-intent";

/**
 * A `<Link>` that warms its destination when the reader looks like they mean
 * it — see `hooks/use-prefetch-on-intent` for what "looks like" means and why
 * it is not simply `prefetch`.
 *
 * A component rather than the hook used directly because the surfaces that
 * need this — search rows, the drawer's sibling-section list, the section
 * chooser — are server components, and a hook cannot be called from one. The
 * link is the smallest thing that has to become a client component.
 *
 * Only string hrefs are prefetched. `router.prefetch` takes a string, and the
 * object form is not worth serialising for a hint; those links still navigate
 * normally, just without the head start.
 */
export function PrefetchLink({
  href,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onTouchStart,
  ...rest
}: ComponentProps<typeof Link>) {
  const intent = usePrefetchOnIntent(typeof href === "string" ? href : "");

  /*
   * Composed rather than spread over. Spreading the intent handlers last would
   * silently drop any handler the caller passed for the same event, which is
   * the kind of bug that only shows up on the one row that needed it.
   */
  return (
    <Link
      href={href}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        intent.onPointerEnter();
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        intent.onPointerLeave();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        intent.onFocus();
      }}
      onBlur={(event) => {
        onBlur?.(event);
        intent.onBlur();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        intent.onTouchStart();
      }}
      {...rest}
    />
  );
}
