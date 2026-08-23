"use client";

import { useEffect, useRef, useState } from "react";
import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

/**
 * A block of text with a copy button.
 *
 * This is the only interactive part of the agent-handoff column, so it is the
 * only part that ships JavaScript — the surrounding card stays a server
 * component, the same way the app shell keeps its client pieces as leaves.
 *
 * Copying can genuinely fail (no clipboard permission, insecure origin, an
 * embedded webview), and a button that silently does nothing is worse than one
 * that admits it — so the failure has its own visible state and the text stays
 * selectable either way.
 */

export interface CopyFieldProps {
  /** Exact text placed on the clipboard. Rendered verbatim. */
  value: string;
  label: string;
  /** Shown under the label, e.g. where this snippet goes. */
  hint?: string;
  /** `block` is a multi-line code panel; `inline` is a single-line row. */
  layout?: "block" | "inline";
  className?: string;
}

type CopyState = "idle" | "copied" | "failed";

export function CopyField({ value, label, hint, layout = "block", className }: CopyFieldProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending reset must not fire into an unmounted component, and a second
  // click must restart the countdown rather than inherit the first one's.
  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const copy = async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    resetTimer.current = setTimeout(() => setCopyState("idle"), 2400);
  };

  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-caption-1-medium text-text-secondary">{label}</span>
        {hint && <span className="text-caption-2-regular text-text-tertiary">{hint}</span>}
      </div>

      <div
        className={cx(
          "flex min-w-0 gap-2 rounded-2lg border border-border-button-default bg-background-inner-default p-2",
          layout === "block" ? "items-start" : "items-center",
        )}
      >
        <pre
          className={cx(
            "min-w-0 flex-1 overflow-x-auto font-mono text-caption-1-regular text-text-primary",
            layout === "inline" && "truncate",
          )}
        >
          {value}
        </pre>
        <Button
          size="xs"
          variant="secondary"
          leadingIcon={copyState === "copied" ? RiCheckLine : RiFileCopyLine}
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="shrink-0"
        >
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Select it" : "Copy"}
        </Button>
      </div>

      {/* Announced to screen readers; also visible, because a failed copy is
          something the student has to act on. */}
      <span
        role="status"
        aria-live="polite"
        className={cx(
          "text-caption-2-regular",
          copyState === "failed" ? "text-status-rose-text" : "text-text-tertiary",
        )}
      >
        {copyState === "copied"
          ? "Copied to clipboard."
          : copyState === "failed"
            ? "Your browser blocked the clipboard — select the text above and copy it manually."
            : ""}
      </span>
    </div>
  );
}
