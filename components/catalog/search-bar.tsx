"use client";

import { useRef } from "react";
import { RiCloseLine, RiSearchLine } from "@remixicon/react";
import { Input } from "@/components/base/input/input";
import { cx } from "@/utils/cx";

/**
 * The query input.
 *
 * NO DEBOUNCE and NO LOADING STATE, ever. `onQueryChange` fires on every
 * keystroke and the caller re-runs the local engine synchronously inside the
 * same render pass. Spec section 19 puts keystroke-to-results at one frame,
 * which is only achievable because search never touches the network -- so
 * there is nothing to wait for and nothing to spin.
 *
 * If this component ever grows a `isLoading` prop, something upstream has
 * broken the thesis.
 */

export interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Rendered under the field: "43 courses" etc. Never a spinner. */
  resultSummary?: string;
  /** Engine time in ms, shown in development only. */
  elapsedMs?: number;
  /**
   * `hero` is the search screen's own field: full width, 56px, 16px text.
   * `default` is for the field embedded in a denser surface.
   */
  appearance?: "default" | "hero";
  className?: string;
}

export function SearchBar({
  query,
  onQueryChange,
  resultSummary,
  elapsedMs,
  appearance = "default",
  className,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hero = appearance === "hero";

  return (
    <div className={cx("flex w-full flex-col gap-1.5", className)}>
      <div className="relative w-full">
        <Input
          ref={inputRef}
          value={query}
          // Synchronous. React Aria hands us the string; we hand it straight
          // to the engine. No timers between the two.
          onChange={onQueryChange}
          aria-label="Search courses"
          placeholder="Search courses, codes, or instructors"
          leadingIcon={RiSearchLine}
          type="search"
          autoComplete="off"
          spellCheck="false"
          fieldClassName={cx(hero ? "h-14 rounded-2lg pr-11 pl-1" : "h-11 pr-9")}
          inputClassName={cx(hero ? "text-headline-regular" : "text-body-regular")}
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
            className={cx(
              "absolute top-1/2 -translate-y-1/2 rounded-lg p-1",
              hero ? "right-3.5" : "right-2",
              "text-text-tertiary transition-colors",
              "hover:bg-background-primary-hover hover:text-text-primary",
              "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            )}
          >
            <RiCloseLine className={cx(hero ? "size-5" : "size-4")} aria-hidden />
          </button>
        )}
      </div>

      {/* Live region so screen readers hear the count change as they type. */}
      <div
        className="flex items-baseline gap-2 px-1"
        aria-live="polite"
        aria-atomic="true"
      >
        {resultSummary && (
          <span className="text-caption-1-medium text-text-secondary tabular-nums">
            {resultSummary}
          </span>
        )}
        {process.env.NODE_ENV !== "production" && elapsedMs !== undefined && (
          <span
            className="text-caption-2-regular text-text-tertiary tabular-nums"
            title="Local engine time. Budget is 16ms."
          >
            {elapsedMs.toFixed(1)}ms
          </span>
        )}
      </div>
    </div>
  );
}
