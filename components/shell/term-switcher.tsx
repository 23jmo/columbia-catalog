"use client";

import { useState, useSyncExternalStore } from "react";
import { RiExpandUpDownLine, RiGraduationCapLine } from "@remixicon/react";
import {
  Dropdown,
  DropdownItem,
  DropdownPopover,
  DropdownTrigger,
} from "@/components/base/dropdown/dropdown";
import { Chip } from "@/components/base/badges/chip";
import { ACTIVE_TERMS, CURRENT_TERM, buildTerm } from "@/lib/constants";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * Which term the whole app is pointed at. Only the registerable terms
 * (`ACTIVE_TERMS`) appear here — archived terms are a comparison feature
 * inside the course drawer, not a place a student plans against.
 *
 * TODO(term-state): the selection is currently local to this control and
 * persisted to localStorage only. Once the search and schedule lanes exist it
 * should move to a URL search param (`?term=20263`) so a shared link carries
 * the term with it, and so server components can read it without hydration.
 * `onTermChange` is the seam for that — pass it and the parent owns the value.
 */

const TERM_STORAGE_KEY = "columbia-catalog:term";

/**
 * The remembered term, as an external store.
 *
 * localStorage cannot be read during render — the server has no access to it,
 * so the markup would not match on hydration. The usual workaround is to read
 * it in an effect and call setState, but that is a synchronous state write
 * inside an effect (React flags it as a cascading render) and it makes every
 * mounted switcher keep its own copy, so two of them on one screen can show
 * different terms.
 *
 * `useSyncExternalStore` is the built-in answer: `getServerSnapshot` returns
 * null so the server and the first client render agree on the default, then
 * React re-reads on the client. One value, read from one place.
 */
const termListeners = new Set<() => void>();

/** `undefined` = not read yet; `null` = nothing valid stored. */
let cachedTerm: TermCode | null | undefined;

function readStoredTerm(): TermCode | null {
  try {
    const stored = window.localStorage.getItem(TERM_STORAGE_KEY);
    return stored && (ACTIVE_TERMS as readonly string[]).includes(stored)
      ? (stored as TermCode)
      : null;
  } catch {
    // Storage can be blocked entirely; the default term is still correct.
    return null;
  }
}

function subscribeToTerm(onStoreChange: () => void): () => void {
  termListeners.add(onStoreChange);
  // Another tab writing the key fires `storage` here; drop the cache so the
  // next snapshot re-reads it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== TERM_STORAGE_KEY) return;
    cachedTerm = undefined;
    onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    termListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Must be referentially stable between changes or React re-renders forever,
 * hence the cache. Term codes are strings, so `Object.is` compares by value.
 */
function getTermSnapshot(): TermCode | null {
  if (cachedTerm === undefined) cachedTerm = readStoredTerm();
  return cachedTerm;
}

/** The server has no storage to read, so nothing is remembered there. */
function getTermServerSnapshot(): TermCode | null {
  return null;
}

function writeStoredTerm(next: TermCode): void {
  cachedTerm = next;
  try {
    window.localStorage.setItem(TERM_STORAGE_KEY, next);
  } catch {
    // Non-fatal: the choice simply will not survive a reload.
  }
  for (const listener of termListeners) listener();
}

export interface TermSwitcherProps {
  /** Controlled value. Omit to let the control own its own state. */
  termCode?: TermCode;
  onTermChange?: (termCode: TermCode) => void;
  /** Icon-only trigger for tight bars. */
  compact?: boolean;
  className?: string;
}

export function TermSwitcher({
  termCode: controlledTerm,
  onTermChange,
  compact = false,
  className,
}: TermSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rememberedTerm = useSyncExternalStore(
    subscribeToTerm,
    getTermSnapshot,
    getTermServerSnapshot,
  );

  const selectedTerm = controlledTerm ?? rememberedTerm ?? CURRENT_TERM;
  const selectedLabel = buildTerm(selectedTerm).label;

  const selectTerm = (next: TermCode) => {
    writeStoredTerm(next);
    setIsOpen(false);
    onTermChange?.(next);
  };

  return (
    <Dropdown isOpen={isOpen} onOpenChange={setIsOpen}>
      <DropdownTrigger
        aria-label={`Term: ${selectedLabel}. Change term`}
        className={cx(
          "flex items-center gap-2 rounded-2lg border border-border-button-default bg-background-primary-default p-2 shadow-xs",
          "transition-colors duration-150 ease hover:bg-background-primary-hover",
          compact ? "h-9" : "h-9 w-full justify-between",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <RiGraduationCapLine
            className="size-5 shrink-0 text-foreground-icon-secondary"
            aria-hidden
          />
          {!compact && (
            <span className="text-body-medium truncate text-text-primary">{selectedLabel}</span>
          )}
        </span>
        <RiExpandUpDownLine
          className="size-4 shrink-0 text-foreground-icon-tertiary"
          aria-hidden
        />
      </DropdownTrigger>

      <DropdownPopover aria-label="Choose a term" placement="bottom start" className="w-[248px]">
        {ACTIVE_TERMS.map((code) => {
          const term = buildTerm(code);
          return (
            <DropdownItem
              key={code}
              selected={code === selectedTerm}
              onSelect={() => selectTerm(code)}
              className="justify-between"
            >
              <span className="flex min-w-0 flex-col items-start">
                <span className="text-body-medium text-text-primary">{term.label}</span>
                <span className="text-caption-1-regular text-text-tertiary">
                  Term code {term.termCode}
                </span>
              </span>
              {code === CURRENT_TERM && (
                <Chip variant="caption" color="lime">
                  Registering
                </Chip>
              )}
            </DropdownItem>
          );
        })}
      </DropdownPopover>
    </Dropdown>
  );
}
