import Link from "next/link";
import { RiBookShelfLine } from "@remixicon/react";
import { cx } from "@/utils/cx";

/** The product mark. No artwork dependency — a glyph and the name. */
export function ShellWordmark({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="Columbia Catalog — home"
      className={cx(
        "flex min-w-0 items-center gap-2 rounded-2lg p-1 outline-none",
        // 36px tall from `p-1` around a 28px glyph. It is the only "back to the
        // start" affordance on a phone, so on a touch device it
        // takes the full 44px — there is room, and this is the one control on
        // the header a lost reader reaches for.
        "pointer-coarse:min-h-11",
        "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        className,
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-b from-accent-500 to-accent-600 shadow-xs">
        <RiBookShelfLine className="size-4 text-white" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body-medium truncate text-text-primary">Columbia Catalog</span>
      </span>
    </Link>
  );
}
