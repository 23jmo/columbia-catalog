import Link from "next/link";
import { RiArrowLeftSLine } from "@remixicon/react";

import { cx } from "@/utils/cx";

/**
 * Back out of a standalone course/section page — drawn small and tucked into
 * the hero cover so it reads as navigation within the view, not a row above it.
 */
export function CoursePageBackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex w-fit items-center gap-0.5 rounded-md px-1 py-0.5",
        "text-caption-2-medium text-text-tertiary",
        "bg-background-full/75 backdrop-blur-sm",
        "transition-colors outline-none",
        "hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        "sm:gap-1 sm:bg-transparent sm:px-1.5 sm:py-1 sm:text-caption-1-medium sm:text-text-secondary sm:backdrop-blur-none",
        "sm:hover:bg-background-primary-hover sm:hover:text-text-primary",
        className,
      )}
    >
      <RiArrowLeftSLine aria-hidden className="size-3.5 sm:size-4" />
      {children}
    </Link>
  );
}
