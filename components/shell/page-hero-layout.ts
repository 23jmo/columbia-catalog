import { cx } from "@/utils/cx";

/**
 * Shared mobile layout for page identity heroes (course, instructor, profile).
 *
 * Below `sm` the hero bleeds through `<main>`'s px-4 / py-5 so it sits flush
 * under the slim hamburger bar; from `sm` up it becomes a bordered card.
 */

export type PageHeroShape = "attached" | "card";

export function pageHeroSectionClass(shape: PageHeroShape, className?: string): string {
  return cx(
    "relative w-full overflow-hidden",
    "-mx-4 -mt-5 w-[calc(100%+2rem)] max-w-none",
    "border-b border-border-table sm:mx-0 sm:mt-0 sm:w-full sm:border-border-ai-profile-card",
    shape === "attached"
      ? "sm:rounded-t-3xl sm:border sm:border-b-0"
      : "sm:rounded-3xl sm:border",
    className,
  );
}

export function pageHeroCoverClass(className?: string): string {
  return cx(
    "absolute inset-x-0 top-0 h-[165px] overflow-hidden bg-background-tertiary-default sm:rounded-t-[23px]",
    className,
  );
}

export function pageHeroBodyClass(className?: string): string {
  return cx(
    "relative flex w-full flex-col gap-3 px-3 pb-3 pt-[124px] sm:gap-[15px] sm:px-4 sm:pb-4",
    className,
  );
}

export function pageHeroBackLinkAnchorClass(className?: string): string {
  return cx(
    "absolute left-3 top-3 z-10 sm:left-4 sm:top-4",
    className,
  );
}

/** Page column rhythm — tight on mobile, centred with more air from `sm`. */
export function pageIdentityContentClass(className?: string): string {
  return cx("w-full max-w-4xl items-stretch gap-3 sm:gap-4", className);
}
