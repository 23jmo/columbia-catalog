"use client";

import Link from "next/link";

import { folderGradientStyle } from "@/lib/bookmarks/folder-art";
import { cx } from "@/utils/cx";

/**
 * A folder, at its smallest.
 *
 * Used under a saved section's title, in the folder picker, and in the
 * schedule dropdown. Always the *static* gradient — the animated version is
 * reserved for the gallery cards on `/saved`, where there are at most a
 * couple of dozen and each one is large enough for the motion to read as
 * texture rather than as noise.
 */

export interface FolderChipProps {
  folderId: string;
  name: string;
  count?: number;
  /** Renders as a link to the folder page. Omit for a static label. */
  href?: string;
  size?: "sm" | "md";
  className?: string;
}

export function FolderChip({
  folderId,
  name,
  count,
  href,
  size = "sm",
  className,
}: FolderChipProps) {
  const content = (
    <>
      <span
        aria-hidden
        className={cx(
          "shrink-0 rounded-full ring-1 ring-inset ring-border-table",
          size === "sm" ? "size-2.5" : "size-3.5",
        )}
        style={folderGradientStyle(folderId)}
      />
      <span className="truncate">{name}</span>
      {count === undefined ? null : (
        <span className="shrink-0 tabular-nums text-text-tertiary">{count}</span>
      )}
    </>
  );

  const classes = cx(
    "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full",
    "border border-border-table bg-background-secondary-default",
    size === "sm" ? "px-2 py-0.5 text-caption-1-regular" : "px-2.5 py-1 text-body-regular",
    "text-text-secondary",
    href && "transition-colors duration-150 ease hover:bg-background-secondary-hover",
    href && "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
    className,
  );

  if (!href) return <span className={classes}>{content}</span>;

  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}

/**
 * The overflow marker after a row's visible chips.
 *
 * Folders-per-bookmark is deliberately uncapped in the database, so a row can
 * genuinely hold ten. Truncating the display is the right place to handle
 * that — the data is not the problem, the line width is.
 */
export function FolderChipOverflow({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border-table bg-background-secondary-default px-2 py-0.5 text-caption-1-regular text-text-tertiary">
      +{count}
    </span>
  );
}
