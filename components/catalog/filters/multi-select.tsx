"use client";

import { useMemo, useRef, useState } from "react";
import { RiArrowDownSLine, RiCheckLine, RiSearchLine } from "@remixicon/react";
import { Input } from "@/components/base/input/input";
import {
  MENU_ITEM,
  MENU_ITEM_ACTIVE,
  MENU_ITEMS_CONTAINER,
} from "@/components/base/dropdown/menu-styles";
import { useDismissOnOutsidePress } from "@/utils/use-dismiss-on-outside-press";
import { cx } from "@/utils/cx";
import type { FacetOption } from "../search-source";

/**
 * Searchable multi-select over a facet.
 *
 * BoardUI's `Select` is a single-value React Aria listbox with no type-ahead
 * filter, and the org filters need multi-select over lists that reach a few
 * thousand instructors -- so this is a local composition built from BoardUI's
 * `Input` and the shared menu recipe rather than a rewrite of `Select`.
 *
 * Everything is client-side: opening the menu, typing in it, and toggling
 * values never leave the browser.
 */

export interface MultiSelectProps {
  label: string;
  options: FacetOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  /** Shown in place of the menu when `options` is empty. */
  emptyMessage?: string;
  /** Cap on rendered rows; the type-ahead is how you reach the rest. */
  maxVisible?: number;
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder = "Type to filter",
  emptyMessage = "Nothing to choose from yet",
  maxVisible = 100,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useDismissOnOutsidePress(isOpen, () => setIsOpen(false), [triggerRef, panelRef]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? options.filter((o) => o.label.toLowerCase().includes(needle))
      : options;
    // Selected values stay pinned to the top so they are always clearable.
    const chosen = matches.filter((o) => selectedSet.has(o.value));
    const rest = matches.filter((o) => !selectedSet.has(o.value));
    return [...chosen, ...rest].slice(0, maxVisible);
  }, [options, query, selectedSet, maxVisible]);

  const toggle = (value: string) => {
    if (selectedSet.has(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  const isDisabled = options.length === 0;

  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="text-body-2-medium text-text-primary">{label}</span>

      <button
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className={cx(
          "flex w-full items-center justify-between gap-1.5 rounded-2lg px-2.5 py-2",
          "border border-border-button-default bg-background-primary-default shadow-xs",
          "text-body-medium transition-[color,background-color,border-color,transform,scale] duration-200 ease-out",
          "active:scale-[0.97] active:duration-[160ms]",
          "motion-reduce:transition-none motion-reduce:active:scale-100",
          "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-border-focus-ring",
          isDisabled
            ? "cursor-not-allowed bg-background-primary-disabled text-text-tertiary shadow-none"
            : "cursor-pointer text-text-primary hover:border-border-button-hover hover:bg-background-primary-hover",
        )}
      >
        <span
          className={cx(
            "min-w-0 truncate text-left",
            selected.length === 0 && "text-text-tertiary",
          )}
        >
          {isDisabled ? emptyMessage : summary}
        </span>
        <RiArrowDownSLine
          aria-hidden
          className={cx(
            "size-4 shrink-0 text-text-secondary transition-transform duration-150 ease-out motion-reduce:transition-none",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && !isDisabled && (
        <div
          ref={panelRef}
          className={cx(
            "absolute top-full right-0 left-0 z-30 mt-1 flex flex-col gap-2",
            "rounded-2xl border border-border-button-default bg-background-primary-default p-2 shadow-dropdown",
          )}
        >
          <Input
            value={query}
            onChange={setQuery}
            aria-label={`Filter ${label}`}
            placeholder={searchPlaceholder}
            leadingIcon={RiSearchLine}
            size="small"
            autoFocus
          />
          <ul
            role="listbox"
            aria-multiselectable
            aria-label={label}
            className={cx(MENU_ITEMS_CONTAINER, "max-h-60 overflow-y-auto")}
          >
            {visible.length === 0 && (
              <li className="px-2 py-3 text-body-2-regular text-text-tertiary">
                No matches
              </li>
            )}
            {visible.map((option) => {
              const isSelected = selectedSet.has(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(option.value)}
                    className={cx(
                      MENU_ITEM,
                      "justify-between text-body-2-medium",
                      isSelected && MENU_ITEM_ACTIVE,
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <RiCheckLine
                        aria-hidden
                        className={cx(
                          "size-4 shrink-0",
                          isSelected ? "text-accent-500" : "text-transparent",
                        )}
                      />
                      <span className="truncate">{option.label}</span>
                    </span>
                    <span className="shrink-0 text-caption-2-regular text-text-tertiary tabular-nums">
                      {option.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {options.length > visible.length && (
            <p className="px-2 pb-1 text-caption-2-regular text-text-tertiary">
              {`Showing ${visible.length} of ${options.length}. Keep typing to narrow.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
